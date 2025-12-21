import type { APIRoute } from 'astro';
import { createProductScraper } from '../../../lib/db/queries/scrapers';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { productId, scraperId, url, scrapeIntervalMinutes } = body;

    if (!productId || !scraperId || !url) {
      return new Response(
        JSON.stringify({ message: 'Product ID, scraper ID, and URL are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const productScraper = await createProductScraper({
      productId: Number(productId),
      scraperId: Number(scraperId),
      url,
      scrapeIntervalMinutes: Number(scrapeIntervalMinutes) || 1440
    });

    return new Response(JSON.stringify(productScraper), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating product scraper:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to create product scraper' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
