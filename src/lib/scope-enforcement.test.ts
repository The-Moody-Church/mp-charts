import { describe, it, expect, vi, afterEach } from 'vitest';
import { getScopeMode, enforceScope } from './scope-enforcement';

const ORIGINAL = process.env.F2_SCOPE_ENFORCEMENT;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.F2_SCOPE_ENFORCEMENT;
  else process.env.F2_SCOPE_ENFORCEMENT = ORIGINAL;
  vi.restoreAllMocks();
});

describe('scope-enforcement', () => {
  it('defaults to enforce mode when unset', () => {
    delete process.env.F2_SCOPE_ENFORCEMENT;
    expect(getScopeMode()).toBe('enforce');
  });

  it('reads report mode from the env var', () => {
    process.env.F2_SCOPE_ENFORCEMENT = 'report';
    expect(getScopeMode()).toBe('report');
  });

  it('treats any non-"report" value as enforce', () => {
    process.env.F2_SCOPE_ENFORCEMENT = 'something-else';
    expect(getScopeMode()).toBe('enforce');
  });

  it('allows an in-scope decision without throwing', () => {
    delete process.env.F2_SCOPE_ENFORCEMENT;
    expect(() => enforceScope(true, 'ctx')).not.toThrow();
  });

  it('throws "Forbidden" on out-of-scope in enforce mode', () => {
    delete process.env.F2_SCOPE_ENFORCEMENT;
    expect(() => enforceScope(false, 'participant 5')).toThrow(/Forbidden/);
  });

  it('warns but allows out-of-scope in report mode', () => {
    process.env.F2_SCOPE_ENFORCEMENT = 'report';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => enforceScope(false, 'participant 5')).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
