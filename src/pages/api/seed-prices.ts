import type { APIRoute } from 'astro';
import { db, priceRecords, retailers, productScrapers } from '../../lib/db';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async () => {
  try {
    // Get all product scrapers
    const allProductScrapers = await db.query.productScrapers.findMany();

    if (allProductScrapers.length === 0) {
      return new Response(JSON.stringify({ error: 'No product scrapers found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Sample retailers to use
    const retailerNames = [
      'PC Case Gear',
      'Scorptec',
      'Umart',
      'PLE Computers',
      'Centre Com',
      'Mwave'
    ];

    // Ensure retailers exist
    const retailerIds: number[] = [];
    for (const name of retailerNames) {
      let retailer = await db.query.retailers.findFirst({
        where: eq(retailers.name, name)
      });
      if (!retailer) {
        const result = db.insert(retailers).values({ name }).returning();
        retailer = result.get();
      }
      retailerIds.push(retailer!.id);
    }

    // Generate prices for the last 14 days
    const now = new Date();
    const basePrice = 1349; // Base price for the monitor
    let totalRecords = 0;

    for (const ps of allProductScrapers) {
      // For each day in the last 14 days
      for (let daysAgo = 14; daysAgo >= 0; daysAgo--) {
        const date = new Date(now);
        date.setDate(date.getDate() - daysAgo);
        date.setHours(12, 0, 0, 0); // Noon each day

        // Generate 3-5 prices per day from different retailers
        const numPrices = 3 + Math.floor(Math.random() * 3);
        const usedRetailers = new Set<number>();

        for (let i = 0; i < numPrices; i++) {
          // Pick a random retailer we haven't used today
          let retailerId: number;
          do {
            retailerId = retailerIds[Math.floor(Math.random() * retailerIds.length)];
          } while (usedRetailers.has(retailerId) && usedRetailers.size < retailerIds.length);
          usedRetailers.add(retailerId);

          // Generate a price with some variation
          // Trend: prices start higher and drop over time (simulating a sale)
          const trendFactor = 1 + (daysAgo / 14) * 0.15; // 15% higher 14 days ago
          const randomVariation = 0.95 + Math.random() * 0.1; // ±5% random
          const retailerVariation = 0.98 + (retailerId % 3) * 0.02; // Slight retailer differences

          const price = Math.round(basePrice * trendFactor * randomVariation * retailerVariation);

          db.insert(priceRecords)
            .values({
              productScraperId: ps.id,
              retailerId,
              price,
              currency: 'AUD',
              inStock: Math.random() > 0.1, // 90% in stock
              productUrl: `https://example.com/product/${ps.id}`,
              scrapedAt: date
            })
            .run();

          totalRecords++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${totalRecords} price records over 14 days for ${allProductScrapers.length} product scraper(s)`
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error seeding prices:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
