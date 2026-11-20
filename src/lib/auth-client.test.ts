import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The browser auth client polls /get-session every 5 minutes while it holds a
 * session (batch 6). Driven through the REAL better-auth client with a stubbed
 * fetch and fake timers, so a removed `sessionOptions.refetchInterval` (or a
 * better-auth release that stops honouring it) fails here.
 */

const LIVE = {
  session: { id: "s1", token: "t", userId: "u1", expiresAt: "2099-01-01T00:00:00.000Z" },
  user: { id: "u1", name: "Sam Ortiz", userGuid: "ab12cd34-ef56-7890-abcd-ef1234567890" },
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

const sessionCalls = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([input]) => String(input instanceof Request ? input.url : input).includes("/get-session"))
    .length;

describe("authClient session polling", () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function mountSessionAtom(body: unknown) {
    const fetchMock = vi.fn(async () => json(body));
    vi.stubGlobal("fetch", fetchMock);
    const { authClient, SESSION_REFETCH_INTERVAL_SECONDS } = await import("./auth-client");
    // Subscribing mounts the atom: the mount fetch plus the refresh manager.
    unsubscribe = authClient.$store.atoms.session.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    return { fetchMock, authClient, interval: SESSION_REFETCH_INTERVAL_SECONDS };
  }

  it("polls every 300 s while a session is held", async () => {
    const { fetchMock, authClient, interval } = await mountSessionAtom(LIVE);
    expect(interval).toBe(300);
    expect(sessionCalls(fetchMock)).toBe(1);
    expect(authClient.$store.atoms.session.get().data).not.toBeNull();

    await vi.advanceTimersByTimeAsync(299_000);
    expect(sessionCalls(fetchMock)).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(sessionCalls(fetchMock)).toBe(2);

    await vi.advanceTimersByTimeAsync(300_000);
    expect(sessionCalls(fetchMock)).toBe(3);
  });

  it("does not poll once there is no session (better-auth's shouldPollSession)", async () => {
    const { fetchMock, authClient } = await mountSessionAtom(null);
    expect(sessionCalls(fetchMock)).toBe(1);
    expect(authClient.$store.atoms.session.get().data).toBeNull();

    await vi.advanceTimersByTimeAsync(900_000);

    expect(sessionCalls(fetchMock)).toBe(1);
  });
});
