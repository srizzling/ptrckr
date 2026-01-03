import * as cheerio from 'cheerio';

export interface StockCheckResult {
  inStock: boolean;
  preorderStatus: 'preorder' | 'backorder' | null;
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
      // If we can't fetch the page, assume in stock (fail open)
      return { inStock: true, preorderStatus: null };
    }

    const html = await response.text();
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
