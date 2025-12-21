import { staticiceScraper } from './staticice';
import { pcpartpickerScraper } from './pcpartpicker';
import type { Scraper, ScrapedPrice } from './types';
import { getOrCreateRetailer, createPriceRecords } from '../db/queries/prices';
import type { ProductScraper, Scraper as ScraperModel } from '../db/schema';

// Registry of available scrapers
const scrapers: Record<string, Scraper> = {
  staticice: staticiceScraper,
  pcpartpicker: pcpartpickerScraper
};

export function getScraper(type: string): Scraper | undefined {
  return scrapers[type];
}

export async function runScraper(
  productScraper: ProductScraper & { scraper: ScraperModel }
): Promise<{ retailerId: number; price: number }[]> {
  const scraper = getScraper(productScraper.scraper.type);

  if (!scraper) {
    throw new Error(`Unknown scraper type: ${productScraper.scraper.type}`);
  }

  console.log(
    `[Scraper] Running ${productScraper.scraper.name} for product scraper ${productScraper.id}`
  );
  console.log(`[Scraper] URL: ${productScraper.url}`);

  const result = await scraper.scrape(productScraper.url);

  if (!result.success) {
    throw new Error(result.error || 'Scraper failed');
  }

  console.log(`[Scraper] Found ${result.prices.length} prices`);

  // Debug: log each price found
  for (const p of result.prices) {
    console.log(`[Scraper]   - ${p.retailerName}: $${p.price}`);
  }

  // Save price records
  const priceRecords: {
    productScraperId: number;
    retailerId: number;
    price: number;
    currency: string;
    inStock: boolean;
    productUrl: string | null;
  }[] = [];

  for (const scrapedPrice of result.prices) {
    // Get or create retailer
    const retailer = await getOrCreateRetailer(
      scrapedPrice.retailerName,
      scrapedPrice.retailerDomain
    );

    priceRecords.push({
      productScraperId: productScraper.id,
      retailerId: retailer.id,
      price: scrapedPrice.price,
      currency: scrapedPrice.currency,
      inStock: scrapedPrice.inStock,
      productUrl: scrapedPrice.productUrl || null
    });
  }

  if (priceRecords.length > 0) {
    await createPriceRecords(priceRecords);
  }

  console.log(`[Scraper] Saved ${priceRecords.length} price records`);

  return priceRecords.map((r) => ({
    retailerId: r.retailerId,
    price: r.price
  }));
}

export type { ScrapedPrice, Scraper };
