import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DATABASE_URL = process.env.DATABASE_URL || './data/ptrckr.db';

// Ensure data directory exists
const dbDir = dirname(DATABASE_URL);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(DATABASE_URL);

// Enable WAL mode for better concurrent access
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Import settings seeding
import { seedSettings } from './queries/settings';

// Initialize database (seed settings)
// Schema sync is handled by drizzle-kit push in docker-entrypoint.sh
export function runMigrations() {
  console.log('[DB] Seeding default settings...');
  seedSettings();
  console.log('[DB] Database initialized');
}

// Export schema for convenience
export * from './schema';
