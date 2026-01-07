import * as cheerio from 'cheerio';

export interface StockCheckResult {
  inStock: boolean;
  preorderStatus: 'preorder' | 'backorder' | null;
}

// Firecrawl extract schema for stock status
const STOCK_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    inStock: { type: 'boolean', description: 'Whether the product is currently in stock and available for immediate purchase' },
    isPreorder: { type: 'boolean', description: 'Whether the product is available for pre-order (not yet released)' },
    isBackorder: { type: 'boolean', description: 'Whether the product is on backorder (out of stock but can be ordered)' },
  },
  required: ['inStock'],
};

/**
 * Check if HTML looks like blocked/unusable content (Cloudflare, bot protection, empty, etc.)
 */
function isBlockedOrUnusable(html: string): boolean {
  const lowerHtml = html.toLowerCase();

  // Too short to be a real product page
  if (html.length < 1000) {
    return true;
  }

  // Cloudflare challenge
  if (
    lowerHtml.includes('just a moment') ||
    lowerHtml.includes('checking your browser') ||
    lowerHtml.includes('challenge-platform') ||
    (lowerHtml.includes('ray id') && html.length < 10000)
  ) {
    return true;
  }

  // Other bot protection / access denied patterns
  if (
    lowerHtml.includes('access denied') ||
    lowerHtml.includes('bot detected') ||
    lowerHtml.includes('please enable javascript') ||
    lowerHtml.includes('enable cookies') ||
    (lowerHtml.includes('captcha') && html.length < 15000)
  ) {
    return true;
  }

  // Check if it looks like a real product page (has price-related content)
  const hasProductContent =
    lowerHtml.includes('price') ||
    lowerHtml.includes('add to cart') ||
    lowerHtml.includes('buy now') ||
    lowerHtml.includes('in stock') ||
    lowerHtml.includes('out of stock') ||
    lowerHtml.includes('$');

  if (!hasProductContent) {
    return true;
  }

  return false;
}

/**
 * Try to fetch stock status using Firecrawl API with JSON extraction
 */
async function fetchStockWithFirecrawl(url: string): Promise<StockCheckResult | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    console.log(`[Stock Checker] Using Firecrawl for ${url}`);
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['extract'],
        extract: { schema: STOCK_EXTRACT_SCHEMA },
      }),
      signal: AbortSignal.timeout(30000) // 30 second timeout for Firecrawl
    });

    if (!response.ok) {
      console.log(`[Stock Checker] Firecrawl error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const extract = data.data?.extract;

    if (!extract) {
      console.log(`[Stock Checker] Firecrawl returned no extract data`);
      return null;
    }

    console.log(`[Stock Checker] Firecrawl result:`, extract);

    let preorderStatus: 'preorder' | 'backorder' | null = null;
    if (extract.isPreorder) {
      preorderStatus = 'preorder';
    } else if (extract.isBackorder) {
      preorderStatus = 'backorder';
    }

    return {
      inStock: extract.inStock !== false, // Default to true if not specified
      preorderStatus,
    };
  } catch (error) {
    console.log(`[Stock Checker] Firecrawl error:`, error);
    return null;
  }
}

/**
 * Check stock status on a retailer's website
 * This function attempts to detect out of stock, preorder, and backorder status
 */
export async function checkRetailerStock(url: string): Promise<StockCheckResult> {
  try {
    // Add cache-busting parameter
    const cacheBuster = `_cb=${Date.now()}`;
    const fetchUrl = url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;

    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      },
      // Set a timeout to avoid hanging on slow sites
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      // Try Firecrawl as fallback
      const firecrawlResult = await fetchStockWithFirecrawl(url);
      if (firecrawlResult) return firecrawlResult;
      // If we can't fetch the page, assume in stock (fail open)
      return { inStock: true, preorderStatus: null };
    }

    const html = await response.text();

    // Check if blocked or unusable content - try Firecrawl as fallback
    if (isBlockedOrUnusable(html)) {
      console.log(`[Stock Checker] Blocked/unusable content for ${url}, trying Firecrawl...`);
      const firecrawlResult = await fetchStockWithFirecrawl(url);
      if (firecrawlResult) return firecrawlResult;
      // Firecrawl failed, fail open
      return { inStock: true, preorderStatus: null };
    }

    const $ = cheerio.load(html);
    
    // Get the full page text for checking
    const pageText = $('body').text().toLowerCase();
    
    // Check for out of stock indicators
    const outOfStockPatterns = [
      'out of stock',
      'sold out',
      'currently unavailable',
      'not available',
      'no longer available',
      'unavailable online',
      'temporarily unavailable',
      'stock unavailable',
      'not in stock'
    ];
    
    // Check for preorder indicators
    const preorderPatterns = [
      'pre-order',
      'preorder',
      'pre order',
      'available for pre-order',
      'coming soon',
      'expected release',
      'expected release date',
      'expected availability',
      'expected to ship',
      'expected in stock'
    ];
    
    // Check for backorder indicators
    const backorderPatterns = [
      'back order',
      'backorder',
      'on backorder',
      'back-order',
      'back ordered'
    ];
    
    let inStock = true;
    let preorderStatus: 'preorder' | 'backorder' | null = null;
    
    // Check for out of stock - check in specific areas first for better accuracy
    const stockIndicatorAreas = [
      $('.availability, .stock-status, [class*="stock"], [class*="availability"]').text().toLowerCase(),
      $('.product-info, .product-details, [class*="product"]').text().toLowerCase(),
      $('.add-to-cart, [class*="addtocart"], [class*="add-to-cart"]').closest('div').text().toLowerCase()
    ].join(' ');
    
    // First check the specific stock indicator areas
    for (const pattern of outOfStockPatterns) {
      if (stockIndicatorAreas.includes(pattern)) {
        inStock = false;
        break;
      }
    }
    
    // If not found in specific areas, check the full page
    if (inStock) {
      for (const pattern of outOfStockPatterns) {
        if (pageText.includes(pattern)) {
          inStock = false;
          break;
        }
      }
    }
    
    // Check for preorder status (only if in stock)
    if (inStock) {
      for (const pattern of preorderPatterns) {
        if (stockIndicatorAreas.includes(pattern) || pageText.includes(pattern)) {
          preorderStatus = 'preorder';
          break;
        }
      }
    }
    
    // Check for backorder status (only if not already marked as preorder)
    if (inStock && !preorderStatus) {
      for (const pattern of backorderPatterns) {
        if (stockIndicatorAreas.includes(pattern) || pageText.includes(pattern)) {
          preorderStatus = 'backorder';
          break;
        }
      }
    }
    
    return { inStock, preorderStatus };
  } catch (error) {
    // On error (timeout, network issue, etc.), fail open and assume in stock
    console.warn(`[Stock Checker] Error checking stock for ${url}:`, error);
    return { inStock: true, preorderStatus: null };
  }
}

/**
 * Check if a URL should be verified for stock status
 * Only verify aggregator sites (StaticICE, PCPartPicker)
 */
export function shouldVerifyStock(scraperType: string, productUrl?: string): boolean {
  // Only verify stock for aggregator scrapers
  if (scraperType !== 'staticice' && scraperType !== 'pcpartpicker') {
    return false;
  }
  
  // Must have a product URL
  if (!productUrl) {
    return false;
  }
  
  // Don't verify if the URL points back to the aggregator itself
  if (productUrl.includes('staticice.com.au') || productUrl.includes('pcpartpicker.com')) {
    return false;
  }
  
  return true;
}
