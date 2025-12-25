import type { Scraper, ScraperResult, ScrapedPrice } from './types';
import { ollamaClient } from './ollama-client';
import { cleanHtmlForAI, truncateHtml } from './html-cleaner';

export class AIScraper implements Scraper {
  type = 'ai';

  async scrape(url: string, hints?: string): Promise<ScraperResult> {
    try {
      const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
      const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';
      console.log(`[AI Scraper] Using Ollama at ${ollamaUrl} with model ${ollamaModel}`);

      // Check if Ollama is available
      const isAvailable = await ollamaClient.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          prices: [],
          error: `Ollama service unavailable at ${ollamaUrl}. Make sure Ollama is running.`
        };
      }

      // Fetch the HTML
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
        return {
          success: false,
          prices: [],
          error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`
        };
      }

      const html = await response.text();

      // Clean and truncate HTML for AI processing
      let cleanedHtml = cleanHtmlForAI(html);
      cleanedHtml = truncateHtml(cleanedHtml, 50000);

      console.log(
        `[AI Scraper] Original HTML: ${html.length} chars, Cleaned: ${cleanedHtml.length} chars`
      );

      // Extract prices using Ollama (supports multiple prices for aggregator sites)
      const result = await ollamaClient.extractPrices(cleanedHtml, url, hints);

      if (result.error) {
        console.warn(`[AI Scraper] Extraction warning: ${result.error}`);
      }

      // Convert to ScrapedPrice format
      const prices: ScrapedPrice[] = result.prices
        .filter((p) => p.price !== null && p.price > 0)
        .map((p) => ({
          retailerName: p.retailerName,
          price: p.price!,
          currency: p.currency,
          inStock: p.inStock,
          productUrl: p.productUrl || url
        }));

      console.log(`[AI Scraper] Extracted ${prices.length} prices from ${url}`);

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

export const aiScraper = new AIScraper();
