import type { APIRoute } from 'astro';
import { getGroups } from '../../../lib/db/queries/groups';
import { getProductById } from '../../../lib/db/queries/products';
import { findBestMatch } from '../../../lib/string-similarity';

// Similarity threshold for group matching (30%)
const SIMILARITY_THRESHOLD = 0.3;

export interface ParsedProduct {
  name: string;
  imageUrl: string | null;
  scrapers: Array<{
    scraperId: number;
    scraperName: string;
    url: string;
    scrapeIntervalMinutes: number;
  }>;
}

export interface ParsedItem {
  groupName: string;
  sourceGroupId: number | null;
  sourceGroupName: string | null;
  similarityScore: number | null;
  products: ParsedProduct[];
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { input } = body;

    if (!input || typeof input !== 'string') {
      return new Response(
        JSON.stringify({ message: 'Input text is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const groupName = input.trim();

    // Get all existing groups
    const allGroups = await getGroups();
    
    if (allGroups.length === 0) {
      // No groups exist, return empty result
      return new Response(
        JSON.stringify({
          groupName,
          sourceGroupId: null,
          sourceGroupName: null,
          similarityScore: null,
          products: []
        } as ParsedItem),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Find similar group based on name similarity
    const groupNames = allGroups.map(g => g.name);
    const match = findBestMatch(groupName, groupNames, SIMILARITY_THRESHOLD);

    if (!match) {
      // No similar group found
      return new Response(
        JSON.stringify({
          groupName,
          sourceGroupId: null,
          sourceGroupName: null,
          similarityScore: null,
          products: []
        } as ParsedItem),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Find the matching group
    const matchedGroup = allGroups.find(g => g.name === match.match);
    
    if (!matchedGroup) {
      return new Response(
        JSON.stringify({
          groupName,
          sourceGroupId: null,
          sourceGroupName: null,
          similarityScore: null,
          products: []
        } as ParsedItem),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Get full product details with scrapers for all products in the group
    const products: ParsedProduct[] = [];
    
    for (const pg of matchedGroup.productGroups) {
      const productId = pg.productId;
      const fullProduct = await getProductById(productId);
      
      if (fullProduct) {
        products.push({
          name: fullProduct.name,
          imageUrl: fullProduct.imageUrl,
          scrapers: fullProduct.productScrapers.map(ps => ({
            scraperId: ps.scraperId,
            scraperName: ps.scraper.name,
            url: ps.url,
            scrapeIntervalMinutes: ps.scrapeIntervalMinutes
          }))
        });
      }
    }

    const result: ParsedItem = {
      groupName,
      sourceGroupId: matchedGroup.id,
      sourceGroupName: matchedGroup.name,
      similarityScore: match.score,
      products
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error parsing quick-add input:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to parse input' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
