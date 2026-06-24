import { describe, it, expect } from 'vitest';
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
