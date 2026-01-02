import type { APIRoute } from 'astro';
import { scraperQueue } from '../../../lib/queue';
import { getProductScraperById } from '../../../lib/db/queries/scrapers';
import { getWatchedSpeeds } from '../../../lib/db/queries/nbn';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { type, productScraperId, speedTier } = body;

    if (type === 'nbn') {
      if (!speedTier) {
        return new Response(JSON.stringify({ error: 'speedTier is required for NBN' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Find the watched speed
      const watchedSpeeds = await getWatchedSpeeds();
      const watchedSpeed = watchedSpeeds.find(ws => ws.speed === speedTier);

      if (!watchedSpeed) {
        return new Response(JSON.stringify({ error: 'Speed tier not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Add to queue as manual (bypasses cache)
      const item = scraperQueue.addNbnRefresh(speedTier, watchedSpeed.label, 'manual');

      return new Response(JSON.stringify({ success: true, item }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Scraper type
    if (!productScraperId) {
      return new Response(JSON.stringify({ error: 'productScraperId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const productScraper = await getProductScraperById(productScraperId);

    if (!productScraper) {
      return new Response(JSON.stringify({ error: 'Product scraper not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add to queue as manual (bypasses cache)
    const item = scraperQueue.add(productScraper, 'manual');

    return new Response(JSON.stringify({ success: true, item }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[API] Force run error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
