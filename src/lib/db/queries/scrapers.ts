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

export async function markScraperAsRun(
  id: number,
  status: 'success' | 'warning' | 'error' = 'success',
  error?: string
) {
  return db
    .update(productScrapers)
    .set({
      lastScrapedAt: new Date(),
      lastScrapeStatus: status,
      lastScrapeError: status === 'error' ? error ?? 'Unknown error' : null
    })
    .where(eq(productScrapers.id, id));
}

// Get all product scrapers with their latest status for monitoring
export async function getAllProductScrapersWithStatus() {
  return db.query.productScrapers.findMany({
    with: {
      product: true,
      scraper: true
    },
    orderBy: [desc(productScrapers.lastScrapedAt)]
  });
}

// Get scrapers with issues (failed, warning/no prices, or never run)
export async function getScrapersWithIssues() {
  const allScrapers = await getAllProductScrapersWithStatus();

  return allScrapers.filter(ps => {
    // Include if last scrape failed
    if (ps.lastScrapeStatus === 'error') return true;
    // Include if last scrape found no prices (warning)
    if (ps.lastScrapeStatus === 'warning') return true;
    // Include if never scraped
    if (!ps.lastScrapedAt) return true;
    return false;
  });
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
    },
    {
      name: 'AI Scraper',
      type: 'ai',
      description: 'AI-powered generic scraper using local Ollama - works with any product page'
    }
  ];

  for (const scraper of defaultScrapers) {
    if (!existingTypes.has(scraper.type)) {
      await createScraper(scraper);
    }
  }
}
