import type { APIRoute } from 'astro';
import { getProductScraperById, markScraperAsRun } from '../../../../lib/db/queries/scrapers';
import { runScraper } from '../../../../lib/scrapers';
import { checkNotifications } from '../../../../lib/notifications';

export const POST: APIRoute = async ({ params, url }) => {
  const id = Number(params.id);
  const debug = url.searchParams.get('debug') === 'true';

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // Run the scraper with log callback for streaming
        // Manual UI runs always force (bypass cache)
        const result = await runScraper(productScraper, {
          onLog: (message) => {
            send('log', { message, timestamp: new Date().toISOString() });
          },
          debug,
          force: true
        });

        // Update productScraper status based on run result
        const scraperStatus = result.status === 'error' ? 'error' : 'success';
        await markScraperAsRun(id, scraperStatus, result.errorMessage);

        // Check notifications (only if we got prices)
        if (result.pricesFound > 0) {
          await checkNotifications(productScraper.productId);
        }

        // Send completion event
        send('complete', {
          status: result.status,
          pricesFound: result.pricesFound,
          pricesSaved: result.pricesSaved,
          runId: result.runId,
          errorMessage: result.errorMessage
        });
      } catch (error) {
        send('error', {
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
