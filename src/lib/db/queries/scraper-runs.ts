import { eq, desc } from 'drizzle-orm';
import { db, scraperRuns } from '../index';
import type { NewScraperRun } from '../schema';

export async function createScraperRun(data: NewScraperRun) {
  const result = db.insert(scraperRuns).values(data).returning();
  return result.get();
}

export async function getRunsForProductScraper(productScraperId: number, limit = 20) {
  return db.query.scraperRuns.findMany({
    where: eq(scraperRuns.productScraperId, productScraperId),
    orderBy: [desc(scraperRuns.createdAt)],
    limit
  });
}

export async function getLatestRun(productScraperId: number) {
  return db.query.scraperRuns.findFirst({
    where: eq(scraperRuns.productScraperId, productScraperId),
    orderBy: [desc(scraperRuns.createdAt)]
  });
}

export async function getRunById(id: number) {
  return db.query.scraperRuns.findFirst({
    where: eq(scraperRuns.id, id)
  });
}

export async function getLastSuccessfulRun(productScraperId: number) {
  return db.query.scraperRuns.findFirst({
    where: (runs, { eq, and }) => and(
      eq(runs.productScraperId, productScraperId),
      eq(runs.status, 'success')
    ),
    orderBy: [desc(scraperRuns.createdAt)]
  });
}

export async function getAllRecentRuns(limit = 50) {
  return db.query.scraperRuns.findMany({
    orderBy: [desc(scraperRuns.createdAt)],
    limit,
    with: {
      productScraper: {
        with: {
          product: true,
          scraper: true
        }
      }
    }
  });
}
