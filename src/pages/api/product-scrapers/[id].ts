import type { APIRoute } from 'astro';
import {
  getProductScraperById,
  updateProductScraper,
  deleteProductScraper
} from '../../../lib/db/queries/scrapers';

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid scraper ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const scraper = await getProductScraperById(id);
    if (!scraper) {
      return new Response(JSON.stringify({ message: 'Scraper not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(scraper), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching scraper:', error);
    return new Response(JSON.stringify({ message: 'Failed to fetch scraper' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid scraper ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const scraper = await updateProductScraper(id, body);

    if (!scraper) {
      return new Response(JSON.stringify({ message: 'Scraper not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(scraper), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating scraper:', error);
    return new Response(JSON.stringify({ message: 'Failed to update scraper' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = Number(params.id);
    if (isNaN(id)) {
      return new Response(JSON.stringify({ message: 'Invalid scraper ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await deleteProductScraper(id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting scraper:', error);
    return new Response(JSON.stringify({ message: 'Failed to delete scraper' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
