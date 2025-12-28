/**
 * NetBargains API Client
 *
 * Handles authenticated requests to the NetBargains API with pagination support.
 * API Key is stored in NETBARGAINS_API_KEY environment variable.
 */

const API_BASE_URL = 'https://api.netbargains.com.au/v1';
const PAGE_SIZE = 50;
const DELAY_BETWEEN_PAGES_MS = 500;
const USER_AGENT = 'ptrckr/0.1.0 (+https://github.com/srizzling/ptrckr)';

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
}

export interface NBNPlanWithCosts extends NBNPlan {
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

function getApiKey(): string {
  const apiKey = process.env.NETBARGAINS_API_KEY || import.meta.env.NETBARGAINS_API_KEY;
  if (!apiKey) {
    throw new Error('NETBARGAINS_API_KEY environment variable is not set');
  }
  return apiKey;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function calculateYearlyCost(plan: NBNPlan): {
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

/**
 * Fetch a single page of plans from the NetBargains API
 */
async function fetchPage(
  speed: number,
  skip: number = 0
): Promise<NetBargainsResponse> {
  const apiKey = getApiKey();

  const apiUrl = new URL(`${API_BASE_URL}/plans/latest`);
  apiUrl.searchParams.set('speed', speed.toString());
  apiUrl.searchParams.set('connection_type', 'FIXED_LINE');
  apiUrl.searchParams.append('network_type', 'NBN');
  apiUrl.searchParams.append('network_type', 'OPTICOMM');
  apiUrl.searchParams.set('skip', skip.toString());
  apiUrl.searchParams.set('limit', PAGE_SIZE.toString());
  apiUrl.searchParams.set('sort_by', 'monthly_price');
  apiUrl.searchParams.set('sort_order', 'asc');

  const response = await fetch(apiUrl.toString(), {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': USER_AGENT
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NetBargains API error: ${response.status} - ${errorText}`);
  }

  return await response.json() as NetBargainsResponse;
}

/**
 * Fetch all plans for a given speed tier, handling pagination automatically.
 * Adds a 500ms delay between pages to be respectful to the API.
 */
export async function fetchAllPlansForSpeed(speed: number): Promise<NBNPlanWithCosts[]> {
  console.log(`[NetBargains API] Fetching plans for speed tier ${speed}...`);

  const allPlans: NBNPlan[] = [];
  let skip = 0;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    if (pageCount > 0) {
      await delay(DELAY_BETWEEN_PAGES_MS);
    }

    const response = await fetchPage(speed, skip);
    allPlans.push(...response.items);

    hasMore = response.has_more;
    skip += PAGE_SIZE;
    pageCount++;

    console.log(`[NetBargains API] Page ${pageCount}: fetched ${response.items.length} plans (total: ${allPlans.length}/${response.total})`);
  }

  console.log(`[NetBargains API] Completed: ${allPlans.length} total plans for speed tier ${speed}`);

  // Calculate yearly costs for all plans
  return allPlans.map(plan => ({
    ...plan,
    ...calculateYearlyCost(plan)
  }));
}

/**
 * Fetch all plans for all speed tiers.
 * Used during scheduled refresh to populate the cache.
 */
export async function fetchAllPlans(): Promise<Map<number, NBNPlanWithCosts[]>> {
  const speedTiers = [25, 50, 100, 250, 500, 1000];
  const result = new Map<number, NBNPlanWithCosts[]>();

  for (const speed of speedTiers) {
    const plans = await fetchAllPlansForSpeed(speed);
    result.set(speed, plans);

    // Small delay between speed tiers
    await delay(DELAY_BETWEEN_PAGES_MS);
  }

  return result;
}
