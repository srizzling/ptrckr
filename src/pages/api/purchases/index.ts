import type { APIRoute } from 'astro';
import { createPurchase, getAllPurchases } from '../../../lib/db/queries/purchases';

export const GET: APIRoute = async () => {
  try {
    const allPurchases = await getAllPurchases();
    return new Response(JSON.stringify(allPurchases), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    return new Response(JSON.stringify({ message: 'Failed to fetch purchases' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { productId, retailerId, price, quantity, purchasedAt, notes } = body;

    if (!productId) {
      return new Response(JSON.stringify({ message: 'productId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!retailerId) {
      return new Response(JSON.stringify({ message: 'retailerId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (typeof price !== 'number' || price <= 0) {
      return new Response(JSON.stringify({ message: 'price must be a positive number' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const purchase = await createPurchase({
      productId,
      retailerId,
      price,
      quantity: quantity || 1,
      purchasedAt: purchasedAt ? new Date(purchasedAt) : new Date(),
      notes: notes || null
    });

    return new Response(JSON.stringify(purchase), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating purchase:', error);
    return new Response(JSON.stringify({ message: 'Failed to create purchase' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
