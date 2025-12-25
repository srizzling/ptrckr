import * as cheerio from 'cheerio';

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
    const attribs = (el as cheerio.Element).attribs || {};
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
