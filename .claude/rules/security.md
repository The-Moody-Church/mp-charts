# Security Best Practices

This project handles **PII** (names, emails, phones, dates of birth, background check data). All code must follow these security practices. These rules apply during development — catch issues at write time, not in review.

## Ministry Platform Data Safety — MANDATORY

**NEVER delete, update, or create records in Ministry Platform without explicit user confirmation first.** No exceptions — not agents, scripts, "cleanup" operations, or "it's just one record."

Ministry Platform is a shared production database containing real church member data — contacts, communications, subscriptions, donations, groups, events. Unauthorized writes can affect thousands of people.

**Before ANY write operation** (`deleteTableRecords`, `updateTableRecords`, `createTableRecords`, stored procedures that mutate state, or any HTTP `POST`/`PUT`/`DELETE` to the MP API):

1. **Stop.** Do not execute the operation.
2. **Show the user** exactly what will be affected: the table name, the record IDs, the fields that will change, and the old → new values where applicable.
3. **Wait for the user to explicitly say yes** before proceeding.
4. If the user says no, do not retry or suggest alternatives unless asked.

**Read-only operations are always fine** — `getTableRecords`, `GET` requests. Only writes require confirmation.

This rule applies to all agents, subagents, scripts, hooks, and scheduled tasks. **There are zero exceptions.**

## Filter & Query Safety

Ministry Platform's REST API accepts OData-style `$filter` parameters that map to SQL WHERE clauses. **Never interpolate raw strings into filters.**

```typescript
import { sanitizeLikeValue, sanitizeFilterValue, sanitizeId, sanitizeIds, sanitizeGuid } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

// LIKE clauses — escapes quotes AND neutralizes wildcards (% _ [) via character
// classes ([%], [_], [[]), so user input matches literally. No ESCAPE clause needed.
const safe = sanitizeLikeValue(userInput);
filter: `Last_Name LIKE '%${safe}%'`

// Non-LIKE quoted strings — escape single quotes
const value = sanitizeFilterValue(userInput);
filter: `Membership_Status = '${value}'`

// Single numeric IDs — validates a positive integer, throws otherwise.
// React Flight args are type-erased: a "number" parameter can arrive as the
// string "1 OR 1=1", which passes truthiness checks like `!id || id <= 0`.
const safeId = sanitizeId(contactId);
filter: `Contact_ID = ${safeId}`

// IN clauses — validate all IDs are finite positive numbers
filter: `Contact_ID IN (${sanitizeIds(ids)})`

// GUID values — validate format before interpolation
const validGuid = sanitizeGuid(guid);
filter: `Contact_GUID = '${validGuid}'`
```

**Anti-patterns — NEVER do these:**
```typescript
filter: `Last_Name LIKE '%${search}%'`          // breaks on O'Brien, injectable
filter: `Last_Name LIKE '%${sanitizeFilterValue(s)}%'` // quotes safe, but % and _ still act as wildcards
filter: `Contact_ID = ${id}`                     // type-erased: "1 OR 1=1" interpolates verbatim
filter: `Contact_ID IN (${ids.join(',')})`       // no numeric validation
filter: `User_GUID = '${profile.sub}'`           // no format validation
```

**Rule**: Every string interpolated into a `filter:` parameter MUST pass through a sanitization function from `filter-sanitize.ts`. This applies to:
- User search input in LIKE clauses -> `sanitizeLikeValue()`
- User input in other quoted-string comparisons -> `sanitizeFilterValue()`
- Single numeric IDs (even typed as `number`) -> `sanitizeId()` — validate at the **action boundary** (reassign: `id = sanitizeId(id)`), not just in the service; it also enforces the safe-integer bound, so an unsafe-integer string can't silently coerce to the wrong record ID
- Arrays of IDs (even from DB results) -> `sanitizeIds()` or `sanitizeIdsOptional()`
- GUIDs (even from trusted sources like OIDC) -> `sanitizeGuid()`

### CI Enforcement

The CI workflow includes a `security-lint` job that greps for `.join(` near `filter` patterns in TypeScript source files. This catches the most common anti-pattern (using `.join(",")` instead of `sanitizeIds()` in filter `IN (...)` clauses). The check runs on every push and PR to `main`.

