import type { APIRoute } from 'astro';
import { dismissScraperIssue } from '../../../../lib/db/queries/scrapers';

export const POST: APIRoute = async ({ params }) => {
  try {
    const id = parseInt(params.id || '', 10);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ error: 'Invalid scraper ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await dismissScraperIssue(id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error dismissing scraper issue:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to dismiss issue'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
