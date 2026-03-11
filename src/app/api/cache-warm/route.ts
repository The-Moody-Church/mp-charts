import { NextRequest, NextResponse } from 'next/server';
import { warmAllCaches } from '@/lib/cache-warming';

/**
 * Cache warming API endpoint.
 *
 * Called automatically by instrumentation.ts on server start, and can be
 * triggered manually for on-demand warming. Protected by CACHE_WARM_SECRET
 * to prevent unauthorized access.
 *
 * Usage:
 *   GET /api/cache-warm?secret=<CACHE_WARM_SECRET>
 *
 * Environment:
 *   CACHE_WARM_SECRET — Required. Shared secret for authenticating warming requests.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CACHE_WARM_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CACHE_WARM_SECRET not configured' },
      { status: 503 }
    );
  }

  const requestSecret = request.nextUrl.searchParams.get('secret');
  if (requestSecret !== secret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const start = Date.now();
  console.log('[cache-warm] Starting cache warming...');

  const results = await warmAllCaches();

  const totalMs = Date.now() - start;
  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;

  // Log results
  for (const r of results) {
    if (r.status === 'success') {
      console.log(`[cache-warm] ✓ ${r.name} (${r.durationMs}ms)`);
    } else {
      console.error(`[cache-warm] ✗ ${r.name} (${r.durationMs}ms): ${r.error}`);
    }
  }
  console.log(`[cache-warm] Complete: ${succeeded} succeeded, ${failed} failed (${totalMs}ms total)`);

  return NextResponse.json({
    success: failed === 0,
    totalMs,
    results,
  });
}
