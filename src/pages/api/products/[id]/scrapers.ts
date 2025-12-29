import type { APIRoute } from 'astro';
import { getProductById } from '../../../../lib/db/queries/products';
import { createProductScraper } from '../../../../lib/db/queries/scrapers';

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid product ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const product = await getProductById(id);
    if (!product) {
      return new Response(JSON.stringify({ message: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { scraperId, url, scrapeIntervalMinutes } = body;

    if (!scraperId || !url) {
      return new Response(JSON.stringify({ message: 'scraperId and url are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const productScraper = await createProductScraper({
      productId: id,
      scraperId: Number(scraperId),
      url,
      scrapeIntervalMinutes: Number(scrapeIntervalMinutes) || 1440
    });

    return new Response(JSON.stringify(productScraper), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error adding scraper to product:', error);
    return new Response(JSON.stringify({ message: 'Failed to add scraper' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
