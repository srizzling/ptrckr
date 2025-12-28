import type { APIRoute } from 'astro';
import { refreshSingleSpeedTier } from '../../../lib/nbn/refresh';
import { canManualRefreshSpeed, getCacheTimestamp } from '../../../lib/db/queries/nbn';

export const GET: APIRoute = async ({ url }) => {
  // Check rate limit status and cache timestamp for a speed tier
  try {
    const speedParam = url.searchParams.get('speed');
    const speed = speedParam ? parseInt(speedParam, 10) : 100; // Default to NBN 100

    // Per-tier rate limiting
    const rateLimit = await canManualRefreshSpeed(speed);

    return new Response(JSON.stringify({
      speed,
      can_refresh: rateLimit.allowed,
      next_allowed_at: rateLimit.nextAllowedAt?.toISOString() || null,
      cached_at: rateLimit.cachedAt?.toISOString() || null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error checking refresh status:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to check refresh status'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ url }) => {
  try {
    // Get speed tier from query param
    const speedParam = url.searchParams.get('speed');
    const speed = speedParam ? parseInt(speedParam, 10) : 100; // Default to NBN 100

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

    // Check rate limit before allowing refresh (per speed tier)
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

    // Refresh just this speed tier
    const result = await refreshSingleSpeedTier(speed);

    return new Response(JSON.stringify({
      message: `NBN ${speed} prices refreshed`,
      speed,
      cached: result.cached,
      is_watched: result.isWatched,
      refreshed_at: new Date().toISOString()
    }), {
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
