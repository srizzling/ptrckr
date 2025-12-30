export interface ScrapedPrice {
  retailerName: string;
  retailerDomain?: string;
  price: number;
  currency: string;
  inStock: boolean;
  productUrl?: string;
  // Unit pricing fields for consumables (nappies, wipes, etc.)
  unitCount?: number; // e.g., 50 for "50 pack"
  unitType?: string; // e.g., "nappy", "wipe", "piece"
}

export interface ScraperResult {
  success: boolean;
  prices: ScrapedPrice[];
  error?: string;
}

export type LogCallback = (message: string) => void;

export interface ScrapeOptions {
  log?: LogCallback;
  debug?: boolean;
}

export interface Scraper {
  type: string;
  scrape(url: string, hints?: string, options?: ScrapeOptions): Promise<ScraperResult>;
}
