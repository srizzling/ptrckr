import type { Scraper, ScraperResult, ScrapedPrice, LogCallback, ScrapeOptions } from './types';
import { getSettingNumber } from '../db/queries/settings';

// Firecrawl extract schema for Amazon product prices
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    productName: { type: 'string', description: 'The name of the product' },
    price: { type: 'number', description: 'The current price of the product in dollars (e.g., 49.99)' },
    originalPrice: { type: 'number', description: 'The original/was/RRP price if on sale or crossed out' },
    inStock: { type: 'boolean', description: 'Whether the product is in stock and available for purchase' },
    packSize: { type: 'number', description: 'Number of items in the pack if applicable (e.g., 50 for a 50-pack)' },
    rating: { type: 'number', description: 'The product rating out of 5' },
    reviewCount: { type: 'number', description: 'Number of customer reviews' },
  },
  required: ['price'],
};

export class AmazonScraper implements Scraper {
  type = 'amazon';
  private log: LogCallback = console.log;
  private extractedProductName: string | undefined;

  private getCountryFromUrl(url: string): { country: string; currency: string; retailerName: string } {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('amazon.com.au')) {
      return { country: 'AU', currency: 'AUD', retailerName: 'Amazon Australia' };
    }
    if (hostname.includes('amazon.co.uk')) {
      return { country: 'GB', currency: 'GBP', retailerName: 'Amazon UK' };
    }
    if (hostname.includes('amazon.ca')) {
      return { country: 'CA', currency: 'CAD', retailerName: 'Amazon Canada' };
    }
    if (hostname.includes('amazon.de')) {
      return { country: 'DE', currency: 'EUR', retailerName: 'Amazon Germany' };
    }
    if (hostname.includes('amazon.co.jp')) {
      return { country: 'JP', currency: 'JPY', retailerName: 'Amazon Japan' };
    }
    // Default to US
    return { country: 'US', currency: 'USD', retailerName: 'Amazon' };
  }

  private extractPackSizeFromUrl(url: string): number | undefined {
    // Try to extract pack size from URL patterns like "50-pack" or "50-count"
    const match = url.match(/(\d+)-?(?:pack|count|ct|pcs|pieces)/i);
    if (match) {
      const num = parseInt(match[1]);
      if (num >= 2 && num <= 1000) return num;
    }
    return undefined;
  }

  private extractPackSizeFromTitle(title: string): number | undefined {
    // Try patterns like "Pack of 50", "50 Count", "50-Pack", etc.
    const patterns = [
      /pack\s+of\s+(\d+)/i,
      /(\d+)\s*[-]?\s*(?:pack|count|ct|pcs|pieces)/i,
      /\((\d+)\s*(?:pack|count|ct)\)/i,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        if (num >= 2 && num <= 1000) return num;
      }
    }
    return undefined;
  }

  private shouldSkipFirecrawl(lastSuccessfulScrape?: Date): { skip: boolean; cacheHours: number } {
    const cacheHours = getSettingNumber('scraper_cache_hours', 168);
    if (!lastSuccessfulScrape) return { skip: false, cacheHours };
    const hoursSinceLastScrape = (Date.now() - lastSuccessfulScrape.getTime()) / (1000 * 60 * 60);
    return { skip: hoursSinceLastScrape < cacheHours, cacheHours };
  }

  private async tryFirecrawl(url: string): Promise<{ price: ScrapedPrice | null; productName?: string }> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      this.log(`[Amazon Scraper] FIRECRAWL_API_KEY not set, skipping Firecrawl`);
      return { price: null };
    }

    const { country, currency, retailerName } = this.getCountryFromUrl(url);
    this.log(`[Amazon Scraper] Trying Firecrawl for ${retailerName}...`);

    try {
      const body: Record<string, unknown> = {
        url,
        formats: ['extract'],
        extract: { schema: EXTRACT_SCHEMA },
        location: {
          country,
          languages: [country === 'US' ? 'en-US' : `en-${country}`],
        },
      };

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
        this.log(`[Amazon Scraper] Firecrawl error: ${response.status} - ${data.error || 'Unknown'}`);
        return { price: null };
      }

      const extract = data.data?.extract;
      const statusCode = data.data?.metadata?.statusCode;

      // Check if blocked
      if (statusCode === 403 || statusCode === 503) {
        this.log(`[Amazon Scraper] Firecrawl blocked (${statusCode})`);
        return { price: null };
      }

      if (extract?.price && extract.price > 0) {
        const productName = extract.productName;
        const packSize = extract.packSize || this.extractPackSizeFromTitle(productName || '') || this.extractPackSizeFromUrl(url);

        this.log(`[Amazon Scraper] Firecrawl extracted: $${extract.price}${packSize ? ` (${packSize} pack)` : ''}`);
        if (productName) {
          this.log(`[Amazon Scraper] Product name: ${productName}`);
        }

        return {
          price: {
            retailerName,
            retailerDomain: new URL(url).hostname,
            price: extract.price,
            currency,
            inStock: extract.inStock !== false,
            productUrl: url,
            unitCount: packSize,
            unitType: packSize ? 'item' : undefined,
          },
          productName,
        };
      }

      this.log(`[Amazon Scraper] Firecrawl returned no price`);
      return { price: null };
    } catch (error) {
      this.log(`[Amazon Scraper] Firecrawl error: ${error instanceof Error ? error.message : 'Unknown'}`);
      return { price: null };
    }
  }

  async scrape(url: string, hints?: string, options?: ScrapeOptions): Promise<ScraperResult> {
    this.log = options?.log || console.log;
    this.extractedProductName = undefined;

    const { retailerName } = this.getCountryFromUrl(url);
    this.log(`[Amazon Scraper] Scraping ${retailerName}: ${url}`);

    try {
      // Check cache - skip Firecrawl if recent successful scrape (unless forced)
      const { skip, cacheHours } = this.shouldSkipFirecrawl(options?.lastSuccessfulScrape);
      if (!options?.force && skip) {
        const hours = Math.round((Date.now() - options!.lastSuccessfulScrape!.getTime()) / (1000 * 60 * 60));
        this.log(`[Amazon Scraper] Skipping Firecrawl - last success was ${hours}h ago (cache: ${cacheHours}h)`);
        return {
          success: true,
          prices: [],
          cached: true,
          error: `Cached - last successful scrape was ${hours}h ago`
        };
      }

      // Try Firecrawl
      const result = await this.tryFirecrawl(url);

      if (result.price) {
        this.extractedProductName = result.productName;
        return {
          success: true,
          prices: [result.price],
          productName: this.extractedProductName
        };
      }

      this.log(`[Amazon Scraper] No price found for ${url}`);
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

export const amazonScraper = new AmazonScraper();
