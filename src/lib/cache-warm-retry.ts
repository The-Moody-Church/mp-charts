/**
 * Retry for a cache warm that reached the server but left entries cold.
 *
 * Since #304 a Ministry Platform failure during warming rejects that entry
 * instead of caching zeros, and /api/cache-warm answers HTTP 200 with
 * `success: false`. Without a retry the entry stayed cold until the next 6:00 AM
 * CT warm (up to ~24h) or the first staff request, which then paid the whole
 * cold fetch, or failed. A retry is cheap: entries that already warmed are cache
 * hits at both layers.
 *
 * Used by src/instrumentation.ts (startup warm and the daily 6:00 AM CT warm).
 * Kept here, not in instrumentation.ts, so it can be tested without register().
 */

export type WarmOutcome = 'ok' | 'partial' | 'failed';

/** Backoff between retries of a partial warm: 1, 3 and 5 minutes. */
export const WARM_RETRY_DELAYS_MS: readonly number[] = [60_000, 180_000, 300_000];

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface RetryOptions {
  delaysMs?: readonly number[];
  fetchFn?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One call to /api/cache-warm. 'ok' when every entry warmed, 'partial' when the
 * route ran but reported failures, 'failed' on a non-2xx answer.
 * Throws when the server cannot be reached (the caller decides what that means).
 */
export async function requestWarm(url: string, fetchFn: FetchLike = fetch): Promise<WarmOutcome> {
  const res = await fetchFn(url);
  if (!res.ok) return 'failed';
  const data = await res.json().catch(() => null);
  return (data as { success?: unknown } | null)?.success === true ? 'ok' : 'partial';
}

/**
 * After a warm reported failed entries, try again with backoff until every
 * entry warms or the delays run out. Never throws; resolves with the last outcome.
 * `label` names the warm in the log ("startup", "scheduled") and must be a literal.
 */
export async function retryPartialWarm(
  url: string,
  label: string,
  { delaysMs = WARM_RETRY_DELAYS_MS, fetchFn = fetch, sleep = defaultSleep }: RetryOptions = {}
): Promise<WarmOutcome> {
  let outcome: WarmOutcome = 'partial';
  for (const [i, delay] of delaysMs.entries()) {
    const attempt = `${i + 1}/${delaysMs.length}`;
    console.warn(`[instrumentation] ${label} cache warm left some caches cold; retry ${attempt} in ${Math.round(delay / 1000)}s`);
    await sleep(delay);
    try {
      outcome = await requestWarm(url, fetchFn);
    } catch {
      outcome = 'failed';
    }
    if (outcome === 'ok') {
      console.info(`[instrumentation] ${label} cache warm: all caches warmed on retry ${attempt}`);
      return outcome;
    }
  }
  console.error(`[instrumentation] ${label} cache warm: some caches still cold after ${delaysMs.length} retries; the next request or scheduled warm will try again`);
  return outcome;
}
