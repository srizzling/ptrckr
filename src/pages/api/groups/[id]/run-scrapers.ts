import type { APIRoute } from 'astro';
import { getGroupById } from '../../../../lib/db/queries/groups';
import { getProductById } from '../../../../lib/db/queries/products';
import { scraperQueue } from '../../../../lib/queue';

export const POST: APIRoute = async ({ params }) => {
  try {
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

    // Gather all product scrapers in the group
    const productIds = group.productGroups.map(pg => pg.productId);
    const allProductScrapers: Array<Parameters<typeof scraperQueue.addMultiple>[0][0]> = [];

    for (const productId of productIds) {
      const product = await getProductById(productId);
      if (!product) continue;

      for (const ps of product.productScrapers) {
        // Add product reference to each scraper for the queue
        allProductScrapers.push({
          ...ps,
          product: {
            id: product.id,
            name: product.name,
            imageUrl: product.imageUrl,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt
          }
        });
      }
    }

    if (allProductScrapers.length === 0) {
      return new Response(JSON.stringify({
        groupId: id,
        groupName: group.name,
        message: 'No scrapers to run',
        queued: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add all to the global queue
    const queueItems = scraperQueue.addMultiple(
      allProductScrapers,
      'group',
      { groupId: id, groupName: group.name }
    );

    return new Response(JSON.stringify({
      groupId: id,
      groupName: group.name,
      queued: queueItems.length,
      queueItemIds: queueItems.map(q => q.id),
      message: `${queueItems.length} scrapers added to queue`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error queueing group scrapers:', error);
    return new Response(JSON.stringify({ message: 'Failed to queue scrapers' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
