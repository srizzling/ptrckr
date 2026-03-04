import type { APIRoute } from 'astro';
import { getWatchedSpeedWithHistory, getWatchedSpeeds } from '../../../lib/db/queries/nbn';

/**
 * GET /api/nbn/snapshots?speed=100
 * Returns all historical snapshots for a speed tier (no limit).
 * If no speed param, returns all speeds with full history.
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const speedParam = url.searchParams.get('speed');

    if (speedParam) {
      const speed = parseInt(speedParam, 10);
      // Get all watched speeds to find the ID for this speed tier
      const speeds = await getWatchedSpeeds();
      const watched = speeds.find(s => s.speed === speed);
      if (!watched) {
        return new Response(JSON.stringify({ error: `Speed tier ${speed} not watched` }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const full = await getWatchedSpeedWithHistory(watched.id);
      return new Response(JSON.stringify(full), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return all speeds with full history
    const speeds = await getWatchedSpeeds();
    const results = await Promise.all(
      speeds.map(s => getWatchedSpeedWithHistory(s.id))
    );

    return new Response(JSON.stringify({ speeds: results.filter(Boolean) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting snapshots:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to get snapshots'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
