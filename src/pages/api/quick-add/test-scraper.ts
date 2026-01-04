import type { APIRoute } from 'astro';
import { getScraper } from '../../../lib/scrapers';
import { getScraperById } from '../../../lib/db/queries/scrapers';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { scraperId, url } = body;

    if (!scraperId || !url) {
      return new Response(
        JSON.stringify({ message: 'scraperId and URL are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get scraper info
    const scraperModel = await getScraperById(Number(scraperId));
    if (!scraperModel) {
      return new Response(
        JSON.stringify({ message: 'Scraper not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the scraper implementation
    const scraper = getScraper(scraperModel.type);
    if (!scraper) {
      return new Response(
        JSON.stringify({ message: `Unknown scraper type: ${scraperModel.type}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Run the scraper test
    const logs: string[] = [];
    const log = (msg: string) => logs.push(msg);

    try {
      const result = await scraper.scrape(url, undefined, {
        log,
        debug: true,
        force: true
      });

      if (!result.success) {
        return new Response(
          JSON.stringify({
            success: false,
            status: 'error',
            pricesFound: 0,
            prices: [],
            error: result.error || 'Scraper failed',
            logs
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Return the test results with price details
      return new Response(
        JSON.stringify({
          success: true,
          status: 'success',
          pricesFound: result.prices.length,
          prices: result.prices.map(p => ({
            retailerName: p.retailerName,
            price: p.price,
            currency: p.currency,
            inStock: p.inStock,
            productUrl: p.productUrl,
            unitCount: p.unitCount,
            unitType: p.unitType,
            multiBuyQuantity: p.multiBuyQuantity,
            multiBuyPrice: p.multiBuyPrice
          })),
          logs
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(
        JSON.stringify({
          success: false,
          status: 'error',
          pricesFound: 0,
          prices: [],
          error: errorMessage,
          logs
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } catch (error) {
    console.error('Error testing scraper:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        message: 'Failed to test scraper',
        error: errorMessage
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
