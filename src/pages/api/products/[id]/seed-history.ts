import type { APIRoute } from 'astro';
import { db, priceRecords, retailers, productScrapers } from '../../../../lib/db';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ params }) => {
  try {
    const productId = Number(params.id);
    if (isNaN(productId)) {
      return new Response(JSON.stringify({ message: 'Invalid product ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get product scrapers
    const scrapers = await db.query.productScrapers.findMany({
      where: eq(productScrapers.productId, productId)
    });

    if (scrapers.length === 0) {
      return new Response(JSON.stringify({ message: 'No scrapers found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get or create some retailers
    const retailerNames = ['Centre Com', 'PC Case Gear', 'Umart', 'PLE Computers', 'Scorptec'];
    const retailerRecords: { id: number; name: string }[] = [];

    for (const name of retailerNames) {
      let retailer = await db.query.retailers.findFirst({
        where: eq(retailers.name, name)
      });

      if (!retailer) {
        const result = db.insert(retailers).values({ name }).returning();
        retailer = result.get();
      }

      retailerRecords.push(retailer);
    }

    // Generate 30 days of price history
    const now = new Date();
    const records: {
      productScraperId: number;
      retailerId: number;
      price: number;
      currency: string;
      inStock: boolean;
      productUrl: string | null;
      scrapedAt: Date;
    }[] = [];

    // Base prices for each retailer (with some variation)
    const basePrices: Record<string, number> = {
      'Centre Com': 1049,
      'PC Case Gear': 1349,
      'Umart': 1349,
      'PLE Computers': 1399,
      'Scorptec': 1379
    };

    for (let daysAgo = 30; daysAgo >= 1; daysAgo--) {
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      date.setHours(12, 0, 0, 0);

      for (const retailer of retailerRecords) {
        const basePrice = basePrices[retailer.name] || 1349;

        // Add some price variation over time
        // Prices generally trended down, with some fluctuation
        const trendFactor = 1 + (daysAgo / 100); // Higher prices in the past
        const randomFactor = 0.98 + Math.random() * 0.04; // -2% to +2% random
        const price = Math.round(basePrice * trendFactor * randomFactor);

        records.push({
          productScraperId: scrapers[0].id,
          retailerId: retailer.id,
          price,
          currency: 'AUD',
          inStock: true,
          productUrl: null,
          scrapedAt: date
        });
      }
    }

    // Insert all records
    if (records.length > 0) {
      await db.insert(priceRecords).values(records);
    }

    return new Response(
      JSON.stringify({
        success: true,
        recordsCreated: records.length
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error seeding history:', error);
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : 'Failed to seed history'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
