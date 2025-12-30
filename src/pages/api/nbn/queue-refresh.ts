import type { APIRoute } from 'astro';
import { scraperQueue } from '../../../lib/queue';
import { canManualRefreshSpeed } from '../../../lib/db/queries/nbn';

export const POST: APIRoute = async ({ url }) => {
  try {
    // Get speed tier from query param
    const speedParam = url.searchParams.get('speed');
    const speed = speedParam ? parseInt(speedParam, 10) : 100;

    // Validate speed
    const validSpeeds = [25, 50, 100, 250, 500, 1000];
    if (!validSpeeds.includes(speed)) {
      return new Response(JSON.stringify({
        error: 'Invalid speed tier',
        valid_speeds: validSpeeds
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check rate limit before allowing refresh
    const rateLimit = await canManualRefreshSpeed(speed);

    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limited',
        message: 'Manual refresh is rate limited to once per hour',
        next_allowed_at: rateLimit.nextAllowedAt?.toISOString(),
        retry_after_seconds: rateLimit.nextAllowedAt
          ? Math.ceil((rateLimit.nextAllowedAt.getTime() - Date.now()) / 1000)
          : null
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': rateLimit.nextAllowedAt
            ? Math.ceil((rateLimit.nextAllowedAt.getTime() - Date.now()) / 1000).toString()
            : '3600'
        }
      });
    }

    // Get label for the speed tier
    const speedLabels: Record<number, string> = {
      25: 'NBN 25',
      50: 'NBN 50',
      100: 'NBN 100',
      250: 'NBN 250',
      500: 'NBN 500',
      1000: 'NBN 1000'
    };

    // Add to queue
    scraperQueue.addNbnRefresh(speed, speedLabels[speed] || `NBN ${speed}`, 'manual');

    return new Response(JSON.stringify({
      message: `NBN ${speed} refresh queued`,
      speed,
      queued_at: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error queuing NBN refresh:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to queue NBN refresh'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
