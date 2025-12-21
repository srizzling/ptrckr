import cron from 'node-cron';
import { getScrapersNeedingRun, markScraperAsRun } from '../db/queries/scrapers';
import { runScraper } from '../scrapers';
import { checkNotifications } from '../notifications';

let schedulerTask: cron.ScheduledTask | null = null;

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

  // Run immediately on startup
  runScheduledScrapers().catch(console.error);
}

export function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    state.isRunning = false;
    console.log('[Scheduler] Scheduler stopped');
  }
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
      try {
        console.log(
          `[Scheduler] Running scraper for product: ${productScraper.product.name}`
        );

        const results = await runScraper(productScraper);
        await markScraperAsRun(productScraper.id);
        state.scrapersRunCount++;

        console.log(
          `[Scheduler] Completed scraper for ${productScraper.product.name}: ${results.length} prices`
        );

        // Check notifications after scrape
        await checkNotifications(productScraper.productId);
      } catch (error) {
        console.error(
          `[Scheduler] Error running scraper ${productScraper.id}:`,
          error
        );
        state.lastError = error instanceof Error ? error.message : 'Unknown error';
        // Still mark as run to prevent immediate retry
        await markScraperAsRun(productScraper.id);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error in scheduler:', error);
    state.lastError = error instanceof Error ? error.message : 'Unknown error';
  }
}

// Export for manual triggering
export { runScheduledScrapers };
