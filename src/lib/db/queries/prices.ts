import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { db, priceRecords, retailers, productScrapers } from '../index';
import type { NewPriceRecord, NewRetailer } from '../schema';

export async function getOrCreateRetailer(name: string, domain?: string) {
  // Try to find existing retailer
  let retailer = await db.query.retailers.findFirst({
    where: eq(retailers.name, name)
  });

  if (!retailer) {
    const result = db.insert(retailers).values({ name, domain }).returning();
    retailer = result.get();
  }

  return retailer;
}

export async function createPriceRecord(data: NewPriceRecord) {
  const result = db.insert(priceRecords).values(data).returning();
  return result.get();
}

export async function createPriceRecords(data: NewPriceRecord[]) {
  if (data.length === 0) return [];
  return db.insert(priceRecords).values(data).returning().all();
}

export async function getPriceHistoryForProduct(
  productId: number,
  options: { days?: number; limit?: number } = {}
) {
  const { days = 30, limit = 1000 } = options;
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get all product scrapers for this product
  const productScrapersList = await db.query.productScrapers.findMany({
    where: eq(productScrapers.productId, productId)
  });

  const psIds = productScrapersList.map((ps) => ps.id);
  if (psIds.length === 0) return [];

  // Get price records for all product scrapers
  const records = await db.query.priceRecords.findMany({
    where: and(
      sql`${priceRecords.productScraperId} IN (${sql.join(psIds.map(id => sql`${id}`), sql`, `)})`,
      gte(priceRecords.scrapedAt, cutoffDate)
    ),
    orderBy: [desc(priceRecords.scrapedAt)],
    limit,
    with: {
      retailer: true
    }
  });

  return records;
}

export async function getLatestPricesForProduct(productId: number) {
  const history = await getPriceHistoryForProduct(productId, { days: 7, limit: 500 });

  // Group by retailer and get latest price for each
  const latestByRetailer = new Map<
    number,
    {
      retailerId: number;
      retailerName: string;
      price: number;
      currency: string;
      inStock: boolean;
      productUrl: string | null;
      scrapedAt: Date;
    }
  >();

  for (const record of history) {
    const existing = latestByRetailer.get(record.retailerId);
    if (!existing || record.scrapedAt > existing.scrapedAt) {
      latestByRetailer.set(record.retailerId, {
        retailerId: record.retailerId,
        retailerName: record.retailer.name,
        price: record.price,
        currency: record.currency,
        inStock: record.inStock,
        productUrl: record.productUrl,
        scrapedAt: record.scrapedAt
      });
    }
  }

  return Array.from(latestByRetailer.values()).sort((a, b) => a.price - b.price);
}

export async function getPreviousLowestPrice(productId: number) {
  const history = await getPriceHistoryForProduct(productId, { days: 30 });

  if (history.length === 0) return null;

  // Find the second most recent scrape time
  const scrapeTimes = [...new Set(history.map((r) => r.scrapedAt.getTime()))].sort(
    (a, b) => b - a
  );

  if (scrapeTimes.length < 2) return null;

  const previousScrapeTime = scrapeTimes[1];
  const previousRecords = history.filter((r) => r.scrapedAt.getTime() === previousScrapeTime);

  if (previousRecords.length === 0) return null;

  return Math.min(...previousRecords.map((r) => r.price));
}

export async function getPriceStats(productId: number, days = 30) {
  const history = await getPriceHistoryForProduct(productId, { days });

  if (history.length === 0) {
    return {
      current: null,
      lowest: null,
      highest: null,
      average: null,
      priceDrops24h: 0,
      priceIncreases24h: 0
    };
  }

  const prices = history.map((r) => r.price);
  const current = prices[0];
  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  const average = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Calculate 24h changes
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentRecords = history.filter((r) => r.scrapedAt >= oneDayAgo);

  let priceDrops24h = 0;
  let priceIncreases24h = 0;

  // Group by retailer and check for changes
  const retailerPrices = new Map<number, number[]>();
  for (const record of recentRecords) {
    const prices = retailerPrices.get(record.retailerId) || [];
    prices.push(record.price);
    retailerPrices.set(record.retailerId, prices);
  }

  for (const prices of retailerPrices.values()) {
    if (prices.length >= 2) {
      const latest = prices[0];
      const previous = prices[1];
      if (latest < previous) priceDrops24h++;
      if (latest > previous) priceIncreases24h++;
    }
  }

  return {
    current,
    lowest,
    highest,
    average,
    priceDrops24h,
    priceIncreases24h
  };
}

export async function clearPricesForProduct(productId: number) {
  // Get all product scrapers for this product
  const productScrapersList = await db.query.productScrapers.findMany({
    where: eq(productScrapers.productId, productId)
  });

  const psIds = productScrapersList.map((ps) => ps.id);
  if (psIds.length === 0) return 0;

  // Delete all price records for these product scrapers
  let deletedCount = 0;
  for (const psId of psIds) {
    const result = await db.delete(priceRecords).where(eq(priceRecords.productScraperId, psId));
    deletedCount += result.changes;
  }

  return deletedCount;
}

export async function getGlobalStats() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentRecords = await db.query.priceRecords.findMany({
    where: gte(priceRecords.scrapedAt, oneDayAgo),
    orderBy: [desc(priceRecords.scrapedAt)],
    with: {
      retailer: true,
      productScraper: {
        with: {
          product: true
        }
      }
    }
  });

  // Group by product and retailer
  const productRetailerPrices = new Map<string, number[]>();

  for (const record of recentRecords) {
    const key = `${record.productScraper.productId}-${record.retailerId}`;
    const prices = productRetailerPrices.get(key) || [];
    prices.push(record.price);
    productRetailerPrices.set(key, prices);
  }

  let priceDrops = 0;
  let priceIncreases = 0;

  for (const prices of productRetailerPrices.values()) {
    if (prices.length >= 2) {
      const sorted = [...prices].sort(
        (a, b) =>
          recentRecords.find((r) => r.price === a)!.scrapedAt.getTime() -
          recentRecords.find((r) => r.price === b)!.scrapedAt.getTime()
      );
      const latest = sorted[sorted.length - 1];
      const previous = sorted[sorted.length - 2];
      if (latest < previous) priceDrops++;
      if (latest > previous) priceIncreases++;
    }
  }

  return { priceDrops, priceIncreases };
}
