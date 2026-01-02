import type { APIRoute } from 'astro';
import { getRunById } from '../../../lib/db/queries/scraper-runs';

export const GET: APIRoute = async ({ params }) => {
  const id = parseInt(params.id ?? '', 10);

  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid run ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const run = await getRunById(id);

  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Parse logs from JSON string
  let logs: string[] = [];
  try {
    logs = run.logs ? JSON.parse(run.logs) : [];
  } catch {
    logs = run.logs ? [run.logs] : [];
  }

  return new Response(JSON.stringify({
    id: run.id,
    productScraperId: run.productScraperId,
    status: run.status,
    pricesFound: run.pricesFound,
    pricesSaved: run.pricesSaved,
    errorMessage: run.errorMessage,
    logs,
    durationMs: run.durationMs,
    createdAt: run.createdAt
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
