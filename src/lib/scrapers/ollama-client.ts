export interface ExtractedPriceData {
  price: number | null;
  currency: string;
  inStock: boolean;
  retailerName: string;
  productUrl?: string;
  confidence?: number;
  error?: string;
}

export interface ExtractionResult {
  prices: ExtractedPriceData[];
  error?: string;
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

export class OllamaClient {
  private timeout: number;
  private maxRetries: number;

  constructor() {
    this.timeout = 600000; // 10 minutes for slower models/networks
    this.maxRetries = 3; // Retry up to 3 times (helps with model warm-up)
  }

  private get baseUrl(): string {
    return process.env.OLLAMA_URL || 'http://localhost:11434';
  }

  private get model(): string {
    return process.env.OLLAMA_MODEL || 'llama3.2';
  }

  /**
   * Check if Ollama is available and the model is loaded
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Extract price information from HTML using the AI model
   * Returns multiple prices for aggregator sites
   * Includes retry logic for model warm-up
   */
  async extractPrices(html: string, url: string, hints?: string): Promise<ExtractionResult> {
    const prompt = this.buildPrompt(html, url, hints);
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[Ollama] Retry attempt ${attempt}/${this.maxRetries}...`);
        }

        const response = await fetch(`${this.baseUrl}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.model,
            prompt,
            stream: false,
            options: {
              temperature: 0.1, // Low temperature for consistent extraction
              num_predict: 2000 // Allow longer response for multiple prices
            }
          }),
          signal: AbortSignal.timeout(this.timeout)
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastError = `Ollama API error: ${response.status} - ${errorText}`;
          continue; // Retry on API error
        }

        const data = (await response.json()) as OllamaGenerateResponse;
        console.log('[Ollama] Raw AI response:', data.response.substring(0, 500));

        const result = this.parseResponse(data.response, url);

        // If we got prices, return immediately
        if (result.prices.length > 0) {
          return result;
        }

        // If no prices but no error, might need retry (model warm-up)
        if (!result.error && attempt < this.maxRetries) {
          console.log(`[Ollama] No prices found, retrying (attempt ${attempt}/${this.maxRetries})...`);
          lastError = 'No prices extracted';
          continue;
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        console.log(`[Ollama] Attempt ${attempt} failed: ${lastError}`);

        if (attempt === this.maxRetries) {
          return {
            prices: [],
            error: `Failed to extract price after ${this.maxRetries} attempts: ${lastError}`
          };
        }
        // Continue to next retry
      }
    }

    return {
      prices: [],
      error: lastError || 'Failed to extract prices'
    };
  }

  private buildPrompt(html: string, url: string, hints?: string): string {
    const hintsSection = hints ? `\nUser hints: ${hints}` : '';

    return `You are a price extraction assistant. Analyze the HTML and extract ALL prices shown.

URL: ${url}${hintsSection}

This page may be:
1. A SINGLE PRODUCT PAGE - one product with one price from one retailer
2. A PRICE AGGREGATOR/COMPARISON SITE - multiple retailers showing prices for the same product

Respond with ONLY valid JSON array (no markdown, no explanation, no code blocks):
[
  {
    "price": <number>,
    "currency": "<3-letter code, default AUD>",
    "inStock": <true or false>,
    "retailerName": "<store/retailer name - be specific, e.g. 'Amazon AU' not just 'Amazon'>",
    "productUrl": "<URL to buy from this retailer if available, otherwise null>"
  }
]

Guidelines:
- Extract EVERY retailer price shown (for aggregators, this could be 10+ prices)
- Use the CURRENT/SALE price, not RRP or "was" price
- retailerName should be the actual store name (e.g., "JB Hi-Fi", "Scorptec", "PCCaseGear")
- Do NOT include shipping costs in the price
- Set inStock to false only if explicitly marked as out of stock
- Price must be a number without currency symbols (e.g., 1299.00 not "$1,299.00")
- If no prices found, return empty array: []
- For aggregator sites like StaticICE, PriceGrabber, Google Shopping - extract ALL listed retailer prices

HTML Content:
${html}`;
  }

  private parseResponse(response: string, url: string): ExtractionResult {
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').trim();
    }

    // Try to find JSON array in the response
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }

    try {
      const parsed = JSON.parse(jsonStr);

      // Handle both array and single object responses
      const items = Array.isArray(parsed) ? parsed : [parsed];

      const prices: ExtractedPriceData[] = items
        .filter((item: Record<string, unknown>) =>
          typeof item.price === 'number' && item.price > 0
        )
        .map((item: Record<string, unknown>) => ({
          price: item.price as number,
          currency: (item.currency as string) || 'AUD',
          inStock: item.inStock !== false,
          retailerName: (item.retailerName as string) || this.extractDomainName(url),
          productUrl: (item.productUrl as string) || undefined,
          confidence: item.confidence as number | undefined
        }));

      return { prices };
    } catch {
      // Fallback: try regex extraction for single price
      const fallback = this.regexFallback(response, url);
      if (fallback.price !== null) {
        return { prices: [fallback] };
      }
      return { prices: [], error: 'Failed to parse AI response' };
    }
  }

  private regexFallback(response: string, url: string): ExtractedPriceData {
    const priceMatch = response.match(/["']?price["']?\s*:\s*(\d+(?:\.\d{2})?)/i);
    const price = priceMatch ? parseFloat(priceMatch[1]) : null;

    const inStockMatch = response.match(/["']?inStock["']?\s*:\s*(true|false)/i);
    const inStock = inStockMatch ? inStockMatch[1].toLowerCase() === 'true' : true;

    const retailerMatch = response.match(/["']?retailerName["']?\s*:\s*["']([^"']+)["']/i);
    const retailerName = retailerMatch ? retailerMatch[1] : this.extractDomainName(url);

    return {
      price,
      currency: 'AUD',
      inStock,
      retailerName,
      error: price === null ? 'Failed to parse AI response' : undefined
    };
  }

  private extractDomainName(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      return 'Unknown';
    }
  }
}

export const ollamaClient = new OllamaClient();
