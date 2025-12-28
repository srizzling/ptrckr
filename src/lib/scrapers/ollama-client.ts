export interface ExtractedPriceData {
  price: number | null;
  currency: string;
  inStock: boolean;
  retailerName: string;
  productUrl?: string;
  confidence?: number;
  error?: string;
  // Unit pricing fields for consumables (nappies, wipes, etc.)
  unitCount?: number; // e.g., 50 for "50 pack"
  unitType?: string; // e.g., "nappy", "wipe", "piece"
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

  private buildPrompt(content: string, url: string, hints?: string): string {
    const hintsSection = hints ? `\nNote: ${hints}` : '';

    return `Extract the price and pack size from this product page.

${content}${hintsSection}

Respond with JSON only, no explanation:
[{"price": NUMBER, "unitCount": NUMBER}]

Rules:
- price: the dollar amount shown (e.g., "$62.99" = 62.99, "$39.00" = 39)
- unitCount: pack size from product name (e.g., "224 Nappies" = 224, "108 Pack" = 108)`;
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

      // Always use our domain extraction for retailer name (more reliable than model)
      const retailerName = this.extractDomainName(url);
      // Extract pack size from URL (more reliable than model for multi-pack products)
      const urlPackSize = this.extractPackSizeFromUrl(url);

      const prices: ExtractedPriceData[] = items
        .filter((item: Record<string, unknown>) =>
          typeof item.price === 'number' && item.price > 0
        )
        .map((item: Record<string, unknown>) => {
          // Prefer URL-derived pack size (more reliable), fall back to model's extraction
          const modelUnitCount =
            typeof item.unitCount === 'number' && item.unitCount > 0 ? item.unitCount : undefined;
          const unitCount = urlPackSize || modelUnitCount;

          return {
            price: item.price as number,
            currency: (item.currency as string) || 'AUD',
            inStock: item.inStock !== false,
            retailerName, // Always use URL-derived name
            productUrl: (item.productUrl as string) || undefined,
            confidence: item.confidence as number | undefined,
            // Unit pricing fields - default to "nappy" for consumables
            unitCount,
            unitType:
              typeof item.unitType === 'string' ? item.unitType : unitCount ? 'nappy' : undefined
          };
        });

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
    // First try JSON-style extraction
    let priceMatch = response.match(/["']?price["']?\s*:\s*(\d+(?:\.\d{2})?)/i);
    let price = priceMatch ? parseFloat(priceMatch[1]) : null;

    // If no JSON match, try plain price format like "$39.00" or "39.00"
    if (price === null) {
      const plainPriceMatch = response.match(/\$?(\d+(?:\.\d{2})?)/);
      price = plainPriceMatch ? parseFloat(plainPriceMatch[1]) : null;
    }

    const inStockMatch = response.match(/["']?inStock["']?\s*:\s*(true|false)/i);
    const inStock = inStockMatch ? inStockMatch[1].toLowerCase() === 'true' : true;

    const retailerMatch = response.match(/["']?retailerName["']?\s*:\s*["']([^"']+)["']/i);
    const retailerName = retailerMatch ? retailerMatch[1] : this.extractDomainName(url);

    // Try to extract unit count from response or URL
    const unitMatch = response.match(/(\d+)\s*(?:pack|count|nappies|wipes)/i);
    const unitCount = unitMatch ? parseInt(unitMatch[1]) : undefined;

    return {
      price,
      currency: 'AUD',
      inStock,
      retailerName,
      unitCount,
      unitType: unitCount ? 'nappy' : undefined,
      error: price === null ? 'Failed to parse AI response' : undefined
    };
  }

  /**
   * Extract pack size from URL patterns like "224-nappies", "108-pack", "54pk"
   */
  private extractPackSizeFromUrl(url: string): number | undefined {
    const urlLower = url.toLowerCase();

    // Common patterns: "224-nappies", "108-pack", "160-pack", "54pk"
    const patterns = [
      /(\d+)-(?:nappies|nappy|pack|pk|count|ct|wipes)/i,
      /(\d+)(?:nappies|nappy|pack|pk|count|ct|wipes)/i,
      /(?:pack|size)-(\d+)/i
    ];

    for (const pattern of patterns) {
      const match = urlLower.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        // Reasonable pack sizes are between 10 and 500
        if (num >= 10 && num <= 500) {
          return num;
        }
      }
    }

    return undefined;
  }

  private extractDomainName(url: string): string {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      // Map known domains to retailer names
      const domainMap: Record<string, string> = {
        'coles.com.au': 'Coles',
        'woolworths.com.au': 'Woolworths',
        'chemistwarehouse.com.au': 'Chemist Warehouse',
        'costco.com.au': 'Costco',
        'amazon.com.au': 'Amazon AU',
        'bigw.com.au': 'Big W',
        'target.com.au': 'Target',
        'kmart.com.au': 'Kmart',
        'bunnings.com.au': 'Bunnings',
        'officeworks.com.au': 'Officeworks',
        'jbhifi.com.au': 'JB Hi-Fi',
        'thegoodguys.com.au': 'The Good Guys',
        'harveynorman.com.au': 'Harvey Norman'
      };

      // Check for known domains
      for (const [domain, name] of Object.entries(domainMap)) {
        if (hostname.includes(domain.replace('www.', ''))) {
          return name;
        }
      }

      // Fallback: extract from domain
      return hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      return 'Unknown';
    }
  }
}

export const ollamaClient = new OllamaClient();
