import * as cheerio from 'cheerio';
import type { Scraper, ScraperResult, ScrapedPrice } from './types';

export class StaticICEScraper implements Scraper {
  type = 'staticice';

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

      // Extract product name from page title or h1
      let productName: string | undefined;
      const titleText = $('title').text().trim();
      if (titleText) {
        // StaticICE titles are like "Product Name - StaticICE Australia"
        productName = titleText.replace(/\s*[-|]\s*StaticICE.*$/i, '').trim() || undefined;
      }
      if (!productName) {
        productName = $('h1').first().text().trim() || undefined;
      }

      // StaticICE structure:
      // Price link: <a href="/cgi-bin/redirect.cgi?name=PC%20Case%20Gear&...&newurl=...">[$1349.00]</a>
      // The retailer name is in the 'name' query parameter of the redirect URL

      $('a[href*="redirect.cgi"]').each((_, element) => {
        const $link = $(element);
        const linkText = $link.text().trim();
        const href = $link.attr('href') || '';

        // Extract price - format is $XXX.XX (may or may not have brackets)
        const priceMatch = linkText.match(/^\$?([\d,]+\.?\d*)$/);
        if (!priceMatch) return;

        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (isNaN(price) || price <= 0 || price > 50000) return;

        // Extract retailer name from the 'name' parameter in the URL
        const nameMatch = href.match(/[?&]name=([^&]+)/);
        if (!nameMatch) return;

        const retailerName = decodeURIComponent(nameMatch[1]);
        if (!retailerName || retailerName.length < 2) return;

        // Extract the actual product URL from 'newurl' parameter
        let productUrl = `https://www.staticice.com.au${href}`;
        const newurlMatch = href.match(/newurl=([^&]+)/);
        if (newurlMatch) {
          try {
            productUrl = decodeURIComponent(newurlMatch[1]);
          } catch {
            // Keep the redirect URL
          }
        }

        // Avoid duplicates
        const exists = prices.some(
          (p) => p.retailerName.toLowerCase() === retailerName.toLowerCase() && p.price === price
        );

        if (!exists) {
          prices.push({
            retailerName,
            price,
            currency: 'AUD',
            inStock: true,
            productUrl
          });
        }
      });

      return {
        success: true,
        prices,
        productName
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

export const staticiceScraper = new StaticICEScraper();
