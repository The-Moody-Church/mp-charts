# Security Audit Report — 2026-06-23

## Executive Summary

This is a second comprehensive, adversarial security review of the MPNext (mp-charts) application — a Next.js 16 internal church-staff tool that reads and writes **PII** (names, emails, phones, dates of birth, background-check / compliance data) in Ministry Platform (MP) via its OData-style REST API. It follows up the [2026-02-24 audit](./security-audit-2026-02-24.md).

**Overall Risk Assessment: MEDIUM.** The application's fundamentals remain solid — feature-level RBAC is broadly enforced, the filter sanitizers are sound, security headers and rate limiting are in place, and no secrets are committed. The residual risk is concentrated in two systemic gaps (below) that produce a cluster of HIGH findings around **cross-record access (IDOR)** and **filter injection through unvalidated numeric IDs**.

### The architectural fact that amplifies everything

All MP API calls run as a **single shared client-credentials service account with full database access**. The `$userId` parameter is audit-only and protects nothing. There is no database-side row-level authorization to act as a backstop, so **the application's own checks are the only control** between a logged-in low-privilege user and all church PII. Any gap in the app's checks is directly exploitable church-wide.

### Systemic root causes

- **RC1 — No per-*record* authorization.** `requireFeatureAccess(feature)` checks *whether* a user may use a feature (coarse, tool-level), never *which* specific `Contact_ID` / `Participant_ID` / `Contact_Log_ID` / `User_GUID` they may read or write. This is the root cause behind F1, F2, F3, and F4.
- **RC2 — TypeScript types trusted as runtime guards.** Server-action arguments arrive as untrusted React Flight wire data with their types erased. A value annotated `number` can arrive as the string `"0 OR 1=1"`, pass a `!id || id <= 0` guard (`!"0 OR 1=1"` is `false`; `"0 OR 1=1" <= 0` is `NaN <= 0` === `false`), and reach a raw `` `Col = ${id}` `` filter interpolation. This is the root cause of all the filter-injection findings.

### Methodology

15-dimension adversarial agent review (auth, RBAC/IDOR, filter injection, MP provider, SSRF, file upload, server-action validation, API routes, rate limiting, secrets, PII logging, headers/CSP, XSS/redirect, cache poisoning, dependencies). 50 raw findings were produced, then each was independently re-checked by a skeptic pass instructed to *refute* it; **27 were refuted, 23 confirmed.** The HIGH findings were then manually re-verified against source.

### Fixed by the accompanying PR (`security/idor-injection-redirect-hardening`)

- **F1** (filter-injection half) — new `sanitizeId()` applied to every single-value numeric filter sink.
- **F3** — `deleteContactLog` ownership check.
- **F4** — user-profile actions bound to the session GUID.
- **F5** — open-redirect fix in `signin/page.tsx` and the propagated snippet in `security.md`.
- **F2** (partial) — ID coercion applied on the journey/compliance detail paths; the full per-record **scope check is deferred** with `SECURITY TODO(F2)` markers (needs runtime verification + a product decision on what "in scope" means).

---

## Findings Summary

