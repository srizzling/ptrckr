import type { APIRoute } from 'astro';
import { getAllNbnRefreshRuns, getNbnRefreshRuns } from '../../../../lib/db/queries/nbn';

export const GET: APIRoute = async ({ url }) => {
  const watchedSpeedId = url.searchParams.get('watchedSpeedId');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  let runs;
  if (watchedSpeedId) {
    runs = await getNbnRefreshRuns(parseInt(watchedSpeedId), limit);
  } else {
    runs = await getAllNbnRefreshRuns(limit);
  }

  const formattedRuns = runs.map(run => ({
    id: run.id,
    watchedSpeedId: run.watchedSpeedId,
    speedLabel: run.watchedSpeed?.label,
    speedTier: run.watchedSpeed?.speed,
    status: run.status,
    plansFetched: run.plansFetched,
    plansCached: run.plansCached,
    snapshotsSaved: run.snapshotsSaved,
    errorMessage: run.errorMessage,
    durationMs: run.durationMs,
    createdAt: run.createdAt
  }));

  return new Response(JSON.stringify({
    runs: formattedRuns,
    total: formattedRuns.length
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
