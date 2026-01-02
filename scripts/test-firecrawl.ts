/**
 * Test Firecrawl API for price extraction
 * Run: FIRECRAWL_API_KEY=fc-xxx npx tsx scripts/test-firecrawl.ts [url]
 */

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

if (!FIRECRAWL_API_KEY) {
  console.error('ERROR: FIRECRAWL_API_KEY environment variable not set');
  process.exit(1);
}
const TEST_URL = process.argv[2] || 'https://www.coles.com.au/product/huggies-skin-protect-newborn-nappies-size-1-108-pack-9088598';

async function testFirecrawl() {
  console.log('='.repeat(80));
  console.log('Firecrawl Test');
  console.log('='.repeat(80));
  console.log(`URL: ${TEST_URL}`);
  console.log('');

  // Define the extraction schema for product prices
  const extractSchema = {
    type: 'object',
    properties: {
      productName: { type: 'string', description: 'The name of the product' },
      price: { type: 'number', description: 'The current price of the product in dollars' },
      originalPrice: { type: 'number', description: 'The original/was price if on sale' },
      currency: { type: 'string', description: 'Currency code (e.g., AUD)' },
      inStock: { type: 'boolean', description: 'Whether the product is in stock' },
      packSize: { type: 'number', description: 'Number of items in the pack (e.g., 108 for a 108-pack)' },
      retailer: { type: 'string', description: 'The retailer name (e.g., Coles, Woolworths, Big W)' },
    },
    required: ['productName', 'price'],
  };

  try {
    console.log('Calling Firecrawl API...\n');
    const startTime = Date.now();

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url: TEST_URL,
        formats: ['extract'],
        extract: {
          schema: extractSchema,
        },
        // No proxy = standard (5 credits). Use proxy: 'stealth' for protected sites
      }),
    });

    const elapsed = Date.now() - startTime;
    console.log(`Response status: ${response.status} (${elapsed}ms)\n`);

    const data = await response.json();

    if (!response.ok) {
      console.error('API Error:', JSON.stringify(data, null, 2));
      return;
    }

    console.log('='.repeat(80));
    console.log('EXTRACTED DATA');
    console.log('='.repeat(80));
    console.log(JSON.stringify(data.data?.extract, null, 2));

    console.log('\n' + '='.repeat(80));
    console.log('FULL RESPONSE');
    console.log('='.repeat(80));
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

testFirecrawl();
