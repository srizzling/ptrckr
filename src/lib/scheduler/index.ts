import cron from 'node-cron';
import { getScrapersNeedingRun } from '../db/queries/scrapers';
import { getWatchedSpeeds } from '../db/queries/nbn';
import { scraperQueue } from '../queue';

let schedulerTask: cron.ScheduledTask | null = null;
let nbnTask: cron.ScheduledTask | null = null;

// Scheduler state for status reporting
interface SchedulerState {
  isRunning: boolean;
  startedAt: Date | null;
  lastCheckAt: Date | null;
  lastRunAt: Date | null;
  scrapersQueuedCount: number;
  lastError: string | null;
}

const state: SchedulerState = {
  isRunning: false,
  startedAt: null,
  lastCheckAt: null,
  lastRunAt: null,
  scrapersQueuedCount: 0,
  lastError: null
};

export function getSchedulerStatus() {
  const queueState = scraperQueue.getState();
  return {
    ...state,
    queue: {
      pending: queueState.pending,
      size: queueState.size,
      isProcessing: queueState.isProcessing,
      processedCount: queueState.processedCount
    }
  };
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

  // NBN refresh job - run daily at midnight AEST (14:00 UTC)
  // Only refreshes watched speed tiers for historical tracking
  nbnTask = cron.schedule('0 14 * * *', async () => {
    await queueNbnRefresh();
  });

  console.log('[Scheduler] NBN watched speeds refresh scheduled - daily at midnight AEST (14:00 UTC)');

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
    console.log(`[Scheduler] Found ${scrapersToRun.length} scrapers to queue`);

    // Add all scrapers to the global queue
    scraperQueue.addMultiple(scrapersToRun, 'scheduled');
    state.scrapersQueuedCount += scrapersToRun.length;

    console.log(`[Scheduler] Queued ${scrapersToRun.length} scrapers`);
  } catch (error) {
    console.error('[Scheduler] Error in scheduler:', error);
    state.lastError = error instanceof Error ? error.message : 'Unknown error';
  }
}

async function queueNbnRefresh() {
  try {
    const watchedSpeeds = await getWatchedSpeeds();

    if (watchedSpeeds.length === 0) {
      console.log('[Scheduler] No NBN speeds being watched, skipping refresh');
      return;
    }

    console.log(`[Scheduler] Queuing NBN refresh for ${watchedSpeeds.length} speed tiers`);

    const speeds = watchedSpeeds.map((ws) => ({
      speed: ws.speed,
      label: ws.label
    }));

    scraperQueue.addNbnRefreshMultiple(speeds, 'scheduled');
    console.log(`[Scheduler] Queued ${speeds.length} NBN speed tiers for refresh`);
  } catch (error) {
    console.error('[Scheduler] Error queuing NBN refresh:', error);
  }
}

// Export for manual triggering
export { runScheduledScrapers, queueNbnRefresh };
