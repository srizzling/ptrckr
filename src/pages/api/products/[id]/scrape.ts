import type { APIRoute } from 'astro';
import { getProductById } from '../../../../lib/db/queries/products';
import { markScraperAsRun } from '../../../../lib/db/queries/scrapers';
import { runScraper } from '../../../../lib/scrapers';

export const POST: APIRoute = async ({ params }) => {
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

    // Run scrapers for this product
    const results = [];
    for (const ps of product.productScrapers) {
      try {
        const result = await runScraper(ps);
        await markScraperAsRun(ps.id, result.status === 'error' ? 'error' : 'success');
        results.push({
          scraperId: ps.id,
          scraperName: ps.scraper.name,
          recordsCreated: result.pricesSaved
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error running scraper ${ps.id}:`, error);
        await markScraperAsRun(ps.id, 'error', errorMessage);
        results.push({
          scraperId: ps.id,
          scraperName: ps.scraper.name,
          error: errorMessage
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error running scrapers:', error);
    return new Response(JSON.stringify({ message: 'Failed to run scrapers' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
