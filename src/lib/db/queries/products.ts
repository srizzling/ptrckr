import { eq, desc } from 'drizzle-orm';
import { db, products, productScrapers, priceRecords, retailers, scraperRuns } from '../index';
import type { NewProduct, Product } from '../schema';

export async function getProducts() {
  return db.query.products.findMany({
    orderBy: [desc(products.createdAt)],
    with: {
      productScrapers: {
        with: {
          scraper: true
        }
      }
    }
  });
}

export async function getProductById(id: number) {
  return db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      productScrapers: {
        with: {
          scraper: true,
          priceRecords: {
            orderBy: [desc(priceRecords.scrapedAt)],
            limit: 100,
            with: {
              retailer: true
            }
          }
        }
      }
    }
  });
}

export async function createProduct(data: NewProduct) {
  const result = db.insert(products).values(data).returning();
  return result.get();
}

export async function updateProduct(id: number, data: Partial<NewProduct>) {
  const result = db
    .update(products)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning();
  return result.get();
}

export async function deleteProduct(id: number) {
  return db.delete(products).where(eq(products.id, id));
}

export async function getProductWithLatestPrices(id: number) {
  const product = await getProductById(id);
  if (!product) return null;

  // Get latest successful scraper run time for each productScraper
  // This helps us filter out stale prices from retailers no longer found
  const lastRunTimes = new Map<number, Date>();
  for (const ps of product.productScrapers) {
    const lastRun = await db.query.scraperRuns.findFirst({
      where: eq(scraperRuns.productScraperId, ps.id),
      orderBy: [desc(scraperRuns.createdAt)]
    });
    if (lastRun) {
      lastRunTimes.set(ps.id, lastRun.createdAt);
    }
  }

  // Get latest price per retailer, but only include prices from the most recent scraper run
  const latestPrices = new Map<
    number,
    {
      price: number;
      retailer: string;
      scrapedAt: Date;
      productUrl: string | null;
      inStock: boolean;
      source: string;
      sourceUrl: string;
    }
  >();

  for (const ps of product.productScrapers) {
    const lastRunTime = lastRunTimes.get(ps.id);

    for (const record of ps.priceRecords) {
      // Skip prices that are older than the last scraper run
      // This means the retailer was found in an old run but not in the latest run
      if (lastRunTime && record.scrapedAt < lastRunTime) {
        continue;
      }

      const existing = latestPrices.get(record.retailerId);
      if (!existing || record.scrapedAt > existing.scrapedAt) {
        latestPrices.set(record.retailerId, {
          price: record.price,
          retailer: record.retailer.name,
          scrapedAt: record.scrapedAt,
          productUrl: record.productUrl,
          inStock: record.inStock,
          source: ps.scraper.name,
          sourceUrl: ps.url
        });
      }
    }
  }

  const prices = Array.from(latestPrices.values()).sort((a, b) => a.price - b.price);
  const lowestPrice = prices[0]?.price ?? null;

  // Calculate median to detect suspicious prices
  const sortedPrices = prices.map((p) => p.price).sort((a, b) => a - b);
  const median =
    sortedPrices.length > 0
      ? sortedPrices.length % 2 === 0
        ? (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2
        : sortedPrices[Math.floor(sortedPrices.length / 2)]
      : 0;

  // Flag prices that are more than 2x the median as suspicious
  const pricesWithFlags = prices.map((p) => ({
    ...p,
    isSuspicious: median > 0 && p.price > median * 2
  }));

  return {
    ...product,
    latestPrices: pricesWithFlags,
    lowestPrice
  };
}

export async function getProductsWithStats() {
  const allProducts = await getProducts();

  return Promise.all(
    allProducts.map(async (product) => {
      const productWithPrices = await getProductWithLatestPrices(product.id);

      // Get the most recent scrape time from all price records
      const latestScrapedAt = productWithPrices?.latestPrices.reduce<Date | null>((latest, price) => {
        if (!latest || price.scrapedAt > latest) {
          return price.scrapedAt;
        }
        return latest;
      }, null);

      // Get sparkline data (lowest prices over last 14 days)
      const sparklineData = await getProductSparklineData(product.id);

      return {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        lowestPrice: productWithPrices?.lowestPrice ?? null,
        retailerCount: productWithPrices?.latestPrices.length ?? 0,
        scraperCount: product.productScrapers.length,
        lastUpdated: latestScrapedAt ?? product.updatedAt,
        sparkline: sparklineData
      };
    })
  );
}

/**
 * Get sparkline data for a product - lowest price per day for the last 14 days
 */
export async function getProductSparklineData(productId: number): Promise<number[]> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: {
      productScrapers: {
        with: {
          priceRecords: {
            orderBy: [desc(priceRecords.scrapedAt)],
            limit: 200
          }
        }
      }
    }
  });

  if (!product) return [];

  // Group prices by day and find lowest per day
  const pricesByDay = new Map<string, number>();

  for (const ps of product.productScrapers) {
    for (const record of ps.priceRecords) {
      const day = record.scrapedAt.toISOString().split('T')[0];
      const existing = pricesByDay.get(day);
      if (!existing || record.price < existing) {
        pricesByDay.set(day, record.price);
      }
    }
  }

  // Sort by date and get last 14 days
  const sortedDays = Array.from(pricesByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14);

  return sortedDays.map(([_, price]) => price);
}
