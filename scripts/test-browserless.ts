/**
 * Test script to debug BrowserQL responses from Coles
 * Run with: npx tsx scripts/test-browserless.ts
 */

const COLES_URL = process.argv[2] || 'https://www.coles.com.au/product/huggies-skin-protect-newborn-nappies-size-1-108-pack-9088598';

async function testBrowserless() {
  const browserlessToken = process.env.BROWSERLESS_TOKEN;
  const browserlessApiUrl = process.env.BROWSERLESS_API_URL || 'https://production-sfo.browserless.io';

  if (!browserlessToken) {
    console.error('ERROR: BROWSERLESS_TOKEN environment variable not set');
    console.log('Run with: BROWSERLESS_TOKEN=your_token npx tsx scripts/test-browserless.ts');
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('BrowserQL Test - Coles');
  console.log('='.repeat(80));
  console.log(`URL: ${COLES_URL}`);
  console.log(`Endpoint: ${browserlessApiUrl}/stealth/bql`);
  console.log('');

  const query = `
    mutation {
      goto(url: "${COLES_URL}", waitUntil: domContentLoaded, timeout: 90000) {
        status
      }
      waitForTimeout(time: 10000) {
        time
      }
      html {
        html
      }
    }
  `;

  const useProxy = process.env.BROWSERLESS_PROXY === 'true';
  const proxyParams = useProxy ? '&proxy=residential&proxyCountry=au' : '';
  const endpoint = `${browserlessApiUrl}/stealth/bql?token=${browserlessToken}${proxyParams}`;

  console.log(`Using proxy: ${useProxy}`);
  console.log('Fetching page...\n');

  try {
    const startTime = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const elapsed = Date.now() - startTime;
    console.log(`Response status: ${response.status} (${elapsed}ms)`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`BrowserQL error: ${errorText}`);
      return;
    }

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL errors:', JSON.stringify(result.errors, null, 2));
      return;
    }

    const html = result.data?.html?.html || '';
    console.log(`\nHTML length: ${html.length} characters`);

    // Check for block indicators
    console.log('\n' + '='.repeat(80));
    console.log('BLOCK DETECTION');
    console.log('='.repeat(80));
    console.log(`Contains "captcha": ${html.toLowerCase().includes('captcha')}`);
    console.log(`Contains "robot": ${html.toLowerCase().includes('robot')}`);
    console.log(`Contains "blocked": ${html.toLowerCase().includes('blocked')}`);
    console.log(`Contains "access denied": ${html.toLowerCase().includes('access denied')}`);

    // Check for price patterns
    console.log('\n' + '='.repeat(80));
    console.log('PRICE PATTERN DETECTION');
    console.log('='.repeat(80));

    // Pattern 1: "price": number
    const pricePattern1 = html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/g);
    console.log(`\n"price": patterns found: ${pricePattern1?.length || 0}`);
    if (pricePattern1) {
      pricePattern1.slice(0, 5).forEach(p => console.log(`  ${p}`));
    }

    // Pattern 2: JSON-LD Offer
    const hasJsonLd = html.includes('@type');
    const hasOffer = html.includes('"Offer"');
    console.log(`\nJSON-LD present: ${hasJsonLd}`);
    console.log(`Offer type present: ${hasOffer}`);

    // Pattern 3: data attributes
    const dataPriceMatch = html.match(/data-price="([^"]+)"/g);
    console.log(`\ndata-price attributes: ${dataPriceMatch?.length || 0}`);
    if (dataPriceMatch) {
      dataPriceMatch.slice(0, 5).forEach(p => console.log(`  ${p}`));
    }

    // Look for price-related data structures
    console.log('\n' + '='.repeat(80));
    console.log('SEARCHING FOR PRICE IN JSON STRUCTURES');
    console.log('='.repeat(80));

    // Extract all JSON blocks
    const jsonBlocks = html.match(/\{[^{}]*"price"[^{}]*\}/gi);
    console.log(`\nJSON blocks with "price": ${jsonBlocks?.length || 0}`);
    if (jsonBlocks) {
      jsonBlocks.slice(0, 10).forEach((block, i) => {
        console.log(`\n[Block ${i + 1}]:`);
        console.log(block.substring(0, 300));
      });
    }

    // Look for __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    console.log(`\n__NEXT_DATA__ present: ${!!nextDataMatch}`);

    // Save full HTML to file for inspection
    const outputPath = '/tmp/coles-test.html';
    const fs = await import('fs');
    fs.writeFileSync(outputPath, html);
    console.log(`\nFull HTML saved to: ${outputPath}`);

    // Print first and last 1000 chars
    console.log('\n' + '='.repeat(80));
    console.log('HTML PREVIEW');
    console.log('='.repeat(80));
    console.log('\n--- First 1000 chars ---');
    console.log(html.substring(0, 1000));
    console.log('\n--- Last 1000 chars ---');
    console.log(html.substring(html.length - 1000));

    // Search for specific price-related keys
    console.log('\n' + '='.repeat(80));
    console.log('SEARCHING FOR COLES-SPECIFIC PATTERNS');
    console.log('='.repeat(80));

    const patterns = [
      { name: 'WasPrice', regex: /"WasPrice":\s*"?([^",}]+)"?/ },
      { name: 'NowPrice', regex: /"NowPrice":\s*"?([^",}]+)"?/ },
      { name: 'SalePrice', regex: /"SalePrice":\s*"?([^",}]+)"?/ },
      { name: 'pricing.now', regex: /"pricing":\s*\{[^}]*"now":\s*(\d+(?:\.\d+)?)/ },
      { name: 'priceValue', regex: /"priceValue":\s*"?(\d+(?:\.\d+)?)"?/ },
      { name: 'productPrice', regex: /"productPrice":\s*"?(\d+(?:\.\d+)?)"?/ },
      { name: 'dollar-value', regex: /\$(\d+(?:\.\d{2})?)\s*<\/span>/ },
      { name: 'price-dollars', regex: /class="[^"]*price[^"]*"[^>]*>.*?\$?(\d+(?:\.\d{2})?)/i },
    ];

    for (const { name, regex } of patterns) {
      const match = html.match(regex);
      console.log(`${name}: ${match ? match[1] : 'not found'}`);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testBrowserless();
