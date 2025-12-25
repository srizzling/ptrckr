import { eq, desc } from 'drizzle-orm';
import { db, watchedNbnSpeeds, nbnSpeedSnapshots } from '../index';
import type { NewWatchedNbnSpeed, NewNbnSpeedSnapshot } from '../schema';

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
