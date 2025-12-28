import type { Scraper, ScraperResult, ScrapedPrice } from './types';
import { ollamaClient } from './ollama-client';
import { extractTextForAI } from './html-cleaner';

// Domains that require Puppeteer stealth (JS rendering + bot protection bypass)
const STEALTH_REQUIRED_DOMAINS = ['bigw.com.au', 'target.com.au', 'kmart.com.au'];

export class AIScraper implements Scraper {
  type = 'ai';

  /**
   * Check if a URL requires Puppeteer stealth mode
   */
  private needsStealth(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return STEALTH_REQUIRED_DOMAINS.some((domain) => hostname.includes(domain));
    } catch {
      return false;
    }
  }

  /**
   * Fetch HTML using Puppeteer with Firefox
   * Used for sites with JS rendering + bot protection (Big W, Target, Kmart)
   */
  private async fetchWithPuppeteer(url: string): Promise<{ html: string; error?: string }> {
    console.log(`[AI Scraper] Using Puppeteer Firefox for ${url}`);

    try {
      // Dynamic import to avoid loading Puppeteer unless needed
      const puppeteer = await import('puppeteer');

      // Use Firefox - less commonly blocked than Chrome
      const browser = await puppeteer.default.launch({
        browser: 'firefox',
        headless: true,
        // Use system Firefox in container environments
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });

      try {
        const page = await browser.newPage();

        // Set a realistic viewport and user agent
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0'
        );

        // Navigate and wait for content
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Wait a bit for any dynamic content
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const html = await page.content();
        console.log(`[AI Scraper] Puppeteer returned ${html.length} chars`);

        return { html };
      } finally {
        await browser.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[AI Scraper] Puppeteer error: ${message}`);
      return { html: '', error: `Puppeteer failed: ${message}` };
    }
  }

  /**
   * Fetch HTML from a URL using the appropriate method
   */
  private async fetchHtml(url: string): Promise<{ html: string; error?: string }> {
    // Use Puppeteer stealth for sites that need it
    if (this.needsStealth(url)) {
      return this.fetchWithPuppeteer(url);
    }

    // Regular fetch (no JS rendering needed for most sites)
    const cacheBuster = `_cb=${Date.now()}`;
    const fetchUrl = url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;

    try {
      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-AU,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });

      if (!response.ok) {
        return { html: '', error: `HTTP ${response.status} ${response.statusText}` };
      }

      return { html: await response.text() };
    } catch (error) {
      return {
        html: '',
        error: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async scrape(url: string, hints?: string): Promise<ScraperResult> {
    try {
      // Fetch the HTML (with optional browserless for JS rendering)
      const { html, error: fetchError } = await this.fetchHtml(url);

      if (fetchError || !html) {
        return {
          success: false,
          prices: [],
          error: fetchError || 'Failed to fetch URL'
        };
      }

      // Try JSON-LD extraction first (faster, more reliable)
      const jsonLdPrice = this.extractJsonLdPrice(html, url);
      if (jsonLdPrice) {
        console.log(`[AI Scraper] Extracted price from JSON-LD: $${jsonLdPrice.price}`);
        return {
          success: true,
          prices: [jsonLdPrice]
        };
      }

      // Try embedded JSON extraction (Chemist Warehouse, Next.js sites)
      const embeddedPrice = this.extractEmbeddedJsonPrice(html, url);
      if (embeddedPrice) {
        console.log(`[AI Scraper] Extracted price from embedded JSON: $${embeddedPrice.price}`);
        return {
          success: true,
          prices: [embeddedPrice]
        };
      }

      // Fall back to AI extraction
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';
      console.log(`[AI Scraper] No JSON-LD found, using Ollama at ${ollamaUrl} with model ${ollamaModel}`);

      // Check if Ollama is available
      const isAvailable = await ollamaClient.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          prices: [],
          error: `Ollama service unavailable at ${ollamaUrl}. Make sure Ollama is running.`
        };
      }

      // Extract just the text content (much smaller than HTML)
      const extractedText = extractTextForAI(html);

      console.log(
        `[AI Scraper] Original HTML: ${html.length} chars, Extracted text: ${extractedText.length} chars`
      );

      // Extract prices using Ollama (supports multiple prices for aggregator sites)
      const result = await ollamaClient.extractPrices(extractedText, url, hints);

      if (result.error) {
        console.warn(`[AI Scraper] Extraction warning: ${result.error}`);
      }

      // Convert to ScrapedPrice format
      const prices: ScrapedPrice[] = result.prices
        .filter((p) => p.price !== null && p.price > 0)
        .map((p) => ({
          retailerName: p.retailerName,
          price: p.price!,
          currency: p.currency,
          inStock: p.inStock,
          productUrl: p.productUrl || url,
          // Pass through unit pricing fields
          unitCount: p.unitCount,
          unitType: p.unitType
        }));

      console.log(`[AI Scraper] Extracted ${prices.length} prices from ${url}`);

      return {
        success: true,
        prices
      };
    } catch (error) {
      return {
        success: false,
        prices: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Try to extract price directly from JSON-LD/schema.org data
   * Returns null if no valid price found
   */
  private extractJsonLdPrice(html: string, url: string): ScrapedPrice | null {
    // Look for schema.org Offer with price
    const offerMatch = html.match(/"@type"\s*:\s*"Offer"[^}]*?"price"\s*:\s*"?([\d.]+)"?/);
    if (!offerMatch) return null;

    const price = parseFloat(offerMatch[1]);
    if (isNaN(price) || price <= 0) return null;

    // Extract retailer from URL
    const retailerName = this.extractRetailerName(url);

    // Extract pack size from URL
    const unitCount = this.extractPackSizeFromUrl(url);

    console.log(`[AI Scraper] JSON-LD found: $${price}, ${unitCount || 'no'} units, ${retailerName}`);

    return {
      retailerName,
      price,
      currency: 'AUD',
      inStock: true,
      productUrl: url,
      unitCount,
      unitType: unitCount ? 'nappy' : undefined
    };
  }

  /**
   * Try to extract price from embedded JSON data (Next.js state, etc.)
   * Used by Chemist Warehouse and other React/Next.js sites
   */
  private extractEmbeddedJsonPrice(html: string, url: string): ScrapedPrice | null {
    // Pattern: "prices":[{"sku":"...","price":{"value":{"amount":38.99,"currencyCode":"AUD"}
    const priceMatch = html.match(/"price":\s*\{\s*"value":\s*\{\s*"amount":\s*([\d.]+)/);
    if (!priceMatch) return null;

    const price = parseFloat(priceMatch[1]);
    if (isNaN(price) || price <= 0) return null;

    const retailerName = this.extractRetailerName(url);
    const unitCount = this.extractPackSizeFromUrl(url);

    console.log(
      `[AI Scraper] Embedded JSON found: $${price}, ${unitCount || 'no'} units, ${retailerName}`
    );

    return {
      retailerName,
      price,
      currency: 'AUD',
      inStock: true,
      productUrl: url,
      unitCount,
      unitType: unitCount ? 'nappy' : undefined
    };
  }

  private extractRetailerName(url: string): string {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const domainMap: Record<string, string> = {
        'coles.com.au': 'Coles',
        'woolworths.com.au': 'Woolworths',
        'chemistwarehouse.com.au': 'Chemist Warehouse',
        'costco.com.au': 'Costco',
        'amazon.com.au': 'Amazon AU',
        'bigw.com.au': 'Big W',
        'target.com.au': 'Target',
        'kmart.com.au': 'Kmart'
      };
      for (const [domain, name] of Object.entries(domainMap)) {
        if (hostname.includes(domain.replace('www.', ''))) {
          return name;
        }
      }
      return hostname.replace(/^www\./, '').split('.')[0];
    } catch {
      return 'Unknown';
    }
  }

  private extractPackSizeFromUrl(url: string): number | undefined {
    const urlLower = url.toLowerCase();
    const patterns = [
      /(\d+)-(?:nappies|nappy|pack|pk|count|ct|wipes)/i,
      /(\d+)(?:nappies|nappy|pack|pk|count|ct|wipes)/i,
      /(?:pack|size)-(\d+)/i
    ];
    for (const pattern of patterns) {
      const match = urlLower.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        if (num >= 10 && num <= 500) return num;
      }
    }
    return undefined;
  }
}

export const aiScraper = new AIScraper();
