/**
 * Next.js Instrumentation Hook
 *
 * The register() function runs once when the Next.js server starts.
 * We use it to:
 * 1. Warm all caches immediately via /api/cache-warm
 * 2. Schedule daily cache re-warming at 6:00 AM Central Time
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
  // Use 127.0.0.1, not `localhost`: the server binds HOSTNAME=0.0.0.0 (IPv4 only,
  // see Dockerfile), while Node's `verbatim` DNS default can resolve `localhost`
  // to ::1 first -> ECONNREFUSED. Warming fails soft, so that would silently
  // leave every cache cold after a restart.
  const url = `http://127.0.0.1:${port}/api/cache-warm?token=${encodeURIComponent(token)}`;

  warmWithRetry(url).catch((err) => {
    console.error('[instrumentation] Cache warming failed after all retries:', err);
  });

  // Schedule daily cache re-warming at 6:00 AM Central Time
  scheduleDailyWarm(url);
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

/**
 * Schedules cache re-warming daily at 6:00 AM Central Time.
 *
 * Calculates the delay to the next 6:00 AM CT, sets a one-shot timer,
 * then repeats every 24 hours. Uses America/Chicago timezone (CT).
 */
function scheduleDailyWarm(url: string): void {
  const TARGET_HOUR = 6; // 6:00 AM
  const TZ = 'America/Chicago'; // Central Time (handles CDT/CST automatically)
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  function msUntilNext6amCT(): number {
    const now = new Date();
    // Get current time components in Central Time
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const get = (type: string) => Number(parts.find(p => p.type === type)!.value);
    const ctHour = get('hour');
    const ctMinute = get('minute');
    const ctSecond = get('second');

    // Milliseconds since midnight CT
    const msSinceMidnight = ((ctHour * 60 + ctMinute) * 60 + ctSecond) * 1000;
    const targetMs = TARGET_HOUR * 60 * 60 * 1000; // 6:00 AM in ms

    let delay = targetMs - msSinceMidnight;
    if (delay <= 0) delay += MS_PER_DAY; // Already past 6 AM today — schedule for tomorrow

    return delay;
  }

  function triggerWarm() {
    console.log('[instrumentation] Scheduled cache re-warm triggered (6:00 AM CT)');
    fetch(url)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          console.log('[instrumentation] Scheduled cache re-warm complete:', data.success ? 'all caches warmed' : 'some caches failed');
        } else {
          console.error(`[instrumentation] Scheduled cache re-warm failed: HTTP ${res.status}`);
        }
      })
      .catch((err) => {
        console.error('[instrumentation] Scheduled cache re-warm error:', err);
      });
  }

  const delay = msUntilNext6amCT();
  const delayHours = (delay / (1000 * 60 * 60)).toFixed(1);
  console.log(`[instrumentation] Next scheduled cache warm in ${delayHours}h (6:00 AM CT)`);

  // First fire at next 6 AM CT, then every 24 hours
  setTimeout(() => {
    triggerWarm();
    setInterval(triggerWarm, MS_PER_DAY);
  }, delay);
}
