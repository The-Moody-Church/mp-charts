import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestWarm, retryPartialWarm, WARM_RETRY_DELAYS_MS } from './cache-warm-retry';

const URL = 'http://127.0.0.1:3000/api/cache-warm?token=t';

/** A fake /api/cache-warm answer. */
const answer = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('requestWarm', () => {
  it('is ok only when the route reports success: true', async () => {
    await expect(requestWarm(URL, vi.fn().mockResolvedValue(answer({ success: true })))).resolves.toBe('ok');
  });

  // The route answers 200 with success: false when an entry failed (#304), so
  // res.ok alone is not "warmed".
  it('is partial on HTTP 200 with success: false, or a body it cannot read', async () => {
    await expect(requestWarm(URL, vi.fn().mockResolvedValue(answer({ success: false })))).resolves.toBe('partial');
    const unreadable = { ok: true, status: 200, json: () => Promise.reject(new SyntaxError('bad json')) };
    await expect(requestWarm(URL, vi.fn().mockResolvedValue(unreadable))).resolves.toBe('partial');
  });

  it('is failed on a non-2xx answer', async () => {
    await expect(requestWarm(URL, vi.fn().mockResolvedValue(answer({ error: 'x' }, 503)))).resolves.toBe('failed');
  });

  it('throws when the server cannot be reached', async () => {
    await expect(requestWarm(URL, vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))).rejects.toThrow('ECONNREFUSED');
  });
});

describe('retryPartialWarm', () => {
  it('backs off 1, 3 and 5 minutes by default', () => {
    expect(WARM_RETRY_DELAYS_MS).toEqual([60_000, 180_000, 300_000]);
  });

  it('stops at the first retry that warms everything', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(answer({ success: false }))
      .mockResolvedValueOnce(answer({ success: true }));

    await expect(retryPartialWarm(URL, 'startup', { delaysMs: [10, 20, 30], fetchFn, sleep })).resolves.toBe('ok');
    expect(sleep.mock.calls).toEqual([[10], [20]]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenCalledWith(URL);
    expect(console.info).toHaveBeenCalledWith('[instrumentation] startup cache warm: all caches warmed on retry 2/3');
  });

  it('gives up after the last delay, logs it, and never throws', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(answer({ success: false }))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(answer({ success: false }));

    await expect(retryPartialWarm(URL, 'scheduled', { delaysMs: [10, 20, 30], fetchFn, sleep })).resolves.toBe('partial');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[instrumentation] scheduled cache warm: some caches still cold after 3 retries'));
  });

  it('waits before each retry, so the first one does not hit MP straight after the failure', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn().mockResolvedValue(answer({ success: true }));
      const done = retryPartialWarm(URL, 'startup', { fetchFn });

      await vi.advanceTimersByTimeAsync(59_999);
      expect(fetchFn).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(done).resolves.toBe('ok');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
