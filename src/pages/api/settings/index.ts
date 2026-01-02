import type { APIRoute } from 'astro';
import { getSettingsByCategory } from '../../../lib/db/queries/settings';

export const GET: APIRoute = async () => {
  try {
    const settings = getSettingsByCategory();
    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch settings' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