If you need `.join()` in a non-filter context and it triggers a false positive, add a `// filter-safety-ignore` comment on the same line.

### CI Job Layout

`.github/workflows/docker-build-push.yml` has three jobs, split by whether they need repository secrets:

| Job | Secrets? | Runs for Dependabot? | What it does |
|-----|----------|----------------------|--------------|
| `security-lint` | no | yes | the `.join()` filter grep above |
| `verify` | no | **yes** | `npm ci`, `npm audit --audit-level=high`, `npm run lint`, `npm run test:run`, `npm run build`, local Docker build (`push: false`), Trivy scan |
| `build-scan-and-push` | **yes** | no (`if: github.actor != 'dependabot[bot]'`) | registry login, build + push `:${sha}`, Trivy, retag `:dev` / `:latest` / `:main` |

**Keep verification steps in `verify`, not in `build-scan-and-push`.** Dependabot PRs cannot access
Actions secrets, so the registry job is gated on the actor — and before `verify` existed, that gate
skipped `npm audit`, the build and the image scan for every bot PR (they merged on `security-lint`
alone, in ~10s). Anything that does not need the registry belongs in `verify` so it covers all actors.

**Both build steps set `no-cache-filters: runner`.** The runner stage's `apk upgrade` only patches
Alpine CVEs if its layer actually rebuilds; a cached layer pins old packages and fails the Trivy gate
as soon as a new OS CVE lands (CVE-2026-14456, 2026-09-01). The two jobs use different caches
(`verify`: GHA, evicted after ~7 idle days; `build-scan-and-push`: registry `buildcache`, never
expires), so without the filter they can even disagree — verify green, push job red. Keep the filter
on **both** steps.

