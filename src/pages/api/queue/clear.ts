import type { APIRoute } from 'astro';
import { scraperQueue } from '../../../lib/queue';

export const POST: APIRoute = async () => {
  scraperQueue.clear();

  return new Response(JSON.stringify({
    message: 'Queue cleared'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
