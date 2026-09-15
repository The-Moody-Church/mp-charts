import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetTableRecords } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
  },
}));

// The real @/lib/auth builds a genericOAuth provider from MP's discovery
// document. Stub fetch so importing it needs no network.
vi.stubGlobal(
  "fetch",
  vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  })
);

import { GET, POST, allowedAuthRoutes } from "./route";

/**
 * F7 — deny-by-default on the better-auth catch-all.
 *
 * better-auth 1.6 mounts ~33 endpoints here; the browser uses three. These
 * tests drive the REAL exported handlers with real NextRequest objects, so
 * they fail if the allowlist is widened, bypassed, or removed.
 */
describe("better-auth route allowlist", () => {
  const req = (path: string, method: "GET" | "POST") =>
    new NextRequest(`http://localhost:3000/api/auth${path}`, { method });

  it("pins the exact allowlist", () => {
    // Deliberately asserted by value: widening this list is a security
    // decision and should require editing a test that says so.
    expect(allowedAuthRoutes).toEqual({
      GET: ["/get-session", "/oauth2/callback/ministryplatform"],
      POST: ["/sign-in/oauth2"],
    });
  });

  it.each(allowedAuthRoutes.GET)("lets GET %s reach better-auth", async (path) => {
    expect((await GET(req(path, "GET"))).status).not.toBe(404);
  });

  it("lets POST /sign-in/oauth2 reach better-auth", async () => {
    // better-auth answers 400 on an empty body — the point is that it is
    // better-auth answering, not our 404.
    expect((await POST(req("/sign-in/oauth2", "POST"))).status).not.toBe(404);
  });

  // The endpoints the advisory and the F7 review actually care about.
  it.each([
    "/update-user",
    "/list-accounts",
    "/link-social",
    "/unlink-account",
    "/get-access-token",
    "/refresh-token",
    "/list-sessions",
    "/revoke-sessions",
    "/sign-up/email",
    "/sign-in/email",
    "/update-session",
    "/sign-out",
    "/error",
    "/ok",
  ])("404s POST %s without touching better-auth", async (path) => {
    expect((await POST(req(path, "POST"))).status).toBe(404);
  });

  it.each(["/list-accounts", "/ok", "/error", "/get-access-token"])(
    "404s GET %s",
    async (path) => {
      expect((await GET(req(path, "GET"))).status).toBe(404);
    }
  );

  it("does not let an allowed GET path through on POST", async () => {
    expect((await POST(req("/get-session", "POST"))).status).toBe(404);
  });

  it("does not let an allowed POST path through on GET", async () => {
    expect((await GET(req("/sign-in/oauth2", "GET"))).status).toBe(404);
  });

  describe("path normalization cannot be used to bypass the exact match", () => {
    // Our 404 carries this body; better-auth's own 404 body is empty. That is
    // what lets these tests prove the request was refused HERE and never
    // reached better-auth, rather than merely observing a 404 status.
    const refusedByUs = async (res: Response) =>
      res.status === 404 && (await res.text()) === "Not Found";

    it.each(["/list-accounts/", "/list-accounts///", "/update-user/"])(
      "refuses %s — a trailing slash is not a bypass",
      async (path) => {
        expect(await refusedByUs(await GET(req(path, "GET")))).toBe(true);
      }
    );

    it.each(["/get-sessionX", "/get-session/extra", "/sign-in/oauth2X"])(
      "refuses %s — a prefix is not a match",
      async (path) => {
        expect(await refusedByUs(await GET(req(path, "GET")))).toBe(true);
      }
    );

    it("resolves traversal before matching, so it cannot reach a disallowed path", async () => {
      // NextRequest/URL normalize this to /api/auth/list-accounts before our
      // handler sees it, so it is refused as the real path it resolves to.
      expect(await refusedByUs(await GET(req("/get-session/../list-accounts", "GET")))).toBe(
        true
      );
    });

    it("documents that better-auth itself 404s a trailing slash on an allowed path", async () => {
      // /get-session/ normalizes past OUR allowlist (so it is not refused by
      // us) but better-auth then 404s it on its own. Recorded so a future
      // reader does not mistake this for the allowlist misfiring. Either way
      // the outcome fails closed.
      const res = await GET(req("/get-session/", "GET"));
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    });
  });
});
