import { eq, desc } from 'drizzle-orm';
import { db, products, productScrapers, priceRecords, retailers } from '../index';
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

  // Get latest price per retailer
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
    for (const record of ps.priceRecords) {
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
      return {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        lowestPrice: productWithPrices?.lowestPrice ?? null,
        retailerCount: productWithPrices?.latestPrices.length ?? 0,
        scraperCount: product.productScrapers.length,
        lastUpdated: product.updatedAt
      };
    })
  );
}
