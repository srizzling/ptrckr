import type { APIRoute } from 'astro';
import { getCachedPlans, getCacheTimestamp, getRefreshState } from '../../../lib/db/queries/nbn';
import type { NBNPlanWithCosts } from '../../../lib/nbn/api-client';

// Re-export the type for consumers
export type NBNPlan = NBNPlanWithCosts;

export const GET: APIRoute = async ({ url }) => {
  try {
    // Get query params with defaults
    const speed = parseInt(url.searchParams.get('speed') || '100', 10);
    const skip = parseInt(url.searchParams.get('skip') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const sortBy = url.searchParams.get('sort_by') || 'monthly_price';
    const sortOrder = url.searchParams.get('sort_order') || 'asc';

    // Get plans from cache
    let plans = await getCachedPlans(speed);
    const cacheTimestamp = await getCacheTimestamp(speed);
    const refreshState = await getRefreshState();

    // Sort plans
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;
    plans.sort((a, b) => {
      switch (sortBy) {
        case 'yearly_cost':
          return (a.yearly_cost - b.yearly_cost) * sortMultiplier;
        case 'monthly_price':
          return (a.monthly_price - b.monthly_price) * sortMultiplier;
        case 'effective_monthly':
          return (a.effective_monthly - b.effective_monthly) * sortMultiplier;
        case 'yearly_savings':
          return (a.yearly_savings - b.yearly_savings) * sortMultiplier;
        default:
          return (a.monthly_price - b.monthly_price) * sortMultiplier;
      }
    });

    // Apply pagination
    const total = plans.length;
    const paginatedPlans = plans.slice(skip, skip + limit);
    const hasMore = skip + limit < total;

    return new Response(JSON.stringify({
      plans: paginatedPlans,
      total,
      skip,
      limit,
      has_more: hasMore,
      cached_at: cacheTimestamp?.toISOString() || null,
      last_refresh_at: refreshState?.lastRefreshAt?.toISOString() || null
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching NBN plans from cache:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to fetch plans'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
