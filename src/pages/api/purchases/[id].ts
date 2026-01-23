import type { APIRoute } from 'astro';
import { getPurchaseById, deletePurchase } from '../../../lib/db/queries/purchases';

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid purchase ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const purchase = await getPurchaseById(id);
    if (!purchase) {
      return new Response(JSON.stringify({ message: 'Purchase not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(purchase), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching purchase:', error);
    return new Response(JSON.stringify({ message: 'Failed to fetch purchase' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid purchase ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const purchase = await getPurchaseById(id);
    if (!purchase) {
      return new Response(JSON.stringify({ message: 'Purchase not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await deletePurchase(id);

    return new Response(JSON.stringify({ message: 'Purchase deleted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting purchase:', error);
    return new Response(JSON.stringify({ message: 'Failed to delete purchase' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
