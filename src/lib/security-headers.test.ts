import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildContentSecurityPolicy,
  createNonce,
  cspHeaderName,
  originOf,
} from "./security-headers";

const NONCE = "test-nonce-value";

/** Pulls one directive out of a policy string, so assertions read as intent. */
function directive(csp: string, name: string): string | undefined {
  return csp
    .split("; ")
    .find((d) => d === name || d.startsWith(`${name} `));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("originOf", () => {
  it("reduces a configured URL to its origin", () => {
    expect(originOf("https://moody.ministryplatform.com/ministryplatformapi/")).toBe(
      "https://moody.ministryplatform.com"
    );
  });

  it("returns null instead of throwing on anything unusable", () => {
    // This runs on the request path. A malformed env var must degrade to a
    // TIGHTER policy, never take the app down.
    for (const bad of [undefined, null, "", "not a url", "///"]) {
      expect(originOf(bad)).toBeNull();
    }
  });
});

describe("createNonce", () => {
  it("is fresh on every call", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
  });

  it("carries at least 128 bits of entropy, base64-encoded", () => {
    const n = createNonce();
    expect(n).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(atob(n).length).toBe(16);
  });
});

describe("cspHeaderName", () => {
  it("ENFORCES by default", () => {
    // The default was inverted on 2026-09-18, after the enforced browser walk.
    // Production enforcement had been carried by a CSP_ENFORCE=true line in
    // each container's .env, so an app that lost that line would have fallen
    // back to report-only silently: nothing broken, nothing logged, the
    // protection simply gone. Forgetting the variable must keep the control,
    // not remove it.
    vi.stubEnv("CSP_ENFORCE", undefined);
    expect(cspHeaderName()).toBe("Content-Security-Policy");
  });

  it('reports ONLY on the exact string "false"', () => {
    vi.stubEnv("CSP_ENFORCE", "false");
    expect(cspHeaderName()).toBe("Content-Security-Policy-Report-Only");
  });

  it("enforces for every near-miss value", () => {
    // A typo or a stray capital must NOT silently disable the policy. This is
    // the half that matters now: the risk is losing enforcement by accident,
    // not gaining it.
    for (const v of ["False", "FALSE", "0", "no", "true", "", " false"]) {
      vi.stubEnv("CSP_ENFORCE", v);
      expect(cspHeaderName()).toBe("Content-Security-Policy");
    }
  });

  it("still honours an explicit argument, so callers can override the env", () => {
    vi.stubEnv("CSP_ENFORCE", undefined);
    expect(cspHeaderName(false)).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(true)).toBe("Content-Security-Policy");
  });
});

describe("buildContentSecurityPolicy", () => {
  const prod = (over = {}) => buildContentSecurityPolicy({ nonce: NONCE, ...over });

  it("nonces script-src and pairs it with strict-dynamic", () => {
    expect(directive(prod(), "script-src")).toBe(
      `script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`
    );
  });

  it("never allows unsafe-eval or unsafe-inline for scripts in production", () => {
    const scriptSrc = directive(prod(), "script-src")!;
    expect(scriptSrc).not.toContain("unsafe-eval");
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("allows unsafe-eval for scripts in dev only", () => {
    // React rebuilds server-side error stacks in the browser with eval.
    expect(directive(prod({ isDev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("declares worker-src explicitly, because strict-dynamic would block the service worker", () => {
    // worker-src has no default: it falls back to child-src, then script-src,
    // where 'strict-dynamic' makes browsers ignore 'self'. A worker script
    // cannot carry a nonce, so without this the SW fails to register.
    expect(directive(prod(), "worker-src")).toBe("worker-src 'self'");
  });

  it("allows inline styles WITHOUT a nonce", () => {
    // Deliberate. Radix pulls in react-remove-scroll, which injects a <style>
    // ELEMENT at runtime — after the server chose the nonce, so no nonce can
    // cover it, and its content varies by scrollbar width so no hash can
    // either. A nonce in this directive would make CSP3 browsers ignore
    // 'unsafe-inline' entirely and break every Radix dialog.
    const styleSrc = directive(prod(), "style-src")!;
    expect(styleSrc).toBe("style-src 'self' 'unsafe-inline'");
    expect(styleSrc).not.toContain("nonce");
  });

  it("adds the MP file origin to img-src, and omits it cleanly when unset", () => {
    // Contact photos are unoptimized next/image, so the BROWSER fetches them
    // straight from MP. Without this origin every avatar breaks.
    expect(directive(prod({ imageOrigin: "https://mp.example.org" }), "img-src")).toBe(
      "img-src 'self' data: blob: https://mp.example.org"
    );
    expect(directive(prod({ imageOrigin: null }), "img-src")).toBe(
      "img-src 'self' data: blob:"
    );
  });

  it("adds the MP origin to form-action, and omits it cleanly when unset", () => {
    // form-action applies to the WHOLE redirect chain a submission produces,
    // so 'self' alone aborts sign-out at the hop to MP's endsession endpoint.
    expect(
      directive(prod({ formActionOrigin: "https://mp.example.org" }), "form-action")
    ).toBe("form-action 'self' https://mp.example.org");
    expect(directive(prod({ formActionOrigin: null }), "form-action")).toBe(
      "form-action 'self'"
    );
  });

  it("keeps the framing, object and base controls locked down", () => {
    const csp = prod();
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-src")).toBe("frame-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
  });

  it("omits upgrade-insecure-requests in report-only mode and in dev", () => {
    // Browsers ignore it in a report-only policy and log an error saying so on
    // every page, which buries the violation reports report-only exists for.
    expect(prod({ reportOnly: true })).not.toContain("upgrade-insecure-requests");
    expect(prod({ isDev: true })).not.toContain("upgrade-insecure-requests");
    expect(prod()).toContain("upgrade-insecure-requests");
  });

  it("interpolates the nonce it was given, not a fresh one", () => {
    // The nonce on the page must match the nonce in the header. Generating one
    // inside this function would guarantee they never match.
    expect(prod({ nonce: "AAAA" })).toContain("'nonce-AAAA'");
    expect(prod({ nonce: "BBBB" })).toContain("'nonce-BBBB'");
  });
});
