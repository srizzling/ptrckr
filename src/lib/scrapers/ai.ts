import type { Scraper, ScraperResult, ScrapedPrice } from './types';

// Domains that require Puppeteer (JS rendering needed)
const JS_REQUIRED_DOMAINS = [
  'bigw.com.au',
  'target.com.au',
  'kmart.com.au',
  'coles.com.au',
  'woolworths.com.au',
  'babybunting.com.au',
  'chemistwarehouse.com.au'
];

// Chrome user agents (desktop)
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
];

// Mobile user agents (for sites with aggressive bot detection)
const MOBILE_USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
];

// Domains that need mobile user agent
const MOBILE_REQUIRED_DOMAINS = ['bigw.com.au'];

export class AIScraper implements Scraper {
  type = 'ai';

  private needsStealth(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return JS_REQUIRED_DOMAINS.some((domain) => hostname.includes(domain));
    } catch {
      return false;
    }
  }

  private needsMobile(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return MOBILE_REQUIRED_DOMAINS.some((domain) => hostname.includes(domain));
    } catch {
      return false;
    }
  }

  private needsBrowserQL(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname.includes('bigw.com.au');
    } catch {
      return false;
    }
  }

  private getRetailer(url: string): string {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (hostname.includes('bigw.com.au')) return 'bigw';
      if (hostname.includes('coles.com.au')) return 'coles';
      if (hostname.includes('woolworths.com.au')) return 'woolworths';
      if (hostname.includes('chemistwarehouse.com.au')) return 'chemistwarehouse';
      if (hostname.includes('babybunting.com.au')) return 'babybunting';
      if (hostname.includes('costco.com.au')) return 'costco';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Fetch HTML using BrowserQL stealth API (for Big W only)
   */
  private async fetchWithBrowserQL(url: string): Promise<{ html: string; error?: string }> {
    const browserlessToken = process.env.BROWSERLESS_TOKEN;
    const browserlessApiUrl =
      process.env.BROWSERLESS_API_URL || 'https://production-sfo.browserless.io';

    console.log(`[Scraper] Using BrowserQL stealth for ${url}`);

    try {
      const query = `
        mutation {
          goto(url: "${url}", waitUntil: domContentLoaded, timeout: 90000) {
            status
          }
          waitForTimeout(time: 10000) {
            time
          }
          html {
            html
          }
        }
      `;

      const useProxy = process.env.BROWSERLESS_PROXY === 'true';
      const proxyParams = useProxy ? '&proxy=residential&proxyCountry=au' : '';
      const endpoint = `${browserlessApiUrl}/stealth/bql?token=${browserlessToken}${proxyParams}`;

      if (useProxy) {
        console.log(`[Scraper] Using residential proxy (AU)`);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Scraper] BrowserQL error: ${response.status} - ${errorText}`);
        return { html: '', error: `BrowserQL failed: ${response.status}` };
      }

      const result = await response.json();

      if (result.errors) {
        console.error(`[Scraper] BrowserQL GraphQL errors:`, result.errors);
        return { html: '', error: `BrowserQL error: ${result.errors[0]?.message}` };
      }

      const html = result.data?.html?.html || '';
      console.log(`[Scraper] BrowserQL returned ${html.length} chars`);

      // Check for blocked response
      if (html.length < 500000 && html.length > 0) {
        console.warn(`[Scraper] Response too small (${html.length} chars) - likely blocked`);
        return { html: '', error: 'Page blocked - will retry' };
      }

      return { html };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Scraper] BrowserQL error: ${message}`);
      return { html: '', error: `BrowserQL failed: ${message}` };
    }
  }

  /**
   * Fetch HTML using local Puppeteer with stealth
   */
  private async fetchWithPuppeteer(url: string): Promise<{ html: string; error?: string }> {
    const useMobile = this.needsMobile(url);
    const browserlessToken = process.env.BROWSERLESS_TOKEN;

    // Use BrowserQL for Big W
    if (browserlessToken && this.needsBrowserQL(url)) {
      return this.fetchWithBrowserQL(url);
    }

    console.log(`[Scraper] Using local Puppeteer for ${url}`);

    try {
      const userAgent = useMobile
        ? MOBILE_USER_AGENTS[Math.floor(Math.random() * MOBILE_USER_AGENTS.length)]
        : USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

      const viewport = useMobile
        ? { width: 390, height: 844, isMobile: true, hasTouch: true }
        : { width: 1920, height: 1080, isMobile: false, hasTouch: false };

      const puppeteerExtra = await import('puppeteer-extra');
      const StealthPlugin = await import('puppeteer-extra-plugin-stealth');
      puppeteerExtra.default.use(StealthPlugin.default());

      const browser = await puppeteerExtra.default.launch({
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        defaultViewport: viewport,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled'
        ]
      });

      try {
        const page = await browser.newPage();
        await page.setUserAgent(userAgent);
        await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-AU,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        });

        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 2000));

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const html = await page.content();
        console.log(`[Scraper] Puppeteer returned ${html.length} chars`);

        return { html };
      } finally {
        await browser.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Scraper] Puppeteer error: ${message}`);
      return { html: '', error: `Puppeteer failed: ${message}` };
    }
  }

  private async fetchHtml(url: string): Promise<{ html: string; error?: string }> {
    if (this.needsStealth(url)) {
      return this.fetchWithPuppeteer(url);
    }

    // Simple fetch for non-JS sites
    const cacheBuster = `_cb=${Date.now()}`;
    const fetchUrl = url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;

    try {
      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent': USER_AGENTS[0],
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-AU,en;q=0.9'
        }
      });

      if (!response.ok) {
        return { html: '', error: `HTTP ${response.status}` };
      }

      return { html: await response.text() };
    } catch (error) {
      return { html: '', error: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown'}` };
    }
  }

  // ============ RETAILER-SPECIFIC EXTRACTORS ============

  /**
   * Big W: Extract from __NEXT_DATA__ JSON
   */
  private extractBigWPrice(html: string, url: string): ScrapedPrice | null {
    // Try __NEXT_DATA__ first
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        const product = data?.props?.pageProps?.product;
        if (product?.price && typeof product.price === 'number') {
          console.log(`[Scraper] Big W __NEXT_DATA__: $${product.price}`);
          return {
            retailerName: 'Big W',
            price: product.price,
            currency: 'AUD',
            inStock: product.inStock !== false,
            productUrl: url,
            unitCount: this.extractPackSizeFromUrl(url),
            unitType: 'nappy'
          };
        }
      } catch (e) {
        console.log('[Scraper] Failed to parse Big W __NEXT_DATA__');
      }
    }

    // Fallback to JSON-LD
    return this.extractJsonLdPrice(html, url);
  }

  /**
   * Coles: Extract from embedded JSON or JSON-LD
   */
  private extractColesPrice(html: string, url: string): ScrapedPrice | null {
    // Try simple JSON pattern first
    const priceMatch = html.match(/"price"\s*:\s*(\d+(?:\.\d+)?)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (price > 0 && price < 1000) {
        console.log(`[Scraper] Coles JSON: $${price}`);
        return {
          retailerName: 'Coles',
          price,
          currency: 'AUD',
          inStock: true,
          productUrl: url,
          unitCount: this.extractPackSizeFromUrl(url),
          unitType: 'nappy'
        };
      }
    }

    return this.extractJsonLdPrice(html, url);
  }

  /**
   * Woolworths: Extract from embedded JSON
   */
  private extractWoolworthsPrice(html: string, url: string): ScrapedPrice | null {
    // Try JSON-LD first
    const jsonLd = this.extractJsonLdPrice(html, url);
    if (jsonLd) return jsonLd;

    // Try embedded price pattern
    const priceMatch = html.match(/"Price"\s*:\s*(\d+(?:\.\d+)?)/i);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (price > 0 && price < 1000) {
        console.log(`[Scraper] Woolworths JSON: $${price}`);
        return {
          retailerName: 'Woolworths',
          price,
          currency: 'AUD',
          inStock: true,
          productUrl: url,
          unitCount: this.extractPackSizeFromUrl(url),
          unitType: 'nappy'
        };
      }
    }

    return null;
  }

  /**
   * Chemist Warehouse: Extract from embedded JSON
   */
  private extractChemistWarehousePrice(html: string, url: string): ScrapedPrice | null {
    // Pattern: "price":{"value":{"amount":38.99
    const priceMatch = html.match(/"price":\s*\{\s*"value":\s*\{\s*"amount":\s*([\d.]+)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (price > 0) {
        console.log(`[Scraper] Chemist Warehouse: $${price}`);
        return {
          retailerName: 'Chemist Warehouse',
          price,
          currency: 'AUD',
          inStock: true,
          productUrl: url,
          unitCount: this.extractPackSizeFromUrl(url),
          unitType: 'nappy'
        };
      }
    }

    return this.extractJsonLdPrice(html, url);
  }

  /**
   * Baby Bunting: Extract from JSON-LD or embedded JSON
   */
  private extractBabyBuntingPrice(html: string, url: string): ScrapedPrice | null {
    // Try JSON-LD first
    const jsonLd = this.extractJsonLdPrice(html, url);
    if (jsonLd) return jsonLd;

    // Try embedded price patterns
    const priceMatch = html.match(/"price"\s*:\s*"?([\d.]+)"?/i);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (price > 0 && price < 1000) {
        console.log(`[Scraper] Baby Bunting: $${price}`);
        return {
          retailerName: 'Baby Bunting',
          price,
          currency: 'AUD',
          inStock: true,
          productUrl: url,
          unitCount: this.extractPackSizeFromUrl(url),
          unitType: 'nappy'
        };
      }
    }

    return null;
  }

  /**
   * Costco: Extract from JSON-LD
   */
  private extractCostcoPrice(html: string, url: string): ScrapedPrice | null {
    return this.extractJsonLdPrice(html, url);
  }

  /**
   * Generic JSON-LD extractor (works for many sites)
   */
  private extractJsonLdPrice(html: string, url: string): ScrapedPrice | null {
    const offerMatch = html.match(/"@type"\s*:\s*"Offer"[^}]*?"price"\s*:\s*"?([\d.]+)"?/);
    if (!offerMatch) return null;

    const price = parseFloat(offerMatch[1]);
    if (isNaN(price) || price <= 0) return null;

    const retailerName = this.getRetailerDisplayName(url);
    console.log(`[Scraper] JSON-LD: $${price} (${retailerName})`);

    return {
      retailerName,
      price,
      currency: 'AUD',
      inStock: true,
      productUrl: url,
      unitCount: this.extractPackSizeFromUrl(url),
      unitType: 'nappy'
    };
  }

  private getRetailerDisplayName(url: string): string {
    const map: Record<string, string> = {
      bigw: 'Big W',
      coles: 'Coles',
      woolworths: 'Woolworths',
      chemistwarehouse: 'Chemist Warehouse',
      babybunting: 'Baby Bunting',
      costco: 'Costco'
    };
    return map[this.getRetailer(url)] || 'Unknown';
  }

  private extractPackSizeFromUrl(url: string): number | undefined {
    const patterns = [
      /(\d+)-(?:nappies|nappy|pack|pk|count|ct|wipes)/i,
      /(\d+)(?:nappies|nappy|pack|pk|count|ct|wipes)/i,
      /(?:pack|size)-(\d+)/i
    ];
    for (const pattern of patterns) {
      const match = url.toLowerCase().match(pattern);
      if (match) {
        const num = parseInt(match[1]);
        if (num >= 10 && num <= 500) return num;
      }
    }
    return undefined;
  }

  // ============ MAIN SCRAPE METHOD ============

  async scrape(url: string): Promise<ScraperResult> {
    const retailer = this.getRetailer(url);
    console.log(`[Scraper] Scraping ${retailer}: ${url}`);

    try {
      const { html, error: fetchError } = await this.fetchHtml(url);

      if (fetchError || !html) {
        return {
          success: false,
          prices: [],
          error: fetchError || 'Failed to fetch URL'
        };
      }

      // Use retailer-specific extractor
      let price: ScrapedPrice | null = null;

      switch (retailer) {
        case 'bigw':
          price = this.extractBigWPrice(html, url);
          break;
        case 'coles':
          price = this.extractColesPrice(html, url);
          break;
        case 'woolworths':
          price = this.extractWoolworthsPrice(html, url);
          break;
        case 'chemistwarehouse':
          price = this.extractChemistWarehousePrice(html, url);
          break;
        case 'babybunting':
          price = this.extractBabyBuntingPrice(html, url);
          break;
        case 'costco':
          price = this.extractCostcoPrice(html, url);
          break;
        default:
          // Try generic extractors
          price = this.extractJsonLdPrice(html, url);
      }

      if (price) {
        console.log(`[Scraper] Extracted: $${price.price} from ${price.retailerName}`);
        return { success: true, prices: [price] };
      }

      console.warn(`[Scraper] No price found for ${url}`);
      return {
        success: false,
        prices: [],
        error: 'No price found - extraction failed'
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

export const aiScraper = new AIScraper();
