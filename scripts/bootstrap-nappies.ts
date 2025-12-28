/**
 * Bootstrap script for nappy products
 * Run with: npx tsx scripts/bootstrap-nappies.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'ptrckr.db');
const db = new Database(DB_PATH);

// AI Scraper ID
const AI_SCRAPER_ID = 5;

// Group ID for "Nappies Size 1" (create if doesn't exist)
const NAPPIES_GROUP_NAME = 'Nappies Size 1';

interface ProductConfig {
  name: string;
  imageUrl?: string;
  scrapers: {
    retailer: string;
    url: string;
  }[];
}

// Product configurations with all retailer URLs
const PRODUCTS: ProductConfig[] = [
  // Huggies Ultimate Newborn
  {
    name: 'Huggies Ultimate Newborn Size 1 - 224pk',
    imageUrl: 'https://www.costco.com.au/medias/sys_master/images/h8d/hf9/119407854870558.jpg',
    scrapers: [
      { retailer: 'Costco', url: 'https://www.costco.com.au/Baby-Kids-Toys/Nappies-Wipes-Training-Pants/Nappies/Huggies-Ultimate-Nappies-Size-1-Newborn-224-Nappies/p/1766911' }
    ]
  },
  {
    name: 'Huggies Ultimate Newborn Size 1 - 160pk',
    imageUrl: 'https://www.bigw.com.au/medias/sys_master/images/images/h8d/h71/98071410180126.jpg',
    scrapers: [
      { retailer: 'Coles', url: 'https://www.coles.com.au/product/huggies-ultimate-nappies-newborn-size-1-160-pack-8710170' },
      { retailer: 'Woolworths', url: 'https://www.woolworths.com.au/shop/productdetails/842251/huggies-ultimate-nappies-newborn-size-1' },
      { retailer: 'Big W', url: 'https://www.bigw.com.au/product/huggies-newborn-nappies-size-1-up-to-5kg-160-pack/p/52815' }
    ]
  },
  {
    name: 'Huggies Ultimate Newborn Size 1 - 108pk',
    imageUrl: 'https://www.bigw.com.au/medias/sys_master/images/images/h8d/h71/98071410180126.jpg',
    scrapers: [
      { retailer: 'Coles', url: 'https://www.coles.com.au/product/huggies-ultimate-nappies-newborn-size-1-108-pack-2461056' },
      { retailer: 'Woolworths', url: 'https://www.woolworths.com.au/shop/productdetails/51461/huggies-ultimate-nappies-newborn-size-1' },
      { retailer: 'Chemist Warehouse', url: 'https://www.chemistwarehouse.com.au/buy/85821/huggies-jumbo-ultimate-newborn-108-pack' },
      { retailer: 'Big W', url: 'https://www.bigw.com.au/product/huggies-newborn-nappies-size-1-up-to-5kg-108-pack/p/568518' }
    ]
  },
  {
    name: 'Huggies Ultimate Newborn Size 1 - 54pk',
    imageUrl: 'https://www.bigw.com.au/medias/sys_master/images/images/h8d/h71/98071410180126.jpg',
    scrapers: [
      { retailer: 'Coles', url: 'https://www.coles.com.au/product/huggies-ultimate-nappies-newborn-size-1-54-pack-4758811' },
      { retailer: 'Woolworths', url: 'https://www.woolworths.com.au/shop/productdetails/78583/huggies-ultimate-nappies-newborn-size-1' },
      { retailer: 'Chemist Warehouse', url: 'https://www.chemistwarehouse.com.au/buy/57478/huggies-ultimate-newborn-54-pack' },
      { retailer: 'Big W', url: 'https://www.bigw.com.au/product/huggies-newborn-nappies-size-1-up-to-5kg-54-pack/p/569376' }
    ]
  },
  // Huggies Pure & Sensitive (formerly Skin Protect)
  {
    name: 'Huggies Pure & Sensitive Newborn Size 1 - 86pk',
    imageUrl: 'https://www.chemistwarehouse.com.au/medias/sys_master/images/h67/h1b/8847850029086/567952-primary.jpg',
    scrapers: [
      { retailer: 'Chemist Warehouse', url: 'https://www.chemistwarehouse.com.au/buy/119050/huggies-pure-sensitive-nappies-size-1-86-pack' },
      { retailer: 'Big W', url: 'https://www.bigw.com.au/product/huggies-pure-sensitive-nappies-size-1-86-pack/p/6018664' }
    ]
  }
];

function getOrCreateGroup(name: string): number {
  const existing = db.prepare('SELECT id FROM groups WHERE name = ?').get(name) as { id: number } | undefined;
  if (existing) {
    console.log(`Group "${name}" already exists with ID ${existing.id}`);
    return existing.id;
  }

  const result = db.prepare('INSERT INTO groups (name, created_at, updated_at) VALUES (?, ?, ?)').run(
    name,
    Date.now(),
    Date.now()
  );
  console.log(`Created group "${name}" with ID ${result.lastInsertRowid}`);
  return result.lastInsertRowid as number;
}

function createProduct(config: ProductConfig, groupId: number): void {
  // Check if product already exists
  const existing = db.prepare('SELECT id FROM products WHERE name = ?').get(config.name) as { id: number } | undefined;
  if (existing) {
    console.log(`Product "${config.name}" already exists, skipping...`);
    return;
  }

  // Create product
  const productResult = db.prepare(
    'INSERT INTO products (name, image_url, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(config.name, config.imageUrl || null, Date.now(), Date.now());
  const productId = productResult.lastInsertRowid as number;
  console.log(`Created product "${config.name}" with ID ${productId}`);

  // Add to group
  db.prepare('INSERT OR IGNORE INTO product_groups (product_id, group_id) VALUES (?, ?)').run(productId, groupId);

  // Create scrapers
  for (const scraper of config.scrapers) {
    db.prepare(`
      INSERT INTO product_scrapers (product_id, scraper_id, url, scrape_interval_minutes, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(productId, AI_SCRAPER_ID, scraper.url, 1440, 1, Date.now());
    console.log(`  - Added ${scraper.retailer} scraper`);
  }
}

function main() {
  console.log('=== Nappy Products Bootstrap Script ===\n');

  // Get or create the nappies group
  const groupId = getOrCreateGroup(NAPPIES_GROUP_NAME);
  console.log('');

  // Create each product
  for (const product of PRODUCTS) {
    createProduct(product, groupId);
    console.log('');
  }

  console.log('=== Bootstrap complete! ===');
  console.log(`Created ${PRODUCTS.length} products in group "${NAPPIES_GROUP_NAME}"`);
}

main();
