import {
  addSpeedSnapshot,
  getLatestSnapshotsByProvider,
  cachePlans,
  createNbnRefreshRun
} from '../db/queries/nbn';
import { fetchTopPlansForSpeed, fetchAllPlansForSpeed, type NBNPlanWithCosts } from './api-client';
import type { WatchedNbnSpeed } from '../db/schema';

const TOP_PLANS_TO_TRACK = 10;

export type LogCallback = (message: string) => void;

export interface NbnRefreshOptions {
  onLog?: LogCallback;
}

export interface NbnRefreshResult {
  success: boolean;
  plansFetched: number;
  plansCached: number;
  snapshotsSaved: number;
  logs: string[];
  runId?: number;
  errorMessage?: string;
}

/**
 * Refresh a single speed tier (scheduled refresh):
 * 1. Fetch top plans from NetBargains API (single page, ~50 plans)
 * 2. Cache these top plans for basic UI access
 * 3. Track top N plans in snapshots for historical data
 *
 * This uses single-page fetch to reduce API calls (~1 call vs ~3 calls per tier).
 * For full plan list, use refreshSingleSpeedTier() which fetches all pages.
 */
export async function refreshNbnSpeed(
  watchedSpeed: WatchedNbnSpeed,
  options?: NbnRefreshOptions
): Promise<NbnRefreshResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
    options?.onLog?.(msg);
  };

  const startTime = Date.now();
  let plansFetched = 0;
  let plansCached = 0;
  let snapshotsSaved = 0;

  try {
    log(`[NBN] Refreshing speed tier: ${watchedSpeed.label}`);

    // Fetch top plans only (single page, no pagination - reduces API calls)
    const plans = await fetchTopPlansForSpeed(watchedSpeed.speed);
    plansFetched = plans.length;

    if (plans.length === 0) {
      log(`[NBN] No plans found for speed ${watchedSpeed.speed}`);
      const run = await createNbnRefreshRun({
        watchedSpeedId: watchedSpeed.id,
        status: 'warning',
        plansFetched: 0,
        plansCached: 0,
        snapshotsSaved: 0,
        errorMessage: 'No plans found',
        logs: JSON.stringify(logs),
        durationMs: Date.now() - startTime
      });
      return { success: false, plansFetched: 0, plansCached: 0, snapshotsSaved: 0, logs, runId: run.id, errorMessage: 'No plans found' };
    }

    // Cache top plans for basic UI access
    plansCached = await cachePlans(watchedSpeed.speed, plans);
    log(`[NBN] Cached ${plansCached} top plans for ${watchedSpeed.label}`);

    // Sort by yearly cost and take top N for snapshot tracking
    // Plans are already sorted by monthly_price from API, but sort by yearly_cost to be safe
    const sortedPlans = [...plans].sort((a, b) => a.yearly_cost - b.yearly_cost);
    const topPlans = sortedPlans.slice(0, TOP_PLANS_TO_TRACK);

    log(`[NBN] Top ${topPlans.length} plans for ${watchedSpeed.label}:`);
    topPlans.forEach((p, i) => log(`  ${i + 1}. ${p.provider_name}: $${p.yearly_cost}/yr`));

    // Get latest snapshots for each provider we're tracking
    const latestByProvider = await getLatestSnapshotsByProvider(watchedSpeed.id);

    // Save snapshots for plans that have changed (for historical tracking)
    for (const plan of topPlans) {
      const latest = latestByProvider.get(plan.provider_name);

      // Save if price/plan changed OR if we now have CIS/speed data that was missing
      const hasMissingData = latest && (
        (!latest.cisUrl && plan.cis_url) ||
        (!latest.typicalEveningSpeed && plan.typical_evening_speed)
      );

      if (!latest ||
          latest.yearlyCost !== plan.yearly_cost ||
          latest.planName !== plan.plan_name ||
          hasMissingData) {

        await addSpeedSnapshot({
          watchedSpeedId: watchedSpeed.id,
          providerName: plan.provider_name,
          planName: plan.plan_name,
          monthlyPrice: plan.monthly_price,
          promoValue: plan.promo_value,
          promoDuration: plan.promo_duration,
          yearlyCost: plan.yearly_cost,
          setupFee: plan.setup_fee,
          typicalEveningSpeed: plan.typical_evening_speed,
          cisUrl: plan.cis_url
        });
        snapshotsSaved++;
      }
    }

    if (snapshotsSaved > 0) {
      log(`[NBN] Saved ${snapshotsSaved} new snapshots for ${watchedSpeed.label}`);
    } else {
      log(`[NBN] No changes for ${watchedSpeed.label}`);
    }

    // Create run record
    const run = await createNbnRefreshRun({
      watchedSpeedId: watchedSpeed.id,
      status: 'success',
      plansFetched,
      plansCached,
      snapshotsSaved,
      logs: JSON.stringify(logs),
      durationMs: Date.now() - startTime
    });

    return { success: true, plansFetched, plansCached, snapshotsSaved, logs, runId: run.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`[NBN] Error refreshing ${watchedSpeed.label}: ${errorMessage}`);

    // Create error run record
    const run = await createNbnRefreshRun({
      watchedSpeedId: watchedSpeed.id,
      status: 'error',
      plansFetched,
      plansCached,
      snapshotsSaved,
      errorMessage,
      logs: JSON.stringify(logs),
      durationMs: Date.now() - startTime
    });

    return { success: false, plansFetched, plansCached, snapshotsSaved, logs, runId: run.id, errorMessage };
  }
}

