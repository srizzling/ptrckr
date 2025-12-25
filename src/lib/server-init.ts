import { runMigrations } from './db';
import { seedDefaultScrapers } from './db/queries/scrapers';
import { startScheduler } from './scheduler';

export async function initializeServer() {

  console.log('[Server] Initializing...');

  try {
    // Run database migrations first
    runMigrations();

    // Seed default scrapers
    await seedDefaultScrapers();
    console.log('[Server] Default scrapers seeded');

    // Start scheduler
    startScheduler();
    console.log('[Server] Scheduler started');
  } catch (error) {
    console.error('[Server] Initialization error:', error);
  }
}