| # | Finding | Severity | Category | Status |
|---|---------|----------|----------|--------|
| F1 | Filter injection + IDOR via unvalidated numeric IDs | **HIGH** | Injection / Broken Access Control | ✅ Injection fixed (PR); IDOR scope → F2 |
| F2 | Cross-participant reads/writes (journey/compliance) accept arbitrary IDs | **HIGH** | Broken Access Control | ✅ Fixed (follow-up PR) — per-record scope enforcement w/ enforce\|report toggle; Zod-on-writes still open |
| F3 | `deleteContactLog` has no ownership check | **HIGH** | Broken Access Control | ✅ Fixed (PR) |
| F4 | User-profile actions accept an arbitrary GUID | **HIGH** | Broken Access Control | ✅ Fixed (PR) |
| F5 | Open redirect via backslash bypass of `getSafeCallbackUrl` | **MEDIUM** | Redirect | ✅ Fixed (PR) |
| F6 | MP error-response body (incl. PII) logged unredacted (~40 sites) | **MEDIUM** | Data Exposure | ✅ Fixed (follow-up PR) |
| F7 | Document uploads skip size check + use wrong rate-limit tier | **LOW** | Input Validation / Abuse | ⚠️ Size check fixed (follow-up PR); `upload` tier reassignment deferred |
| F8 | `bulkAddToSummerBlast` accepts an unbounded array | **MEDIUM** | DoS / Abuse | ✅ Fixed (follow-up PR) |
| F9 | PII-read actions use `general` tier, not `search` | **LOW** | Abuse | ✅ Fixed (follow-up PR) |
| F10 | Unvalidated `year` arg → uncapped cache map growth | **LOW** | DoS | Open |
| F11 | `/admin` page renders shell without server-side role gate | **LOW** | Authorization (defense-in-depth) | Open |
| F12 | Authz profile cached 15 min → revocation lag | **LOW** | Authorization | ✅ Fixed (follow-up PR) — TTL lowered to 2 min |
| F13 | No timeout/`AbortSignal` on outbound fetch | **LOW** | Availability | ✅ Fixed (follow-up PR) |
| F14 | Missing COOP / CORP headers | **LOW** | Configuration | ✅ Fixed (follow-up PR) |
| F15 | `sanitizeFilterValue` does not escape LIKE wildcards | **LOW** | Injection (low) | ✅ Fixed (follow-up PR) — `sanitizeLikeValue` |
| F16 | Rate-limit tiers are independent buckets | **LOW** | Abuse | Open |

---

## Detailed Findings

### F1 — Filter injection + IDOR via unvalidated numeric IDs

**Severity: HIGH · Category: Injection / Broken Access Control · OWASP: A03 (Injection), A01 (Broken Access Control)**

**Affected files (single-value `= ${id}` sinks, no service-layer coercion):**
- `src/services/contactLogService.ts` — `Contact_ID = ${contactId}` (searchContactLogs, getContactLogsByContactId), `Contact_Log_ID = ${contactLogId}` (getContactLogById)
- `src/services/journeyProcessingService.ts` — `Contact_ID = ${contactId}`, `Group_Participant_ID = ${groupParticipantId}` (getParticipantDetail)
- `src/services/complianceProcessingService.ts` — `Contact_ID = ${contactId}`, `Group_Participant_ID = ${groupParticipantId}` (getParticipantDetail)
- `src/services/summerBlastService.ts` — `Response_ID = ${responseId}`, `Contact_ID = ${contactId}` (addToSummerBlast)

**Attack scenario:** The only guard was the action-layer `!id || id <= 0`, which a string bypasses. An authenticated user replays a server-action POST with `contactId` encoded as `"0 OR 1=1"`. It reaches `` `Contact_ID = 0 OR 1=1` ``. Because `getContactLogsByContactId` set **no `top`**, a single call dumped the entire `Contact_Log` table (all pastoral/follow-up notes). Even without injection, supplying a *different valid integer* is trivial cross-record IDOR — IDs are sequential and discoverable via the tools' own listing actions.

**Fix (this PR):** Added `sanitizeId(value: unknown): number` to `filter-sanitize.ts` (accepts only a positive integer or digits-only string; throws on floats, 0, negatives, NaN/Infinity, and any non-digit string). Routed every sink above through it at the service layer (the chokepoint, so it holds regardless of caller). Added a `top: 500` cap to `getContactLogsByContactId`. The per-record **authorization** dimension is tracked under F2.

**Follow-up:** extend the CI `security-lint` job to flag `= ${` inside filter template literals, not just `.join(`.

### F2 — Cross-participant writes accept arbitrary IDs (journey/compliance)

**Severity: HIGH · Category: Broken Access Control**

**Affected files:** `src/components/journey-processing/actions.ts`, `src/components/compliance-processing/actions.ts`, and the corresponding services (`getParticipantDetail`, `createMilestone`/`updateMilestone`/`createCertification`/`createFormResponse`).

