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
  }>;
}

/**
 * Parse item description and suggest product setup
 * Uses simple keyword matching and category detection
 */
function parseItemDescription(description: string, existingGroups: Array<{ id: number; name: string }>): ParsedItem {
  const lowerDesc = description.toLowerCase();
  
  // Extract product name (use the full description as product name)
  const productName = description.trim();
  
  // Category detection based on keywords
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
  
  // Try to find or create a group
  let groupName = category;
  let groupId: number | undefined;
  
  // Check if there's an existing group with similar name
  const similarGroup = existingGroups.find(g => 
    g.name.toLowerCase().includes(category.toLowerCase()) ||
    category.toLowerCase().includes(g.name.toLowerCase())
  );
  
  if (similarGroup) {
    groupName = similarGroup.name;
    groupId = similarGroup.id;
  } else {
    // Extract more specific group name from description if possible
    // e.g., "27 inch 4K OLED monitor" -> "4K OLED Monitors"
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
  }
  
  return {
    productName,
    groupName,
    groupId,
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
    
    // Get existing groups to check for reuse
    const existingGroups = await getGroups();
    
    // Get available scrapers
    const allScrapers = await getScrapers();
    
    // Parse the description
    const parsed = parseItemDescription(description, existingGroups);
    
    // Map scraper types to actual scrapers
    const suggestedScrapers = parsed.suggestedScraperTypes
      .map(type => allScrapers.find(s => s.type === type))
      .filter((s): s is NonNullable<typeof s> => s !== undefined)
      .map(s => ({
        id: s.id,
        name: s.name,
        type: s.type
      }));
    
    // Fallback: if no scrapers matched, suggest StaticICE
    if (suggestedScrapers.length === 0) {
      const staticIce = allScrapers.find(s => s.type === 'staticice');
      if (staticIce) {
        suggestedScrapers.push({
          id: staticIce.id,
          name: staticIce.name,
          type: staticIce.type
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
