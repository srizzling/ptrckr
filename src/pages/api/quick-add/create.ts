import type { APIRoute } from 'astro';
import { createGroup, addProductToGroup } from '../../../lib/db/queries/groups';
import { createProduct } from '../../../lib/db/queries/products';
import { createProductScraper, seedDefaultScrapers } from '../../../lib/db/queries/scrapers';

interface BulkCreateProduct {
  name: string;
  imageUrl: string | null;
  scrapers: Array<{
    scraperId: number;
    url: string;
    scrapeIntervalMinutes: number;
  }>;
}

interface BulkCreatePayload {
  groupName: string;
  description?: string | null;
  products: BulkCreateProduct[];
}

export const POST: APIRoute = async ({ request }) => {
  try {
    // Ensure default scrapers exist
    await seedDefaultScrapers();

    const body: BulkCreatePayload = await request.json();
    const { groupName, description, products } = body;

    // Validation
    if (!groupName) {
      return new Response(
        JSON.stringify({ message: 'Group name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return new Response(
        JSON.stringify({ message: 'At least one product is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate each product
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      if (!product.name) {
        return new Response(
          JSON.stringify({ message: `Product ${i + 1}: Name is required` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!product.scrapers || !Array.isArray(product.scrapers) || product.scrapers.length === 0) {
        return new Response(
          JSON.stringify({ message: `Product ${i + 1}: At least one scraper is required` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Validate each scraper
      for (let j = 0; j < product.scrapers.length; j++) {
        const scraper = product.scrapers[j];
        if (!scraper.scraperId || !scraper.url) {
          return new Response(
            JSON.stringify({ 
              message: `Product ${i + 1}, Scraper ${j + 1}: scraperId and URL are required` 
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Create group
    const group = await createGroup({
      name: groupName,
      description: description || null
    });

    // Create all products and their scrapers
    const createdProducts = [];
    
    for (const productData of products) {
      // Create product
      const product = await createProduct({
        name: productData.name,
        imageUrl: productData.imageUrl || null
      });

      // Create all product scrapers
      for (const scraperData of productData.scrapers) {
        const scraperId = parseInt(String(scraperData.scraperId), 10);
        const scrapeIntervalMinutes = parseInt(String(scraperData.scrapeIntervalMinutes), 10);
        
        if (isNaN(scraperId)) {
          throw new Error(`Invalid scraperId for product "${productData.name}"`);
        }
        
        await createProductScraper({
          productId: product.id,
          scraperId,
          url: scraperData.url,
          scrapeIntervalMinutes: isNaN(scrapeIntervalMinutes) ? 1440 : scrapeIntervalMinutes
        });
      }

      // Add product to group
      await addProductToGroup(product.id, group.id);
      
      createdProducts.push(product);
    }

    return new Response(
      JSON.stringify({
        group,
        products: createdProducts
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error creating group with products:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to create group with products' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
