import type { Scraper, ScraperResult, ScrapedPrice, LogCallback, ScrapeOptions } from './types';
import { getSettingNumber } from '../db/queries/settings';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Firecrawl extract schema for product prices
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    productName: { type: 'string', description: 'The name of the product' },
    price: { type: 'number', description: 'The regular price for buying ONE item (not the multi-buy deal price). This is the price shown when adding just 1 to cart, e.g., $39.00' },
    originalPrice: { type: 'number', description: 'The original/was price if on sale' },
    inStock: { type: 'boolean', description: 'Whether the product is in stock' },
    packSize: { type: 'number', description: 'Number of items in the pack' },
    multiBuyQuantity: { type: 'number', description: 'Quantity required for multi-buy deal (e.g., 2 for "2 for $55")' },
    multiBuyPrice: { type: 'number', description: 'Total price for multi-buy deal in dollars (e.g., 55 for "2 for $55.00"). This is the total you pay for multiBuyQuantity items.' },
  },
  required: ['price'],
};

export class AIScraper implements Scraper {
  type = 'ai';
  private log: LogCallback = console.log;
  private extractedProductName: string | undefined;

  private getRetailer(url: string): string {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('bigw.com.au')) return 'Big W';
    if (hostname.includes('coles.com.au')) return 'Coles';
    if (hostname.includes('woolworths.com.au')) return 'Woolworths';
    if (hostname.includes('chemistwarehouse.com.au')) return 'Chemist Warehouse';
    if (hostname.includes('babybunting.com.au')) return 'Baby Bunting';
    if (hostname.includes('costco.com.au')) return 'Costco';
    return 'Unknown';
  }

  private needsStealth(url: string): boolean {
    return new URL(url).hostname.toLowerCase().includes('bigw.com.au');
  }

  private extractPackSizeFromUrl(url: string): number | undefined {
    const match = url.match(/(\d+)-?(?:pack|nappies|nappy|count)/i);
    if (match) {
      const num = parseInt(match[1]);
      if (num >= 10 && num <= 500) return num;
    }
    return undefined;
  }

  /**
   * Try direct fetch - works for Costco, Chemist Warehouse
   */
  private async tryDirectFetch(url: string): Promise<ScrapedPrice | null> {
    this.log(`[Scraper] Trying direct fetch...`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html',
          'Accept-Language': 'en-AU,en;q=0.9'
        }
      });

      if (!response.ok) {
        this.log(`[Scraper] Direct fetch failed: HTTP ${response.status}`);
        return null;
      }

      const html = await response.text();
      this.log(`[Scraper] Direct fetch returned ${html.length} chars`);

      // Try to extract price from HTML
      const price = this.extractPriceFromHtml(html, url);
      if (price) {
        this.log(`[Scraper] Direct fetch extracted: $${price.price}`);
        return price;
      }

      return null;
    } catch (error) {
      this.log(`[Scraper] Direct fetch error: ${error instanceof Error ? error.message : 'Unknown'}`);
      return null;
    }
  }

  /**
   * Extract product name from HTML using common patterns
   */
  private extractProductNameFromHtml(html: string): string | undefined {
    // Try JSON-LD Product schema: "name":"Product Name"
    const jsonLdMatch = html.match(/"@type"\s*:\s*"Product"[^}]*"name"\s*:\s*"([^"]+)"/);
    if (jsonLdMatch) return jsonLdMatch[1];

    // Try alternate JSON-LD format
    const jsonLdAlt = html.match(/"name"\s*:\s*"([^"]+)"[^}]*"@type"\s*:\s*"Product"/);
    if (jsonLdAlt) return jsonLdAlt[1];

    // Try Open Graph title
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch) return ogMatch[1];

    // Try <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      // Clean up common suffixes
      let title = titleMatch[1].trim();
      title = title.replace(/\s*[-|]\s*(Costco|Woolworths|Coles|Chemist Warehouse|Big W|Baby Bunting).*$/i, '');
      title = title.replace(/\s*[-|]\s*Buy Online.*$/i, '');
      if (title.length > 5) return title;
    }

    return undefined;
  }

  /**
   * Extract price from HTML using retailer-specific patterns
   */
  private extractPriceFromHtml(html: string, url: string): ScrapedPrice | null {
    const retailer = this.getRetailer(url);

    // Try to extract product name
    const productName = this.extractProductNameFromHtml(html);
    if (productName) {
      this.extractedProductName = productName;
      this.log(`[Scraper] Product name: ${productName}`);
    }

    // Costco: "price":"50.99"
    if (retailer === 'Costco') {
      const match = html.match(/"price"\s*:\s*"?([\d.]+)"?/);
      if (match) {
        const price = parseFloat(match[1]);
        if (price > 0 && price < 1000) {
          return this.buildPrice(price, url);
        }
      }
    }

    // Chemist Warehouse: "price":{"value":{"amount":38.99
    if (retailer === 'Chemist Warehouse') {
      const match = html.match(/"price":\s*\{\s*"value":\s*\{\s*"amount":\s*([\d.]+)/);
      if (match) {
        const price = parseFloat(match[1]);
        if (price > 0) {
          return this.buildPrice(price, url);
        }
      }
    }

    // Woolworths: Extract from JSON-LD structured data
    // Format: "itemCondition":"http://schema.org/NewCondition","price":39,"priceCurrency":"AUD"
    if (retailer === 'Woolworths') {
      // Extract single-item price from JSON-LD Offer schema
      const priceMatch = html.match(/"itemCondition"[^,]+,"price":(\d+(?:\.\d+)?),"priceCurrency":"AUD"/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        if (price > 0 && price < 1000) {
          // Try to extract pack size from unitText
          const packMatch = html.match(/"unitText"\s*:\s*"(\d+)\s*pack"/);
          const packSize = packMatch ? parseInt(packMatch[1]) : this.extractPackSizeFromUrl(url);

          // Try to extract multi-buy deal (2 for $55 pattern)
          const multiBuyMatch = html.match(/(\d+)\s+for\s+\$(\d+(?:\.\d+)?)/i);

          this.log(`[Scraper] Direct fetch extracted: $${price}${multiBuyMatch ? ` (multi-buy: ${multiBuyMatch[1]} for $${multiBuyMatch[2]})` : ''}`);
          return {
            retailerName: this.getRetailer(url),
            price,
            currency: 'AUD',
            inStock: true,
            productUrl: url,
            unitCount: packSize,
            unitType: 'nappy',
            multiBuyQuantity: multiBuyMatch ? parseInt(multiBuyMatch[1]) : undefined,
            multiBuyPrice: multiBuyMatch ? parseFloat(multiBuyMatch[2]) : undefined,
          };
        }
      }
    }

    return null;
  }

  /**
   * Try Firecrawl API - works for Coles, Woolworths, Baby Bunting, Big W (with stealth)
   */
  private async tryFirecrawl(url: string, useStealth: boolean = false): Promise<ScrapedPrice | null> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      this.log(`[Scraper] FIRECRAWL_API_KEY not set, skipping Firecrawl`);
      return null;
    }

    this.log(`[Scraper] Trying Firecrawl${useStealth ? ' (stealth)' : ''}...`);

    try {
      const body: Record<string, unknown> = {
        url,
        formats: ['extract'],
        extract: { schema: EXTRACT_SCHEMA },
      };

      if (useStealth) {
        body.proxy = 'stealth';
      }

      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        this.log(`[Scraper] Firecrawl error: ${response.status} - ${data.error || 'Unknown'}`);
        return null;
      }

      const extract = data.data?.extract;
      const statusCode = data.data?.metadata?.statusCode;

      // Check if blocked (403)
      if (statusCode === 403) {
        this.log(`[Scraper] Firecrawl blocked (403)`);
        return null;
      }

      if (extract?.price && extract.price > 0) {
        const hasMultiBuy = extract.multiBuyQuantity && extract.multiBuyPrice && extract.multiBuyQuantity > 1;
        this.log(`[Scraper] Firecrawl extracted: $${extract.price}${hasMultiBuy ? ` (${extract.multiBuyQuantity} for $${extract.multiBuyPrice})` : ''}`);

        // Store product name if extracted
        if (extract.productName) {
          this.extractedProductName = extract.productName;
          this.log(`[Scraper] Product name: ${extract.productName}`);
        }

        return {
          retailerName: this.getRetailer(url),
          price: extract.price,
          currency: 'AUD',
          inStock: extract.inStock !== false,
          productUrl: url,
          unitCount: extract.packSize || this.extractPackSizeFromUrl(url),
          unitType: 'nappy',
          multiBuyQuantity: hasMultiBuy ? extract.multiBuyQuantity : undefined,
          multiBuyPrice: hasMultiBuy ? extract.multiBuyPrice : undefined,
        };
      }

      this.log(`[Scraper] Firecrawl returned no price`);
      return null;
    } catch (error) {
      this.log(`[Scraper] Firecrawl error: ${error instanceof Error ? error.message : 'Unknown'}`);
      return null;
    }
  }

  private buildPrice(price: number, url: string): ScrapedPrice {
    return {
      retailerName: this.getRetailer(url),
      price,
      currency: 'AUD',
      inStock: true,
      productUrl: url,
      unitCount: this.extractPackSizeFromUrl(url),
      unitType: 'nappy'
    };
  }

  private shouldSkipFirecrawl(lastSuccessfulScrape?: Date): { skip: boolean; cacheHours: number } {
    const cacheHours = getSettingNumber('scraper_cache_hours', 168);
    if (!lastSuccessfulScrape) return { skip: false, cacheHours };
    const hoursSinceLastScrape = (Date.now() - lastSuccessfulScrape.getTime()) / (1000 * 60 * 60);
    return { skip: hoursSinceLastScrape < cacheHours, cacheHours };
  }

  async scrape(url: string, hints?: string, options?: ScrapeOptions): Promise<ScraperResult> {
    this.log = options?.log || console.log;
    this.extractedProductName = undefined; // Reset for each scrape
    const retailer = this.getRetailer(url);
    this.log(`[Scraper] Scraping ${retailer}: ${url}`);

    try {
      // Step 1: Try direct fetch first (free)
      let price = await this.tryDirectFetch(url);
      if (price) {
        return { success: true, prices: [price], productName: this.extractedProductName };
      }

      // Step 2: Check cache - skip Firecrawl if recent successful scrape (unless forced)
      const { skip, cacheHours } = this.shouldSkipFirecrawl(options?.lastSuccessfulScrape);
      if (!options?.force && skip) {
        const hours = Math.round((Date.now() - options!.lastSuccessfulScrape!.getTime()) / (1000 * 60 * 60));
        this.log(`[Scraper] Skipping Firecrawl - last success was ${hours}h ago (cache: ${cacheHours}h)`);
        return {
          success: true,
          prices: [],
          cached: true,
          error: `Cached - last successful scrape was ${hours}h ago`
        };
      }

      // Step 3: Try Firecrawl (5 credits)
      price = await this.tryFirecrawl(url, false);
      if (price) {
        return { success: true, prices: [price], productName: this.extractedProductName };
      }

      // Step 4: If Big W and Firecrawl failed, retry with stealth
      if (this.needsStealth(url)) {
        this.log(`[Scraper] Retrying with stealth for Big W...`);
        price = await this.tryFirecrawl(url, true);
        if (price) {
          return { success: true, prices: [price], productName: this.extractedProductName };
        }
      }

      this.log(`[Scraper] No price found for ${url}`);
      return {
        success: false,
        prices: [],
        error: 'No price found - extraction failed'
      };
    } catch (error) {
      return {
        success: false,
        prices: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const aiScraper = new AIScraper();
