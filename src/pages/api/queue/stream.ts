import type { APIRoute } from 'astro';
import { scraperQueue, type QueueState } from '../../../lib/queue';

export const GET: APIRoute = async () => {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  const subscriberId = `sse_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          // Stream may be closed
        }
      };

      // Subscribe to queue updates
      unsubscribe = scraperQueue.subscribe(subscriberId, (state: QueueState) => {
        send({
          pending: state.pending,
          size: state.size,
          isProcessing: state.isProcessing,
          processedCount: state.processedCount,
          lastProcessedAt: state.lastProcessedAt,
          items: state.items.slice(-50).map(item => ({
            id: item.id,
            productName: item.productName,
            scraperName: item.scraperName,
            status: item.status,
            pricesSaved: item.pricesSaved,
            error: item.error,
            addedAt: item.addedAt,
            startedAt: item.startedAt,
            completedAt: item.completedAt,
            source: item.source,
            groupId: item.groupId,
            groupName: item.groupName
          }))
        });
      });
    },
    cancel() {
      if (unsubscribe) {
        unsubscribe();
      }
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