**Attack scenario:** A user with access to one journey/compliance tool can read another participant's detail (incl. compliance/background-check data) and create/overwrite `Participant_Milestones` / `Participant_Certifications` / `Form_Responses` against **any** participant church-wide by supplying a different (valid) ID. There is no scope check binding the ID to the tool's tracking group/program, and no Zod `schema:` on the writes. *(Note: there is no `Background_Checks` table write — the original finder overstated that; the confirmed impact is milestone/certification/form-response writes.)*

**Fix (this PR, partial):** `getParticipantDetail` now coerces `contactId`/`participantId`/`groupParticipantId` with `sanitizeId` (closes the injection vector) and carries a `// SECURITY TODO(F2)` marker. **Deferred:** the full per-record scope check — resolve the in-scope participant set for the slug (as `getParticipants()` already does) and reject out-of-scope IDs; add `schema:` validation to the writes. Deferred because a correct scope check needs runtime verification against MP and a product decision on the scope definition; shipping a guessed check risks both false denials and false confidence.

### F3 — `deleteContactLog` has no ownership check

**Severity: HIGH · Category: Broken Access Control**

**Affected files:** `src/components/contact-logs/actions.ts`, `src/services/contactLogService.ts`

**Attack scenario:** `updateContactLog` verified `existingLog.Made_By === userId`, but `deleteContactLog` omitted the check and called an unconditional delete via the service account. Any contact-lookup user could permanently destroy any staffer's/pastor's contact-log notes (the `"use server"` export is a reachable endpoint even though no delete UI exists; target IDs and `Made_By` are returned by `getContactLogsByContactId`).

**Fix (this PR):** `deleteContactLog` now loads the log via `getContactLogById` and rejects unless `existingLog.Made_By === getMpUserId(session)`, mirroring `updateContactLog`. Tests added.

### F4 — User-profile actions accept an arbitrary GUID

**Severity: HIGH · Category: Broken Access Control**

**Affected files:** `src/components/shared-actions/user.ts`, `src/services/userService.ts`

**Attack scenario:** `getCurrentUserProfile(id)` and `getUserAuthorization(id)` called only `requireSession()` and used the client-supplied `id`, never binding it to the session GUID. Any authenticated user could read another MP user's name/email/phone/group memberships and enumerate `isSuperAdmin` + `accessibleFeatures` for that GUID — direct reconnaissance for locating admin accounts to target. (`sanitizeGuid` validates format only, not ownership.)

**Fix (this PR):** Both actions now derive the GUID from the session (`getUserGuid(session)`) and ignore the legacy client argument (retained as `_requestedId` for call-site compatibility). They only ever need the current user's own profile/authorization.

### F5 — Open redirect via backslash bypass of `getSafeCallbackUrl`

**Severity: MEDIUM · Category: Redirect**

**Affected files:** `src/app/signin/page.tsx`, `.claude/rules/security.md`

**Attack scenario:** `getSafeCallbackUrl` accepted `/\evil.com` — it passes `startsWith("/")`, `!startsWith("//")`, and `!includes("://")`. Browsers normalize `\` to `/`, so `window.location.href = callbackUrl` navigated to `https://evil.com`. A staffer (most reliably one already authenticated) clicking `/signin?callbackUrl=/\evil.com` is bounced from the trusted app to a credential-harvesting page. The identical flawed snippet was reproduced verbatim in `security.md`, propagating the bug.

**Fix (this PR):** Rewrote the guard to reject backslashes/control characters, then resolve with `new URL(url, window.location.origin)` and require same-origin (also rejects absolute, protocol-relative, and `javascript:` URLs). Fixed the snippet in `security.md` too.

### F6 — MP error-response body (incl. PII) logged unredacted *(Open)*

**Severity: MEDIUM · Category: Data Exposure.** On an MP `4xx/5xx`, the HTTP client concatenates the echoed request body (containing `$filter` values such as searched email/phone/GUID/DOB) into the thrown `Error.message`; ~40 ungated `console.error('...', error)` sites then write that PII to production stdout/log aggregation. Violates the project's own logging rule. *(Connection timeouts do not trigger this — fetch rejects before the body read — so only the 4xx/5xx path is affected.)* **Fix:** stop concatenating `response.text()` into the thrown message (keep `GET {endpoint} failed: {status}`); log a stable code; gate verbose logging behind `NODE_ENV === 'development'`.

