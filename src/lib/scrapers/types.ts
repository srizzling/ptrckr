export interface ScrapedPrice {
  retailerName: string;
  retailerDomain?: string;
  price: number;
  currency: string;
  inStock: boolean;
  preorderStatus?: 'preorder' | 'backorder' | null; // null = normal, 'preorder' = available for preorder, 'backorder' = on backorder
  productUrl?: string;
  // Unit pricing fields for consumables (nappies, wipes, etc.)
  unitCount?: number; // e.g., 50 for "50 pack"
  unitType?: string; // e.g., "nappy", "wipe", "piece"
  // Multi-buy deal fields (e.g., "2 for $55")
  multiBuyQuantity?: number; // e.g., 2 for "2 for $55"
  multiBuyPrice?: number; // e.g., 55.00 for "2 for $55"
}

export interface ScraperResult {
  success: boolean;
  prices: ScrapedPrice[];
  error?: string;
  cached?: boolean; // True when scraper was skipped due to cache
}

export type LogCallback = (message: string) => void;

export interface ScrapeOptions {
  log?: LogCallback;
  debug?: boolean;
  lastSuccessfulScrape?: Date; // Skip Firecrawl if recent successful scrape exists
  force?: boolean; // Bypass cache check (for manual runs)
}

export interface Scraper {
  type: string;
  scrape(url: string, hints?: string, options?: ScrapeOptions): Promise<ScraperResult>;
}
