import { eq, desc } from 'drizzle-orm';
import { db, watchedNbnSpeeds, nbnSpeedSnapshots, userNbnPlans, nbnPlansCache, nbnRefreshState } from '../index';
import type { NewWatchedNbnSpeed, NewNbnSpeedSnapshot, NewUserNbnPlan, NewNbnPlanCache } from '../schema';
import type { NBNPlanWithCosts } from '../../nbn/api-client';

const SPEED_LABELS: Record<number, string> = {
  25: 'NBN 25 (25/5 Mbps)',
  50: 'NBN 50 (50/20 Mbps)',
  100: 'NBN 100 (100/20 Mbps)',
  250: 'NBN 250 (250/25 Mbps)',
  500: 'NBN 500 (500/50 Mbps)',
  1000: 'NBN 1000 (1000/50 Mbps)'
};

export async function getWatchedSpeeds() {
  return db.query.watchedNbnSpeeds.findMany({
    orderBy: [watchedNbnSpeeds.speed],
    with: {
      snapshots: {
        orderBy: [desc(nbnSpeedSnapshots.scrapedAt)],
        limit: 30 // Last 30 snapshots for sparkline
      }
    }
  });
}

export async function getWatchedSpeedById(id: number) {
  return db.query.watchedNbnSpeeds.findFirst({
    where: eq(watchedNbnSpeeds.id, id),
    with: {
      snapshots: {
        orderBy: [desc(nbnSpeedSnapshots.scrapedAt)],
        limit: 30
      }
    }
  });
}

// Get watched speed with full history for detail page
export async function getWatchedSpeedWithHistory(id: number) {
  return db.query.watchedNbnSpeeds.findFirst({
    where: eq(watchedNbnSpeeds.id, id),
    with: {
      snapshots: {
        orderBy: [desc(nbnSpeedSnapshots.scrapedAt)]
        // No limit - get all snapshots for history view
      }
    }
  });
}

export async function getWatchedSpeedBySpeed(speed: number) {
  return db.query.watchedNbnSpeeds.findFirst({
    where: eq(watchedNbnSpeeds.speed, speed)
  });
}

export async function watchSpeed(speed: number) {
  // Check if already watching
  const existing = await getWatchedSpeedBySpeed(speed);
  if (existing) {
    return existing;
  }

  const label = SPEED_LABELS[speed] || `NBN ${speed}`;
  const result = db.insert(watchedNbnSpeeds).values({ speed, label }).returning();
  return result.get();
}

export async function unwatchSpeed(id: number) {
  return db.delete(watchedNbnSpeeds).where(eq(watchedNbnSpeeds.id, id));
}

export async function addSpeedSnapshot(data: NewNbnSpeedSnapshot) {
  const result = db.insert(nbnSpeedSnapshots).values(data).returning();
  return result.get();
}

export async function getLatestSnapshot(watchedSpeedId: number) {
  return db.query.nbnSpeedSnapshots.findFirst({
    where: eq(nbnSpeedSnapshots.watchedSpeedId, watchedSpeedId),
    orderBy: [desc(nbnSpeedSnapshots.scrapedAt)]
  });
}

// Get the latest snapshot for each provider (for change detection)
export async function getLatestSnapshotsByProvider(watchedSpeedId: number) {
  const snapshots = await db.query.nbnSpeedSnapshots.findMany({
    where: eq(nbnSpeedSnapshots.watchedSpeedId, watchedSpeedId),
    orderBy: [desc(nbnSpeedSnapshots.scrapedAt)]
  });

  // Group by provider and keep only the latest for each
  const byProvider = new Map<string, typeof snapshots[0]>();
  for (const snapshot of snapshots) {
    if (!byProvider.has(snapshot.providerName)) {
      byProvider.set(snapshot.providerName, snapshot);
    }
  }

  return byProvider;
}

// Get watched speeds with stats for dashboard
export async function getWatchedSpeedsWithStats() {
  const speeds = await getWatchedSpeeds();

  return speeds.map(speed => {
    const snapshots = speed.snapshots || [];

    // Get latest snapshot per provider
    const latestByProvider = new Map<string, typeof snapshots[0]>();
    for (const snapshot of snapshots) {
      if (!latestByProvider.has(snapshot.providerName)) {
        latestByProvider.set(snapshot.providerName, snapshot);
      }
    }

    // Find the cheapest among current providers
    const currentPlans = Array.from(latestByProvider.values());
    currentPlans.sort((a, b) => a.yearlyCost - b.yearlyCost);
    const cheapest = currentPlans[0];

    // Build sparkline data - use the cheapest plan's price at each point in time
    // Group snapshots by date (rounded to day) and take the min
    const byDate = new Map<string, number>();
    for (const s of snapshots) {
      const dateKey = s.scrapedAt.toISOString().split('T')[0];
      const existing = byDate.get(dateKey);
      if (!existing || s.yearlyCost < existing) {
        byDate.set(dateKey, s.yearlyCost);
      }
    }
    const sparkline = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([_, cost]) => cost);

    return {
      id: speed.id,
      speed: speed.speed,
      label: speed.label,
      latestSnapshot: cheapest || null,
      sparkline,
      lowestYearlyCost: cheapest?.yearlyCost ?? null,
      providerName: cheapest?.providerName ?? null,
      planName: cheapest?.planName ?? null,
      providerCount: currentPlans.length
    };
  });
}