### F7 — Document uploads skip size check + wrong rate-limit tier *(Open)*

**Severity: LOW.** `extractValidatedFiles`/`extractValidatedFilesResult` validate MIME and `size > 0` but never compare against `MAX_FILE_SIZE` (imported but unused), and the document-upload actions enforce the `write` tier (30/min) instead of `upload` (10/10min). `next.config.ts` `bodySizeLimit: '20mb'` caps a single request, so impact is a modest authenticated self-DoS / MP-storage-abuse vector. **Fix:** add the `MAX_FILE_SIZE` check in both helpers; add `enforceRateLimit(session.user.id, 'upload')` to the document-upload actions.

### F8 — `bulkAddToSummerBlast` accepts an unbounded array *(Open)*

**Severity: MEDIUM.** `enforceRateLimit('write')` is charged once before a per-item loop where each item performs 2 MP writes; no array cap and no Zod, so one call can far exceed the 30/min intent (mass garbage `Group_Participants`, closing attacker-chosen `Response_ID`s). *(The loop is sequential, so the original "1.5M writes/min" framing was overstated; the amplification is still real.)* **Fix:** `z.array(itemSchema).max(N)`; charge the limiter per item; coerce `contactId`/`responseId` as positive integers via Zod.

### F9 — PII-read actions use `general` tier not `search` *(Open)*

**Severity: LOW.** `getContactDetails`, `getContactLogsByContactId`, `getHouseholdMembers`, `getContactBadges`, `getContactGroups` apply no explicit tier, running at 120/min instead of the documented `search` tier (30/min) — faster bulk scraping. No new *access* is granted (a contact-lookup user is already authorized to read this). **Fix:** add `enforceRateLimit(session.user.id, 'search')` after the feature check in each PII-read action.

### F10 — Unvalidated `year` arg → uncapped cache growth *(Open)*

**Severity: LOW.** `getDashboardMetrics(year)` flows a client-supplied `year` into both the `cacheTag` and the uncapped `serviceCache` Map (no LRU/size cap), and fires the heavy dashboard query set per cold key. A dashboard user iterating distinct/fractional `year` values grows process memory and amplifies MP load (throttled by 120/min). No cross-user exposure — the cache is deliberately shared aggregate data. **Fix:** validate `year` with `Number.isInteger` within `[currentYear-10, currentYear+1]`; bound `serviceCache` with a max-entries/LRU policy.

### F11 — `/admin` renders shell without server-side role gate *(Open)*

**Severity: LOW (defense-in-depth).** `proxy.ts` checks only session-cookie presence (no role check), and `/admin` and sub-pages have no page-level `requireFeatureAccess('admin')`, so a non-admin can render the admin UI shell. **Not privilege escalation** — every admin data/mutation action calls `requireFeatureAccess('admin')` (server-derived from MP groups, non-spoofable), so no config/PII loads and no mutation succeeds; only static UI chrome leaks. **Fix:** add an async admin layout that calls `requireFeatureAccess('admin')` and redirects non-admins.

### F12 — Authz profile cached 15 min → revocation lag *(Open)*

**Severity: LOW.** `requireFeatureAccess` relies on `UserService.getUserProfile`, cached 15 min per User_GUID (invalidated only by the admin `flushProfileCache`). Revoking a user's group membership directly in MP is not honored for up to 15 min. Per-user keyed (no cross-user leak); grants no access the user never had. **Fix:** lower the authz TTL (1–2 min) or skip the cache for the access-control read; optionally an MP-webhook-triggered flush.

### F13 — No timeout on outbound fetch *(Open)*

**Severity: LOW (availability).** No fetch sets `AbortSignal`/timeout/`redirect` (MP API, OAuth, userinfo, file, GitHub), so a slow/hung upstream can pin the shared service-account request path with no abort ceiling. No attacker-controlled URL host exists, so SSRF does not apply. **Fix:** centralize `AbortSignal.timeout(~15s)` in `HttpClient` and apply to the other callers; optionally `redirect: 'error'`.

