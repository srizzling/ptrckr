import type { APIRoute } from 'astro';
import { getSetting, updateSetting } from '../../../lib/db/queries/settings';
import { scraperQueue } from '../../../lib/queue';

export const GET: APIRoute = async ({ params }) => {
  const key = params.key;
  if (!key) {
    return new Response(JSON.stringify({ error: 'Key is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const setting = getSetting(key);
  if (!setting) {
    return new Response(JSON.stringify({ error: 'Setting not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(setting), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const PUT: APIRoute = async ({ params, request }) => {
  const key = params.key;
  if (!key) {
    return new Response(JSON.stringify({ error: 'Key is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { value } = body;

    if (value === undefined) {
      return new Response(JSON.stringify({ error: 'Value is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if queue is empty before allowing interval change
    if (key === 'queue_interval_ms') {
      const state = scraperQueue.getState();
      if (state.pending > 0 || state.isProcessing) {
        return new Response(JSON.stringify({
          error: 'Cannot change queue interval while items are pending. Wait for queue to empty.'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    const updated = updateSetting(key, value);
    if (!updated) {
      return new Response(JSON.stringify({ error: 'Setting not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Reinitialize queue if interval setting changed
    if (key === 'queue_interval_ms') {
      scraperQueue.init();
    }

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to update setting' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
