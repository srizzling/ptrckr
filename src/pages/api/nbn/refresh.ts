import type { APIRoute } from 'astro';
import { refreshAllNbnSpeeds } from '../../../lib/nbn/refresh';

export const POST: APIRoute = async () => {
  try {
    await refreshAllNbnSpeeds();

    return new Response(JSON.stringify({ message: 'NBN prices refreshed' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error refreshing NBN prices:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to refresh NBN prices'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
