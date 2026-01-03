import type { APIRoute } from 'astro';
import { getGroups } from '../../../lib/db/queries/groups';
import { getScrapers } from '../../../lib/db/queries/scrapers';

interface ParsedItem {
  productName: string;
  groupName: string;
  groupId?: number; // If reusing existing group
  suggestedScrapers: Array<{
    id: number;
    name: string;
    type: string;
    suggestedUrl?: string; // Auto-generated URL
  }>;
}

interface ParsedItemInternal {
  productName: string;
  groupName: string;
  groupId?: number;
  suggestedScraperTypes: string[];
}

/**
 * Generate a suggested URL for a scraper based on product name
 */
function generateScraperUrl(scraperType: string, productName: string): string | undefined {
  const encodedName = encodeURIComponent(productName);
  
  switch (scraperType) {
    case 'staticice':
      return `https://www.staticice.com.au/cgi-bin/search.cgi?q=${encodedName}`;
    
    case 'pcpartpicker':
      // PCPartPicker uses a search format
      return `https://au.pcpartpicker.com/search/?q=${encodedName}`;
    
    case 'pbtech':
      return `https://www.pbtech.co.nz/search?query=${encodedName}`;
    
    case 'dell':
      // Dell's search
      return `https://www.dell.com/en-au/search/${encodedName.replace(/%20/g, '%20')}`;
    
    case 'ai':
      // For AI scraper, we can't auto-generate a URL reliably
      // User needs to provide the specific product page
      return undefined;
    
    default:
      return undefined;
  }
}

/**
 * Calculate similarity score between description and group/product names
 * Returns a score from 0-1 based on keyword overlap
 */
function calculateSimilarity(description: string, targetText: string): number {
  const descWords = description.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const targetWords = targetText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  if (descWords.length === 0 || targetWords.length === 0) return 0;
  
  let matches = 0;
  for (const word of descWords) {
    if (targetWords.some(tw => tw.includes(word) || word.includes(tw))) {
      matches++;
    }
  }
  
  return matches / Math.max(descWords.length, targetWords.length);
}

/**
 * Find the most similar existing group based on group name and product names
 */
function findBestMatchingGroup(
  description: string, 
  groupsWithProducts: Array<{ 
    id: number; 
    name: string;
    productGroups: Array<{ product: { name: string } }>;
  }>
): { groupId: number; groupName: string; score: number } | null {
  if (groupsWithProducts.length === 0) return null;
  
  let bestMatch: { groupId: number; groupName: string; score: number } | null = null;
  
  for (const group of groupsWithProducts) {
    // Calculate similarity with group name
    let groupScore = calculateSimilarity(description, group.name) * 2; // Weight group name higher
    
    // Calculate similarity with product names in the group
    const productScores = group.productGroups.map(pg => 
      calculateSimilarity(description, pg.product.name)
    );
    
    // Average product similarity
    const avgProductScore = productScores.length > 0
      ? productScores.reduce((sum, s) => sum + s, 0) / productScores.length
      : 0;
    
    // Combined score (60% group name, 40% product names)
    const combinedScore = (groupScore * 0.6) + (avgProductScore * 0.4);
    
    if (!bestMatch || combinedScore > bestMatch.score) {
      bestMatch = {
        groupId: group.id,
        groupName: group.name,
        score: combinedScore
      };
    }
  }
  
  // Only return if score is above threshold (0.3 = at least some keyword overlap)
  return bestMatch && bestMatch.score > 0.3 ? bestMatch : null;
}

/**
 * Detect scrapers based on keywords in description
 */
function detectScrapersFromKeywords(description: string): string[] {
  const lowerDesc = description.toLowerCase();
  
  // Electronics / Monitors
  if (/\b(4k|oled|qled|uhd|1440p|144hz|240hz|27"|32"|display|monitor)\b/i.test(lowerDesc)) {
    return ['staticice', 'pcpartpicker', 'dell'];
  }
  // PC Components / Tech
  if (
    /\b(rtx|gtx|nvidia|amd|ryzen|intel|cpu|gpu|motherboard|ram|ssd|nvme|keyboard|mouse|webcam)\b/i.test(lowerDesc) ||
    /\b(gaming|pc|computer|laptop|graphics card|processor)\b/i.test(lowerDesc)
  ) {
    return ['staticice', 'pcpartpicker'];
  }
  // Dell products
  if (/\bdell\b/i.test(lowerDesc)) {
    return ['staticice', 'dell'];
  }
  // Baby / Nappies / Wipes
  if (/\b(nappies|nappy|diaper|wipes|baby|huggies|pampers)\b/i.test(lowerDesc)) {
    return ['ai'];
  }
  
  // Default: StaticICE as general aggregator
  return ['staticice'];
}

