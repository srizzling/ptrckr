export interface ScrapedPrice {
  retailerName: string;
  retailerDomain?: string;
  price: number;
  currency: string;
  inStock: boolean;
  productUrl?: string;
}

export interface ScraperResult {
  success: boolean;
  prices: ScrapedPrice[];
  error?: string;
}

export interface Scraper {
  type: string;
  scrape(url: string): Promise<ScraperResult>;
}
