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
  hints: text('hints'), // Optional hints for AI scraper (e.g., "look for the sale price")
  scrapeIntervalMinutes: integer('scrape_interval_minutes').notNull().default(1440), // Default: daily
  lastScrapedAt: integer('last_scraped_at', { mode: 'timestamp' }),
  lastScrapeStatus: text('last_scrape_status').$type<'success' | 'warning' | 'error'>(), // null = never run
  lastScrapeError: text('last_scrape_error'), // Error message if status is 'error'
  issueDismissedAt: integer('issue_dismissed_at', { mode: 'timestamp' }), // When issue was dismissed (reappears if new error after this)
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
  // Unit pricing fields for consumables (nappies, wipes, etc.)
  unitCount: integer('unit_count'), // e.g., 50 for a 50-pack
  unitType: text('unit_type'), // e.g., "nappy", "wipe", "piece"
  pricePerUnit: real('price_per_unit'), // Calculated: price / unitCount
  scrapedAt: integer('scraped_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// Groups table - for organizing products (e.g., "4K OLED Monitors")
export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// ProductGroups table - many-to-many link between products and groups
export const productGroups = sqliteTable('product_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  groupId: integer('group_id')
    .notNull()
    .references(() => groups.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
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

// ScraperRuns table - historical log of scraper executions
export const scraperRuns = sqliteTable('scraper_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productScraperId: integer('product_scraper_id')
    .notNull()
    .references(() => productScrapers.id, { onDelete: 'cascade' }),
  status: text('status').$type<'success' | 'error' | 'warning'>().notNull(),
  pricesFound: integer('prices_found').notNull().default(0),
  pricesSaved: integer('prices_saved').notNull().default(0),
  errorMessage: text('error_message'),
  logs: text('logs'), // JSON array of log entries
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// Relations
export const productsRelations = relations(products, ({ many }) => ({
  productScrapers: many(productScrapers),
  notificationConfigs: many(notificationConfigs),
  productGroups: many(productGroups)
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  productGroups: many(productGroups)
}));

export const productGroupsRelations = relations(productGroups, ({ one }) => ({
  product: one(products, {
    fields: [productGroups.productId],
    references: [products.id]
  }),
  group: one(groups, {
    fields: [productGroups.groupId],
    references: [groups.id]
  })
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
  priceRecords: many(priceRecords),
  scraperRuns: many(scraperRuns)
}));

export const scraperRunsRelations = relations(scraperRuns, ({ one }) => ({
  productScraper: one(productScrapers, {
    fields: [scraperRuns.productScraperId],
    references: [productScrapers.id]
  })
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

// Watched NBN Speeds table - tracks speed tiers user wants to monitor
export const watchedNbnSpeeds = sqliteTable('watched_nbn_speeds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  speed: integer('speed').notNull(), // 25, 50, 100, 250, 500, 1000
  label: text('label').notNull(), // "NBN 100 (100/20 Mbps)"
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// NBN Speed Snapshots table - historical cheapest plan for each speed
export const nbnSpeedSnapshots = sqliteTable('nbn_speed_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  watchedSpeedId: integer('watched_speed_id')
    .notNull()
    .references(() => watchedNbnSpeeds.id, { onDelete: 'cascade' }),
  providerName: text('provider_name').notNull(),
  planName: text('plan_name').notNull(),
  monthlyPrice: real('monthly_price').notNull(),
  promoValue: real('promo_value'),
  promoDuration: integer('promo_duration'),
  yearlyCost: real('yearly_cost').notNull(),
  setupFee: real('setup_fee').notNull().default(0),
  typicalEveningSpeed: integer('typical_evening_speed'), // Mbps
  cisUrl: text('cis_url'), // Critical Information Summary URL
  scrapedAt: integer('scraped_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// User's current NBN plan - for savings comparison
export const userNbnPlans = sqliteTable('user_nbn_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  watchedSpeedId: integer('watched_speed_id')
    .notNull()
    .references(() => watchedNbnSpeeds.id, { onDelete: 'cascade' })
    .unique(), // One plan per speed tier
  providerName: text('provider_name'),
  monthlyPrice: real('monthly_price').notNull(),
  planStartedAt: integer('plan_started_at', { mode: 'timestamp' }),
  promoDiscount: real('promo_discount').default(0),
  promoEndsAt: integer('promo_ends_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// NBN Relations
export const watchedNbnSpeedsRelations = relations(watchedNbnSpeeds, ({ many, one }) => ({
  snapshots: many(nbnSpeedSnapshots),
  userPlan: one(userNbnPlans)
}));

export const nbnSpeedSnapshotsRelations = relations(nbnSpeedSnapshots, ({ one }) => ({
  watchedSpeed: one(watchedNbnSpeeds, {
    fields: [nbnSpeedSnapshots.watchedSpeedId],
    references: [watchedNbnSpeeds.id]
  })
}));

export const userNbnPlansRelations = relations(userNbnPlans, ({ one }) => ({
  watchedSpeed: one(watchedNbnSpeeds, {
    fields: [userNbnPlans.watchedSpeedId],
    references: [watchedNbnSpeeds.id]
  })
}));

// NBN Plans Cache - stores fetched plans from NetBargains API
export const nbnPlansCache = sqliteTable('nbn_plans_cache', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  speedTier: integer('speed_tier').notNull(), // 25, 50, 100, 250, 500, 1000
  planData: text('plan_data').notNull(), // JSON stringified full plan object
  providerId: integer('provider_id').notNull(),
  providerName: text('provider_name').notNull(),
  planName: text('plan_name').notNull(),
  monthlyPrice: real('monthly_price').notNull(),
  yearlyCost: real('yearly_cost').notNull(),
  cachedAt: integer('cached_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// NBN Refresh State - tracks when API was last called
export const nbnRefreshState = sqliteTable('nbn_refresh_state', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lastRefreshAt: integer('last_refresh_at', { mode: 'timestamp' }).notNull(),
  lastManualRefreshAt: integer('last_manual_refresh_at', { mode: 'timestamp' })
});

// NBN Refresh Runs - historical log of NBN refresh executions
export const nbnRefreshRuns = sqliteTable('nbn_refresh_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  watchedSpeedId: integer('watched_speed_id')
    .notNull()
    .references(() => watchedNbnSpeeds.id, { onDelete: 'cascade' }),
  status: text('status').$type<'success' | 'error' | 'warning'>().notNull(),
  plansFetched: integer('plans_fetched').notNull().default(0),
  plansCached: integer('plans_cached').notNull().default(0),
  snapshotsSaved: integer('snapshots_saved').notNull().default(0),
  errorMessage: text('error_message'),
  logs: text('logs'), // JSON array of log entries
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

export const nbnRefreshRunsRelations = relations(nbnRefreshRuns, ({ one }) => ({
  watchedSpeed: one(watchedNbnSpeeds, {
    fields: [nbnRefreshRuns.watchedSpeedId],
    references: [watchedNbnSpeeds.id]
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
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type ProductGroup = typeof productGroups.$inferSelect;
export type NewProductGroup = typeof productGroups.$inferInsert;
export type ScraperRun = typeof scraperRuns.$inferSelect;
export type NewScraperRun = typeof scraperRuns.$inferInsert;
export type WatchedNbnSpeed = typeof watchedNbnSpeeds.$inferSelect;
export type NewWatchedNbnSpeed = typeof watchedNbnSpeeds.$inferInsert;
export type NbnSpeedSnapshot = typeof nbnSpeedSnapshots.$inferSelect;
export type NewNbnSpeedSnapshot = typeof nbnSpeedSnapshots.$inferInsert;
export type UserNbnPlan = typeof userNbnPlans.$inferSelect;
export type NewUserNbnPlan = typeof userNbnPlans.$inferInsert;
export type NbnPlanCache = typeof nbnPlansCache.$inferSelect;
export type NewNbnPlanCache = typeof nbnPlansCache.$inferInsert;
export type NbnRefreshState = typeof nbnRefreshState.$inferSelect;
export type NewNbnRefreshState = typeof nbnRefreshState.$inferInsert;
export type NbnRefreshRun = typeof nbnRefreshRuns.$inferSelect;
export type NewNbnRefreshRun = typeof nbnRefreshRuns.$inferInsert;
