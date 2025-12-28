/**
 * Bootstrap script for nappy products using API
 * Run with: npx tsx scripts/bootstrap-nappies.ts [BASE_URL]
 *
 * Examples:
 *   npx tsx scripts/bootstrap-nappies.ts                    # Uses http://localhost:3000
 *   npx tsx scripts/bootstrap-nappies.ts http://192.168.1.94:3000
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';

// AI Scraper ID
const AI_SCRAPER_ID = 5;

// Group name
const NAPPIES_GROUP_NAME = 'Nappies Size 1';

interface ProductConfig {
  name: string;
  imageUrl?: string;
  scrapers: {
    retailer: string;
    url: string;
  }[];
}

// Product configurations from nappy-urls.txt
const PRODUCTS: ProductConfig[] = [
  // Huggies Skin Protect 224 pack (Costco exclusive)
  {
    name: 'Huggies Skin Protect Newborn Size 1 - 224pk',
    imageUrl: 'https://www.costco.com.au/medias/sys_master/images/h98/h56/171744033701918.jpg',
    scrapers: [
      { retailer: 'Costco', url: 'https://www.costco.com.au/Baby-Kids-Toys/Baby/Nappies-Wipes/Huggies-Unisex-Ultimate-Nappies-Size-1-Newborn-Up-to-5-kg-224-Nappies/p/41926' }
    ]
  },
  // Huggies Skin Protect 160 pack
  {
    name: 'Huggies Skin Protect Newborn Size 1 - 160pk',
    imageUrl: 'https://www.bigw.com.au/medias/sys_master/images/images/h57/h69/101215632359454.jpg',
    scrapers: [
      { retailer: 'Coles', url: 'https://www.coles.com.au/product/huggies-newborn-nappies-size-1-(up-to-5kg)-160-pack-4315353' },
      { retailer: 'Big W', url: 'https://www.bigw.com.au/product/huggies-newborn-nappies-size-1-up-to-5kg-160-pack/p/52815' },
      { retailer: 'Baby Bunting', url: 'https://www.babybunting.com.au/product/huggies-nappies-mega-newborn-size-1-160-pack-106593' }
    ]
  },
  // Huggies Skin Protect 108 pack
  {
    name: 'Huggies Skin Protect Newborn Size 1 - 108pk',
    imageUrl: 'https://static.chemistwarehouse.com.au/ams/media/pi/85821/3DF_800.jpg',
    scrapers: [
      { retailer: 'Coles', url: 'https://www.coles.com.au/product/huggies-skin-protect-newborn-nappies-size-1-108-pack-9088598' },
      { retailer: 'Chemist Warehouse', url: 'https://www.chemistwarehouse.com.au/buy/85821/huggies-jumbo-ultimate-newborn-108-pack' },
      { retailer: 'Big W', url: 'https://www.bigw.com.au/product/huggies-newborn-nappies-size-1-up-to-5kg-108-pack/p/568518' }
    ]
  },
  // Huggies Skin Protect 54 pack
  {
    name: 'Huggies Skin Protect Newborn Size 1 - 54pk',
    imageUrl: 'https://static.chemistwarehouse.com.au/ams/media/pi/90273/3DF_800.jpg',
    scrapers: [
      { retailer: 'Coles', url: 'https://www.coles.com.au/product/huggies-skin-protect-newborn-nappies-size-1-54-pack-7259907' },
      { retailer: 'Chemist Warehouse', url: 'https://www.chemistwarehouse.com.au/buy/90273/huggies-ultimate-nappies-size-1-newborn-5kg-bulk-54-pack' },
      { retailer: 'Big W', url: 'https://www.bigw.com.au/product/huggies-newborn-nappies-size-1-up-to-5kg-54-pack/p/569376' }
    ]
  },
  // Huggies Skin Protect 28 pack (convenience)
  {
    name: 'Huggies Skin Protect Newborn Size 1 - 28pk',
    imageUrl: 'https://static.chemistwarehouse.com.au/ams/media/pi/145563/3DF_800.jpg',
    scrapers: [
      { retailer: 'Coles', url: 'https://www.coles.com.au/product/huggies-convenience-nappies-size-1-28-pack-7019674' },
      { retailer: 'Chemist Warehouse', url: 'https://www.chemistwarehouse.com.au/buy/145563/huggies-convenience-pack-ultimate-size-1-newborn-28-pack' }
    ]
  },
  // Huggies Pure & Sensitive 86 pack
  {
    name: 'Huggies Pure & Sensitive Newborn Size 1 - 86pk',
    imageUrl: 'https://static.chemistwarehouse.com.au/ams/media/pi/156051/3DF_800.jpg',
    scrapers: [
      { retailer: 'Coles', url: 'https://www.coles.com.au/product/huggies-pure-and-sensitive-newborn-nappies-size-1-86-pack-9263348' },
      { retailer: 'Chemist Warehouse', url: 'https://www.chemistwarehouse.com.au/buy/156051/huggies-pure-and-sensitive-nappies-size-1-up-to-5kg-86-pack' },
      { retailer: 'Big W', url: 'https://www.bigw.com.au/product/huggies-pure-sensitive-nappies-size-1-86-pack/p/6018664' }
    ]
  }
];

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API ${method} ${path} failed: ${response.status} - ${error}`);
  }

  return response.json();
}

async function getOrCreateGroup(name: string): Promise<number> {
  // Check if group exists
  const groups = await api<{ id: number; name: string }[]>('GET', '/api/groups');
  const existing = groups.find(g => g.name === name);

  if (existing) {
    console.log(`Group "${name}" already exists with ID ${existing.id}`);
    return existing.id;
  }

  // Create new group
  const group = await api<{ id: number }>('POST', '/api/groups', { name });
  console.log(`Created group "${name}" with ID ${group.id}`);
  return group.id;
}

async function createProduct(config: ProductConfig, groupId: number): Promise<void> {
  try {
    // Create product with scrapers
    const product = await api<{ id: number }>('POST', '/api/products', {
      name: config.name,
      imageUrl: config.imageUrl,
      scrapers: config.scrapers.map(s => ({
        scraperId: AI_SCRAPER_ID,
        url: s.url
      }))
    });
    console.log(`Created product "${config.name}" with ID ${product.id}`);

    // Add to group
    await api('POST', `/api/groups/${groupId}/products`, { productId: product.id });
    console.log(`  - Added to group`);

    // Log scrapers
    for (const scraper of config.scrapers) {
      console.log(`  - ${scraper.retailer}: ${scraper.url}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log(`Product "${config.name}" already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log(`=== Nappy Products Bootstrap Script ===`);
  console.log(`Using API at: ${BASE_URL}\n`);

  // Get or create the nappies group
  const groupId = await getOrCreateGroup(NAPPIES_GROUP_NAME);
  console.log('');

  // Create each product
  for (const product of PRODUCTS) {
    await createProduct(product, groupId);
    console.log('');
  }

  console.log('=== Bootstrap complete! ===');
  console.log(`Created ${PRODUCTS.length} products in group "${NAPPIES_GROUP_NAME}"`);
}

main().catch(console.error);
