import { describe, it, expect } from 'vitest';
import { errorForLog } from '@/lib/log-safe';

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
});
