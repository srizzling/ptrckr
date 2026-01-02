import { staticiceScraper } from './staticice';
import { pcpartpickerScraper } from './pcpartpicker';
import { pbtechScraper } from './pbtech';
import { dellScraper } from './dell';
import { aiScraper } from './ai';
import type { Scraper, ScrapedPrice } from './types';
import { getOrCreateRetailer, createPriceRecords } from '../db/queries/prices';
import { createScraperRun, getLastSuccessfulRun } from '../db/queries/scraper-runs';
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

export interface ScraperRunOptions {
  onLog?: LogCallback;
  debug?: boolean;
  force?: boolean; // Bypass cache check (for manual UI runs)
}

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
  options?: ScraperRunOptions | LogCallback
): Promise<ScraperRunResult> {
  // Handle both old callback-style and new options-style calls
  const opts: ScraperRunOptions = typeof options === 'function'
    ? { onLog: options }
    : options || {};

  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
    opts.onLog?.(msg);
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

    // Get last successful run for cache check
    const lastSuccess = await getLastSuccessfulRun(productScraper.id);
    if (opts.force) {
      log(`[Scraper] Force mode - bypassing cache`);
    }

    const result = await scraper.scrape(productScraper.url, productScraper.hints ?? undefined, {
      log,
      debug: opts.debug,
      lastSuccessfulScrape: lastSuccess?.createdAt,
      force: opts.force
    });

    if (!result.success) {
      throw new Error(result.error || 'Scraper failed');
    }

    // Handle cached results - treat as warning, not error
    if (result.cached) {
      status = 'warning';
      errorMessage = result.error || 'Cached - skipped';
      log(`[Scraper] ${errorMessage}`);
    } else {
      pricesFound = result.prices.length;
      log(`[Scraper] Found ${pricesFound} prices`);

      // Debug: log each price found
      for (const p of result.prices) {
        const unitInfo = p.unitCount ? ` (${p.unitCount} ${p.unitType || 'units'})` : '';
        log(`[Scraper]   - ${p.retailerName}: $${p.price}${unitInfo}`);
      }

      // Save price records
      const priceRecords: {
        productScraperId: number;
        retailerId: number;
        price: number;
        currency: string;
        inStock: boolean;
        productUrl: string | null;
        unitCount: number | null;
        unitType: string | null;
        pricePerUnit: number | null;
      }[] = [];

      for (const scrapedPrice of result.prices) {
        const retailer = await getOrCreateRetailer(
          scrapedPrice.retailerName,
          scrapedPrice.retailerDomain
        );

        // Calculate price per unit if unit count is available
        const pricePerUnit =
          scrapedPrice.unitCount && scrapedPrice.unitCount > 0
            ? scrapedPrice.price / scrapedPrice.unitCount
            : null;

        priceRecords.push({
          productScraperId: productScraper.id,
          retailerId: retailer.id,
          price: scrapedPrice.price,
          currency: scrapedPrice.currency,
          inStock: scrapedPrice.inStock,
          productUrl: scrapedPrice.productUrl || null,
          unitCount: scrapedPrice.unitCount ?? null,
          unitType: scrapedPrice.unitType ?? null,
          pricePerUnit
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
