import type { APIRoute } from 'astro';
import { scraperQueue } from '../../../lib/queue';

// GET returns current state
export const GET: APIRoute = async () => {
  const state = scraperQueue.getState();

  return new Response(JSON.stringify({
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
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
