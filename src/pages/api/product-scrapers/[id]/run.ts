import type { APIRoute } from 'astro';
import { getProductScraperById } from '../../../../lib/db/queries/scrapers';
import { scraperQueue } from '../../../../lib/queue';

export const POST: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid scraper ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const productScraper = await getProductScraperById(id);
    if (!productScraper) {
      return new Response(JSON.stringify({ message: 'Scraper not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add to global queue instead of running directly
    const queueItem = scraperQueue.add(productScraper, 'manual');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Scraper added to queue',
        queueItemId: queueItem?.id ?? null,
        productName: productScraper.product.name,
        scraperName: productScraper.scraper.name
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error queueing scraper:', error);
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : 'Failed to queue scraper'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
