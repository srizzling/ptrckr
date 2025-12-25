import { addSpeedSnapshot, getLatestSnapshotsByProvider } from '../db/queries/nbn';
import type { WatchedNbnSpeed } from '../db/schema';

const TOP_PLANS_TO_TRACK = 10;

interface NBNPlan {
  provider_name: string;
  plan_name: string;
  monthly_price: number;
  promo_value: number | null;
  promo_duration: number | null;
  setup_fee: number;
  yearly_cost: number;
}

interface PlansResponse {
  plans: NBNPlan[];
  total: number;
}

function calculateYearlyCost(plan: {
  monthly_price: number;
  promo_value: number | null;
  promo_duration: number | null;
  setup_fee: number;
}): number {
  const monthlyPrice = plan.monthly_price;
  const promoValue = plan.promo_value || 0;
  const promoDuration = plan.promo_duration || 0;
  const setupFee = plan.setup_fee || 0;

  const promoMonths = Math.min(promoDuration, 12);
  const regularMonths = 12 - promoMonths;

  const promoCost = (monthlyPrice - promoValue) * promoMonths;
  const regularCost = monthlyPrice * regularMonths;

  return Math.round((promoCost + regularCost + setupFee) * 100) / 100;
}

export async function refreshNbnSpeed(watchedSpeed: WatchedNbnSpeed): Promise<boolean> {
  try {
    console.log(`[NBN] Refreshing speed tier: ${watchedSpeed.label}`);

    // Fetch cheapest plan from netbargains
    const apiUrl = new URL('https://netbargains.com.au/api/v1/plans/latest');
    apiUrl.searchParams.set('speed', watchedSpeed.speed.toString());
    apiUrl.searchParams.set('connection_type', 'FIXED_LINE');
    apiUrl.searchParams.append('network_type', 'NBN');
    apiUrl.searchParams.append('network_type', 'OPTICOMM');
    apiUrl.searchParams.set('skip', '0');
    apiUrl.searchParams.set('limit', '1');
    apiUrl.searchParams.set('sort_by', 'monthly_price');
    apiUrl.searchParams.set('sort_order', 'asc');

    const response = await fetch(apiUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ptrckr/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`NetBargains API error: ${response.status}`);
    }

    const data = await response.json() as { items: NBNPlan[] };

    if (!data.items || data.items.length === 0) {
      console.log(`[NBN] No plans found for speed ${watchedSpeed.speed}`);
      return false;
    }

    // Get all plans and find the one with lowest yearly cost
    // We need more plans since cheapest monthly might not be cheapest yearly
    apiUrl.searchParams.set('limit', '20');
    const fullResponse = await fetch(apiUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ptrckr/1.0'
      }
    });

    const fullData = await fullResponse.json() as { items: NBNPlan[] };

    // Calculate yearly cost for each plan
    const plansWithYearly = fullData.items.map(plan => ({
      ...plan,
      yearly_cost: calculateYearlyCost(plan)
    }));

    // Sort by yearly cost and take top N
    plansWithYearly.sort((a, b) => a.yearly_cost - b.yearly_cost);
    const topPlans = plansWithYearly.slice(0, TOP_PLANS_TO_TRACK);

    console.log(`[NBN] Top ${topPlans.length} plans for ${watchedSpeed.label}:`);
    topPlans.forEach((p, i) => console.log(`  ${i + 1}. ${p.provider_name}: $${p.yearly_cost}/yr`));

    // Get latest snapshots for each provider we're tracking
    const latestByProvider = await getLatestSnapshotsByProvider(watchedSpeed.id);

    // Save snapshots for plans that have changed
    let savedCount = 0;
    for (const plan of topPlans) {
      const latest = latestByProvider.get(plan.provider_name);

      // Only save if price or plan changed for this provider
      if (!latest ||
          latest.yearlyCost !== plan.yearly_cost ||
          latest.planName !== plan.plan_name) {

        await addSpeedSnapshot({
          watchedSpeedId: watchedSpeed.id,
          providerName: plan.provider_name,
          planName: plan.plan_name,
          monthlyPrice: plan.monthly_price,
          promoValue: plan.promo_value,
          promoDuration: plan.promo_duration,
          yearlyCost: plan.yearly_cost,
          setupFee: plan.setup_fee
        });
        savedCount++;
      }
    }

    if (savedCount > 0) {
      console.log(`[NBN] Saved ${savedCount} new snapshots for ${watchedSpeed.label}`);
    } else {
      console.log(`[NBN] No changes for ${watchedSpeed.label}`);
    }

    return true;
  } catch (error) {
    console.error(`[NBN] Error refreshing ${watchedSpeed.label}:`, error);
    return false;
  }
}

export async function refreshAllNbnSpeeds(): Promise<void> {
  const { getWatchedSpeeds } = await import('../db/queries/nbn');
  const speeds = await getWatchedSpeeds();

  console.log(`[NBN] Refreshing ${speeds.length} watched speed tiers...`);

  for (const speed of speeds) {
    await refreshNbnSpeed(speed);
    // Small delay to be nice to the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[NBN] Refresh complete`);
}
