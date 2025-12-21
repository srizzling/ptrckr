import type { APIRoute } from 'astro';
import { clearPricesForProduct } from '../../../../lib/db/queries/prices';

export const POST: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid product ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const deletedCount = await clearPricesForProduct(id);

    return new Response(
      JSON.stringify({
        success: true,
        deletedCount
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error clearing prices:', error);
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : 'Failed to clear prices'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
