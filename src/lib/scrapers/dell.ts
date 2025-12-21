import * as cheerio from 'cheerio';
import type { Scraper, ScraperResult, ScrapedPrice } from './types';

export class DellScraper implements Scraper {
  type = 'dell';

  async scrape(url: string): Promise<ScraperResult> {
    try {
      // Add cache-busting parameter
      const cacheBuster = `_cb=${Date.now()}`;
      const fetchUrl = url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;

      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-AU,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const prices: ScrapedPrice[] = [];

      let price: number | null = null;
      let inStock = true;

      // Method 1: Look for JSON price data in the page
      // Dell embeds price as "price":"1199" in various scripts
      const priceMatch = html.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1]);
      }

      // Method 2: Look for price in the price display elements
      if (price === null) {
        const priceText = $('.ps-dell-price').first().text().trim();
        const match = priceText.match(/\$?([\d,]+(?:\.\d{2})?)/);
        if (match) {
          price = parseFloat(match[1].replace(/,/g, ''));
        }
      }

      // Method 3: Look for any dollar amount in price containers
      if (price === null) {
        const priceContainers = $('[class*="price"]').toArray();
        for (const elem of priceContainers) {
          const text = $(elem).text();
          const match = text.match(/\$([\d,]+(?:\.\d{2})?)/);
          if (match) {
            const parsed = parseFloat(match[1].replace(/,/g, ''));
            if (parsed > 0 && (price === null || parsed < price)) {
              price = parsed;
            }
          }
        }
      }

      // Check stock status
      const pageText = $('body').text().toLowerCase();
      if (
        pageText.includes('out of stock') ||
        pageText.includes('sold out') ||
        pageText.includes('currently unavailable') ||
        pageText.includes('not available')
      ) {
        inStock = false;
      }

      // Also check for "Add to Cart" button presence
      const addToCartBtn = $('[data-testid*="addToCart"], .add-to-cart, [class*="add-to-cart"]');
      if (addToCartBtn.length === 0) {
        // No add to cart button might indicate out of stock
        // But don't mark as out of stock if we found a price
      }

      if (price !== null && price > 0) {
        prices.push({
          retailerName: 'Dell',
          price,
          currency: 'AUD',
          inStock,
          productUrl: url
        });
      }

      return {
        success: true,
        prices
      };
    } catch (error) {
      return {
        success: false,
        prices: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const dellScraper = new DellScraper();
