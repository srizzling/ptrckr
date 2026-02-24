import type { Scraper, ScraperResult, ScrapedPrice, LogCallback, ScrapeOptions } from './types';
import { getSettingNumber } from '../db/queries/settings';
import Firecrawl from '@mendable/firecrawl-js';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// JSON Schema for Firecrawl extraction
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

// Type for extracted data
interface ExtractedData {
  productName?: string;
  price?: number;
  originalPrice?: number;
  inStock?: boolean;
  packSize?: number;
  multiBuyQuantity?: number;
  multiBuyPrice?: number;
}

export class AIScraper implements Scraper {
  type = 'ai';
  private log: LogCallback = console.log;
  private extractedProductName: string | undefined;
  private detectedOutOfStock: boolean = false;

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
   * Extract price data from JSON-LD structured data (schema.org Product)
   * Works for Woolworths, Coles, and other retailers using JSON-LD
   */
  /**
   * Parse a JSON-LD Product object and extract price/stock info.
   * Sets this.detectedOutOfStock if the product is out of stock (even without a price).
   */
  private parseJsonLdProduct(jsonData: Record<string, unknown>, url: string): ScrapedPrice | null {
    if (jsonData['@type'] !== 'Product') return null;

    const productName = (jsonData.name as string) || '';
    if (productName) {
      this.extractedProductName = productName;
      this.log(`[Scraper] Product name: ${productName}`);
    }

    // Offers can be an object or an array
    const rawOffers = jsonData.offers;
    const offersList = Array.isArray(rawOffers) ? rawOffers : rawOffers ? [rawOffers] : [];

    let price: number | null = null;
    let inStock = true;

    for (const offer of offersList) {
      // Check availability (handles both http and https schema.org URLs)
      if (offer.availability) {
        const avail = String(offer.availability);
        inStock = avail.includes('InStock');
      }

      // Try to get price from offer
      if (typeof offer.price === 'number') {
        price = offer.price;
      } else if (typeof offer.price === 'string') {
        price = parseFloat(offer.price);
      }
    }

    // If out of stock with no price, flag it so we don't fall through to Firecrawl
    if (!inStock && (!price || price <= 0)) {
      this.log(`[Scraper] JSON-LD detected product is out of stock with no price`);
      this.detectedOutOfStock = true;
      return null;
    }

    if (price && price > 0 && price < 1000) {
      const packMatch = productName.match(/(\d+)\s*pack/i);
      const packSize = packMatch ? parseInt(packMatch[1]) : this.extractPackSizeFromUrl(url);

      this.log(`[Scraper] Direct fetch extracted from JSON-LD: $${price}${packSize ? ` (${packSize} pack)` : ''}, inStock: ${inStock}`);

      return {
        retailerName: this.getRetailer(url),
        price,
        currency: 'AUD',
        inStock,
        productUrl: url,
        unitCount: packSize,
        unitType: 'nappy',
      };
    }

    return null;
  }

  private extractJsonLd(html: string, url: string): ScrapedPrice | null {
    try {
      // Try to find the pdp-schema script block specifically (Woolworths uses this id)
      const pdpSchemaMatch = html.match(/<script[^>]*id="pdp-schema"[^>]*>([\s\S]*?)<\/script>/i);

      if (pdpSchemaMatch) {
        try {
          const jsonData = JSON.parse(pdpSchemaMatch[1]);
          const result = this.parseJsonLdProduct(jsonData, url);
          if (result || this.detectedOutOfStock) return result;
        } catch (e) {
          this.log(`[Scraper] JSON-LD parse error: ${e instanceof Error ? e.message : 'Unknown'}`);
        }
      }

      // Try all application/ld+json scripts (Coles, etc.)
      const ldJsonRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      while ((match = ldJsonRegex.exec(html)) !== null) {
        try {
          const jsonData = JSON.parse(match[1]);
          const result = this.parseJsonLdProduct(jsonData, url);
          if (result || this.detectedOutOfStock) return result;
        } catch {
          // Skip unparseable scripts
        }
      }

      // Fallback: Try to extract price directly from HTML patterns
      // Look for the Offer schema price pattern with availability (handles both http and https)
      const priceMatch = html.match(/"availability":"https?:\/\/schema\.org\/(InStock|OutOfStock)","price":(\d+(?:\.\d+)?),"priceCurrency":"AUD"/);
      if (priceMatch) {
        const inStock = priceMatch[1] === 'InStock';
        const price = parseFloat(priceMatch[2]);
        if (price > 0 && price < 1000) {
          const nameMatch = html.match(/"@type":"Product","name":"([^"]+)"/);
          const productName = nameMatch ? nameMatch[1] : '';
          if (productName) {
            this.extractedProductName = productName;
            this.log(`[Scraper] Product name: ${productName}`);
          }

          const packMatch = productName.match(/(\d+)\s*pack/i);
          const packSize = packMatch ? parseInt(packMatch[1]) : this.extractPackSizeFromUrl(url);

          this.log(`[Scraper] Direct fetch extracted from fallback pattern: $${price}${packSize ? ` (${packSize} pack)` : ''}, inStock: ${inStock}`);
          return {
            retailerName: this.getRetailer(url),
            price,
            currency: 'AUD',
            inStock,
            productUrl: url,
            unitCount: packSize,
            unitType: 'nappy',
          };
        }
      }

      return null;
    } catch (error) {
      this.log(`[Scraper] JSON-LD extraction error: ${error instanceof Error ? error.message : 'Unknown'}`);
      return null;
    }
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

