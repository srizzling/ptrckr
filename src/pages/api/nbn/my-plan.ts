import type { APIRoute } from 'astro';
import { getUserPlan, saveUserPlan, deleteUserPlan } from '../../../lib/db/queries/nbn';

// GET - get user's plan for a speed tier
export const GET: APIRoute = async ({ url }) => {
  try {
    const speedId = url.searchParams.get('speedId');
    if (!speedId) {
      return new Response(JSON.stringify({ error: 'Missing speedId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const plan = await getUserPlan(parseInt(speedId, 10));

    return new Response(JSON.stringify({ plan: plan || null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error getting user plan:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to get plan'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// POST - save user's plan
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { watchedSpeedId, providerName, monthlyPrice, planStartedAt, promoDiscount, promoEndsAt } = body;

    if (!watchedSpeedId || monthlyPrice === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const plan = await saveUserPlan({
      watchedSpeedId: parseInt(watchedSpeedId, 10),
      providerName,
      monthlyPrice: parseFloat(monthlyPrice),
      planStartedAt: planStartedAt ? new Date(planStartedAt) : null,
      promoDiscount: promoDiscount ? parseFloat(promoDiscount) : 0,
      promoEndsAt: promoEndsAt ? new Date(promoEndsAt) : null
    });

    return new Response(JSON.stringify({ plan }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error saving user plan:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to save plan'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// DELETE - delete user's plan
export const DELETE: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { watchedSpeedId } = body;

    if (!watchedSpeedId) {
      return new Response(JSON.stringify({ error: 'Missing watchedSpeedId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await deleteUserPlan(parseInt(watchedSpeedId, 10));

    return new Response(JSON.stringify({ message: 'Plan deleted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting user plan:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to delete plan'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
