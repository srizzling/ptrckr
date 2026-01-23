import type { APIRoute } from 'astro';
import { getPurchasesForProduct } from '../../../../lib/db/queries/purchases';

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid product ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const purchases = await getPurchasesForProduct(id);

    return new Response(JSON.stringify({ purchases }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching purchases for product:', error);
    return new Response(JSON.stringify({ message: 'Failed to fetch purchases' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
