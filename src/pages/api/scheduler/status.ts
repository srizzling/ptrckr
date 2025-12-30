import type { APIRoute } from 'astro';
import { getSchedulerStatus } from '../../../lib/scheduler';
import { db, productScrapers } from '../../../lib/db';
import { eq, and, or, lte, isNull } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  try {
    const status = getSchedulerStatus();

    // Get upcoming scrapers that are due or will be due soon
    const now = new Date();

    const allScrapers = await db.query.productScrapers.findMany({
      where: eq(productScrapers.enabled, true),
      with: {
        product: true,
        scraper: true
      }
    });

    const scrapersInfo = allScrapers.map((ps) => {
      const lastRun = ps.lastScrapedAt;
      const intervalMs = ps.scrapeIntervalMinutes * 60 * 1000;
      const nextRun = lastRun ? new Date(lastRun.getTime() + intervalMs) : now;
      const isDue = nextRun <= now;

      return {
        id: ps.id,
        productName: ps.product.name,
        scraperType: ps.scraper.type,
        intervalMinutes: ps.scrapeIntervalMinutes,
        lastScrapedAt: ps.lastScrapedAt?.toISOString() || null,
        nextRunAt: nextRun.toISOString(),
        isDue,
        enabled: ps.enabled
      };
    });

    // Sort by next run time
    scrapersInfo.sort((a, b) => new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime());

    return new Response(
      JSON.stringify({
        scheduler: {
          isRunning: status.isRunning,
          startedAt: status.startedAt?.toISOString() || null,
          lastCheckAt: status.lastCheckAt?.toISOString() || null,
          lastRunAt: status.lastRunAt?.toISOString() || null,
          totalScrapersQueued: status.scrapersQueuedCount,
          lastError: status.lastError
        },
        scrapers: scrapersInfo,
        summary: {
          totalScrapers: scrapersInfo.length,
          dueNow: scrapersInfo.filter((s) => s.isDue).length,
          enabled: scrapersInfo.filter((s) => s.enabled).length
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : 'Failed to get scheduler status'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