/**
 * Refresh all watched speed tiers.
 * Called by scheduler (daily) to maintain historical tracking.
 */
export async function refreshAllWatchedSpeeds(): Promise<void> {
  const { getWatchedSpeeds } = await import('../db/queries/nbn');
  const speeds = await getWatchedSpeeds();

  console.log(`[NBN] Scheduled refresh: ${speeds.length} watched speed tiers`);

  for (const speed of speeds) {
    await refreshNbnSpeed(speed);
    // Small delay between speed tiers
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[NBN] Scheduled refresh complete`);
}

/**
 * Refresh a single speed tier by speed value.
 * Called manually from the NBN comparison page.
 * If the speed is watched, also updates snapshots for historical tracking.
 */
export async function refreshSingleSpeedTier(speedValue: number): Promise<{ cached: number; isWatched: boolean }> {
  const { getWatchedSpeeds } = await import('../db/queries/nbn');

  console.log(`[NBN] Manual refresh: speed tier ${speedValue}`);

  // Check if this speed is watched (for snapshot tracking)
  const watchedSpeeds = await getWatchedSpeeds();
  const watchedSpeed = watchedSpeeds.find(ws => ws.speed === speedValue);

  // Fetch all plans for this speed tier
  const allPlans = await fetchAllPlansForSpeed(speedValue);

  if (allPlans.length === 0) {
    console.log(`[NBN] No plans found for speed ${speedValue}`);
    return { cached: 0, isWatched: !!watchedSpeed };
  }

  // Store ALL plans in cache for UI access
  const cachedCount = await cachePlans(speedValue, allPlans);
  console.log(`[NBN] Cached ${cachedCount} plans for speed ${speedValue}`);

  // If this speed is watched, also update snapshots for historical tracking
  if (watchedSpeed) {
    const sortedPlans = [...allPlans].sort((a, b) => a.yearly_cost - b.yearly_cost);
    const topPlans = sortedPlans.slice(0, 10);

    const latestByProvider = await getLatestSnapshotsByProvider(watchedSpeed.id);

    let savedCount = 0;
    for (const plan of topPlans) {
      const latest = latestByProvider.get(plan.provider_name);

      const hasMissingData = latest && (
        (!latest.cisUrl && plan.cis_url) ||
        (!latest.typicalEveningSpeed && plan.typical_evening_speed)
      );

      if (!latest ||
          latest.yearlyCost !== plan.yearly_cost ||
          latest.planName !== plan.plan_name ||
          hasMissingData) {

        await addSpeedSnapshot({
          watchedSpeedId: watchedSpeed.id,
          providerName: plan.provider_name,
          planName: plan.plan_name,
          monthlyPrice: plan.monthly_price,
          promoValue: plan.promo_value,
          promoDuration: plan.promo_duration,
          yearlyCost: plan.yearly_cost,
          setupFee: plan.setup_fee,
          typicalEveningSpeed: plan.typical_evening_speed,
          cisUrl: plan.cis_url
        });
        savedCount++;
      }
    }

    if (savedCount > 0) {
      console.log(`[NBN] Saved ${savedCount} new snapshots for watched speed ${speedValue}`);
    }
  }

  console.log(`[NBN] Manual refresh complete for speed ${speedValue}`);
  return { cached: cachedCount, isWatched: !!watchedSpeed };
}
