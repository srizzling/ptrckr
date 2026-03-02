import Firecrawl from '@mendable/firecrawl-js';

const CIS_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    minimumTerm: {
      type: 'string',
      description: 'The minimum contract term or lock-in period. Examples: "No lock-in contract", "Month-to-month", "12 months", "24 months". If no minimum term or lock-in is mentioned, return "No lock-in".'
    },
    cancellationFees: {
      type: 'string',
      description: 'Early termination or cancellation fees. Examples: "No cancellation fee", "$0", "$99 early termination fee", "Remaining months x monthly fee". If no fees are mentioned, return "No cancellation fee".'
    },
    noticePeriod: {
      type: 'string',
      description: 'The notice period required to cancel the service. Examples: "30 days", "14 days", "None", "No notice required". If not mentioned, return "Not specified".'
    },
  },
  required: ['minimumTerm', 'cancellationFees', 'noticePeriod'],
};

const CIS_PDF_LINK_SCHEMA = {
  type: 'object',
  properties: {
    pdfUrl: {
      type: 'string',
      description: 'The URL of the NBN residential (fixed-line) Critical Information Summary (CIS) PDF document. Look for links containing "nbn", "residential", "CIS", "FTTP", "HFC", "FTTC", or "FTTN". Prefer the residential fixed-line CIS over fixed wireless or mobile CIS documents. Return the full absolute URL.'
    },
  },
  required: ['pdfUrl'],
};

interface CisExtractionResult {
  minimumTerm: string;
  cancellationFees: string;
  noticePeriod: string;
}

export interface CisExtractorResult {
  success: boolean;
  data?: CisExtractionResult;
  rawExtraction?: string;
  resolvedUrl?: string;
  error?: string;
}

/**
 * Check if a URL points to a PDF or an HTML page
 */
async function resolveContentType(url: string): Promise<'pdf' | 'html'> {
  // Quick check: if URL ends with .pdf, it's a PDF
  if (url.toLowerCase().endsWith('.pdf')) {
    return 'pdf';
  }

  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/pdf')) {
      return 'pdf';
    }
  } catch {
    // Fall through - assume HTML if HEAD fails
  }

  return 'html';
}

/**
 * Find the NBN residential CIS PDF link from an HTML landing page
 */
async function findCisPdfUrl(firecrawl: Firecrawl, landingPageUrl: string): Promise<string | null> {
  const result = await firecrawl.scrape(landingPageUrl, {
    formats: [{
      type: 'json',
      prompt: 'This is a page listing Critical Information Summary (CIS) PDF documents for an Australian internet provider. Find the URL of the NBN residential fixed-line CIS PDF. Look for links that mention "nbn", "residential", "CIS", "FTTP", "HFC", "FTTC", or "FTTN". Do NOT pick mobile SIM CIS or fixed wireless CIS - pick the residential fixed-line NBN CIS.',
      schema: CIS_PDF_LINK_SCHEMA,
    }],
  });

  const fullResult = result as {
    success: boolean;
    json?: { pdfUrl?: string };
    error?: string;
  };

  return fullResult.json?.pdfUrl || null;
}

export async function extractCisTerms(cisUrl: string): Promise<CisExtractorResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'FIRECRAWL_API_KEY not set' };
  }

  try {
    const firecrawl = new Firecrawl({ apiKey });

    // Check if URL is a PDF or an HTML landing page
    const contentType = await resolveContentType(cisUrl);
    let targetUrl = cisUrl;

    if (contentType === 'html') {
      // Landing page with multiple PDFs - find the right one
      const pdfUrl = await findCisPdfUrl(firecrawl, cisUrl);
      if (!pdfUrl) {
        return {
          success: false,
          error: 'Could not find NBN residential CIS PDF on landing page',
          resolvedUrl: cisUrl,
        };
      }
      targetUrl = pdfUrl;
    }

    const result = await firecrawl.scrape(targetUrl, {
      formats: [{
        type: 'json',
        prompt: 'Extract the key contract terms from this Australian NBN internet Critical Information Summary (CIS) document. Focus on: 1) The minimum contract term or lock-in period, 2) Any early termination or cancellation fees, 3) The notice period required to cancel. These are Australian telecommunications CIS documents required by the ACMA.',
        schema: CIS_EXTRACT_SCHEMA,
      }],
    });

    const fullResult = result as {
      success: boolean;
      json?: CisExtractionResult;
      error?: string;
    };

    const extracted = fullResult.json;

    if (!extracted) {
      return {
        success: false,
        error: fullResult.error || 'No data extracted from CIS document',
        resolvedUrl: targetUrl !== cisUrl ? targetUrl : undefined,
      };
    }

    return {
      success: true,
      data: {
        minimumTerm: extracted.minimumTerm || 'Not specified',
        cancellationFees: extracted.cancellationFees || 'Not specified',
        noticePeriod: extracted.noticePeriod || 'Not specified',
      },
      rawExtraction: JSON.stringify(extracted),
      resolvedUrl: targetUrl !== cisUrl ? targetUrl : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during CIS extraction',
    };
  }
}
