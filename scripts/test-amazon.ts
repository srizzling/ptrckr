/**
 * Test Amazon scraper using Firecrawl
 * Run: FIRECRAWL_API_KEY=fc-xxx npx tsx scripts/test-amazon.ts [url]
 */

import { amazonScraper } from '../src/lib/scrapers/amazon';

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!FIRECRAWL_API_KEY) {
  console.error('ERROR: FIRECRAWL_API_KEY environment variable not set');
  process.exit(1);
}

// Default to an Amazon Australia product
const TEST_URL = process.argv[2] || 'https://www.amazon.com.au/dp/B09V3KXJPB';

async function testAmazonScraper() {
  console.log('='.repeat(80));
  console.log('Amazon Scraper Test');
  console.log('='.repeat(80));
  console.log(`URL: ${TEST_URL}`);
  console.log('');

  const startTime = Date.now();

  const result = await amazonScraper.scrape(TEST_URL, undefined, {
    log: (msg) => console.log(msg),
    force: true, // Bypass cache for testing
  });

  const elapsed = Date.now() - startTime;

  console.log('\n' + '='.repeat(80));
  console.log('RESULT');
  console.log('='.repeat(80));
  console.log(`Success: ${result.success}`);
  console.log(`Prices found: ${result.prices.length}`);
  console.log(`Duration: ${elapsed}ms`);

  if (result.productName) {
    console.log(`Product name: ${result.productName}`);
  }

  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  if (result.prices.length > 0) {
    console.log('\nPrices:');
    for (const price of result.prices) {
      console.log(`  - ${price.retailerName}: ${price.currency} $${price.price}`);
      console.log(`    In stock: ${price.inStock}`);
      if (price.unitCount) {
        console.log(`    Pack size: ${price.unitCount} ${price.unitType || 'items'}`);
      }
      console.log(`    URL: ${price.productUrl}`);
    }
  }
}

testAmazonScraper().catch(console.error);
