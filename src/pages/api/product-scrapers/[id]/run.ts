import type { APIRoute } from 'astro';
import { getProductScraperById, markScraperAsRun } from '../../../../lib/db/queries/scrapers';
import { runScraper } from '../../../../lib/scrapers';
import { checkNotifications } from '../../../../lib/notifications';

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

    // Run the scraper
    const priceRecords = await runScraper(productScraper);
    await markScraperAsRun(id);

    // Check notifications
    await checkNotifications(productScraper.productId);

    return new Response(
      JSON.stringify({
        success: true,
        recordsCreated: priceRecords.length
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error running scraper:', error);
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : 'Failed to run scraper'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
