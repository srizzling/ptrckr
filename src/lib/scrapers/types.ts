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

export interface Scraper {
  type: string;
  scrape(url: string, hints?: string): Promise<ScraperResult>;
}
