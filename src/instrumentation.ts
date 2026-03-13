/**
 * Next.js Instrumentation Hook
 *
 * The register() function runs once when the Next.js server starts.
 * We use it to trigger cache warming via the /api/cache-warm endpoint
 * after the HTTP server is ready.
 *
 * A random token is set on process.env at runtime so the API route can
 * verify the request came from this process — no user configuration needed.
 */
export async function register() {
  // Only warm caches in the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Generate a one-time token and share it via process.env (same Node process)
  // Use Web Crypto API (available in both Node.js and Edge) to avoid static analysis errors
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  process.env.__CACHE_WARM_TOKEN = token;

  // Schedule cache warming after the server is ready.
  // register() runs during server initialization, before the HTTP listener
  // is bound. We poll until the server is accepting connections.
  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}/api/cache-warm?token=${encodeURIComponent(token)}`;

  warmWithRetry(url).catch((err) => {
    console.error('[instrumentation] Cache warming failed after all retries:', err);
  });
}

/**
 * Polls the cache warming endpoint until the server is ready, then triggers warming.
 * Retries up to 10 times with 2-second intervals (20s max wait for server startup).
 */
async function warmWithRetry(url: string, maxAttempts = 10, intervalMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Wait before each attempt (server isn't ready during register())
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        console.log(`[instrumentation] Cache warming complete (attempt ${attempt}):`, data.success ? 'all caches warmed' : 'some caches failed');
        return;
      }
      console.log(`[instrumentation] Cache warming attempt ${attempt}: HTTP ${res.status}`);
    } catch {
      // Server not ready yet — connection refused is expected
      if (attempt < maxAttempts) {
        console.log(`[instrumentation] Waiting for server... (attempt ${attempt}/${maxAttempts})`);
      }
    }
  }

  console.error('[instrumentation] Server did not become ready within timeout — cache warming skipped');
}
