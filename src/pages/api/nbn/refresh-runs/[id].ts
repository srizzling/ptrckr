import type { APIRoute } from 'astro';
import { getNbnRefreshRunById } from '../../../../lib/db/queries/nbn';

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);

  if (isNaN(id)) {
    return new Response(JSON.stringify({ message: 'Invalid run ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const run = await getNbnRefreshRunById(id);

  if (!run) {
    return new Response(JSON.stringify({ message: 'Run not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Parse logs from JSON string
  let logs: string[] = [];
  try {
    logs = run.logs ? JSON.parse(run.logs) : [];
  } catch {
    logs = [];
  }

  return new Response(JSON.stringify({
    id: run.id,
    watchedSpeedId: run.watchedSpeedId,
    speedLabel: run.watchedSpeed?.label,
    speedTier: run.watchedSpeed?.speed,
    status: run.status,
    plansFetched: run.plansFetched,
    plansCached: run.plansCached,
    snapshotsSaved: run.snapshotsSaved,
    errorMessage: run.errorMessage,
    logs,
    durationMs: run.durationMs,
    createdAt: run.createdAt
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