// User's current plan queries
export async function getUserPlan(watchedSpeedId: number) {
  return db.query.userNbnPlans.findFirst({
    where: eq(userNbnPlans.watchedSpeedId, watchedSpeedId)
  });
}

export async function saveUserPlan(data: {
  watchedSpeedId: number;
  providerName?: string;
  monthlyPrice: number;
  promoDiscount?: number;
  promoEndsAt?: Date | null;
}) {
  const existing = await getUserPlan(data.watchedSpeedId);

  if (existing) {
    // Update existing
    return db
      .update(userNbnPlans)
      .set({
        providerName: data.providerName,
        monthlyPrice: data.monthlyPrice,
        promoDiscount: data.promoDiscount || 0,
        promoEndsAt: data.promoEndsAt,
        updatedAt: new Date()
      })
      .where(eq(userNbnPlans.watchedSpeedId, data.watchedSpeedId))
      .returning()
      .get();
  } else {
    // Insert new
    return db
      .insert(userNbnPlans)
      .values({
        watchedSpeedId: data.watchedSpeedId,
        providerName: data.providerName,
        monthlyPrice: data.monthlyPrice,
        promoDiscount: data.promoDiscount || 0,
        promoEndsAt: data.promoEndsAt
      })
      .returning()
      .get();
  }
}

export async function deleteUserPlan(watchedSpeedId: number) {
  return db.delete(userNbnPlans).where(eq(userNbnPlans.watchedSpeedId, watchedSpeedId));
}

// ============================================================
// Plans Cache Functions
// ============================================================

const MANUAL_REFRESH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get cached plans for a specific speed tier
 */
export async function getCachedPlans(speedTier: number): Promise<NBNPlanWithCosts[]> {
  const cached = await db.query.nbnPlansCache.findMany({
    where: eq(nbnPlansCache.speedTier, speedTier)
  });

  return cached.map(row => JSON.parse(row.planData) as NBNPlanWithCosts);
}

/**
 * Get the cache timestamp for a speed tier (to show data freshness)
 */
export async function getCacheTimestamp(speedTier: number): Promise<Date | null> {
  const cached = await db.query.nbnPlansCache.findFirst({
    where: eq(nbnPlansCache.speedTier, speedTier)
  });

  return cached?.cachedAt ?? null;
}

/**
 * Clear cache for a specific speed tier
 */
export async function clearCacheForSpeed(speedTier: number) {
  return db.delete(nbnPlansCache).where(eq(nbnPlansCache.speedTier, speedTier));
}

/**
 * Store plans in cache for a speed tier
 */
export async function cachePlans(speedTier: number, plans: NBNPlanWithCosts[]) {
  // Clear existing cache for this speed tier
  await clearCacheForSpeed(speedTier);

  // Insert new cached plans
  const cacheEntries: NewNbnPlanCache[] = plans.map(plan => ({
    speedTier,
    planData: JSON.stringify(plan),
    providerId: plan.provider_id,
    providerName: plan.provider_name,
    planName: plan.plan_name,
    monthlyPrice: plan.monthly_price,
    yearlyCost: plan.yearly_cost,
    cachedAt: new Date()
  }));

  if (cacheEntries.length > 0) {
    await db.insert(nbnPlansCache).values(cacheEntries);
  }

  return cacheEntries.length;
}

/**
 * Get refresh state (when was the last refresh)
 */
export async function getRefreshState() {
  return db.query.nbnRefreshState.findFirst();
}

/**
 * Update refresh state after a refresh completes
 */
export async function updateRefreshState(isManual: boolean) {
  const existing = await getRefreshState();
  const now = new Date();

  if (existing) {
    return db
      .update(nbnRefreshState)
      .set({
        lastRefreshAt: now,
        lastManualRefreshAt: isManual ? now : existing.lastManualRefreshAt
      })
      .where(eq(nbnRefreshState.id, existing.id))
      .returning()
      .get();
  } else {
    return db
      .insert(nbnRefreshState)
      .values({
        lastRefreshAt: now,
        lastManualRefreshAt: isManual ? now : null
      })
      .returning()
      .get();
  }
}

/**
 * Check if a manual refresh is allowed for a specific speed tier (1 hour cooldown per tier)
 */
export async function canManualRefreshSpeed(speedTier: number): Promise<{
  allowed: boolean;
  nextAllowedAt?: Date;
  cachedAt?: Date;
}> {
  const cachedAt = await getCacheTimestamp(speedTier);

  if (!cachedAt) {
    return { allowed: true };
  }

  const timeSinceCache = Date.now() - cachedAt.getTime();

  if (timeSinceCache >= MANUAL_REFRESH_COOLDOWN_MS) {
    return { allowed: true, cachedAt };
  }

  const nextAllowedAt = new Date(cachedAt.getTime() + MANUAL_REFRESH_COOLDOWN_MS);
  return {
    allowed: false,
    nextAllowedAt,
    cachedAt
  };
}
