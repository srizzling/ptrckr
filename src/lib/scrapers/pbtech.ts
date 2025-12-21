import * as cheerio from 'cheerio';
import type { Scraper, ScraperResult, ScrapedPrice } from './types';

export class PBTechScraper implements Scraper {
  type = 'pbtech';

  async scrape(url: string): Promise<ScraperResult> {
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
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const prices: ScrapedPrice[] = [];

      // PBTech has data-price attribute on add to cart buttons (ex-GST price)
      // and displays GST-inclusive prices in sticky-price spans

      // Try to get the GST-inclusive price from the sticky price display
      let price: number | null = null;
      let inStock = true;

      // Method 1: Look for the inc GST price in sticky-price
      const stickyPrices = $('.sticky-price').toArray();
      for (const elem of stickyPrices) {
        const priceText = $(elem).text().trim();
        const match = priceText.match(/\$?([\d,]+\.?\d*)/);
        if (match) {
          const parsed = parseFloat(match[1].replace(/,/g, ''));
          // PBTech shows both ex-GST and inc-GST, the higher one is inc-GST
          if (parsed > 0 && (price === null || parsed > price)) {
            price = parsed;
          }
        }
      }

      // Method 2: Fallback to data-price attribute (ex-GST) and add 10% GST
      if (price === null) {
        const dataPrice = $('[data-price]').first().attr('data-price');
        if (dataPrice) {
          const exGstPrice = parseFloat(dataPrice);
          if (!isNaN(exGstPrice) && exGstPrice > 0) {
            // Add 10% GST
            price = Math.round(exGstPrice * 1.1 * 100) / 100;
          }
        }
      }

      // Check stock status
      const outOfStockText = $('body').text().toLowerCase();
      if (
        outOfStockText.includes('out of stock') ||
        outOfStockText.includes('sold out') ||
        outOfStockText.includes('unavailable')
      ) {
        // Check more specifically near price/buy buttons
        const buySection = $('.p_atc_button_dd, .add-to-cart').closest('.row').text().toLowerCase();
        if (buySection.includes('out of stock') || buySection.includes('sold out')) {
          inStock = false;
        }
      }

      if (price !== null && price > 0) {
        prices.push({
          retailerName: 'PB Tech',
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

export const pbtechScraper = new PBTechScraper();
