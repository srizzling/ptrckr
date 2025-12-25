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
    const result = await runScraper(productScraper);

    // Update productScraper status based on run result
    const scraperStatus = result.status === 'error' ? 'error' : 'success';
    await markScraperAsRun(id, scraperStatus, result.errorMessage);

    // Check notifications (only if we got prices)
    if (result.pricesFound > 0) {
      await checkNotifications(productScraper.productId);
    }

    return new Response(
      JSON.stringify({
        success: result.status !== 'error',
        status: result.status,
        pricesFound: result.pricesFound,
        pricesSaved: result.pricesSaved,
        runId: result.runId,
        errorMessage: result.errorMessage
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
