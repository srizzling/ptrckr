import { eq } from 'drizzle-orm';
import { db, appSettings } from '../index';
import type { AppSetting, NewAppSetting } from '../schema';

// Default settings with their metadata
export const DEFAULT_SETTINGS: Omit<NewAppSetting, 'id'>[] = [
  // Scrapers
  { key: 'scraper_cache_hours', value: '168', type: 'number', label: 'Firecrawl Cache (hours)', description: 'Hours to cache before calling Firecrawl again', category: 'scrapers' },
  { key: 'scraper_max_price', value: '1000', type: 'number', label: 'Max Valid Price', description: 'Maximum price to accept as valid (filters out errors)', category: 'scrapers' },
  { key: 'scraper_pack_size_min', value: '10', type: 'number', label: 'Min Pack Size', description: 'Minimum valid pack size for consumables', category: 'scrapers' },
  { key: 'scraper_pack_size_max', value: '500', type: 'number', label: 'Max Pack Size', description: 'Maximum valid pack size for consumables', category: 'scrapers' },
  { key: 'staticice_max_price', value: '50000', type: 'number', label: 'StaticICE Max Price', description: 'Maximum price for StaticICE scraper', category: 'scrapers' },

  // Queue
  { key: 'queue_interval_ms', value: '120000', type: 'number', label: 'Queue Interval (ms)', description: 'Milliseconds between queue items', category: 'queue' },
  { key: 'queue_history_limit', value: '100', type: 'number', label: 'Queue History Limit', description: 'Maximum completed items to keep in memory', category: 'queue' },

  // Ollama
  { key: 'ollama_timeout_ms', value: '600000', type: 'number', label: 'Ollama Timeout (ms)', description: 'Timeout for Ollama API requests', category: 'ollama' },
  { key: 'ollama_max_retries', value: '3', type: 'number', label: 'Ollama Max Retries', description: 'Number of retry attempts for Ollama', category: 'ollama' },
  { key: 'ollama_health_timeout_ms', value: '5000', type: 'number', label: 'Ollama Health Check (ms)', description: 'Timeout for Ollama health check', category: 'ollama' },
  { key: 'ollama_max_tokens', value: '2000', type: 'number', label: 'Ollama Max Tokens', description: 'Maximum response tokens for Ollama', category: 'ollama' },

  // NBN
  { key: 'nbn_top_plans_to_track', value: '10', type: 'number', label: 'Top Plans to Track', description: 'Number of top plans to save in snapshots', category: 'nbn' },
  { key: 'nbn_page_size', value: '50', type: 'number', label: 'API Page Size', description: 'Number of plans per API request', category: 'nbn' },
  { key: 'nbn_page_delay_ms', value: '500', type: 'number', label: 'Page Delay (ms)', description: 'Delay between pagination requests', category: 'nbn' },
  { key: 'nbn_refresh_cooldown_ms', value: '3600000', type: 'number', label: 'Refresh Cooldown (ms)', description: 'Minimum time between manual refreshes', category: 'nbn' },
  { key: 'nbn_sparkline_limit', value: '30', type: 'number', label: 'Sparkline Data Points', description: 'Number of snapshots shown in sparklines', category: 'nbn' },

  // Prices
  { key: 'price_history_days', value: '30', type: 'number', label: 'History Days', description: 'Default days of price history to show', category: 'prices' },
  { key: 'price_history_limit', value: '1000', type: 'number', label: 'History Limit', description: 'Maximum price records to fetch', category: 'prices' },
  { key: 'latest_prices_days', value: '7', type: 'number', label: 'Latest Prices Window', description: 'Days to search for latest prices', category: 'prices' },
];

/**
 * Seed default settings if they don't exist
 */
export function seedSettings() {
  for (const setting of DEFAULT_SETTINGS) {
    const existing = db.select().from(appSettings).where(eq(appSettings.key, setting.key)).get();
    if (!existing) {
      db.insert(appSettings).values(setting).run();
      console.log(`[Settings] Seeded: ${setting.key}`);
    }
  }
}

/**
 * Get all settings
 */
export function getAllSettings(): AppSetting[] {
  return db.select().from(appSettings).all();
}

/**
 * Get settings grouped by category
 */
export function getSettingsByCategory(): Record<string, AppSetting[]> {
  const settings = getAllSettings();
  const grouped: Record<string, AppSetting[]> = {};

  for (const setting of settings) {
    if (!grouped[setting.category]) {
      grouped[setting.category] = [];
    }
    grouped[setting.category].push(setting);
  }

  return grouped;
}

/**
 * Get a single setting by key
 */
export function getSetting(key: string): AppSetting | undefined {
  return db.select().from(appSettings).where(eq(appSettings.key, key)).get();
}

/**
 * Get a setting value as a number with fallback
 */
export function getSettingNumber(key: string, defaultValue: number): number {
  const setting = getSetting(key);
  if (!setting) return defaultValue;
  const num = Number(setting.value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Get a setting value as a boolean with fallback
 */
export function getSettingBoolean(key: string, defaultValue: boolean): boolean {
  const setting = getSetting(key);
  if (!setting) return defaultValue;
  return setting.value === 'true';
}

/**
 * Get a setting value as a string with fallback
 */
export function getSettingString(key: string, defaultValue: string): string {
  const setting = getSetting(key);
  return setting?.value ?? defaultValue;
}

/**
 * Update a setting value
 */
export function updateSetting(key: string, value: string | number | boolean): AppSetting | undefined {
  const stringValue = String(value);
  const result = db
    .update(appSettings)
    .set({ value: stringValue, updatedAt: new Date() })
    .where(eq(appSettings.key, key))
    .returning()
    .get();
  return result;
}