/**
 * Parse item description and suggest product setup
 * First tries to match with existing groups, then falls back to keyword detection
 */
function parseItemDescription(
  description: string, 
  groupsWithProducts: Array<{ 
    id: number; 
    name: string;
    productGroups: Array<{ product: { name: string } }>;
  }>
): ParsedItemInternal {
  const productName = description.trim();
  
  // STEP 1: Try to find a matching existing group based on similarity
  const bestMatch = findBestMatchingGroup(description, groupsWithProducts);
  
  if (bestMatch) {
    // Found a good match! Reuse the existing group
    // Detect scrapers from the description keywords
    const suggestedScraperTypes = detectScrapersFromKeywords(description);
    
    return {
      productName,
      groupName: bestMatch.groupName,
      groupId: bestMatch.groupId,
      suggestedScraperTypes
    };
  }
  
  // STEP 2: No good match found, create a new group based on keywords
  const lowerDesc = description.toLowerCase();
  let category = 'General';
  let suggestedScraperTypes: string[] = [];
  
  // Electronics / Monitors (check this BEFORE PC Components)
  if (/\b(4k|oled|qled|uhd|1440p|144hz|240hz|27"|32"|display)\b/i.test(lowerDesc) && /\bmonitor\b/i.test(lowerDesc)) {
    category = 'Monitors';
    suggestedScraperTypes = ['staticice', 'pcpartpicker', 'dell'];
  }
  // PC Components / Tech
  else if (
    /\b(rtx|gtx|nvidia|amd|ryzen|intel|cpu|gpu|motherboard|ram|ssd|nvme|keyboard|mouse|webcam)\b/i.test(lowerDesc) ||
    /\b(gaming|pc|computer|laptop|graphics card|processor)\b/i.test(lowerDesc)
  ) {
    category = 'PC Components';
    suggestedScraperTypes = ['staticice', 'pcpartpicker'];
  }
  // Dell products
  else if (/\bdell\b/i.test(lowerDesc)) {
    category = 'Dell Products';
    suggestedScraperTypes = ['staticice', 'dell'];
  }
  // Baby / Nappies / Wipes
  else if (/\b(nappies|nappy|diaper|wipes|baby|huggies|pampers)\b/i.test(lowerDesc)) {
    category = 'Baby Products';
    suggestedScraperTypes = ['ai']; // AI scraper works well for retail sites
  }
  // General retail products
  else if (/\b(buy|purchase|price|cheap|deal)\b/i.test(lowerDesc)) {
    category = 'General Products';
    suggestedScraperTypes = ['staticice', 'ai'];
  }
  // Default: suggest StaticICE as it's a general aggregator
  else {
    category = 'General';
    suggestedScraperTypes = ['staticice'];
  }
  
  // Extract more specific group name from description if possible
  let groupName = category;
  if (category === 'Monitors') {
    const specs = [];
    if (/\b(4k|uhd)\b/i.test(lowerDesc)) specs.push('4K');
    if (/\boled\b/i.test(lowerDesc)) specs.push('OLED');
    if (/\bqled\b/i.test(lowerDesc)) specs.push('QLED');
    if (/\bgaming\b/i.test(lowerDesc)) specs.push('Gaming');
    if (specs.length > 0) {
      groupName = `${specs.join(' ')} Monitors`;
    }
  }
  
  return {
    productName,
    groupName,
    groupId: undefined,
    suggestedScraperTypes
  };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { description } = body;
    
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return new Response(
        JSON.stringify({ message: 'Description is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Get existing groups WITH their products for better matching
    const groupsWithProducts = await getGroups();
    
    // Get available scrapers
    const allScrapers = await getScrapers();
    
    // Parse the description (now uses similarity matching with existing groups)
    const parsed = parseItemDescription(description, groupsWithProducts);
    
    // Map scraper types to actual scrapers with suggested URLs
    const suggestedScrapers = parsed.suggestedScraperTypes
      .map(type => allScrapers.find(s => s.type === type))
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        suggestedUrl: generateScraperUrl(s.type, parsed.productName)
      }));
    
    // Fallback: if no scrapers matched, suggest StaticICE
    if (suggestedScrapers.length === 0) {
      const staticIce = allScrapers.find(s => s.type === 'staticice');
      if (staticIce) {
        suggestedScrapers.push({
          id: staticIce.id,
          name: staticIce.name,
          type: staticIce.type,
          suggestedUrl: generateScraperUrl(staticIce.type, parsed.productName)
        });
      }
    }
    
    const result: ParsedItem = {
      productName: parsed.productName,
      groupName: parsed.groupName,
      groupId: parsed.groupId,
      suggestedScrapers
    };
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error parsing item description:', error);
    return new Response(
      JSON.stringify({ message: 'Failed to parse description' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
