import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { execSync } from 'child_process';

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

// Sync database schema using drizzle-kit push
function syncSchema() {
  try {
    console.log('[DB] Syncing schema with drizzle-kit push...');
    execSync('npx drizzle-kit push --force', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL }
    });
    console.log('[DB] Schema sync complete');
  } catch (error) {
    console.error('[DB] Schema sync failed:', error instanceof Error ? error.message : error);
    // Don't throw - let the app try to start anyway
  }
}

// Initialize database
export function runMigrations() {
  syncSchema();
  console.log('[DB] Seeding default settings...');
  seedSettings();
  console.log('[DB] Database initialized');
}

// Export schema for convenience
export * from './schema';
