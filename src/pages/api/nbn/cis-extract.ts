import type { APIRoute } from 'astro';
import { getAllCisExtractions, getCisExtraction, saveCisExtraction } from '../../../lib/db/queries/nbn';
import { extractCisTerms } from '../../../lib/nbn/cis-extractor';

export const GET: APIRoute = async () => {
  try {
    const extractions = await getAllCisExtractions();

    // Key by cisUrl for easy frontend lookup
    const byUrl: Record<string, typeof extractions[0]> = {};
    for (const e of extractions) {
      byUrl[e.cisUrl] = e;
    }

    return new Response(JSON.stringify({ extractions: byUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching CIS extractions:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to fetch CIS extractions'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { cisUrl, providerName, force } = body;

    if (!cisUrl || !providerName) {
      return new Response(JSON.stringify({
        error: 'cisUrl and providerName are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check cache first (skip if already extracted unless force: true)
    if (!force) {
      const existing = await getCisExtraction(cisUrl);
      if (existing && existing.status === 'success') {
        return new Response(JSON.stringify({
          extraction: existing,
          cached: true
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Mark as pending
    await saveCisExtraction({
      cisUrl,
      providerName,
      status: 'pending',
    });

    // Extract terms from the CIS PDF
    const result = await extractCisTerms(cisUrl);

    if (result.success && result.data) {
      const saved = await saveCisExtraction({
        cisUrl,
        providerName,
        minimumTerm: result.data.minimumTerm,
        cancellationFees: result.data.cancellationFees,
        noticePeriod: result.data.noticePeriod,
        rawExtraction: result.rawExtraction,
        resolvedPdfUrl: result.resolvedUrl,
        status: 'success',
      });

      return new Response(JSON.stringify({
        extraction: saved,
        cached: false
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      const saved = await saveCisExtraction({
        cisUrl,
        providerName,
        status: 'error',
        errorMessage: result.error,
      });

      return new Response(JSON.stringify({
        extraction: saved,
        cached: false,
        error: result.error
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Error extracting CIS terms:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Failed to extract CIS terms'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
