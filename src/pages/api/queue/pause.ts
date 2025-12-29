import type { APIRoute } from 'astro';
import { scraperQueue } from '../../../lib/queue';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const paused = body.paused;

    if (paused) {
      scraperQueue.pause();
    } else {
      scraperQueue.start();
    }

    return new Response(JSON.stringify({
      paused: scraperQueue.isPaused(),
      message: paused ? 'Queue paused' : 'Queue resumed'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ message: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