    // Woolworths & Coles: Extract from JSON-LD structured data
    if (retailer === 'Woolworths' || retailer === 'Coles') {
      const priceData = this.extractJsonLd(html, url);
      if (priceData) {
        return priceData;
      }
    }

    return null;
  }

  /**
   * Try Firecrawl API using the SDK's scrape method with extract format
   * Works for Coles, Woolworths, Baby Bunting, Big W (with stealth)
   */
  private async tryFirecrawl(url: string, useStealth: boolean = false): Promise<ScrapedPrice | null> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      this.log(`[Scraper] FIRECRAWL_API_KEY not set, skipping Firecrawl`);
      return null;
    }

    this.log(`[Scraper] Trying Firecrawl SDK scrape${useStealth ? ' (stealth)' : ''}...`);

    try {
      const firecrawl = new Firecrawl({ apiKey });

      const result = await firecrawl.scrape(url, {
        formats: [{
          type: 'json',
          prompt: 'Extract the product pricing information. Focus on the CURRENT price shown for buying ONE item (not bulk deals). If there is a multi-buy deal (like "2 for $55"), extract both the single item price AND the multi-buy details separately.',
          schema: EXTRACT_SCHEMA,
        }],
        proxy: useStealth ? 'stealth' : 'auto',
      });

      // Cast to access all properties
      const fullResult = result as {
        success: boolean;
        json?: ExtractedData;
        metadata?: { statusCode?: number };
        error?: string;
      };

      // Try to get extracted data even if success is false (SDK sometimes marks success=false incorrectly)
      const extract = fullResult.json;

      // Check for blocked status - but only reject if we don't have valid price data
      if (fullResult.metadata?.statusCode === 403 && (!extract?.price || extract.price <= 0)) {
        this.log(`[Scraper] Firecrawl blocked (403)`);
        return null;
      }

      if (!extract && !result.success) {
        this.log(`[Scraper] Firecrawl scrape failed: ${fullResult.error || 'Unknown error'}`);
        return null;
      }

      this.log(`[Scraper] Firecrawl raw result: ${JSON.stringify(extract)}`);

      if (extract?.price && extract.price > 0) {
        // NOTE: We intentionally ignore Firecrawl's multi-buy data because
        // the AI frequently hallucinates deals that don't exist.
        // Multi-buy should only be trusted when extracted from structured HTML.
        if (extract.multiBuyQuantity && extract.multiBuyPrice) {
          this.log(`[Scraper] Ignoring Firecrawl multi-buy data (AI often hallucinates): ${extract.multiBuyQuantity} for $${extract.multiBuyPrice}`);
        }

        this.log(`[Scraper] Firecrawl extracted: $${extract.price}`);

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
          // Don't include multi-buy from Firecrawl - it's unreliable (AI hallucinates deals)
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
    this.detectedOutOfStock = false; // Reset for each scrape
    const retailer = this.getRetailer(url);
    this.log(`[Scraper] Scraping ${retailer}: ${url}`);

    try {
      // Step 1: Try direct fetch first (free)
      let price = await this.tryDirectFetch(url);
      if (price) {
        return { success: true, prices: [price], productName: this.extractedProductName };
      }

      // If direct fetch detected the product is out of stock (no price available),
      // don't fall through to Firecrawl which may hallucinate a price from related products
      if (this.detectedOutOfStock) {
        this.log(`[Scraper] Product detected as out of stock via JSON-LD, skipping Firecrawl`);
        return {
          success: true,
          prices: [],
          productName: this.extractedProductName,
          error: 'Product is out of stock'
        };
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
