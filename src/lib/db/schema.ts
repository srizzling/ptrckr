import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// Products table - items being tracked
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// Scrapers table - scraper templates (e.g., StaticICE)
export const scrapers = sqliteTable('scrapers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type').notNull(), // e.g., 'staticice', 'amazon', etc.
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// ProductScrapers table - links products to scrapers with specific URLs
export const productScrapers = sqliteTable('product_scrapers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  scraperId: integer('scraper_id')
    .notNull()
    .references(() => scrapers.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  scrapeIntervalMinutes: integer('scrape_interval_minutes').notNull().default(1440), // Default: daily
  lastScrapedAt: integer('last_scraped_at', { mode: 'timestamp' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// Retailers table - stores discovered from scraping
export const retailers = sqliteTable('retailers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  domain: text('domain'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// PriceRecords table - historical price data
export const priceRecords = sqliteTable('price_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productScraperId: integer('product_scraper_id')
    .notNull()
    .references(() => productScrapers.id, { onDelete: 'cascade' }),
  retailerId: integer('retailer_id')
    .notNull()
    .references(() => retailers.id, { onDelete: 'cascade' }),
  price: real('price').notNull(),
  currency: text('currency').notNull().default('AUD'),
  inStock: integer('in_stock', { mode: 'boolean' }).notNull().default(true),
  productUrl: text('product_url'),
  scrapedAt: integer('scraped_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// NotificationConfigs table - notification settings
export const notificationConfigs = sqliteTable('notification_configs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }), // null = global
  channel: text('channel').notNull().default('discord'), // 'discord', 'email', etc.
  webhookUrl: text('webhook_url').notNull(),
  triggerType: text('trigger_type').notNull().default('price_drop'), // 'price_drop', 'price_increase', 'any_change', 'below_threshold'
  thresholdValue: real('threshold_value'), // For 'below_threshold' trigger
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// Relations
export const productsRelations = relations(products, ({ many }) => ({
  productScrapers: many(productScrapers),
  notificationConfigs: many(notificationConfigs)
}));

export const scrapersRelations = relations(scrapers, ({ many }) => ({
  productScrapers: many(productScrapers)
}));

export const productScrapersRelations = relations(productScrapers, ({ one, many }) => ({
  product: one(products, {
    fields: [productScrapers.productId],
    references: [products.id]
  }),
  scraper: one(scrapers, {
    fields: [productScrapers.scraperId],
    references: [scrapers.id]
  }),
  priceRecords: many(priceRecords)
}));

export const retailersRelations = relations(retailers, ({ many }) => ({
  priceRecords: many(priceRecords)
}));

export const priceRecordsRelations = relations(priceRecords, ({ one }) => ({
  productScraper: one(productScrapers, {
    fields: [priceRecords.productScraperId],
    references: [productScrapers.id]
  }),
  retailer: one(retailers, {
    fields: [priceRecords.retailerId],
    references: [retailers.id]
  })
}));

export const notificationConfigsRelations = relations(notificationConfigs, ({ one }) => ({
  product: one(products, {
    fields: [notificationConfigs.productId],
    references: [products.id]
  })
}));

// Types
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Scraper = typeof scrapers.$inferSelect;
export type NewScraper = typeof scrapers.$inferInsert;
export type ProductScraper = typeof productScrapers.$inferSelect;
export type NewProductScraper = typeof productScrapers.$inferInsert;
export type Retailer = typeof retailers.$inferSelect;
export type NewRetailer = typeof retailers.$inferInsert;
export type PriceRecord = typeof priceRecords.$inferSelect;
export type NewPriceRecord = typeof priceRecords.$inferInsert;
export type NotificationConfig = typeof notificationConfigs.$inferSelect;
export type NewNotificationConfig = typeof notificationConfigs.$inferInsert;
