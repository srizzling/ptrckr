import type { APIRoute } from 'astro';
import { getGroupById } from '../../../../lib/db/queries/groups';
import { getProductById } from '../../../../lib/db/queries/products';
import { runScraper } from '../../../../lib/scrapers';
import { markScraperAsRun } from '../../../../lib/db/queries/scrapers';

interface QueueItem {
  productId: number;
  productName: string;
  scraperId: number;
  scraperName: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error' | 'cached';
  pricesSaved?: number;
  error?: string;
}

export const POST: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ message: 'Invalid group ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const group = await getGroupById(id);
  if (!group) {
    return new Response(JSON.stringify({ message: 'Group not found' }), {
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
        // Build the queue
        const queue: QueueItem[] = [];
        const productIds = group.productGroups.map(pg => pg.productId);

        for (const productId of productIds) {
          const product = await getProductById(productId);
          if (!product) continue;

          for (const ps of product.productScrapers) {
            queue.push({
              productId: product.id,
              productName: product.name,
              scraperId: ps.id,
              scraperName: ps.scraper.name,
              status: 'pending'
            });
          }
        }

        // Send initial queue state
        send('queue', {
          groupId: id,
          groupName: group.name,
          items: queue
        });

        // Process queue
        for (let i = 0; i < queue.length; i++) {
          const item = queue[i];

          // Mark as running
          item.status = 'running';
          send('update', { index: i, item });

          // Get the full product scraper data
          const product = await getProductById(item.productId);
          const productScraper = product?.productScrapers.find(ps => ps.id === item.scraperId);

          if (!productScraper) {
            item.status = 'error';
            item.error = 'Scraper not found';
            send('update', { index: i, item });
            continue;
          }

          try {
            // Group runs from UI always force (bypass cache)
            const result = await runScraper(productScraper, {
              onLog: (message) => {
                send('log', { index: i, message, timestamp: new Date().toISOString() });
              },
              force: true
            });

            await markScraperAsRun(
              item.scraperId,
              result.status === 'error' ? 'error' : (result.status === 'warning' ? 'warning' : 'success'),
              result.errorMessage
            );

            item.status = result.status;
            item.pricesSaved = result.pricesSaved;
            if (result.errorMessage) {
              item.error = result.errorMessage;
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await markScraperAsRun(item.scraperId, 'error', errorMessage);
            item.status = 'error';
            item.error = errorMessage;
          }

          send('update', { index: i, item });
        }

        // Calculate summary
        const successful = queue.filter(q => q.status === 'success').length;
        const warnings = queue.filter(q => q.status === 'warning').length;
        const failed = queue.filter(q => q.status === 'error').length;
        const totalPrices = queue.reduce((acc, q) => acc + (q.pricesSaved || 0), 0);

        send('complete', {
          summary: {
            total: queue.length,
            successful,
            warnings,
            failed,
            totalPricesSaved: totalPrices
          }
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
