import cron from 'node-cron';
import { getScrapersNeedingRun, markScraperAsRun } from '../db/queries/scrapers';
import { runScraper } from '../scrapers';
import { checkNotifications } from '../notifications';
import { refreshAllNbnSpeeds } from '../nbn/refresh';

let schedulerTask: cron.ScheduledTask | null = null;
let nbnTask: cron.ScheduledTask | null = null;

// Scheduler state for status reporting
interface SchedulerState {
  isRunning: boolean;
  startedAt: Date | null;
  lastCheckAt: Date | null;
  lastRunAt: Date | null;
  scrapersRunCount: number;
  lastError: string | null;
}

const state: SchedulerState = {
  isRunning: false,
  startedAt: null,
  lastCheckAt: null,
  lastRunAt: null,
  scrapersRunCount: 0,
  lastError: null
};

export function getSchedulerStatus() {
  return { ...state };
}

export function startScheduler() {
  if (schedulerTask) {
    console.log('[Scheduler] Scheduler already running');
    return;
  }

  console.log('[Scheduler] Starting scheduler...');

  state.isRunning = true;
  state.startedAt = new Date();

  // Run every minute to check for scrapers that need to run
  schedulerTask = cron.schedule('* * * * *', async () => {
    await runScheduledScrapers();
  });

  console.log('[Scheduler] Scheduler started - checking every minute for due scrapers');

  // NBN refresh job - run every 6 hours
  nbnTask = cron.schedule('0 */6 * * *', async () => {
    await refreshAllNbnSpeeds();
  });

  console.log('[Scheduler] NBN refresh scheduled - every 6 hours');

  // Run immediately on startup
  runScheduledScrapers().catch(console.error);
}

export function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
  if (nbnTask) {
    nbnTask.stop();
    nbnTask = null;
  }
  state.isRunning = false;
  console.log('[Scheduler] Scheduler stopped');
}

async function runScheduledScrapers() {
  state.lastCheckAt = new Date();

  try {
    const scrapersToRun = await getScrapersNeedingRun();

    if (scrapersToRun.length === 0) {
      return;
    }

    state.lastRunAt = new Date();
    console.log(`[Scheduler] Found ${scrapersToRun.length} scrapers to run`);

    for (const productScraper of scrapersToRun) {
      console.log(
        `[Scheduler] Running scraper for product: ${productScraper.product.name}`
      );

      const result = await runScraper(productScraper);
      state.scrapersRunCount++;

      // Update productScraper status based on run result
      const scraperStatus = result.status === 'error' ? 'error' : 'success';
      await markScraperAsRun(productScraper.id, scraperStatus, result.errorMessage);

      if (result.status === 'error') {
        state.lastError = result.errorMessage || 'Unknown error';
      }

      console.log(
        `[Scheduler] Completed scraper for ${productScraper.product.name}: ${result.pricesSaved} prices (${result.status})`
      );

      // Check notifications after scrape (only if we got prices)
      if (result.pricesFound > 0) {
        await checkNotifications(productScraper.productId);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error in scheduler:', error);
    state.lastError = error instanceof Error ? error.message : 'Unknown error';
  }
}

// Export for manual triggering
export { runScheduledScrapers };
