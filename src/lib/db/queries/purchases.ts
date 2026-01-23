import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { db, purchases, priceRecords, productScrapers } from '../index';
import type { NewPurchase, Purchase } from '../schema';

export async function createPurchase(data: NewPurchase) {
  const result = db.insert(purchases).values(data).returning();
  return result.get();
}

export async function getPurchaseById(id: number) {
  return db.query.purchases.findFirst({
    where: eq(purchases.id, id),
    with: {
      product: true,
      retailer: true
    }
  });
}

export async function deletePurchase(id: number) {
  return db.delete(purchases).where(eq(purchases.id, id));
}

export async function getPurchasesForProduct(productId: number) {
  const purchaseRecords = await db.query.purchases.findMany({
    where: eq(purchases.productId, productId),
    orderBy: [desc(purchases.purchasedAt)],
    with: {
      retailer: true
    }
  });

  // Calculate stats for each purchase
  const purchasesWithStats = await Promise.all(
    purchaseRecords.map(async (purchase) => {
      const stats = await getPurchaseStats(purchase);
      return {
        ...purchase,
        stats
      };
    })
  );

  return purchasesWithStats;
}

export interface PurchaseStats {
  currentPrice: number | null;
  priceDifference: number | null;
  percentChange: number | null;
  lowestSincePurchase: number | null;
  lowestSincePurchaseDate: Date | null;
  wouldHaveSaved: number | null;
}

async function getPurchaseStats(purchase: Purchase & { retailer?: { id: number; name: string } }): Promise<PurchaseStats> {
  // Get all product scrapers for this product
  const productScrapersList = await db.query.productScrapers.findMany({
    where: eq(productScrapers.productId, purchase.productId)
  });

  const psIds = productScrapersList.map((ps) => ps.id);
  if (psIds.length === 0) {
    return {
      currentPrice: null,
      priceDifference: null,
      percentChange: null,
      lowestSincePurchase: null,
      lowestSincePurchaseDate: null,
      wouldHaveSaved: null
    };
  }

  // Get the latest price for this retailer
  const latestPriceRecord = await db.query.priceRecords.findFirst({
    where: and(
      sql`${priceRecords.productScraperId} IN (${sql.join(psIds.map(id => sql`${id}`), sql`, `)})`,
      eq(priceRecords.retailerId, purchase.retailerId)
    ),
    orderBy: [desc(priceRecords.scrapedAt)]
  });

  // Get the lowest price since purchase date for this retailer
  const lowestSincePurchaseRecord = await db.query.priceRecords.findFirst({
    where: and(
      sql`${priceRecords.productScraperId} IN (${sql.join(psIds.map(id => sql`${id}`), sql`, `)})`,
      eq(priceRecords.retailerId, purchase.retailerId),
      gte(priceRecords.scrapedAt, purchase.purchasedAt)
    ),
    orderBy: [sql`${priceRecords.price} ASC`]
  });

  const currentPrice = latestPriceRecord?.price ?? null;
  const lowestSincePurchase = lowestSincePurchaseRecord?.price ?? null;

  return {
    currentPrice,
    priceDifference: currentPrice !== null ? currentPrice - purchase.price : null,
    percentChange: currentPrice !== null ? ((currentPrice - purchase.price) / purchase.price) * 100 : null,
    lowestSincePurchase,
    lowestSincePurchaseDate: lowestSincePurchaseRecord?.scrapedAt ?? null,
    wouldHaveSaved: lowestSincePurchase !== null ? purchase.price - lowestSincePurchase : null
  };
}

export async function getAllPurchases() {
  return db.query.purchases.findMany({
    orderBy: [desc(purchases.purchasedAt)],
    with: {
      product: true,
      retailer: true
    }
  });
}
