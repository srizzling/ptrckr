import { staticiceScraper } from './staticice';
import { pcpartpickerScraper } from './pcpartpicker';
import { pbtechScraper } from './pbtech';
import { dellScraper } from './dell';
import { aiScraper } from './ai';
import type { Scraper, ScrapedPrice } from './types';
import { getOrCreateRetailer, createPriceRecords } from '../db/queries/prices';
import { createScraperRun } from '../db/queries/scraper-runs';
import type { ProductScraper, Scraper as ScraperModel } from '../db/schema';

// Registry of available scrapers
const scrapers: Record<string, Scraper> = {
  staticice: staticiceScraper,
  pcpartpicker: pcpartpickerScraper,
  pbtech: pbtechScraper,
  dell: dellScraper,
  ai: aiScraper
};

export function getScraper(type: string): Scraper | undefined {
  return scrapers[type];
}

export type LogCallback = (message: string) => void;

export interface ScraperRunResult {
  pricesSaved: number;
  pricesFound: number;
  status: 'success' | 'warning' | 'error';
  errorMessage?: string;
  logs: string[];
  runId: number;
}

export async function runScraper(
  productScraper: ProductScraper & { scraper: ScraperModel },
  onLog?: LogCallback
): Promise<ScraperRunResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
    onLog?.(msg);
  };

  const startTime = Date.now();
  let status: 'success' | 'warning' | 'error' = 'success';
  let errorMessage: string | undefined;
  let pricesFound = 0;
  let pricesSaved = 0;

  try {
    const scraper = getScraper(productScraper.scraper.type);

    if (!scraper) {
      throw new Error(`Unknown scraper type: ${productScraper.scraper.type}`);
    }

    log(`[Scraper] Running ${productScraper.scraper.name} for product scraper ${productScraper.id}`);
    log(`[Scraper] URL: ${productScraper.url}`);
    if (productScraper.hints) {
      log(`[Scraper] Hints: ${productScraper.hints}`);
    }

    const result = await scraper.scrape(productScraper.url, productScraper.hints ?? undefined);

    if (!result.success) {
      throw new Error(result.error || 'Scraper failed');
    }

    pricesFound = result.prices.length;
    log(`[Scraper] Found ${pricesFound} prices`);

    // Debug: log each price found
    for (const p of result.prices) {
      log(`[Scraper]   - ${p.retailerName}: $${p.price}`);
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

    pricesSaved = priceRecords.length;
    log(`[Scraper] Saved ${pricesSaved} price records`);

    // Mark as warning if no prices found
    if (pricesFound === 0) {
      status = 'warning';
      errorMessage = 'No prices found';
      log(`[Scraper] Warning: No prices extracted`);
    }
  } catch (error) {
    status = 'error';
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`[Scraper] Error: ${errorMessage}`);
  }

  // Create scraper run record
  const run = await createScraperRun({
    productScraperId: productScraper.id,
    status,
    pricesFound,
    pricesSaved,
    errorMessage,
    logs: JSON.stringify(logs),
    durationMs: Date.now() - startTime
  });

  return {
    pricesSaved,
    pricesFound,
    status,
    errorMessage,
    logs,
    runId: run.id
  };
}

export type { ScrapedPrice, Scraper };
