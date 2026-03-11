import { NextRequest, NextResponse } from 'next/server';
import { warmAllCaches } from '@/lib/cache-warming';

/**
 * Cache warming API endpoint.
 *
 * Called automatically by instrumentation.ts on server start. Protected by a
 * runtime token set on process.env — no user configuration needed.
 *
 * The token is generated in register() and shared via process.env.__CACHE_WARM_TOKEN
 * (same Node.js process). External callers cannot guess it.
 */
/** Format milliseconds as m:ss.xx (e.g., 1:36.63) */
function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

export async function GET(request: NextRequest) {
  const token = process.env.__CACHE_WARM_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'Cache warming not initialized' },
      { status: 503 }
    );
  }

  const requestToken = request.nextUrl.searchParams.get('token');
  if (!requestToken || requestToken !== token) {
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

  for (const r of results) {
    if (r.status === 'success') {
      console.log(`[cache-warm] ✓ ${r.name} (${formatDuration(r.durationMs)})`);
    } else {
      console.error(`[cache-warm] ✗ ${r.name} (${formatDuration(r.durationMs)}): ${r.error}`);
    }
  }
  console.log(`[cache-warm] Complete: ${succeeded} succeeded, ${failed} failed (${formatDuration(totalMs)} total)`);

  return NextResponse.json({
    success: failed === 0,
    totalMs,
    results,
  });
}
