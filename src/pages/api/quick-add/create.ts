import type { APIRoute } from 'astro';
import { createProduct } from '../../../lib/db/queries/products';
import { createProductScraper, seedDefaultScrapers } from '../../../lib/db/queries/scrapers';
import { createGroup, addProductToGroup } from '../../../lib/db/queries/groups';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Ensure default scrapers exist
    await seedDefaultScrapers();
    
    const body = await request.json();
    const { productName, groupName, groupId, scrapers } = body;
    
    if (!productName || typeof productName !== 'string') {
      return new Response(
        JSON.stringify({ message: 'Product name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    if (!groupName || typeof groupName !== 'string') {
      return new Response(
        JSON.stringify({ message: 'Group name is required' }),
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
    
    // Create or reuse group
    let finalGroupId = groupId;
    if (!finalGroupId) {
      const newGroup = await createGroup({
        name: groupName,
        description: null
      });
      finalGroupId = newGroup.id;
    }
    
    // Create product
    const product = await createProduct({
      name: productName,
      imageUrl: null
    });
    
    // Link product to group
    await addProductToGroup(product.id, finalGroupId);
    
    // Create all product scrapers
    for (const scraper of scrapers) {
      await createProductScraper({
        productId: product.id,
        scraperId: Number(scraper.scraperId),
        url: scraper.url,
        scrapeIntervalMinutes: Number(scraper.scrapeIntervalMinutes) || 1440
      });
    }
    
    return new Response(
      JSON.stringify({ 
        product,
        groupId: finalGroupId
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('Error creating quick-add product:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to create product' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
