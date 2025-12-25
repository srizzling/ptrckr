import type { APIRoute } from 'astro';
import { getRunsForProductScraper } from '../../../../lib/db/queries/scraper-runs';

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid scraper ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const limit = Number(url.searchParams.get('limit')) || 20;
    const runs = await getRunsForProductScraper(id, limit);

    return new Response(JSON.stringify(runs), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching scraper runs:', error);
    return new Response(
      JSON.stringify({
        message: error instanceof Error ? error.message : 'Failed to fetch runs'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
