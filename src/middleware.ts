import 'dotenv/config';
import { defineMiddleware } from 'astro:middleware';
import { initializeServer } from './lib/server-init';

let initialized = false;

export const onRequest = defineMiddleware(async (_context, next) => {
  if (!initialized) {
    await initializeServer();
    initialized = true;
  }
  return next();
});
