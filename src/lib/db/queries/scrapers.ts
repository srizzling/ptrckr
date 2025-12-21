import { eq, desc } from 'drizzle-orm';
import { db, scrapers, productScrapers } from '../index';
import type { NewScraper, NewProductScraper } from '../schema';

export async function getScrapers() {
  return db.query.scrapers.findMany({
    orderBy: [desc(scrapers.createdAt)]
  });
}

export async function getScraperById(id: number) {
  return db.query.scrapers.findFirst({
    where: eq(scrapers.id, id)
  });
}

export async function getScraperByType(type: string) {
  return db.query.scrapers.findFirst({
    where: eq(scrapers.type, type)
  });
}

export async function createScraper(data: NewScraper) {
  const result = db.insert(scrapers).values(data).returning();
  return result.get();
}

export async function getProductScraperById(id: number) {
  return db.query.productScrapers.findFirst({
    where: eq(productScrapers.id, id),
    with: {
      product: true,
      scraper: true
    }
  });
}

export async function createProductScraper(data: NewProductScraper) {
  const result = db.insert(productScrapers).values(data).returning();
  return result.get();
}

export async function updateProductScraper(id: number, data: Partial<NewProductScraper>) {
  const result = db
    .update(productScrapers)
    .set(data)
    .where(eq(productScrapers.id, id))
    .returning();
  return result.get();
}

export async function deleteProductScraper(id: number) {
  return db.delete(productScrapers).where(eq(productScrapers.id, id));
}

export async function getProductScrapersForProduct(productId: number) {
  return db.query.productScrapers.findMany({
    where: eq(productScrapers.productId, productId),
    with: {
      scraper: true
    }
  });
}

export async function getScrapersNeedingRun() {
  const now = new Date();

  return db.query.productScrapers.findMany({
    where: eq(productScrapers.enabled, true),
    with: {
      product: true,
      scraper: true
    }
  }).then((results) =>
    results.filter((ps) => {
      if (!ps.lastScrapedAt) return true;
      const nextRun = new Date(ps.lastScrapedAt.getTime() + ps.scrapeIntervalMinutes * 60 * 1000);
      return now >= nextRun;
    })
  );
}

export async function markScraperAsRun(id: number) {
  return db
    .update(productScrapers)
    .set({ lastScrapedAt: new Date() })
    .where(eq(productScrapers.id, id));
}

// Seed default scrapers if they don't exist
export async function seedDefaultScrapers() {
  const existingScrapers = await getScrapers();
  const existingTypes = new Set(existingScrapers.map((s) => s.type));

  const defaultScrapers = [
    {
      name: 'StaticICE',
      type: 'staticice',
      description: 'Price comparison aggregator for Australian retailers'
    },
    {
      name: 'PCPartPicker',
      type: 'pcpartpicker',
      description: 'PC component price comparison with price history'
    },
    {
      name: 'PB Tech',
      type: 'pbtech',
      description: 'Australian and New Zealand computer retailer'
    },
    {
      name: 'Dell',
      type: 'dell',
      description: 'Dell Australia direct store'
    }
  ];

  for (const scraper of defaultScrapers) {
    if (!existingTypes.has(scraper.type)) {
      await createScraper(scraper);
    }
  }
}
