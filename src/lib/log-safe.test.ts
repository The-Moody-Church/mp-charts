import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { causeForLog, errorForLog } from '@/lib/log-safe';

describe('errorForLog', () => {
  it('renders an Error as "name: message"', () => {
    expect(errorForLog(new Error('boom'))).toBe('Error: boom');
    expect(errorForLog(new TypeError('bad'))).toBe('TypeError: bad');
  });

  it('strips CR, LF and other control characters, so a message cannot forge a log line', () => {
    expect(errorForLog(new Error('a\nb\r\nc\rd'))).toBe('Error: abcd');
    expect(errorForLog(new Error('x\x1b[31my\x00z\x7f  '))).toBe('Error: x[31myz');
  });

  it('stringifies non-Error values', () => {
    expect(errorForLog('plain')).toBe('plain');
    expect(errorForLog(undefined)).toBe('undefined');
    expect(errorForLog({ a: 1 })).toBe('[object Object]');
  });

  it('never includes a stack trace', () => {
    expect(errorForLog(new Error('boom'))).not.toMatch(/\s+at\s/);
  });

  it('does not throw for a value whose toString throws', () => {
    const hostile = { toString() { throw new Error('no'); } };
    expect(errorForLog(hostile)).toBe('unprintable error');
  });

  // Batch 3 review: every MP client log line goes through errorForLog, and undici
  // keeps the useful detail (ECONNREFUSED, connect timeout, refused redirect) on
  // error.cause. Class and code only, never the cause's free-text message.
  describe('cause suffix', () => {
    const fetchFailed = (cause: unknown) => new TypeError('fetch failed', { cause });

    it('appends the cause class and code of a network failure', () => {
      const cause = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:443'), { code: 'ECONNREFUSED' });
      expect(errorForLog(fetchFailed(cause))).toBe('TypeError: fetch failed (cause: Error ECONNREFUSED)');
    });

    it('names an undici connect timeout', () => {
      const cause = Object.assign(new Error('Connect Timeout Error (attempted address: mp.example.com:443)'), {
        name: 'ConnectTimeoutError',
        code: 'UND_ERR_CONNECT_TIMEOUT',
      });
      expect(errorForLog(fetchFailed(cause))).toBe(
        'TypeError: fetch failed (cause: ConnectTimeoutError UND_ERR_CONNECT_TIMEOUT)'
      );
    });

    it('labels a refused redirect with fixed text, not the cause message', () => {
      expect(errorForLog(fetchFailed(new Error('unexpected redirect')))).toBe(
        'TypeError: fetch failed (cause: Error redirect refused)'
      );
    });

    it('never copies the cause message', () => {
      const out = errorForLog(fetchFailed(new Error('member@example.org /files/secret')));
      expect(out).toBe('TypeError: fetch failed (cause: Error)');
    });

    it.each([
      ['a name with spaces and a newline', { name: 'Bad Name\nforged', code: 'ECONNREFUSED' }, ' (cause: ECONNREFUSED)'],
      ['a code with punctuation', { name: 'Error', code: 'E;rm -rf' }, ' (cause: Error)'],
      ['an over-long code', { name: 'Error', code: 'E'.repeat(65) }, ' (cause: Error)'],
      ['a numeric code', { name: 'Error', code: 42 }, ' (cause: Error)'],
      ['nothing usable', { name: '', code: '' }, ''],
    ])('drops %s', (_label, cause, suffix) => {
      expect(causeForLog(fetchFailed(cause))).toBe(suffix);
    });

    it('adds nothing for an error without an object cause, or a non-Error', () => {
      expect(causeForLog(new Error('x'))).toBe('');
      expect(causeForLog(new Error('x', { cause: 'ECONNREFUSED' }))).toBe('');
      expect(causeForLog({ cause: { code: 'ECONNREFUSED' } })).toBe('');
      expect(errorForLog(new Error('boom'))).toBe('Error: boom');
    });

    it('does not throw for a cause whose getters throw', () => {
      const cause = {
        get name(): string {
          throw new Error('no');
        },
      };
      expect(causeForLog(fetchFailed(cause))).toBe('');
      expect(errorForLog(fetchFailed(cause))).toBe('TypeError: fetch failed');
    });

    it('describes real undici rejections: a refused redirect and a refused connection', async () => {
      const server = createServer((_req, res) => {
        res.writeHead(307, { Location: 'http://127.0.0.1:1/elsewhere' });
        res.end();
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      try {
        const redirected = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'error' }).catch((e: unknown) => e);
        expect(errorForLog(redirected)).toBe('TypeError: fetch failed (cause: Error redirect refused)');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
      // The port is closed now.
      const refused = await fetch(`http://127.0.0.1:${port}/`).catch((e: unknown) => e);
      expect(errorForLog(refused)).toMatch(/^TypeError: fetch failed \(cause: \w+ ECONNREFUSED\)$/);
    });
  });
});
