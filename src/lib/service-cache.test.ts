import { describe, it, expect, vi, afterEach } from 'vitest';
import { serviceCache } from './service-cache';

const noopFetcher = async () => undefined;

describe('serviceCache entry cap (F10)', () => {
  it('evicts the oldest entries once the max cap is exceeded', () => {
    // Insert well beyond the cap (MAX_ENTRIES = 500). These are inserted last, so
    // the surviving entries are the most-recent 500 — i.e. our later keys remain
    // and our earliest keys are evicted, regardless of any pre-existing entries.
    const N = 600;
    for (let i = 0; i < N; i++) {
      serviceCache.set(`evict-test:${i}`, i);
    }

    // Earliest key evicted...
    expect(serviceCache.get('evict-test:0', 60_000, noopFetcher)).toBeUndefined();
    // ...most-recent key retained.
    expect(serviceCache.get(`evict-test:${N - 1}`, 60_000, noopFetcher)).toBe(N - 1);

    serviceCache.deleteByPrefix('evict-test:');
  });

  it('re-setting a key keeps it as most-recent (not immediately evicted)', () => {
    serviceCache.set('keepalive:anchor', 'v1');
    // Push the cap so eviction runs on subsequent sets.
    for (let i = 0; i < 600; i++) {
      serviceCache.set(`keepalive:${i}`, i);
      // Continuously refresh the anchor so it stays at the most-recent end.
      serviceCache.set('keepalive:anchor', 'v2');
    }
    expect(serviceCache.get('keepalive:anchor', 60_000, noopFetcher)).toBe('v2');

    serviceCache.deleteByPrefix('keepalive:');
  });
});

describe('serviceCache background refresh', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    serviceCache.deleteByPrefix('refresh-test:');
  });

  // #304: a rejected refresh must keep the last good value, and say so in the log.
  it('keeps the cached value and warns when a background refresh rejects', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    serviceCache.set('refresh-test:a', 'good');

    vi.setSystemTime(new Date('2026-11-17T13:00:01Z')); // past the 1h TTL
    const failing = vi.fn(() => Promise.reject(new Error('MP down')));
    expect(serviceCache.get('refresh-test:a', 3_600_000, failing)).toBe('good');
    expect(failing).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn).toHaveBeenCalledWith(
      '[service-cache] background refresh failed; keeping cached value:',
      'refresh-test:a',
      'Error: MP down',
    );
    // Still the old value, and the next stale read retries.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const healthy = vi.fn(() => Promise.resolve('fresh'));
    expect(serviceCache.get('refresh-test:a', 3_600_000, healthy)).toBe('good');
    expect(healthy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(serviceCache.get('refresh-test:a', 3_600_000, healthy)).toBe('fresh'));
  });
});

// An explicit Refresh must reach MP, but must not throw away the last good value
// before it knows the new one arrived (finding on #304: deleteByPrefix before the
// fetch left both cache layers empty when that fetch failed).
describe('serviceCache markForRefresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    serviceCache.deleteByPrefix('force-test:');
  });

  it('fetches a marked key in the foreground and stores the new value', async () => {
    serviceCache.set('force-test:a', 'old');
    serviceCache.markForRefresh('force-test:');

    const fetcher = vi.fn(() => Promise.resolve('new'));
    await expect(serviceCache.getOrFetch('force-test:a', 3_600_000, fetcher)).resolves.toBe('new');
    expect(fetcher).toHaveBeenCalledTimes(1);

    // No longer marked: the next read is a plain hit.
    const again = vi.fn(() => Promise.resolve('newer'));
    await expect(serviceCache.getOrFetch('force-test:a', 3_600_000, again)).resolves.toBe('new');
    expect(again).not.toHaveBeenCalled();
  });

  it('keeps the old value when the forced fetch fails, rejects that call, and serves the old value next', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    serviceCache.set('force-test:a', 'good');
    serviceCache.markForRefresh('force-test:');

    const failing = vi.fn(() => Promise.reject(new Error('MP down')));
    await expect(serviceCache.getOrFetch('force-test:a', 3_600_000, failing)).rejects.toThrow('MP down');
    expect(warn).toHaveBeenCalledWith(
      '[service-cache] forced refresh failed; keeping cached value:',
      'force-test:a',
      'Error: MP down',
    );

    // The next request gets the last good value instantly, without another foreground fetch.
    const next = vi.fn(() => Promise.resolve('fresh'));
    await expect(serviceCache.getOrFetch('force-test:a', 3_600_000, next)).resolves.toBe('good');
    expect(next).not.toHaveBeenCalled();
  });

  it('marks only keys with the prefix, and leaves unknown keys a cold miss', async () => {
    serviceCache.set('force-test:a', 'a1');
    serviceCache.set('force-test-other:b', 'b1');
    serviceCache.markForRefresh('force-test:');

    const other = vi.fn(() => Promise.resolve('b2'));
    await expect(serviceCache.getOrFetch('force-test-other:b', 3_600_000, other)).resolves.toBe('b1');
    expect(other).not.toHaveBeenCalled();
    serviceCache.deleteByPrefix('force-test-other:');

    const cold = vi.fn(() => Promise.resolve('c1'));
    await expect(serviceCache.getOrFetch('force-test:c', 3_600_000, cold)).resolves.toBe('c1');
    expect(cold).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight forced fetch between concurrent callers', async () => {
    serviceCache.set('force-test:a', 'old');
    serviceCache.markForRefresh('force-test:');

    let resolve!: (v: string) => void;
    const fetcher = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    const first = serviceCache.getOrFetch('force-test:a', 3_600_000, fetcher);
    const second = serviceCache.getOrFetch('force-test:a', 3_600_000, fetcher);
    resolve('new');
    await expect(Promise.all([first, second])).resolves.toEqual(['new', 'new']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
