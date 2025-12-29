import * as cheerio from 'cheerio';

/**
 * Extracts just the text content from HTML, focused on product/price info.
 * Returns a much smaller string than HTML for faster AI processing.
 */
export function extractTextForAI(html: string): string {
  const $ = cheerio.load(html);
  const lines: string[] = [];

  // First, try to find price in JSON-LD or embedded JSON (most reliable)
  // Look for schema.org Offer price pattern in raw HTML
  const offerPriceMatch = html.match(/"@type"\s*:\s*"Offer"[^}]*?"price"\s*:\s*"?([\d.]+)"?/);
  if (offerPriceMatch) {
    lines.push(`Schema Price: $${offerPriceMatch[1]}`);
  }

  // Also try JSON-LD script parsing
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '');
      const price = findJsonLdPrice(json);
      if (price) {
        lines.push(`Structured Data Price: $${price}`);
      }
    } catch {
      // Ignore JSON parse errors
    }
  });

  // Remove non-content elements
  $('script, style, svg, noscript, iframe, video, audio, canvas, map, object, embed').remove();
  $('nav, footer, header').remove();
  $('[style*="display: none"], [style*="display:none"]').remove();
  $('[style*="visibility: hidden"], [style*="visibility:hidden"]').remove();
  $('[hidden]').remove();

  // Remove "related products" / "other options" sections to avoid extracting wrong prices
  $('[class*="related"], [class*="Similar"], [class*="other-option"], [class*="recommendation"]').remove();

  // Get page title (often includes pack size like "108 Pack")
  const title = $('title').text().trim();
  if (title) lines.push(`Title: ${title}`);

  // Get h1 (usually product name with pack size)
  const h1 = $('h1').first().text().trim();
  if (h1) lines.push(`Product: ${h1}`);

  // Look for price elements - get the parent container's text for context
  const priceEls = $('[class*="price"], [data-price], [itemprop="price"]');
  const priceTexts = new Set<string>();

  priceEls.each((i, el) => {
    if (i > 5) return; // Limit to first few price elements
    // Get parent text for more context (includes per-unit info)
    const parentText = $(el).parent().text().replace(/\s+/g, ' ').trim();
    if (parentText && parentText.length < 150) {
      priceTexts.add(parentText);
    }
  });

  if (priceTexts.size > 0) {
    lines.push(`Prices: ${[...priceTexts].slice(0, 3).join(' | ')}`);
  }

  return lines.join('\n');
}

/**
 * Recursively search JSON-LD data for price field
 */
function findJsonLdPrice(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;

  // Check if this object has a price field
  if ('price' in obj) {
    const price = (obj as Record<string, unknown>).price;
    if (typeof price === 'string' || typeof price === 'number') {
      return String(price);
    }
  }

  // Check offers array/object (common in Product schema)
  if ('offers' in obj) {
    const offers = (obj as Record<string, unknown>).offers;
    if (Array.isArray(offers)) {
      for (const offer of offers) {
        const price = findJsonLdPrice(offer);
        if (price) return price;
      }
    } else {
      const price = findJsonLdPrice(offers);
      if (price) return price;
    }
  }

  // Recursively check arrays
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const price = findJsonLdPrice(item);
      if (price) return price;
    }
  }

  return null;
}

/**
 * Cleans HTML to reduce token count while preserving pricing information.
 * Removes scripts, styles, SVGs, comments, and excessive whitespace.
 */
export function cleanHtmlForAI(html: string): string {
  const $ = cheerio.load(html);

  // Remove elements that don't contain useful pricing info
  $('script').remove();
  $('style').remove();
  $('svg').remove();
  $('noscript').remove();
  $('iframe').remove();
  $('video').remove();
  $('audio').remove();
  $('canvas').remove();
  $('map').remove();
  $('object').remove();
  $('embed').remove();

  // Remove hidden elements
  $('[style*="display: none"]').remove();
  $('[style*="display:none"]').remove();
  $('[style*="visibility: hidden"]').remove();
  $('[style*="visibility:hidden"]').remove();
  $('[hidden]').remove();

  // Remove navigation and footer elements (usually not price-related)
  $('nav').remove();
  $('footer').remove();
  $('header').remove();

  // Remove form elements except for add-to-cart buttons
  $('form').not(':has(button:contains("cart"), button:contains("buy"), input[type="submit"])').remove();

  // Strip most attributes but keep class, id, and data-* for context
  $('*').each((_, el) => {
    const element = $(el);
    const attribs = (el as unknown as { attribs?: Record<string, string> }).attribs || {};
    const allowedAttrs = ['class', 'id', 'data-price', 'data-product', 'data-sku', 'itemprop', 'content'];

    Object.keys(attribs).forEach((attr) => {
      if (!allowedAttrs.includes(attr) && !attr.startsWith('data-')) {
        element.removeAttr(attr);
      }
    });
  });

  // Get the cleaned HTML
  let cleaned = $.html();

  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Remove empty tags
  cleaned = cleaned.replace(/<(\w+)[^>]*>\s*<\/\1>/g, '');

  // Trim
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Truncates HTML if it exceeds the maximum length.
 * Tries to cut at a tag boundary to avoid broken HTML.
 */
export function truncateHtml(html: string, maxLength: number = 50000): string {
  if (html.length <= maxLength) {
    return html;
  }

  // Find a good cut point (end of a tag)
  let cutPoint = maxLength;
  const lastTagEnd = html.lastIndexOf('>', cutPoint);
  if (lastTagEnd > maxLength * 0.8) {
    cutPoint = lastTagEnd + 1;
  }

  return html.substring(0, cutPoint) + '\n<!-- Content truncated for AI processing -->';
}
