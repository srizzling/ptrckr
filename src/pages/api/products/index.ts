import type { APIRoute } from 'astro';
import { createProduct, getProducts } from '../../../lib/db/queries/products';
import { createProductScraper, seedDefaultScrapers } from '../../../lib/db/queries/scrapers';

export const GET: APIRoute = async () => {
  try {
    const products = await getProducts();
    return new Response(JSON.stringify(products), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return new Response(JSON.stringify({ message: 'Failed to fetch products' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    // Ensure default scrapers exist
    await seedDefaultScrapers();

    const body = await request.json();
    const { name, imageUrl, scrapers } = body;

    if (!name) {
      return new Response(
        JSON.stringify({ message: 'Name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!scrapers || !Array.isArray(scrapers) || scrapers.length === 0) {
      return new Response(
        JSON.stringify({ message: 'At least one scraper is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate all scrapers have required fields
    for (const scraper of scrapers) {
      if (!scraper.scraperId || !scraper.url) {
        return new Response(
          JSON.stringify({ message: 'Each scraper must have a scraperId and URL' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create product
    const product = await createProduct({
      name,
      imageUrl: imageUrl || null
    });

    // Create all product scrapers
    for (const scraper of scrapers) {
      await createProductScraper({
        productId: product.id,
        scraperId: Number(scraper.scraperId),
        url: scraper.url,
        scrapeIntervalMinutes: Number(scraper.scrapeIntervalMinutes) || 1440
      });
    }

    return new Response(JSON.stringify(product), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating product:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to create product' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
