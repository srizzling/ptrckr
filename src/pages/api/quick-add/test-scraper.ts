import type { APIRoute } from 'astro';
import { getScraper } from '../../../lib/scrapers';
import { getScrapers } from '../../../lib/db/queries/scrapers';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { url, scraperType } = body;
    
    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ message: 'URL is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    if (!scraperType || typeof scraperType !== 'string') {
      return new Response(
        JSON.stringify({ message: 'Scraper type is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Get the scraper instance
    const scraper = getScraper(scraperType);
    
    if (!scraper) {
      return new Response(
        JSON.stringify({ message: 'Invalid scraper type' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Test scrape the URL
    const result = await scraper.scrape(url);
    
    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          success: false,
          message: result.error || 'Failed to scrape URL',
          pricesFound: 0
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Return success with price count and sample prices
    return new Response(
      JSON.stringify({
        success: true,
        pricesFound: result.prices.length,
        samplePrices: result.prices.slice(0, 3).map(p => ({
          retailerName: p.retailerName,
          price: p.price,
          currency: p.currency,
          inStock: p.inStock
        }))
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error testing scraper:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        message: error instanceof Error ? error.message : 'Failed to test scraper',
        pricesFound: 0
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
