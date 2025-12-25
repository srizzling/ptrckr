import type { APIRoute } from 'astro';
import { getWatchedSpeeds, watchSpeed, unwatchSpeed, getWatchedSpeedBySpeed } from '../../../lib/db/queries/nbn';
import { refreshNbnSpeed } from '../../../lib/nbn/refresh';

// GET - list watched speeds
export const GET: APIRoute = async () => {
  try {
    const speeds = await getWatchedSpeeds();
    return new Response(JSON.stringify({ speeds }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting watched speeds:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to get watched speeds'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// POST - watch a speed
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const speed = parseInt(body.speed, 10);

    if (!speed || ![25, 50, 100, 250, 500, 1000].includes(speed)) {
      return new Response(JSON.stringify({ error: 'Invalid speed tier' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if already watching
    const existing = await getWatchedSpeedBySpeed(speed);
    if (existing) {
      return new Response(JSON.stringify({
        message: 'Already watching this speed',
        watchedSpeed: existing
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const watchedSpeed = await watchSpeed(speed);

    // Immediately fetch the cheapest plan for this speed
    try {
      await refreshNbnSpeed(watchedSpeed!);
    } catch (e) {
      console.error('Failed to fetch initial snapshot:', e);
    }

    return new Response(JSON.stringify({
      message: 'Now watching speed tier',
      watchedSpeed
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error watching speed:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to watch speed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// DELETE - unwatch a speed
export const DELETE: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const id = parseInt(body.id, 10);

    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await unwatchSpeed(id);

    return new Response(JSON.stringify({ message: 'Unwatched speed tier' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error unwatching speed:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to unwatch speed'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
