import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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

// Run migrations on startup
export function runMigrations() {
  // In production, migrations are in the dist folder
  // In development, they're in the project root
  const migrationsFolder =
    process.env.NODE_ENV === 'production'
      ? join(process.cwd(), 'drizzle')
      : join(process.cwd(), 'drizzle');

  console.log('[DB] Running migrations from:', migrationsFolder);

  if (existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
    console.log('[DB] Migrations complete');
  } else {
    console.log('[DB] No migrations folder found, skipping migrations');
  }

  // Seed default settings
  seedSettings();
}

// Export schema for convenience
export * from './schema';
