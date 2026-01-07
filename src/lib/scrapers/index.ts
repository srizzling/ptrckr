import { staticiceScraper } from './staticice';
import { pcpartpickerScraper } from './pcpartpicker';
import { pbtechScraper } from './pbtech';
import { dellScraper } from './dell';
import { aiScraper } from './ai';
import { amazonScraper } from './amazon';
import type { Scraper, ScrapedPrice } from './types';
import { getOrCreateRetailer, createPriceRecords, getLatestPricesForProductScraper } from '../db/queries/prices';
import { createScraperRun, getLastSuccessfulRun } from '../db/queries/scraper-runs';
import type { ProductScraper, Scraper as ScraperModel } from '../db/schema';
import { checkRetailerStock, shouldVerifyStock } from './stock-checker';

// Registry of available scrapers
const scrapers: Record<string, Scraper> = {
  staticice: staticiceScraper,
  pcpartpicker: pcpartpickerScraper,
  pbtech: pbtechScraper,
  dell: dellScraper,
  ai: aiScraper,
  amazon: amazonScraper
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
  status: 'success' | 'warning' | 'error' | 'cached';
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

    // Handle cached results - duplicate price records with current timestamp
    // so they appear in the graph for today
    if (result.cached) {
      log(`[Scraper] Using cached prices from previous run`);

      // Get the latest price records from the previous run
      const previousPrices = await getLatestPricesForProductScraper(productScraper.id);
      log(`[Scraper] Found ${previousPrices.length} cached prices to duplicate`);

      // Create new price records with current timestamp
      let cachedPricesSaved = 0;
      if (previousPrices.length > 0) {
        const newRecords = previousPrices.map((record) => ({
          productScraperId: productScraper.id,
          retailerId: record.retailerId,
          price: record.price,
          currency: record.currency,
          inStock: record.inStock,
          productUrl: record.productUrl,
          unitCount: record.unitCount,
          unitType: record.unitType,
          pricePerUnit: record.pricePerUnit,
          multiBuyQuantity: record.multiBuyQuantity,
          multiBuyPrice: record.multiBuyPrice,
          multiBuyPricePerUnit: record.multiBuyPricePerUnit
        }));

        await createPriceRecords(newRecords);
        cachedPricesSaved = newRecords.length;
        log(`[Scraper] Duplicated ${cachedPricesSaved} price records with current timestamp`);
      }

      // Create a cached run record
      const run = await createScraperRun({
        productScraperId: productScraper.id,
        status: 'cached',
        pricesFound: previousPrices.length,
        pricesSaved: cachedPricesSaved,
        errorMessage: `Cached - duplicated prices from ${lastSuccess?.createdAt?.toISOString() ?? 'previous run'}`,
        logs: JSON.stringify(logs),
        durationMs: Date.now() - startTime
      });

      return {
        pricesSaved: cachedPricesSaved,
        pricesFound: previousPrices.length,
        status: 'cached',
        logs,
        runId: run.id
      };
    } else {
      pricesFound = result.prices.length;
      log(`[Scraper] Found ${pricesFound} prices`);

      // Debug: log each price found
      for (const p of result.prices) {
        const unitInfo = p.unitCount ? ` (${p.unitCount} ${p.unitType || 'units'})` : '';
        const multiBuyInfo = p.multiBuyQuantity && p.multiBuyPrice ? ` [${p.multiBuyQuantity} for $${p.multiBuyPrice}]` : '';
        log(`[Scraper]   - ${p.retailerName}: $${p.price}${unitInfo}${multiBuyInfo}`);
      }

      // Verify stock status for aggregator sites
      const shouldVerifyAnyStock = result.prices.some(
        (price) => price.productUrl && shouldVerifyStock(productScraper.scraper.type, price.productUrl)
      );
      if (shouldVerifyAnyStock) {
        log(`[Scraper] Verifying stock status on retailer sites...`);
        
        for (const price of result.prices) {
          if (price.productUrl && shouldVerifyStock(productScraper.scraper.type, price.productUrl)) {
            try {
              const stockCheck = await checkRetailerStock(price.productUrl);
              price.inStock = stockCheck.inStock;
              price.preorderStatus = stockCheck.preorderStatus;
              
              const statusText = !stockCheck.inStock 
                ? 'OUT OF STOCK' 
                : stockCheck.preorderStatus 
                ? stockCheck.preorderStatus.toUpperCase() 
                : 'IN STOCK';
              log(`[Scraper]   - ${price.retailerName}: ${statusText}`);
            } catch (error) {
              log(`[Scraper]   - ${price.retailerName}: Stock check failed, assuming in stock`);
            }
          }
        }
      }

      // Save price records
      const priceRecords: {
        productScraperId: number;
        retailerId: number;
        price: number;
        currency: string;
        inStock: boolean;
        preorderStatus: 'preorder' | 'backorder' | null;
        productUrl: string | null;
        unitCount: number | null;
        unitType: string | null;
        pricePerUnit: number | null;
        multiBuyQuantity: number | null;
        multiBuyPrice: number | null;
        multiBuyPricePerUnit: number | null;
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

        // Calculate multi-buy price per unit
        // Formula: multiBuyPrice / multiBuyQuantity / unitCount
        // e.g., $55 / 2 packs / 108 nappies = $0.255/nappy
        const multiBuyPricePerUnit =
          scrapedPrice.multiBuyQuantity &&
          scrapedPrice.multiBuyPrice &&
          scrapedPrice.unitCount &&
          scrapedPrice.multiBuyQuantity > 0 &&
          scrapedPrice.unitCount > 0
            ? scrapedPrice.multiBuyPrice / scrapedPrice.multiBuyQuantity / scrapedPrice.unitCount
            : null;

        priceRecords.push({
          productScraperId: productScraper.id,
          retailerId: retailer.id,
          price: scrapedPrice.price,
          currency: scrapedPrice.currency,
          inStock: scrapedPrice.inStock,
          preorderStatus: scrapedPrice.preorderStatus ?? null,
          productUrl: scrapedPrice.productUrl || null,
          unitCount: scrapedPrice.unitCount ?? null,
          unitType: scrapedPrice.unitType ?? null,
          pricePerUnit,
          multiBuyQuantity: scrapedPrice.multiBuyQuantity ?? null,
          multiBuyPrice: scrapedPrice.multiBuyPrice ?? null,
          multiBuyPricePerUnit
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
