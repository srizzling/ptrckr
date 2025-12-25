import type { APIRoute } from 'astro';

export interface NBNPlan {
  id: string;
  provider_id: number;
  provider_name: string;
  provider_website: string;
  plan_name: string;
  speed_tier: string;
  download_speed: number;
  upload_speed: number;
  typical_evening_speed: number | null;
  network_type: string;
  monthly_price: number;
  setup_fee: number;
  total_min_cost: number;
  contract_length: number;
  data_limit: string;
  promo_type: string | null;
  promo_value: number | null;
  promo_duration: number | null;
  promo_end_date: string | null;
  cis_url: string;
  scraped_date: string;
  is_active: boolean;
  // Calculated fields
  yearly_cost: number;
  yearly_savings: number;
  effective_monthly: number;
}

interface NetBargainsResponse {
  items: NBNPlan[];
  total: number;
  skip: number;
  limit: number;
  has_more: boolean;
}

function calculateYearlyCost(plan: Omit<NBNPlan, 'yearly_cost' | 'yearly_savings' | 'effective_monthly'>): {
  yearly_cost: number;
  yearly_savings: number;
  effective_monthly: number;
} {
  const monthlyPrice = plan.monthly_price;
  const promoValue = plan.promo_value || 0;
  const promoDuration = plan.promo_duration || 0;
  const setupFee = plan.setup_fee || 0;

  // Calculate promo period (capped at 12 months)
  const promoMonths = Math.min(promoDuration, 12);
  const regularMonths = 12 - promoMonths;

  // Calculate costs
  const promoCost = (monthlyPrice - promoValue) * promoMonths;
  const regularCost = monthlyPrice * regularMonths;
  const yearlyTotal = promoCost + regularCost + setupFee;

  // What you'd pay without promo
  const yearlyWithoutPromo = (monthlyPrice * 12) + setupFee;
  const yearlySavings = yearlyWithoutPromo - yearlyTotal;

  // Effective monthly (yearly / 12, excluding setup)
  const effectiveMonthly = (yearlyTotal - setupFee) / 12;

  return {
    yearly_cost: Math.round(yearlyTotal * 100) / 100,
    yearly_savings: Math.round(yearlySavings * 100) / 100,
    effective_monthly: Math.round(effectiveMonthly * 100) / 100
  };
}

export const GET: APIRoute = async ({ url }) => {
  try {
    // Get query params with defaults
    const speed = url.searchParams.get('speed') || '100';
    const connectionType = url.searchParams.get('connection_type') || 'FIXED_LINE';
    const skip = url.searchParams.get('skip') || '0';
    const limit = url.searchParams.get('limit') || '50';
    const sortBy = url.searchParams.get('sort_by') || 'monthly_price';
    const sortOrder = url.searchParams.get('sort_order') || 'asc';

    // Build netbargains API URL
    const apiUrl = new URL('https://netbargains.com.au/api/v1/plans/latest');
    apiUrl.searchParams.set('speed', speed);
    apiUrl.searchParams.set('connection_type', connectionType);
    apiUrl.searchParams.append('network_type', 'NBN');
    apiUrl.searchParams.append('network_type', 'OPTICOMM');
    apiUrl.searchParams.set('skip', skip);
    apiUrl.searchParams.set('limit', limit);
    apiUrl.searchParams.set('sort_by', sortBy);
    apiUrl.searchParams.set('sort_order', sortOrder);

    const response = await fetch(apiUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ptrckr/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`NetBargains API error: ${response.status}`);
    }

    const data = await response.json() as NetBargainsResponse;

    // Add calculated yearly costs to each plan
    const plansWithCosts = data.items.map(plan => ({
      ...plan,
      ...calculateYearlyCost(plan)
    }));

    // Sort by yearly_cost if requested
    if (url.searchParams.get('sort_by') === 'yearly_cost') {
      plansWithCosts.sort((a, b) => {
        const order = sortOrder === 'asc' ? 1 : -1;
        return (a.yearly_cost - b.yearly_cost) * order;
      });
    }

    return new Response(JSON.stringify({
      plans: plansWithCosts,
      total: data.total,
      skip: data.skip,
      limit: data.limit,
      has_more: data.has_more
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching NBN plans:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to fetch plans'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
