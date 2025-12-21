import * as cheerio from 'cheerio';
import type { Scraper, ScraperResult, ScrapedPrice } from './types';

export class PCPartPickerScraper implements Scraper {
  type = 'pcpartpicker';

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
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const prices: ScrapedPrice[] = [];

      // PCPartPicker table structure:
      // td.td__logo (merchant logo) | td.td__base (price) | td.td__promo | td.td__shipping |
      // td.td__tax | td.td__availability | td.td__finalPrice | td.td__buy

      $('tr').each((_, row) => {
        const $row = $(row);

        // Must have a merchant logo
        const $logoCell = $row.find('td.td__logo');
        if ($logoCell.length === 0) return;

        const $merchantImg = $logoCell.find('img[src*="merchant"]');
        if ($merchantImg.length === 0) return;

        // Check stock status
        const $availCell = $row.find('td.td__availability');
        const inStock = !$availCell.hasClass('td__availability--outOfStock');

        // Extract retailer name from img alt or URL, then normalize
        let retailerName = $merchantImg.attr('alt') || '';
        if (!retailerName) {
          const src = $merchantImg.attr('src') || '';
          const merchantMatch = src.match(/merchant_([a-z]+)/i);
          if (merchantMatch) {
            retailerName = merchantMatch[1];
          }
        }
        if (!retailerName) return;

        // Always normalize the retailer name for consistency
        retailerName = this.formatRetailerName(retailerName);

        // Get price from td.td__base
        const $baseCell = $row.find('td.td__base');
        const priceText = $baseCell.text().trim();
        const priceMatch = priceText.match(/\$([\d,]+\.?\d*)/);
        if (!priceMatch) return;

        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (isNaN(price) || price <= 0) return;

        // Get product URL from Buy button
        const $buyLink = $row.find('td.td__buy a');
        let productUrl = $buyLink.attr('href') || '';

        // Fallback to logo link
        if (!productUrl) {
          productUrl = $logoCell.find('a').attr('href') || '';
        }

        // Avoid duplicates
        const exists = prices.some(
          (p) => p.retailerName.toLowerCase() === retailerName.toLowerCase()
        );

        if (!exists) {
          prices.push({
            retailerName,
            price,
            currency: 'AUD',
            inStock,
            productUrl: productUrl || undefined
          });
        }
      });

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

  private formatRetailerName(rawName: string): string {
    // Remove trailing numbers and common suffixes
    const name = rawName.replace(/\d+$/, '').replace(/comau$/i, '');

    const knownRetailers: Record<string, string> = {
      centrecom: 'Centre Com',
      'centre com': 'Centre Com',
      mwave: 'Mwave',
      'mwave australia': 'Mwave',
      scorptec: 'Scorptec',
      umart: 'Umart',
      pccasegear: 'PC Case Gear',
      'pc case gear': 'PC Case Gear',
      pccg: 'PC Case Gear',
      amazon: 'Amazon AU',
      amazonau: 'Amazon AU',
      'amazon au': 'Amazon AU',
      bpctech: 'BPC Tech',
      ple: 'PLE Computers',
      plecom: 'PLE Computers',
      'ple computers': 'PLE Computers',
      jw: 'JW Computers',
      jwcom: 'JW Computers',
      'jw computers': 'JW Computers',
      austin: 'Austin Computers',
      'austin computers': 'Austin Computers',
      skycomp: 'Skycomp',
      pcbyte: 'PC Byte',
      'pc byte': 'PC Byte',
      shoppingexpress: 'Shopping Express',
      'shopping express': 'Shopping Express',
      computeralliance: 'Computer Alliance',
      computeralliancecom: 'Computer Alliance',
      'computer alliance': 'Computer Alliance'
    };

    const lower = name.toLowerCase().trim();
    return knownRetailers[lower] || name.charAt(0).toUpperCase() + name.slice(1);
  }
}

export const pcpartpickerScraper = new PCPartPickerScraper();