### F14 — Missing COOP / CORP headers *(Open)*

**Severity: LOW.** `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` are absent. `X-Frame-Options: DENY` and SameSite cookies already cover the practical framing/state-inference vectors, and the app is auth-gated behind Cloudflare. **Fix:** add `COOP: same-origin` and `CORP: same-origin` to `next.config.ts` `headers()` (leave COEP unset to avoid breaking cross-origin MP file embeds).

### F15 — `sanitizeFilterValue` does not escape LIKE wildcards *(Open)*

**Severity: LOW.** `sanitizeFilterValue` only doubles single quotes; in LIKE contexts (`getAvailablePrograms`/`getAvailableGroups`, `journey-tools/actions.ts`) `%`/`_`/`[` over-match. Super-admin-only over non-PII catalog tables (`top: 50`), no quote breakout. **Fix:** add a dedicated LIKE-escaping helper (`%`→`[%]`, `_`→`[_]`, `[`→`[[]` plus quote doubling) for LIKE clauses; keep `sanitizeFilterValue` for equality contexts.

### F16 — Rate-limit tiers are independent buckets *(Open)*

**Severity: LOW.** Key is `${userId}:${tier}` with `userId` = MP User_GUID (non-rotatable, good), but tiers are independent buckets, so one user can sustain ~120 read + 30 write + 30 search ops/min against the shared service account; and any future unauthenticated path would have no limiter. Throttles rather than enabling new access. **Fix:** consider an aggregate per-user cap across tiers; ensure any future unauthenticated path gets an IP-keyed limiter.

---

## What's Already Done Well

- **Feature-level RBAC is enforced** via `requireFeatureAccess(feature)` across nearly all server actions (admin, contact-lookup, dashboard, manage-members, summer-blast, journey/compliance) — server-derived from MP User Groups, non-spoofable.
- **Filter sanitizers are sound** — `sanitizeGuid` is anchored (`^…$`); `sanitizeIds` rejects empty sets (throws); `IN (...)` sites consistently use the sanitizers.
- **No secrets in git history**; `.env*.local` are gitignored.
- **No dangerous sinks** — no `eval` / `new Function` / `child_process` / `dangerouslySetInnerHTML`.
- **`security-lint` CI job** greps for the `.join(` filter anti-pattern on every push/PR.
- **Security headers present** — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`.
- **Rate limiting** wired into `requireSession()` with stricter explicit tiers.

## Refuted but Latent (worth knowing)

These were investigated and **refuted as exploitable today**, but are fragile and cheap to harden:

- **Background-check `Report_Url` rendered as `href={reportUrl}`** with no scheme allowlist (`compliance-detail-modal.tsx`). Safe today *only* because `target="_blank" rel="noopener noreferrer"` makes browsers refuse to execute a `javascript:` URL in a new browsing context, and writing the field needs MP edit rights. It is **one removed `target="_blank"` away from live stored XSS.** Add an `http`/`https`/`mailto`/`tel` allowlist via `new URL()` and render non-conforming values as text.
- ~~**Upload MIME validated by client-controlled `file.type` only** (no magic bytes).~~ ✅ **Fixed (follow-up PR)** — `fileMagicMatchesType()` now verifies the leading bytes match the claimed type across all upload validators (photo + document); text/csv are allowed without a content check (no reliable signature).

## Notes / Hygiene

- `data/summer-blast-config.json` is git-tracked while its sibling runtime config files are gitignored — review whether it should be ignored.
- A stray `.env copy.local` duplicates live local secrets — safe (gitignored) but worth removing.
- ~~An unused `openai` dependency ships in the production bundle~~ ✅ removed (follow-up PR). `brace-expansion` ReDoS advisory is dev-toolchain only (under `@typescript-eslint`, not in the prod image, below `high`) — left to clear on the next eslint-toolchain bump. `data/summer-blast-config.json` is intentionally git-tracked (the feature throws if it's missing — it must ship in the image), unlike the runtime-generated sibling configs.