**`npm audit --audit-level=high` is a hard deploy gate.** It runs before any image is built, so an
unresolved HIGH advisory blocks *all* deploys, not just dependency PRs. This has bitten twice
(2026-07-10 after #190, and a 27-day production freeze discovered 2026-08-06). Run it locally before
pushing.

## File Upload Validation

All file upload endpoints must validate MIME type **and** file size on the server side. Limits match Ministry Platform: **20 MB max**, standard file formats (PNG, JPG, BMP, GIF, PDF, TXT, CSV):

```typescript
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'text/plain', 'text/csv'];

// Validate before processing
if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
  return { success: false, error: `Invalid file type: ${file.type}` };
}
```

## URL & Redirect Safety

Never use user-supplied URLs for redirects without validation:

Do **not** validate with string-prefix checks like `startsWith("//")` / `includes("://")` — they miss the backslash bypass: browsers normalize `\` to `/`, so `"/\evil.com"` passes those checks yet navigates off-site. Resolve against your own origin and require it to stay same-origin — and then check the **output** too, because dot segments are removed while parsing: `"/.//evil.com"` resolves on our origin to the pathname `"//evil.com"`, which is protocol-relative when navigated to. The live copy is `src/components/sign-in/sign-in.tsx`, tested by `safe-callback-url.test.ts` beside it:

```typescript
// Validate callback URLs are same-origin (client component — uses window.location)
function getSafeCallbackUrl(url: string | null): string {
  if (!url) return "/";
  // Reject backslashes and control chars first (browsers normalize "\" to "/").
  if (/[\\\x00-\x1f]/.test(url)) return "/";
  try {
    const resolved = new URL(url, window.location.origin);
    if (resolved.origin !== window.location.origin) return "/";
    const safe = resolved.pathname + resolved.search + resolved.hash;
    // Dot segments are removed while parsing: "/.//evil.com" resolves on OUR
    // origin to the pathname "//evil.com", which is protocol-relative when
    // navigated to. Check the output, not just the input.
    if (safe.startsWith("//")) return "/";
    // Not a security check: better-auth stores the callback in the oauth_state
    // cookie (~2 bytes a character), which the browser drops past ~1754
    // characters. Below that, and below the 2048 server cap, sign in to home.
    return safe.length > MAX_SIGN_IN_CALLBACK_URL_LENGTH ? "/" : safe; // 1536
  } catch {
    return "/";
  }
}
```

## Logging & PII

**Never log PII in production.** This includes contact records, emails, phone numbers, notes, and any data from Ministry Platform tables that contain personal information.

```typescript
// Log operation context, not data
console.error("Error updating contact:", error);

// Gate verbose logging behind NODE_ENV
if (process.env.NODE_ENV === 'development') {
  console.log("Debug:", data);
}

// NEVER log PII
console.log("Contact:", JSON.stringify(record));         // leaks email, phone
console.log("HTTP PUT:", JSON.stringify(body, null, 2)); // leaks request payloads
```

## Better Auth Endpoint Exposure — MANDATORY

The better-auth catch-all route mounts far more HTTP endpoints than this app uses. Two controls keep that surface closed, and **both must stay**:

1. **`allowedAuthRoutes` in `src/app/api/auth/[...all]/route.ts`** — a deny-by-default allowlist. Only the exact paths our browser client calls reach better-auth; everything else returns a plain 404 without touching it. Exact string match only: no regex, no prefix matching.
2. **`disabledAuthPaths` in `src/lib/auth.ts`** — passed as `disabledPaths`, matched in better-auth's router before rate limiting, plugins and `sessionMiddleware`.

**Adding a browser-side better-auth call means adding its path to the allowlist first** — the 404 is designed to make that omission loud. Never widen either list to make an unrelated failure go away.

The one POST the allowlist admits, `/sign-in/social`, is body-filtered in `route.ts` before better-auth (and before its rate limiter) sees it: exactly `provider` + `callbackURL` (`allowedSignInSocialKeys`), exactly `application/json` (an anchored match — `trim()` would also strip U+00A0 and let a value past that better-auth then parses differently), at most 4096 bytes, and a `callbackURL` string of at most 2048 characters (`MAX_CALLBACK_URL_LENGTH`). Every refusal is the same 404. The sign-in page itself sends less: `getSafeCallbackUrl` sends `/` above `MAX_SIGN_IN_CALLBACK_URL_LENGTH` (1536), because the 2048 cap does not fit in a cookie — better-auth's `oauth_state` value is 556 + 2 × length bytes (better-auth 1.7.5), and past 1754 characters, with the production `__Secure-better-auth.oauth_state` name, it exceeds the browser's 4096-byte limit, is silently dropped, and the MP callback ends on `/auth-error?error=state_mismatch`. `route.test.ts` measures the real cookie at both limits. The 4096-byte cap bounds what the filter parses and better-auth receives, **not** what the server buffers: `src/proxy.ts` matches `/api/auth`, so Next has already read the whole body (up to its 10 MB proxy clone limit) and waited for it to end before the route runs — up to about 10 MB per anonymous request, before the filter and the rate limiter. That residual is the separate proxy body-size item, not done here.

Why this matters concretely: `POST /update-user` takes a body of `z.record(z.string(), z.any())` and copies any additional field declared `input !== false` straight onto the session, with no validator. Our `userGuid`/`mpUserId`/`mpContactId` must stay `input: true` for sign-in to work, so before this was closed any authenticated user could POST themselves another user's MP identity and inherit their User Groups and audit attribution (GHSA-pqxp-c5mr-5398). `input: false` is not an alternative — the same flag governs whether the OAuth profile may populate the field, so setting it breaks sign-in.

**If either control is ever removed, rotate `BETTER_AUTH_SECRET`.** Closing the endpoint does not revoke a session already forged, and with no database there is no session table to clear. Rotating the secret invalidates every signed cookie at once.

> **Erratum (2026-09-29) on GHSA-pqxp-c5mr-5398.** This section used to say a forged session lived "in the JWT cookie cache for up to an hour". That was wrong for the configuration in force until 2026-09-29: better-auth silently turned `cookieCache.refreshCache` on (stateless default) and slid `expiresAt` daily, so a forged or copied cookie pair re-minted itself and could persist **up to the session's `expiresAt` — 7 days, self-renewing** — and a copied `session_token` alone lasted until the container restarted. The 2026-09-29 session settings (below) end every session that existed before that deploy within 1h of it: the restart empties the in-memory store, and `refreshCache: false` stops a cookie from re-minting itself once its one-hour cache lapses.

## Better Auth Sessions — MANDATORY

There is no database: the signed `session_token` + `session_data` cookies are the session, backed by an in-memory store that sign-out can delete from but that cannot recall a copied cookie. These settings in `src/lib/auth.ts` put a hard ceiling on any session's life. **Do not remove or "tidy" any of them** — each is pinned by `src/lib/auth.session-lifetime.test.ts` or `src/lib/auth.shared-instance.test.ts`.

| Setting | Why |
|---|---|
| `auth = sharedInstance(Symbol.for("tmc.auth"), createAuth)` | Next loads `auth.ts` once per bundle layer. With a `betterAuth()` per copy, the OAuth callback stored the session in the route handler's store and sign-out deleted it from the server action's, empty one. One instance per process fixes sign-out and lets server components/actions see the session after the cookie cache lapses |
| `session.expiresIn: 12h` | `expiresAt` is fixed at sign-in; nothing outlives it. better-auth's default is 7 days. Matches the id-token store's 12h TTL |
| `session.disableSessionRefresh: true` | Otherwise the store slides `expiresAt` forward once a day |
| `cookieCache: { maxAge: 1h, strategy: "jwt", refreshCache: false }` | `refreshCache: false` **must be explicit** — with no database better-auth merges `true` under our config, which re-signs `session_data` from the cookie alone. With `false`, a cookie with no live row behind it dies within 1h |

What users see: they go back through sign-in at least every 12h, and within 1h of every deploy or restart (a silent redirect while their MP session is alive).

**Auth option edits need a `next dev` restart.** Hot reload re-evaluates `auth.ts` but `sharedInstance` returns the instance already on `globalThis`.

**Emergency "sign everyone out"**: rotate `BETTER_AUTH_SECRET` (or add `cookieCache.version` and bump it).

**The user's MP OAuth tokens are not retained.** `account.storeAccountCookie: false` keeps them out of the browser (better-auth defaults it on without a database), and `databaseHooks.account` strips the access/refresh tokens and expiries before the in-memory row is written. The idToken is kept for sign-out's `id_token_hint` fallback. Nothing in this app acts as the user against MP after sign-in; if something ever needs to, add it deliberately.

## Identity & Email

**Never use `session.user.email` for display, lookup or mail.** It is a synthetic `<sub>@mp.invalid` value derived from the MP `User_GUID`. The real Ministry Platform address is on `session.user.mpEmail`, which is **nullable** — MP does not require an email.

This exists because better-auth's `email` column is required and unique, and its OAuth callback uses `findUserByEmail` as a fallback identity lookup, while **Ministry Platform enforces no uniqueness on email at all**. Households routinely share one address across contacts who each hold a `dp_Users` login. Keying on email meant the second person to sign in inherited the first person's identity.

## Attribution is Server-Authoritative

Any value that decides **who did this** or **whose record this is** comes from the server, never from a caller-shaped payload.

For contact logs (`src/services/contactLogService.ts`):

| Field | Create | Update |
|---|---|---|
| `Made_By` | the service's `madeBy` argument, from the session | **never sent** — MP preserves the original author |
| `Contact_ID` | caller's subject contact, `sanitizeId`'d | **never sent** — a log cannot be re-parented |

The runtime control is the Zod **`.omit()`** in the service: a `z.object` parse *strips* keys the schema does not declare, so a smuggled key is dropped rather than merely untyped. A narrow TypeScript parameter type guards nothing — types are erased at runtime and a server action is a POST endpoint whose payload shape the caller controls.

Two rules that follow:
- **Pass the acting user as a separate argument**, never as a field inside the data object. One source of attribution; two layers stamping it could drift.
- **Do not add `.passthrough()` or `z.looseObject`** to `ContactLogSchema`, and do not regenerate it into that shape — the strip is the control, and the smuggled-key tests are what would catch it.

All three writes pass `{ $userId }` so MP's audit trail names the staff member rather than the API service account.

## Authentication & Authorization

- **The auth environment is checked when `src/lib/auth.ts` loads** (`assertAuthEnvironment`): a missing/empty `BETTER_AUTH_SECRET`, better-auth's public default secret, one shorter than 32 characters, any `BETTER_AUTH_SECRETS`, or a truthy `TEST` with `NODE_ENV=production` all throw, and the message never contains the value. "Truthy" is better-auth's own reading — anything but unset, empty or exactly `false`, so **`TEST=0` is refused too**; confirm a deploy target's `.env` has no such line before promoting a build. There is no `NEXTAUTH_SECRET` fallback. `next build` is exempt (`NEXT_PHASE=phase-production-build`). Next loads route modules lazily, so on a running server this shows as a **500 and a logged `[auth] …` reason on the first request that needs auth**, not a process exit — check the log, not just whether the container is up. `advanced.disableOriginCheck: false` is pinned so a stray `TEST` cannot switch off the Origin check
- Every server action MUST call `requireSession()` before any data access
- Use `getMpUserId(session)` for audit attribution on write operations
- The proxy (`src/proxy.ts`) protects routes but only checks session presence — it does not check roles
- IDOR risk: server actions accept record IDs from clients without per-record authorization. When adding new endpoints that access sensitive data, consider whether the requesting user should have access to that specific record

## Security Headers

Security headers are configured in `next.config.ts` via the `headers()` function. When modifying, ensure these headers remain present:
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Strict-Transport-Security` — enforces HTTPS
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables unused browser APIs

## Rate Limiting

Server actions are rate-limited per authenticated user via `src/lib/rate-limit.ts` (in-memory sliding window). The general limit is enforced automatically in `requireSession()`; stricter tiers must be called explicitly with `enforceRateLimit()`:

```typescript
import { enforceRateLimit } from "@/lib/rate-limit";

// In a write server action:
const session = await requireSession(); // auto-enforces "general" (120/min)
enforceRateLimit(session.user.id, "write"); // explicit stricter limit (30/min)
```

| Tier | Limit | Window | Applied to |
|------|-------|--------|------------|
| `general` | 120 req | 1 min | All server actions (via `requireSession()`) |
| `write` | 30 req | 1 min | Create/update/delete operations |
| `upload` | 10 req | 10 min | Photo and document uploads |
| `search` | 30 req | 1 min | Contact search (PII access) |
| `cacheRefresh` | 5 req | 1 hour | Dashboard cache invalidation |

### better-auth's own limiter (the sign-in endpoints)

Separate from the table above: better-auth rate-limits its own endpoints, **in production only**, keyed on `<client IP>|<path>`. `/sign-in/social` is **10 per 10 s** (`authRateLimitCustomRules` in `src/lib/auth.ts`; better-auth's built-in `/sign-in*` rule is 3, too few for staff behind one office IP when a deploy sends everyone back through sign-in).

The client IP comes from `AUTH_IP_ADDRESS_HEADERS` / `AUTH_TRUSTED_PROXIES` (`parseIpAddressOptions`). An invalid entry — including a trusted proxy that better-auth's own parser would warn about and drop, such as `fe80::1%lo0` — throws when `auth.ts` loads, so a typo in the operator step shows as every auth request returning 500 with an `[auth] …` log line while the container stays up and reports healthy. Check the log after setting them. Both blank is better-auth's default: `x-forwarded-for`, trusted only when it holds a single valid IP. Verified in better-auth 1.7.5 (`dist/api/rate-limiter/index.mjs`) and on a local production build:

- A request whose IP cannot be resolved — the configured header missing, or a multi-hop `x-forwarded-for` chain — is **not** skipped. It is counted in **one shared bucket per path** (`no-trusted-ip|<path>`), and the process logs `Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket` **once**.
- `AUTH_IP_ADDRESS_HEADERS` **replaces** `x-forwarded-for`; it is not a fallback.
- Name a header only if the edge always overwrites it (`cf-connecting-ip` when every request arrives through Cloudflare). A header clients can set lets them rotate past the limit or lock someone else out. With nothing in front, `next start` fills a missing `x-forwarded-for` with the socket address, and a client-supplied one is believed.

When adding new server actions:
- **Read-only actions**: No extra work — `requireSession()` handles the general limit
- **Write actions**: Add `enforceRateLimit(session.user.id, "write")` after `requireSession()`
- **File uploads**: Add `enforceRateLimit(session.user.id, "upload")` after `requireSession()`

## Security Audit Reference

The full security audit report is at `.claude/notes/security-audit-2026-02-24.md`. It documents all 15 findings, their status, and remaining open items (RBAC, IDOR mitigation).

Pre-PR security review checklist: `.claude/notes/security-review-checklist.md`
