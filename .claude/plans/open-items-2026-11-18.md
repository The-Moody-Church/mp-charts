# Open items analysis — 2026-11-18

Read-only analysis of audit LOW findings N9–N19, #297, and upstream MPNext `75d249d..aa1bc64` (#98–#107). Workflow run `wf_e5a48cb3-0e2` (10 analysts + 1 critic). Nothing implemented.

## Decisions (user, 2026-11-18)

- **N17:** port upstream's lazy id_token verifier (option C) to all four apps, with a 60 s clock tolerance and a longer JWKS cache than upstream's. Sign-in will depend on MP's JWKS endpoint, a dependency accepted knowingly. Update CLAUDE.md's "no `discoveryUrl`" notes (discovery stays lazy, never fetched at boot).
- **ace4566:** keep the silent re-sign-in through `/signin`. Do not adopt `/signed-out`.
- **N16:** yes to both, `cookieCache.strategy: "jwe"` and stripping token/ipAddress/userAgent from `/get-session`. Its own PR, mirrored to all four repos, pins and docs updated in the same commit, soaked on `:dev`.
- **Public repo:** add an MIT LICENSE that keeps MPNext's notice. Future audits stay in the repo (no change).
- **Batch 8 (user, 2026-11-20):** take the 5aa0b5e 401 refresh-and-retry (one shared refresh, one retry per request, `token === rejectedToken` guard) in all four; **skip** the 5-30 s negative cache (batch 3's single-flight already removed the stampede, and the cache would make manual dashboard refreshes fail fast and still spend a `cacheRefresh` token); **delete** the dead user-token mode in all four (re-checked 2026-11-20: no caller passes a user token in any of the four).
- **Batch 6 (user, 2026-11-20):** SessionGuard warns and waits while a page holds unsaved edits (shipped: mp-charts #327, event-manager #98, mp-senior-care #260, music-tools #214).
- Still open: #297 accept (recommended), deleting the dead contact code (mostly done in batch 4), the `CommunicationType` enum.

## Critic: verification, conflicts, gaps, PR batches, decisions

## Refuted claims

I re-checked the most consequential claims against the current tree (main dbf2050). Only one rationale is refuted; the rest held. The corrections and inconsistencies below should be fixed before implementation.

**Refuted**
- **upstream:defd338, second entry (the "port" one).** It says every `'use server'` export is a reachable POST endpoint. That is false for the current build, and it is also the premise of audit N11. `.next/server/server-reference-manifest.json` (built 2026-11-17 21:49) has 80 entries and contains 0 occurrences of `getContactLogById` or `deleteContactLog`. Only one `getContactLogsByContactId` appears: the contact-lookup-details copy, per N11's own check. The three contact-logs orphans (`src/components/contact-logs/actions.ts:102, :139, :213`) are latent, not live. N11's entry has this right. The removal recommendation still stands.

**Verified (held up)**
- **N9.** `src/proxy.ts:57` still does `startsWith('/api')`. The matcher at `:110` has unanchored `_next/static|_next/image|favicon.ico`. All three siblings have the same `startsWith('/api')`: event-manager `proxy.ts:57`, mp-senior-care `:88`, music-db `:64`.
- **N16.**
  - `auth.ts:621` sets `strategy: "jwt"`, and `:765-772` returns `session` unchanged.
  - Removing `token`, `ipAddress` and `userAgent` in `customSession` does not break sign-out. `findMpIdToken` keys on `session.user.userGuid` and `session.user.id` (`user-menu/actions.ts:35-56`), and `auth.api.signOut` reads the cookie. No non-test `src` code reads `session.token`, `ipAddress` or `userAgent`.
  - `jwe` is better-auth's own stateless default (`node_modules/better-auth/dist/context/create-context.mjs:49-54`).
  - The pin is at `auth.session-lifetime.test.ts:156`. All three siblings also use `strategy: "jwt"`.
- **N12 / upstream:5aa0b5e.**
  - `client.ts:68-94` has no single-flight and no ceiling on `expires_in`. A value of 1e13 gives an Invalid Date, after which the token is never refreshed.
  - `client-credentials.ts:26-38` has no timeout, no `redirect` option and no body validation.
  - The user-token mode really is dead. Every `getInstance(accessToken?)` caller passes nothing, and no `new MPHelper({ accessToken })` call passes a value.
- **N14.**
  - `next-server.js:193` calls `render404` for `images.unoptimized` before `validateParams`.
  - `logging.serverFunctions` exists (`config-shared.d.ts:307`, `config-schema.js:760`).
  - `REVIEWED_OPTIONS` is at `src/test-only-imports.test.ts:376`. `next.config.ts` has none of the three keys.
- **#297.** I confirmed independently that 73 of 80 manifest action IDs appear in `.next/static` chunks.
- **N13.** `security-headers.ts:31-38` is `new URL(raw).origin` with no scheme or hostname check.
- **721d6e5.** Only `api/routes/session.mjs` (plus `plugins/oauth-popup`, which we don't use) sets cache-control in better-auth's dist.

**Thin already_done / fixed claims: all hold**
- **96ab2f5.** Anchored regex at `route.ts:154-155`, no `trim()`.
- **3e9e96d.** The workflow has `npm run build`, `check:shells` and `check:standalone` at `:110/:118/:129`.
- **N15.** Alert #37 is confirmed `open js/incomplete-sanitization` at `dashboardService.core.test.ts:95`.
- **69fa5c5, e775734.** Consistent with the tree.
- **606dc53.** No `"use client"` file value-imports `@/lib/auth`, `@/services/*` or the MP client. They import only types, models and `mp-datetime`. `instrumentation.ts` imports only `cache-warm-retry`, which has no imports. So adding `server-only` is safe.

**Corrections and internal inconsistencies**
- **595ecab.** The proposed change says "2 or more within 2 minutes" but the tests say "a third automatic navigation". Pick one threshold.
- **Timeouts disagree across entries.** userinfo 10 s and token 10 s (N12/5aa0b5e), API 30 s and upload 60 s (9b7b4d1), and 20 s for `getFileContentByUniqueId` (41bba94). Use shared constants. `getFileContentByUniqueId` has no app caller, so route it through HttpClient's 30 s, or delete it.
- **#297's sibling list leaves out music-db.** Per CLAUDE.md, music-tools has no `next-action` skip, so its action POSTs also get the 10 MB copy. The acceptance note should say so.
- **1d58475.** Confirmed that `.claude/worktrees/` exists and is not ignored (`git check-ignore` returns nothing).

## Conflicts/overlaps

- **Duplicate entries that should each be one change.**
  - upstream:defd338 appears twice and overlaps N11. They disagree on `deleteContactLog`: N11 says remove it, the second defd338 entry says optional.
  - upstream:710dfa8 appears twice; the two entries agree.
  - upstream:3e9e96d appears twice; both say already done.
- **`src/proxy.ts:57`** is edited by N9 (exact `/api` match) and by ace4566 if adopted (exact `/signed-out`). Do them in one PR, or land N9 first.
- **`next.config.ts`** is edited by N14 (three new keys plus `REVIEWED_OPTIONS`) and by the 6e160a3 extras (a COOP/CORP pin test). Both propose a new `src/lib/next-config.test.ts`; make it one file, one PR.
- **`src/lib/auth.ts`** has five proposals:
  - N19: lines 16-17 and 101-103, plus `baseURL` at `:526`.
  - f2af96d: userinfo fetch at `:123-125` and `errorForLog` at `:168`.
  - N16: `:621` and `customSession` at `:765`.
  - N17 option B: `getUserInfo` at `:744`.
  - 606dc53: an `import "server-only"` line.
  All five must be mirrored in four repos and need a `:dev` sign-in soak. Group them into two auth PRs (see batches), not five.
- **`src/app/api/auth/[...all]/route.ts`.** 721d6e5/5620831 (no-store) shares the route tests with 6167cfd (origin, state and cookie harness). One PR.
- **MP client files.**
  - `client.ts` and `client-credentials.ts`: N12, 5aa0b5e and N19 (`getMpBaseUrl` in place of `!` at `client.ts:49` and `client-credentials.ts:16`).
  - `http-client.ts`: 9b7b4d1 (`redirect: 'error'`, `assertSafeEndpoint`, upload timeout) and the 5aa0b5e 401 hook. Every exact-init assertion in `http-client.test.ts` changes once for both; do it once.
  - `file.service.ts` and `procedure.service.ts`: 41bba94/3d9ae92.
  - Order: N19's `env.ts` lands first, then the client PR uses it.
  - The `errorForLog` sweep is proposed in 41bba94 (services), defd338 (contact-logs actions) and f2af96d (`auth.ts:168`). Assign each file to exactly one PR.
- **User menu and header.**
  - f3cb739 makes `userProfile` optional in `user-menu.tsx` and `header.tsx`.
  - 0670531 retypes the same components from `MPUserProfile` to `CurrentUserProfile`.
  - 02731d4 optionally adds a broadcast in `user-menu.tsx`.
  - N19 changes `postLogoutUri` in `user-menu/actions.ts`.
  Do f3cb739, 0670531 and 02731d4 in one auth-UI PR. N19's one-liner rides with the auth PR.
- **SessionGuard (02731d4), 595ecab and ace4566** are interdependent. The loop cap only matters once the guard redirects, and the guard's target depends on the ace4566 decision. One PR.
- **Contact-log cluster:** N11, defd338, 710dfa8, dc4a25b (`.omit()` to `.pick()`, which also changes the pinned wording in `security.md`) and the `contactSearch` deletion from a11c2a3. They touch the same three files and their tests; one PR. Removing tested code can lower coverage, so re-run `test:coverage` against the floors.
- **`package.json` / lockfile:** 606dc53 (add `server-only`), b93d4c9 (remove `@types/js-cookie`, `@types/react-syntax-highlighter` and `autoprefixer`, and move `tsx` to dev), and option C of N17 (add `jose`). Do one relock and one audit-gate run. Restore the better-auth `>=1.7.18 <1.8.0` range afterwards.
- **5aa0b5e's 401 retry versus the all-or-nothing dashboard reads.** It works in our favour, but its negative cache makes manual refresh fail fast for 5-30 s. Keep it out of the low-risk client PR.

## Gaps

1. **Not covered: `ContactService.updateContact` mass assignment.** Upstream fixed this in a11c2a3 (its TODO was `security-contact-service-update-contact-mass-assignment`). The a11c2a3 entry covered only `contactSearch`.
   - `src/services/contactService.ts:94-103` builds `{ Contact_ID: contactId, ...fields }`. `fields.Contact_ID` overrides the target, `contactId` is never sanitized, and there is no `$userId`.
   - Zero callers in mp-charts. event-manager (`contactService.ts:106`) and mp-senior-care (`:105`) have the same code, also with no callers.
   - Smallest fix: delete it in all three, in the contact-log PR. Alternative: upstream's `.pick()`, `Contact_ID` set last, and `sanitizeId`.
2. **Upstream commits no entry covers.** All are docs or upstream-internal; log them as reviewed in the sync-log entry:
   - 49d4cd7, b46034c (its worktree-ignore part is covered by the 1d58475 entry), 8eed2d4, 571725c, 597c213, 4aa225e, d6c3dd6, 5f7340a, 9a0004d, 8e90a89, 234ae74, 109880d: TODO and docs bookkeeping, skip.
   - 5c5f43e: comment fixes in upstream-only files (`contactlookup/`, `server-providers.tsx`), not applicable.
   - 2935d29: the query-syntax doc for the sanitizer hardening. If a11c2a3's sanitizer `typeof`/control-character guards are taken, update `.claude/references/ministryplatform.query-syntax.md` in the same PR.
   - ba7d144: one test plus an eslint directive in `filter-sanitize.ts`. Trivial; check whether our `getContactLogTypes` test covers the non-Error path.
3. **N-items and #297.** N9–N19 and #297 are all covered. N21 (`$ignorePermissions`) is covered inside 41bba94. N10 correctly lists no siblings: only mp-charts has the journey, compliance and summer-blast pages.
4. **No entry owns the sync-log write-up.** The upstream-sync-log entry for 75d249d..aa1bc64 and the audit-table updates (N8 and N15 closed, N11 half-fixed) need an owner. Proposed as batch 0.

## Proposed PR batches

Each batch lands in mp-charts first. "Mirror" means the same change in event-manager, mp-senior-care and music-db (the music-tools repo) under the CLAUDE.md "check all four" rule. "Soak" means `:dev` with a human sign-in and sign-out before promoting.

0. **Docs only, direct to main (no PR).**
   - upstream-sync-log section for 75d249d..aa1bc64 with every per-commit decision.
   - Audit table: N15 fixed, N11 dashboard half fixed, N8 reviewed.
   - #297 accepted in `docs/ideas.md` (closes the issue), with the measured numbers and a music-db note.
   - N17 decision record, if option A.
   - Correct the `idTokenSubject` comment.
1. **Headers and proxy.** N9, N13, N14, the 6e160a3 extras (`base-uri 'none'`, COOP/CORP pin test), and the `.claude/worktrees/` entry in `.gitignore` and the eslint ignores. Mirror to all four: siblings also add COOP/CORP, event-manager only `poweredByHeader` and `logging`, and music-db drops `remotePatterns`. CI must run build plus `check:standalone`. Soak, because it touches the proxy matcher and CSP, the same path as #252 and #295.
2. **Auth core.** N19 (`env.ts`, build-phase exemption kept, no `NEXTAUTH_URL`), the f2af96d userinfo timeout and `redirect: 'error'`, 721d6e5/5620831 no-store, the 6167cfd test harness adapted, 6aa1633's code-shape regex (allowing uppercase `MISSING_FIELD`), aa696f8 global-error, and N17 option B if chosen. Mirror to all four. Soak. Operator step first: confirm the TMC1 and Ironside `.env` URLs are https.
3. **MP client, low risk.**
   - N12 and 9b7b4d1: `redirect: 'error'`, `assertSafeEndpoint`, 60 s upload timeout, empty and 204 body handling.
   - 5aa0b5e minus the retry: single-flight, clamp to [30 s, 3600 s], require a non-empty `access_token` and don't require `token_type`.
   - 41bba94 guards, a deny-all procedure allowlist, and removal of `$ignorePermissions`.
   - Uses `env.ts` from batch 2.
   Mirror to all four. event-manager must pass its three procedure names through `allowedProcedures` or event writes break. Soak with a cold dashboard warm, and in event-manager an event create. A sign-in soak is not required.
4. **Contact logs and data minimisation.**
   - N11 and defd338: delete the three orphans and make the `mp-datetime` errors static.
   - 710dfa8: explicit DTO that keeps `Made_By` and the author name.
   - dc4a25b `.pick()`, updating `security.md` and the JSDoc wording in the same commit.
   - Delete `contactSearch` (a11c2a3) and `updateContact` (gap 1).
   - Close CodeQL #37 (one-line regex in the test).
   - Add the export-has-importer guard test.
   Mirror to mp-senior-care as is. event-manager first needs the #85 contact-log shape, plus #220's `COMMUNICATION_TYPES`; that is a separate sibling PR. In siblings, also port `sanitizeLikeValue` and the search cap. A `:dev` click-through is enough.
5. **mp-charts only.** N10 gates on journey, compliance and summer-blast, plus the optional `requireFeaturePageAccess` helper. Soak with three users: a non-member, a member and an admin.
6. **Auth UI.** f3cb739 (sign-out always available), 0670531 (`CurrentUserProfile` DTO, drops the `dp_User_Roles` read), the f1ad0c8 sidebar `<Link>`, 02731d4 SessionGuard, 595ecab loop cap, and ace4566 only if decision 2 says so. Mirror to all four. 0670531 and f3cb739 are not needed in music-db where its header differs; check first. Soak, including a deploy mid-session to watch the guard.
7. **Session cookie.** N16 alone: `jwe` plus `withholdSessionFields`, with the CLAUDE.md, `security.md` and test pins updated in the same commit. Kept separate so its one-time sign-out and its rollback are attributable. Mirror to all four. Soak.
8. **MP client, medium risk.** The 5aa0b5e 401 refresh-and-retry, the negative cache, and optionally deleting the dead user-token mode. Mirror to all four. Soak with the dashboard and a manual refresh.
9. **Tooling and dependencies.** 606dc53 `server-only` (Vitest alias, `tsx --conditions=react-server`), b93d4c9 dependency cleanup, 56bd228 codegen escaping (keep `z.guid()`, regenerate models and expect a byte-identical diff), and 7aae2ae `setup.ts` (replacer function, quoting, 0600 permissions, `npm ci`, keep the TM.Widgets default). One lockfile change. Mirror where applicable. No soak beyond CI.
10. **CI hardening.** N18, `.github` only: SHA pins with version comments, `permissions: contents: read`, `persist-credentials: false` except in sync-issues. Mirror to all four, music-db first because of `trivy-action@master`.

## Decisions needed from the user

1. **N17, id_token signature verification.**
   - (A) Decline and record it as accepted. This is the analyst's recommendation, and I found nothing to contradict it.
   - (B) A, plus refuse a missing id_token and check `aud`/`iss`. This flips the pinned test at `auth.test.ts:487`.
   - (C) Port upstream's lazy JWKS verifier with a 60 s clock tolerance and a longer JWKS cache, in all four apps.
2. **ace4566.** When a session ends at the 12h cap or after a deploy, should a tab still silently re-sign-in through `/signin`, as CLAUDE.md documents, or stop on a static `/signed-out` page? Related: SessionGuard will redirect an open tab when its session lapses (on focus or refetch), which can drop an unsaved contact-log note. Confirm that is acceptable.
3. **N16 changes a pinned setting.** CLAUDE.md, `security.md` and `auth.session-lifetime.test.ts:156` all pin `strategy: "jwt"`. Switching to `jwe` signs everyone out once, on their first request after the deploy. Do you approve the pin change?
4. **#297.** Accept the page-path 10 MB residual and close the issue (no code change)? Measurements: the alternative option (a) shifts the cost to 20 MB multipart decoding and strips CSP from Transfer-Encoding GETs, and the action path accepted under #252 already allows 20 MB.
5. **1d58475.** mp-charts is public with no LICENSE. Should we add MIT, keeping MPNext's notice? Should future security audits stay out of the public repo?
6. **5aa0b5e.** Take the 401 refresh-and-retry and the 5-30 s negative cache (batch 8), or defer them? Should the dead user-token mode in the MP client be deleted?
7. **Dead code.** Delete `deleteContactLog`, `ContactService.updateContact` and `contactSearch`, or keep any of them for a planned feature? If kept, harden them instead.
8. **Optional.** After batch 10, turn on the repo setting "Require actions to be pinned to a full-length commit SHA"? Also split the sync-issues workflow permissions per job?
9. **Confirm keeping the full five-member `CommunicationType` enum** (our #220 rule) rather than upstream's narrowing to Email/SMS. Only the value-echoing error message changes.


## Per-item analysis

### N9 — Proxy /api carve-out is a prefix match and the matcher exclusions are unanchored (upstream 9b61b82)

**State:** open · **Recommendation:** adapt · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 9b61b82

**Evidence:**

Checked against the current tree (dbf2050), Next 16.4.5.
- src/proxy.ts:57 still reads `pathname.startsWith('/api') || pathname === '/signin' || pathname === '/auth-error'`, so a future page such as /apidocs or /api-keys would be public. No such page exists today: src/app/api holds only auth/[...all] and cache-warm, and no (web) route starts with 'api'.
- In the matcher at src/proxy.ts:110, `_next/static|_next/image|favicon.ico` are unanchored and favicon's dot is unescaped. `manifest\.json|sw\.js|offline\.html` are escaped but also unanchored. `api/auth(?:/|$)` and `assets/` are already bounded correctly.
- Probe: I ran the current config through Next's own `unstable_doesMiddlewareMatch` in a throwaway vitest file in the worktree (since deleted). All 10 of these paths skip the proxy today: /_next/imagefoo, /_next/staticX, /favicon.ico/x, /faviconXico, /manifest.jsonx, /manifest.json/x, /sw.js.map, /sw.jsx, /offline.html/x, /offline.htmlx. Those requests get no cookie redirect and no CSP header. In practice they render the root not-found page, which reads no data, so the impact is LOW and defense-in-depth only.
- The proposed config below passed 34 assertions:
  - it runs the proxy on all 10 of those paths;
  - it still skips /_next/static/chunks/main.js, /_next/image, /_next/image?url=x, /_next/image/x, /favicon.ico, /assets/logo.png, /manifest.json, /sw.js, /offline.html, /api/auth, /api/auth/, /api/auth/sign-in/social and /api/auth/callback/ministryplatform?code=x&state=y;
  - it still runs on /, /dashboard, /signin, /auth-error, /api/cache-warm, /api/authority, /api/auth-extra and /apidocs;
  - it still skips a request carrying `next-action`.
- What src/proxy.test.ts pins today: lines 164-218 check the real config for static assets, six /api/auth paths, /api/authority, /api/auth-extra and next-action requests. They check none of the 10 paths above. Lines 111-131 and 253-291 re-implement `startsWith('/api')` inline, so they test nothing real and would pass either way.
- Upstream 9b61b82 is not an ancestor of our last logged review (75d249d), so it falls in the unlogged range. Its matcher is `'/((?!_next/static/|_next/image(?:$|/)|favicon\\.ico$|assets/).*)'`, a plain string with no /api/auth exclusion, no manifest/sw/offline entries and no `missing` next-action condition. A cherry-pick would therefore re-add /api/auth to the matcher and drop the #252 next-action skip, both of which CLAUDE.md pins. The /api part of upstream's proxy-body change (`pathname === '/api' || pathname.startsWith('/api/')`) applies cleanly.
- The audit records this as an open LOW finding (.claude/notes/security-audit-2026-10-10.md:55, :165-169, :351).

**Rationale:**

Upstream's idea fits our fork, but its matcher string does not. Our matcher deliberately also excludes /api/auth (2026-11-09: anonymous auth POSTs must not get the 10 MB body copy) and skips next-action requests (#252). Both are pinned in CLAUDE.md, and taking upstream's string would undo them. The smallest fix keeps our entries and only adds escaping and anchors: `$` on favicon.ico, manifest.json, sw.js and offline.html; a trailing `/` on _next/static; `(?:$|/)` on _next/image. It also changes the /api early return to an exact-or-under check. The fix costs nothing at runtime and closes a gap that is latent today, with no /api* page and no data on the 404 page.

**Proposed change:**

1. src/proxy.ts:57: change the early return to `pathname === '/api' || pathname.startsWith('/api/') || pathname === '/signin' || pathname === '/auth-error'`.
2. src/proxy.ts:110: change the matcher source to `'/((?!api/auth(?:/|$)|_next/static/|_next/image(?:$|/)|favicon\\.ico$|assets/|manifest\\.json$|sw\\.js$|offline\\.html$).*)'` and keep `missing: [{ type: 'header', key: 'next-action' }]` unchanged.
3. Extend the comment above `config` with one line on the anchoring, crediting upstream 9b61b82.
4. Log 9b61b82 as 'adapted' in .claude/notes/upstream-sync-log.md.
5. Mark N9 fixed in the audit table.

**Tests:**

src/proxy.test.ts 'Route Matcher (real config)':
- add the 10 paths above to the 'runs the proxy on' table;
- add '/_next/image' and '/_next/image/x' to the static-asset skip table.
In 'Public paths (real proxy)':
- '/apidocs' with no cookie must redirect to /signin;
- '/api' and '/api/cache-warm' with no cookie must return next.
Delete the tautological inline `startsWith('/api')` blocks at src/proxy.test.ts:111-131 and 253-291.
Check: with the old matcher restored, the 10 new cases fail. Then run npm run test:run, tsc and lint.

**Conflicts with pinned settings:**

None if adapted as proposed. A verbatim cherry-pick of upstream's matcher WOULD conflict: it re-adds /api/auth to the matcher (CLAUDE.md: 'Do not add /api/auth back to a matcher') and drops the next-action `missing` condition (#252).

### #297 — Anonymous POSTs to page paths still make Next buffer up to 10 MB each

**State:** open · **Recommendation:** accept_risk · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** —

**Evidence:**

How it works today (Next 16.4.5):
- The matcher (src/proxy.ts:106-113) matches every page request that lacks `next-action`.
- For any non-GET/HEAD request the proxy runs on, Next clones the body and awaits `finalize()` before answering (node_modules/next/dist/server/next-server.js:1198 and 1215-1234). GETs are never cloned.

I built two local production builds of the worktree with dummy env (standalone, NODE_ENV=production) and probed them with raw sockets. Each flood is 20 concurrent POSTs to `/`, each sending 45 MB of a declared 500 MB. Each measurement used a fresh server and 3 rounds. Scripts are in /private/tmp/claude-502/-Users-jonathon-huff-Claude-Code-mp-charts/06943184-3063-456e-b73a-400f764dc667/scratchpad/n9-297/.

BASE (current matcher):
- multipart, anonymous: 0 of 20 answered, RSS 148 -> 582 MB at peak.
- multipart with a fake session cookie: 0 answered, RSS 147 -> 634 MB.
- application/octet-stream: 0 answered, +447 MB.
- A slow 64 KB body is answered (307) only after its last byte, at 5.1 s.

OPTION (a), measured. The proposal adds to `missing`: `{type:'header',key:'content-length',value:'[1-9][0-9]*'}` and `{type:'header',key:'transfer-encoding'}`. A missing item that is present skips the proxy, and `value` is matched as `^...$` (prepare-destination.js:57-117). Results:
- octet-stream / text/plain: immediate 405 after about 1 MB sent, RSS flat.
- urlencoded: 200 page render without a CSP header after about 3 MB, RSS flat. Next returns null for urlencoded (action-handler.js:405-412).
- multipart: now goes to Next's no-JS form-action decode (action-handler.js:690-727), which buffers the whole body through `fakeRequest.formData()` up to `serverActions.bodySizeLimit` (20 MB) BEFORE it checks any action ID (`areAllActionIdsValid` runs after the parse). Each request was answered 500 (413) after about 27 MB, with RSS 148 -> 888 MB at peak. That is no better than base, and an attacker simply picks multipart.
- `Content-Length: 0` GET and POST still 307 with CSP (the value regex works).
- A GET carrying `Transfer-Encoding: chunked` now skips the proxy: 200, no CSP, no redirect. That would need proof that cloudflared never adds the header to normal GETs.

What a no-JS form POST loses under (a): the app's only native form action is session-error's `<form action={handleSignOut}>` (src/app/session-error/page.tsx:38). It ends in `redirect()` (src/components/user-menu/actions.ts:121), so losing CSP on that response costs nothing. The contact-logs form uses onSubmit (src/components/contact-logs/contact-logs.tsx:258). No page relies on a plain POST.

The already-accepted path is the larger one:
- A fetch action with an invalid `next-action` id gets 409 after about 1 MB. `getActionModIdOrError` runs before busboy (action-handler.js:663).
- A real id reads to 20 MB, then 500.
- 73 of the 80 action IDs in server-reference-manifest.json appear in public /_next/static chunks, which the proxy never matches. So any anonymous client can already make Next buffer 20 MB per request. #252 accepted that ('the cost of honouring the 20 MB limit'; docs/ideas.md:194-197).

Option (b): moodychurch.org is on Cloudflare's Free plan, with 5 custom rules, one of them used by the POST Skip rule (auto-memory). A Block rule on POST to a non-/api path without a `next-action` header would stop page-path bodies, but:
- it would also break session-error's no-JS sign-out fallback, unless /session-error is exempted, which leaves that one path a 10 MB target;
- it does not lower the worst case, because the action path stays open;
- I could not verify here whether the header-name and len() rule fields are available on the Free plan.

**Rationale:**

(a) does not close the gap; it moves it. Unmatched multipart POSTs fall into Next's own no-JS form-action decode, which buffers up to the 20 MB bodySizeLimit without checking an action ID: twice the proxy's 10 MB copy, with the same or higher measured RSS. It also adds a CSP/redirect bypass for GETs carrying Transfer-Encoding. Its only gain is that connections are answered after about 20 MB instead of being held to the declared size. A split matcher that exempts only non-multipart bodies helps nothing, because the attacker switches to multipart.

(b) cannot lower the worst case either. Any anonymous client can already make Next buffer 20 MB per request through a public action ID, which #252 accepted, and a Block rule risks the no-JS sign-out fallback.

The page-path residual is therefore bounded below an accepted risk. It is limited by the 10 MB copy per connection, Cloudflare's request-body limit and our bandwidth. Accepting it with these numbers on record is the smallest correct action.

**Proposed change:**

Docs only, no code:
1. Rewrite the docs/ideas.md #297 entry (line ~194) with the findings: the base numbers; option (a) measured and rejected (multipart moves to the no-JS form-action decode at 20 MB without an ID check, and Transfer-Encoding GETs lose the proxy); option (b) does not lower the worst case; 73 of 80 action IDs are public, so the 20 MB action path accepted under #252 dominates.
2. Mark the entry `~~...~~ COMPLETED` (accepted), which closes the issue on push.
3. Optionally add one sentence to .claude/rules/security.md and to the CLAUDE.md line 'Page paths still get the 10 MB copy (#297)' recording that the residual is accepted and why.
4. Do not change src/proxy.ts.
5. If the owner later wants more (outside this scope), the lever with real effect is Next's no-JS form-action decode and bodySizeLimit, not the proxy matcher.

**Tests:**

None for an acceptance. If (a) were ever adopted despite this, add these matcher tests:
- content-length 0 still matches;
- content-length >0 and transfer-encoding skip;
- a production probe must confirm multipart bodies are refused before 10 MB;
- a soak through Cloudflare must confirm GET / still returns 307 with a CSP header, i.e. cloudflared adds no Transfer-Encoding to GETs.

**Conflicts with pinned settings:**

None for accepting. Option (a) would weaken the CSP guarantee: a GET with Transfer-Encoding, or an anonymous urlencoded POST, gets a page with no CSP header. It does not touch the pinned /api/auth exclusion or the next-action skip.

### N10 — Journey/compliance [slug] pages render the full tool config without a feature gate

**State:** open · **Recommendation:** adapt · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** —

**Evidence:**

Still open. src/app/(web)/journey/[slug]/page.tsx:23-41 and src/app/(web)/compliance/[slug]/page.tsx:23-41 await params, call getJourneyToolBySlug/getComplianceToolBySlug (:27), call notFound() only for an unknown or disabled slug (:28-29), then pass the whole `config` object to the client component (:41). Neither file calls requireFeatureAccess. The config holds programId, trackingGroupId, pausedGroupId, defaultGroupRoleId, pauseMilestoneId and the milestone IDs (src/lib/journey-tools-config-types.ts:19-33), and for compliance also groupRoleIds, journeyId and every requirementId and type (src/lib/compliance-tools-config-types.ts:27-43). The client reads only names, the description and a few booleans (journey-processing.tsx:31-32,199-200; compliance-processing.tsx:29,170-171), but RSC serialises the whole object to the browser. The data actions are gated: journey-processing/actions.ts:18 and compliance-processing/actions.ts:17 call requireFeatureAccess(`journey:${slug}` / `compliance:${slug}`). So only configuration IDs leak. The /admin fix to compare against is src/app/(web)/admin/layout.tsx:15-35: connection(), then requireFeatureAccess("admin") inside a try, with redirect("/") outside the try. hasFeatureAccess (src/lib/authorization.ts:167-179) returns false for any feature key it does not know, and loadFeatureAccess injects only enabled tools (:83-102). A gate placed before the config lookup therefore redirects a non-member the same way for an unknown, a disabled and an unauthorised slug, so the gate is not an existence oracle. Scope note: the gate hides IDs, not which tools exist. getUserAuthorization (src/components/shared-actions/user.ts:62-74) already gives every signed-in user the slug, name and description of every enabled tool, whatever their access. Same class elsewhere: src/app/(web)/summer-blast-volunteers/page.tsx:18-31 renders eventName, eventEndDate, roleConfigs groupRoleIds and tempGroupRoleId with no gate. dashboard/page.tsx:26 and manage-members/page.tsx:28-31 call gated actions on the server, so an unauthorised user hits the error boundary rather than seeing data. Upstream: MPNext has no journey/compliance pages, so there is no upstream commit to port. The pattern already exists in mp-senior-care/src/app/(web)/contact-lookup/page.tsx:19-26 (requireFeatureAccess in a Suspense child, redirect("/") in the catch).

**Rationale:**

This is the smallest change that closes the gap and matches the existing /admin gate (F11). The pages render server-side config that only feature holders need. The actions are already gated, so the gate redirects an unauthorised user who had nothing to load anyway; no feature holder loses anything. The gate goes in the page's async content component, not a new [slug]/layout.tsx, because the page is what reads the config and already awaits params inside Suspense, which PPR and cacheComponents need. It conflicts with no pinned setting: it touches neither the proxy matcher (/api/auth and next-action exclusions stay) nor auth.ts. The cost is one extra getUserProfile per page load, the same call every action already makes. Fold in the summer-blast page, which has the same gap.

**Proposed change:**

In JourneyPageContent (src/app/(web)/journey/[slug]/page.tsx:23) and CompliancePageContent (src/app/(web)/compliance/[slug]/page.tsx:23), right after `const { slug } = await params;` and BEFORE get*ToolBySlug, add: `let allowed = false; try { await requireFeatureAccess(`journey:${slug}` as DynamicFeature); allowed = true; } catch {} if (!allowed) redirect('/');` (use `compliance:` in the compliance page). Keep redirect() outside the try, as admin/layout.tsx:22-32 does. Leave notFound() after it, so an admin who opens an unknown slug still gets a 404. Do the same in SummerBlastVolunteersContent (summer-blast-volunteers/page.tsx:18) with requireFeatureAccess("summer-blast-volunteers"). Optional, to stay DRY: add `requireFeaturePageAccess(feature)` (try, then redirect('/')) to src/lib/authorization.ts and use it in all four places, including admin/layout.tsx. Optional follow-up: filter journeyTools/complianceTools in getUserAuthorization (shared-actions/user.ts:62-74) to the user's accessibleFeatures, so tool names stop reaching users without access.

**Tests:**

If the shared helper is extracted: a Vitest unit test in src/lib/authorization.test.ts that mocks requireFeatureAccess and next/navigation.redirect, and asserts redirect('/') when it throws (Forbidden or Unauthorized) and no redirect when it resolves. Page components need no unit tests (testing.md). Manual soak on :dev with three users: (a) not in the tool's groups: /journey/<slug> and /compliance/<slug> redirect home, and the RSC payload carries no config; (b) a group member: the page renders as before, and the ?applicant= deep link still opens; (c) a super-admin on an unknown slug gets a 404. Then run npm run test:run and npm run build.

### N11 — Duplicate getContactLogsByContactId at a weaker rate tier; orphan 'use server' exports

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** defd338

**Evidence:**

(1) getDashboardMetrics is gone. `git log -S` shows commit 5d95f60 (2026-11-17, dashboard fix) removed it. src/components/dashboard/actions.ts now exports only getFullRangeDashboardMetrics:25, getExtendedDashboardMetrics:38, getEngagementDashboardMetrics:49 and refreshDashboardCache:85, and every one has an importer. (2) The duplicate is still in the source. src/components/contact-logs/actions.ts:139 getContactLogsByContactId uses requireFeatureAccess("contact-lookup") with the general tier only. The live copy, src/components/contact-lookup-details/actions.ts:35-38, adds enforceRateLimit(..., "search"). (3) Full enumeration: a probe walked all 13 file-level 'use server' modules (78 exports) and their non-test import graph. It is at /private/tmp/claude-502/-Users-jonathon-huff-Claude-Code-mp-charts/06943184-3063-456e-b73a-400f764dc667/scratchpad/n10-n11/orphans.mjs. It found exactly three orphans, all in src/components/contact-logs/actions.ts: deleteContactLog:102 (ownership-checked, write tier, no UI calls it; contact-logs.tsx imports only getContactLogTypes, createContactLog and updateContactLog), getContactLogsByContactId:139 (general tier), and getContactLogById:213 (general tier). getContactLogById returns any log's full row, Notes included (contactLogService.ts:119-123), so it could have enumerated pastoral notes by sequential ID at 120/min. Every other export has a production importer, and shared-actions/processing.ts is deliberately not 'use server' (:1-4). (4) None of the three is reachable in a production build. The local production build's .next/server/server-reference-manifest.json (Next 16.4.5, Turbopack, built 2026-11-17 21:49; contact-logs/actions.ts last changed 2026-09-16) lists 80 entries: 75 actions (78 minus the 3 orphans) plus 5 $$RSC_SERVER_CACHE entries. deleteContactLog, getContactLogsByContactId and getContactLogById from contact-logs are absent; contact-lookup-details' getContactLogsByContactId is present. An unknown action ID fails with getActionNotFoundError (node_modules/next/dist/server/app-render/manifests-singleton.js:59-60). The audit's 'both are reachable POST endpoints, so F9's tier is bypassable' therefore does not hold for the current build. The gap is latent: importing either orphan from any client component, or passing one as a prop from a server component, would register it.

**Rationale:**

Of the original N11, the dashboard half is fixed. The contact-logs half is dead code that Turbopack's action tree-shaking currently keeps off the endpoint list. Deleting it removes a weaker-tier duplicate that one import away would bring back, and a general-tier read of any log by ID, and it matches upstream defd338. Upstream's claim that every export is an endpoint whether or not anything imports it is stricter than what Next 16.4.5 actually does, but removal is right either way. deleteContactLog: upstream keeps it because its UI has a delete button (upstream contact-logs.tsx:279). Ours has no delete UI and ideas.md has no entry for one, so remove it too. Keep it only if a delete UI is planned; it is ownership-checked and write-tier, so keeping it is low risk. A guard test stops new orphans appearing. Nothing here touches a pinned setting.

**Proposed change:**

In src/components/contact-logs/actions.ts, delete the exports deleteContactLog (:102-136), getContactLogsByContactId (:139-154) and getContactLogById (:213-228), plus any import that then goes unused (the ContactLog type is still used by create/update). Remove their cases from src/components/contact-logs/actions.test.ts (describe blocks at about :207-280 and the injection/coercion cases at about :350-370), and drop the three mocks from the module mock at :43-45 if nothing else needs them. Keep ContactLogService.getContactLogById, because update ownership uses it (:74). Add src/server-action-exports.test.ts, modelled on src/test-only-imports.test.ts: it scans every file-level 'use server' module under src/ and fails when an export has no importer outside tests. Siblings: event-manager (src/components/contact-logs/actions.ts:104,141,213) and mp-senior-care (:102,145,214) have the same three orphans. Both also still mark src/components/shared-actions/processing.ts 'use server' with orphan extractValidatedFiles/extractValidatedFilesResult (:11,:32), which mp-charts fixed in its N3 follow-up. mp-senior-care also has orphan refreshAdminTabsAction (src/app/(web)/admin/actions.ts:82) and a duplicate rejectFinishRequestAction in src/app/(web)/cases/[caseId]/actions.ts:662 (the live one is admin/actions.ts:163, imported by review-list.tsx:8). music-db has no orphans.

**Tests:**

Run npx vitest run src/components/contact-logs/actions.test.ts after the cut. Add the new export-has-importer guard test. Then run npm run test:coverage to confirm the floors (statements 59 / branches 50 / functions 50 / lines 60) still hold, since tested code is being removed. After npm run build in CI or a worktree (not the main tree), confirm server-reference-manifest.json still lists the contact-lookup-details getContactLogsByContactId and lists no contact-logs read actions.

### upstream:defd338 — Upstream: stop echoing caller input into logs; drop unused log actions

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** defd338

**Evidence:**

defd338 is upstream (MPNext PR #99, merge 5e9d7af, after our last logged review at 75d249d; not in .claude/notes/upstream-sync-log.md). It does three things. (a) It removes the unused getContactLogsByContactId and getContactLogById from contact-logs/actions.ts: still open here (see N11; src/components/contact-logs/actions.ts:139,213). (b) contact-log actions log one JSON line (logActionError): our file still passes raw errors to console.error at :21,51,94,131,151,208,225. .claude/rules/security.md ('Log caught errors with errorForLog(error)') requires src/lib/log-safe.ts:13 errorForLog instead. (c) DomainTimezoneService stops echoing input: we have no such service. The equivalent is src/lib/providers/ministry-platform/utils/mp-datetime.ts, whose errors echo the value (:128 `toMpSqlDatetime: cannot parse "${value}"`, :175 parseMpDatetime). That breaks the security.md rule 'Error messages the app throws must be static'. On the contact-log path it is mitigated, because ContactLogSchema.ts:6 runs z.string().datetime() before toMpSqlDatetime (contactLogService.ts:196,259), so no newline can reach the message. Upstream's AuthorizationService.requireSecurityRole gate is a different architecture from our requireFeatureAccess and is not portable.

**Rationale:**

Port the intent, not the code. Part (a) ships with N11. Part (b) uses our own errorForLog convention instead of upstream's JSON logger, so contact-logs matches the rest of the codebase and CodeQL js/log-injection. Part (c) makes the two mp-datetime messages static, which our own rule requires. Today's exposure is low because Zod screens Contact_Date on the one caller-shaped path. The auth parts of the commit stay behind: our requireFeatureAccess model is deliberate.

**Proposed change:**

src/components/contact-logs/actions.ts: replace each `console.error("…", error)` with `console.error("…:", errorForLog(error))` (import from @/lib/log-safe). src/lib/providers/ministry-platform/utils/mp-datetime.ts:128,175: drop the interpolated value (for example `toMpSqlDatetime: cannot parse value`) and update any test that asserts the old text. The removal half is in N11. Mirror in event-manager and mp-senior-care: same contact-logs file, and grep their mp-datetime.ts for the same messages.

**Tests:**

Update the mp-datetime tests that match on the message, if any (grep found none matching 'cannot parse' or 'expected an MP wall-clock' in *.test.ts). Add one test that an action error containing CR/LF is logged on one line, mocking console.error. Then npm run test:run.

### upstream:710dfa8 — Upstream: return only rendered contact-log fields to the browser

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** 710dfa8

**Evidence:**

710dfa8 is upstream (PR #99, unlogged). The same gap exists here. src/components/contact-lookup-details/actions.ts:97-100 builds each log as `{ ...log, Contact_Log_Type, MadeByContact } as ContactLogDisplay`, spreading the full MP row (Planned_Contact_ID, Contact_Successful, Original_Contact_Log_Entry, Feedback_Entry_ID; contactLogService.ts:140 select) behind a cast. MadeByContact also carries each staff author's Contact_ID, Email_Address, Mobile_Phone and Image_GUID (select at :65, mapping at :69-77). The UI renders only Nickname/First_Name and Last_Name (contact-logs.tsx:527-529), plus Contact_Date, Notes and Contact_Log_Type, and it uses Made_By for the edit-own-log check (contact-logs.tsx:507). DTO: src/lib/dto/contact-logs.ts:1-20. Upstream trimmed the DTO to Contact_Log_ID, Contact_Date, Notes and Contact_Log_Type, but our fork has to keep Made_By and the author name, because our UI shows the author and restricts editing to the author.

**Rationale:**

This read sits on the search tier (F9) and sends staff PII (author email, mobile, contact ID) and MP cross-record links to the browser, none of which the UI shows. Building the DTO field by field closes the gap without losing anything we render. Upstream's exact field set would break our author display and edit-ownership check, so adapt it rather than port it.

**Proposed change:**

In getContactLogsByContactId (contact-lookup-details/actions.ts:88-101), return explicit objects with only {Contact_Log_ID, Contact_Date, Notes, Contact_Log_Type, Contact_Log_Type_ID, Made_By, MadeByContact} and drop the spread and the cast. Narrow the dp_Users select at :65 to User_ID, First_Name, Nickname and Last_Name. Trim ContactLogMadeBy (src/lib/dto/contact-logs.ts:1-9) to those names, and remove Contact_ID from ContactLogDisplay if nothing reads it (contact-logs.tsx creates logs from props.contactId, not log.Contact_ID). Mirror in event-manager (actions.ts:94 spread, :62 select) and mp-senior-care (actions.ts:95 spread, :63 select), which have the same code.

**Tests:**

In src/components/contact-lookup-details/actions.test.ts, assert the exact key set of each returned log and of MadeByContact[0], as upstream does, so a re-introduced spread fails. Check contact-lookup-details.test.tsx and contact-logs.test.tsx fixtures still type-check (tsc --noEmit). Run npx vitest run on both files.

### N12 — Outbound fetch hygiene: userinfo, client-credentials token, ensureValidToken single-flight, HttpClient redirects and path guard, feedbackService timeout

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** M · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 9b7b4d1, 5aa0b5e, f2af96d

**Evidence:**

Five sub-points, each checked against the current tree (main dbf2050) and confirmed with throwaway vitest probes in /private/tmp/claude-502/-Users-jonathon-huff-Claude-Code-mp-charts/06943184-3063-456e-b73a-400f764dc667/scratchpad/n12/ (userinfo.probe.test.ts, token.probe.test.ts, run with vitest.probe.config.ts).
(a) getMpUserInfo userinfo fetch: still OPEN. src/lib/auth.ts:123-125 passes only `headers`. The probe confirmed the init keys are just ['headers']: no AbortSignal.timeout and no redirect:'error', so a same-origin redirect would re-send the user's bearer. The function's never-throws structure is already in place (auth.ts:121-150). The probe showed a JSON body of `null` resolves to null, because the TypeError lands inside the sanitizeGuid try at :144-152. A stalled MP holds the OAuth callback until undici's default timeout.
(b) auth/client-credentials.ts: OPEN. :26-32 has no timeout and no redirect refusal (probe init keys ['method','headers','body']). A 307/308 would re-POST client_secret. :38 returns the body unvalidated. Probe: a 200 with `{}` leaves token = undefined, which is cached for 55 min and sent as `Bearer undefined`. :35 puts only statusText in the error, and statusText is empty over HTTP/2.
(c) expires_in: PARTIALLY FIXED by 2db848d (upstream #77 port). client.ts:81-88 adds a default and a 30 s floor but no ceiling. Probe: expires_in 1e13 gives expiresAt = Invalid Date, and `Invalid Date < new Date()` is false, so the token is never refreshed again.
(d) client.ts:68-94 ensureValidToken: OPEN, no single-flight. Probe: 31 concurrent calls on a cold client made 31 token POSTs. 31 is the documented full-dashboard peak (CLAUDE.md 'Ministry Platform API Concurrency': ~31 calls). The same stampede happens at every 55-min expiry boundary. The client is a per-module static singleton (provider.ts:51,89-95), so it is one token per bundle layer, not per process.
(e) http-client.ts: timeouts FIXED (30 s, :7, on all six methods since F13/9e27f7e). Redirects still followed: no `redirect` key, probe init keys ['method','headers','signal']. No path guard (:161-167 is plain concatenation). Probe: `/tables/${encodeURIComponent('..')}` fetches .../ministryplatformapi/tables/.., which resolves to .../ministryplatformapi/. Today every endpoint is a constant or a sanitized ID: all uploadDocument tables are literals (journey-processing/actions.ts:96,129; compliance-processing/actions.ts:84,115,145,178), getRequirementFiles maps type to REQUIREMENT_RECORDS (complianceProcessingService.ts:809-815), and file.service.ts:33-35 encodes. Adjacent and unused: file.service.ts:164-185 getFileContentByUniqueId (only exposed via helper.ts:608) does its own fetch with no timeout or redirect refusal and an unencoded GUID; upstream hardened it in 41bba94.
(f) feedbackService.ts: NOT APPLICABLE. The in-app feedback feature was deleted in 36b5d25 (2026-10-23, 'remove the in-app feedback feature (N5)'). src/services/ has no feedbackService.ts, and the app's only fetch() calls are auth.ts:123, client-credentials.ts:26, file.service.ts:176 and http-client.ts.
The audit table still lists N12 as Open (security-audit-2026-10-10.md:58), and P8 is listed as 'timeouts only' (:346).

**Rationale:**

Every gap except feedbackService (gone) and the HttpClient timeout (done) is still live and confirmed by probe. The real-world risks are (1) the Invalid Date token that never refreshes and the cached `Bearer undefined`, which would make every MP call 401 for up to an hour, and (2) the 31-way token stampede on each cold start and expiry. The redirect, path-guard and userinfo items are defence in depth. Upstream's three commits cover this but do not port verbatim: our client still has the (dead) user-token mode, we log with errorForLog, our timeout is 30 s not 20 s, and our tests pin exact fetch inits. The smallest safe change is split per commit below, ideally in one PR touching four files plus tests.

**Proposed change:**

One PR, smallest-first:
1) auth.ts:123-125 add `signal: AbortSignal.timeout(10_000), redirect: "error"`.
2) client-credentials.ts: same two options (10 s); wrap fetch in try/catch throwing a static `Failed to get client credentials token: <errName>`; include status in the !ok error; require typeof access_token === 'string' && trim() !== ''.
3) client.ts: single-flight `inflight` promise; clamp expires_in to [30 s, 3600 s]; errorForLog instead of the raw error at :90.
4) http-client.ts: `redirect: 'error'` on every fetch plus upstream's assertSafeEndpoint in buildUrl.
The 401 retry and the negative cache are separate options (see upstream:5aa0b5e). No pinned CLAUDE.md setting is touched.

**Tests:**

auth.test.ts:186-188 pins the userinfo init as exactly `{ headers }`; update it to expect signal + redirect:'error', and add a timeout test (TimeoutError leads to null with auth.userinfo.fetch_failed). client-credentials.test.ts: 200 with {} or a blank access_token rejects; a network error rejects with a static message; init carries redirect:'error' and a signal. client.test.ts: 31 concurrent ensureValidToken calls make 1 fetch; a failed refresh rejects every waiter and the next call retries; expires_in 1e13 gives a finite expiresAt at most 55 min ahead. http-client.test.ts: the exact-object toHaveBeenCalledWith assertions (:136-144, :215-225, …) gain redirect:'error'; '..', '%2e%2e', '\\', '?', '#' and control chars in an endpoint throw before fetch. Reuse the scratchpad probes as a starting point.

### upstream:9b7b4d1 — HttpClient: timeouts, no redirects, central path guard, safe logging (upstream MPNext)

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 9b7b4d1

**Evidence:**

Upstream (git show 5aa0b5e:src/lib/providers/ministry-platform/utils/http-client.ts) collapses the six methods into request()/send() and adds:
- API_TIMEOUT_MS 20 s and UPLOAD_TIMEOUT_MS 60 s (:6,:9)
- redirect:'error' (:236)
- the UNSAFE_ENDPOINT regex plus resolved-URL root check in assertSafeEndpoint (:16,:143-161)
- GUID redaction (:21,:26-28)
- errorName (:31-34)
- readJsonResponse with 204/empty-body handling, a JSON content-type check and a SyntaxError-free error (:44-60)
- encodeQueryKey (:257-259)
- a console.error on every failure (:205,:248)
Ours (src/lib/providers/ministry-platform/utils/http-client.ts) has a 30 s timeout on all six methods (:7,:41,:69,:90,:111,:132,:151), and safeEndpoint control-char stripping instead of refusal (:19-21). It has no redirect refusal, no path guard (:161-167; probe: '/tables/..' escapes to the API root), no 204 handling (`response.json()` at :55/:76/:97/:118/:139/:158), and no upload-specific timeout. A 20 MB upload under the 20 MB bodySizeLimit gets the same 30 s budget. file.service.ts:153 does `delete<void>`, which would throw a SyntaxError on an empty 204 after a successful delete; there are no app callers of deleteFile today. This commit is not in .claude/notes/upstream-sync-log.md (it postdates the 75d249d review).

**Rationale:**

Our http-client is still the pre-refactor shape, so the upstream file would replace ours almost wholesale and the per-method exact-init tests would all change. The security value is in two small pieces that drop into our existing methods: redirect:'error' (MP's API has no legitimate redirects, and a 307/308 would re-send member-data bodies and the service bearer) and assertSafeEndpoint (closes the encodeURIComponent('..') === '..' hole for any future caller-shaped table or procedure name). Keep our 30 s API timeout: F13 chose it, and the documented cold dashboard reads are slow (Activity_Log months), so dropping to 20 s risks new all-or-nothing rejections in getMonthlyAttendanceTrends and getEngagementRawData. Take UPLOAD_TIMEOUT_MS 60 s for the two FormData methods. readJsonResponse's empty-body handling is worth taking. Its strict content-type check carries some outage risk if any MP endpoint we call answers 200 without a JSON content-type, so soak it on :dev or make it lenient. Skip upstream's extra console.error per failure: every service caller already logs (e.g. file.service.ts:38) and the double line adds noise. If logging is wanted, use errorForLog.

**Proposed change:**

http-client.ts:
- add `redirect: 'error'` to all six fetch inits.
- add the private assertSafeEndpoint(endpoint), copied from upstream :16 and :143-161, and call it first in buildUrl (:161). buildUrl is also used by file.service.ts:174, so getFileContentByUniqueId is covered.
- add a 60 s UPLOAD_TIMEOUT_MS for postFormData/putFormData.
- optionally add a small readJson helper that returns undefined for 204 or content-length 0 and throws a static `<METHOD> <endpoint> failed: invalid JSON response` instead of V8's SyntaxError.
Optional: GUID redaction in safeEndpoint.
Leave the request()/send() refactor and the per-failure console.error out. The 401 hook constructor arg comes with 5aa0b5e.

**Tests:**

http-client.test.ts: add `redirect: 'error'` to every exact toHaveBeenCalledWith init (:136-144, :158-162, :215-225, :239-249, :262, :293-303, :333-343, :375-384, :400-408, :438). New cases: endpoints with '..', '%2e%2e', '%2F', '\\', '?', '#', a tab or newline, or no leading '/' throw before fetch is called; a fetch rejecting with TypeError (refused redirect) surfaces as a thrown error; FormData methods get a signal (the upload timeout); 204/empty body returns undefined. Re-run the full suite, since every service mocks through this client.

### upstream:5aa0b5e — Single-flight token refresh, validated token response, lifetime clamp, refresh-and-retry on 401 (upstream MPNext)

**State:** open · **Recommendation:** adapt · **Effort:** M · **Risk:** medium · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 5aa0b5e

**Evidence:**

Upstream client.ts (git show 5aa0b5e) adds:
- an `inflight` shared promise and `failedUntil`, a negative cache of 5 s + up to 25 s jitter
- a lifetime clamp of [30 s, 3600 s] (MAX_TOKEN_LIFETIME_SECONDS)
- handleUnauthorized(rejectedToken), which invalidates only when the token is still the current one, wired as HttpClient's onUnauthorized
- errorName-only logging
Upstream client-credentials.ts adds a 10 s TOKEN_TIMEOUT_MS, redirect:'error', a static error with the status, readJsonResponse, and a required non-empty string access_token plus token_type 'bearer' (case-insensitive). Upstream HttpClient.request retries once after a successful onUnauthorized.
Ours: client.ts:68-94 has no single-flight (probe: 31 concurrent calls made 31 token POSTs) and no ceiling (probe: expires_in 1e13 gives Invalid Date, never refreshed). client-credentials.ts:26-38 has no timeout, no redirect refusal and no validation (probe: `{}` caches token=undefined for 55 min).
Our client still carries a user-token mode (client.ts:17-20,47-57,70) that upstream dropped. It is dead code: provider.ts:104 withAccessToken is reachable only through `new MPHelper({ accessToken })` (helper.ts:53-54) and MemberService.getInstance(accessToken), and no caller passes a token (manage-members/actions.ts:114,134,190,242 all call getInstance()). Users' MP tokens are stripped at sign-in anyway (CLAUDE.md, databaseHooks.account).
Our provider singleton is a per-module static (provider.ts:51,89-95), not globalThis, so single-flight is per bundle layer.

**Rationale:**

Single-flight, validation and the clamp port cleanly and close the concrete failure modes the probes reproduced.
The 401 retry interacts with our all-or-nothing dashboard semantics, mostly in our favour. Today a token MP revokes server-side before its local expiry (secret rotation, MP restart) makes every call 401 until the 55-min local expiry. Every mapWithConcurrency fan-out (getMonthlyAttendanceTrends, getEngagementRawData's ~51 months) then rejects whole. serviceCache serves the last good value, but a cold container stays empty and retryPartialWarm's 1/3/5-min retries all fail. With the hook, the first 401 of a burst invalidates once (the token === rejectedToken guard), the six in-flight callers share one refresh, and each request retries exactly once, so a 51-month fan-out survives a revocation instead of failing the whole entry. Replaying a 401'd POST/PUT is safe because MP rejected it before processing, and string and FormData bodies are re-sendable.
Caveats:
(1) The hook must not run in user-token mode (ensureValidToken is a no-op there, so the retry repeats the same 401). Either skip wiring it when isUserToken or delete the dead mode.
(2) A 401 that is not about the token would cost one extra refresh per failing request sequence. That is bounded by single-flight and is low risk, since MP uses 403 for permissions.
(3) The negative cache means every MP call fails fast for 5-30 s after a failed refresh. In all-or-nothing terms, a dashboard load or manual Refresh in that window rejects at once: serviceCache keeps the last good value, refreshDashboardCache returns its inline failure, and a manual refresh spends one of the 5/hour cacheRefresh tokens. retryPartialWarm's first retry, at 1 min, is outside the window. Acceptable, and it stops cold-start warms from hammering a down token endpoint 31 times.
(4) The token_type === 'bearer' check is a new fail-closed precondition: if MP's token response ever omits token_type, every MP call breaks. Requiring only a non-empty access_token is the smaller change. If token_type is checked, accept it absent, or confirm MP's real response on :dev first.

**Proposed change:**

client-credentials.ts: TOKEN_TIMEOUT_MS = 10_000 and redirect:'error'; try/catch around fetch throwing `Failed to get client credentials token: <error name>`; !ok error `... : ${status} ${statusText}`; JSON parse failure reported with a static message; require a non-empty string access_token (token_type: accept missing or 'bearer').
client.ts:
- move the body of :73-93 into a private refreshToken()
- ensureValidToken returns early when valid, else shares `this.inflight ??= this.refreshToken().finally(() => { this.inflight = null })`
- clamp seconds with Math.min(Math.max(seconds, 30), 3600)
- add failedUntil with jitter
- log errorForLog(error), not the raw error
- add handleUnauthorized(rejectedToken) and pass it to `new HttpClient(baseUrl, getToken, onUnauthorized)` only when !isUserToken
http-client.ts: optional third constructor arg; in each method (or a small shared send helper), on 401 with a hook call the hook, re-read getToken(), and retry once with a fresh AbortSignal. If the hook throws, fall through to the normal 401 error.

**Tests:**

client.test.ts:
- concurrent callers share one fetch
- a rejected refresh rejects all waiters and clears inflight
- within failedUntil a call throws without fetching; after it, a call fetches again
- expires_in 1e13, -1, 'abc' and absent give a finite expiry in [30 s, 55 min]
- handleUnauthorized with a stale rejectedToken does not invalidate a newer token
- user-token mode registers no hook (a 401 is not retried)
http-client.test.ts:
- a 401 then 200 retries once with the new token and a new signal
- a 401 then 401 throws after exactly two fetches
- a hook that throws gives the original 401 error
- six concurrent 401s for one token trigger one refresh
- POST and FormData bodies are re-sent
client-credentials.test.ts: {} / '' / non-string access_token rejects; timeout and redirect options present; an error never contains client_secret.
A dashboardService test that a mid-fan-out 401 recovers and the series is complete, so all-or-nothing does not reject.

### upstream:f2af96d — Harden MP OIDC provider, userinfo fetch and session payload (upstream MPNext); only the userinfo fetch part is N12

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** f2af96d

**Evidence:**

The N12 portion of f2af96d is the userinfo fetch: USERINFO_TIMEOUT_MS = 10_000 plus `signal: AbortSignal.timeout(...)` and `redirect: 'error'`, every failure returning null with a status/errName-only log, a not_an_object check, and profileDisplayName.
Our getMpUserInfo already has the null-returning structure and structured logs (src/lib/auth.ts:120-150: auth.userinfo.fetch_failed / http_error / bad_body / invalid_sub). The probe showed a `null` JSON body already resolves to null via the sanitizeGuid try, and the name is built with `|| ""` fallbacks (:190), so neither 'undefined undefined' nor the not_an_object throw affects us. Only the timeout and redirect refusal are missing (:123-125; probe init keys ['headers']). auth.test.ts:186-188 pins the exact init `{ headers: { Authorization: 'Bearer token' } }`.
The rest of f2af96d is outside N12 and mostly does not fit:
- requireIdTokenVerification: n/a. We pin no discoveryUrl, so genericOAuth builds no id_token verifier. That is the N17 posture.
- id_token exp/azp checks: N17.
- cookieCache strategy 'jwe' and withholding token/ipAddress/userAgent: N16.
- resolveMpUserId negative cache: n/a. Our customSession (auth.ts:765-769) does no MP lookup per session.
- the pkce comment: consistent with our pinned pkce:false.

**Rationale:**

Port only the two fetch options into our own getMpUserInfo. The upstream getUserInfo block is shaped differently (inline in the provider config, our function is exported and separately tested), so a code copy does not apply. A two-line change gives the userinfo request the same deadline and redirect refusal as the rest of the outbound calls, and keeps the user's bearer from following a redirect. The dp_Users enrichment inside the same callback (auth.ts:157-169) goes through MPHelper, which is covered by the client-credentials timeout in 5aa0b5e's port. Do not take the jwe switch as part of this: it contradicts the pinned setting and belongs to the N16 decision.

**Proposed change:**

src/lib/auth.ts:123-125: `fetch(`${mpOauthUrl}/connect/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(USERINFO_TIMEOUT_MS), redirect: "error" })`, with `export const USERINFO_TIMEOUT_MS = 10_000`. Optionally put the error name in the existing fetch_failed log (e.g. TimeoutError vs TypeError) without the message. Also replace the raw `error` in the 'Auth: Error fetching MP user profile during login:' log (:168) with errorForLog(error).

**Tests:**

auth.test.ts:186-188: expect `{ headers: {...}, signal: expect.any(AbortSignal), redirect: 'error' }`. New cases: fetch rejecting with a DOMException named TimeoutError, and with a TypeError (refused redirect), each resolves null and logs auth.userinfo.fetch_failed. Keep route.flow.test.ts green. Mirror the change in each sibling's auth.test.ts.

**Conflicts with pinned settings:**

Only the parts NOT recommended conflict. f2af96d sets cookieCache strategy 'jwe', but CLAUDE.md and security.md pin `cookieCache { 1h, strategy: "jwt", refreshCache: false }`, so that is left to N16. requireIdTokenVerification presumes discovery, while CLAUDE.md pins 'no discoveryUrl'. The recommended userinfo change touches no pinned setting.

### N13 — originOf accepts any scheme/host characters, so a bad env value can inject or widen CSP sources (upstream 6e160a3, originOf half)

**State:** open · **Recommendation:** port · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 6e160a3

**Evidence:**

src/lib/security-headers.ts:31-38 is still `try { return new URL(raw).origin } catch { return null }` with no scheme or hostname check. It is used on every proxied request at src/proxy.ts:29 (img-src from NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL) and src/proxy.ts:30 (form-action from MINISTRY_PLATFORM_BASE_URL), and the result is pasted into the policy at security-headers.ts:157 and :179. A probe (scratchpad/n13n14/probe.mjs) shows the current code returns 'https://a;sandbox' (adds a directive), 'https://*' and 'https://%2A' (both become 'https://*', allowing every https host), 'https://a%3Bsandbox' (becomes 'https://a;sandbox'), 'ftp://h', "https://a'b", and 'null' for javascript:. Upstream's version (scheme must be http/https, hostname must match /^[a-z0-9.-]+$/) returns null for all of these and still returns the real MP origin, http://localhost:3000, and punycode IDNs unchanged. The tests at src/lib/security-headers.test.ts:22-36 cover only the happy path and parse failures. Siblings have the same code: event-manager/src/lib/security-headers.ts:34, mp-senior-care/src/lib/security-headers.ts:34 and music-db/src/lib/security-headers.ts:34 all `return new URL(raw).origin`, and none has CSP_SAFE_HOSTNAME. Baseline `npx vitest run src/lib/security-headers.test.ts src/test-only-imports.test.ts` gives 28/28 passing.

**Rationale:**

This is the smallest possible fix (about 6 lines), and it keeps our own design: an unusable value already degrades to a tighter policy (null). The input is operator-controlled env only, so it is LOW, but a typo such as a wildcard host would silently widen img-src or form-action in an enforcing CSP. It conflicts with no pinned setting. One side effect to accept and document: an IPv6-literal host ([::1]) now returns null. That is fine, because MP is always a DNS name. If MINISTRY_PLATFORM_BASE_URL were rejected, form-action would fall back to 'self' and an enforced CSP would block the sign-out redirect to MP. That is the same outcome as an unset variable today, so it is not a new failure mode.

**Proposed change:**

src/lib/security-headers.ts: add `const CSP_SAFE_HOSTNAME = /^[a-z0-9.-]+$/;` and change originOf to parse into `url`, return null unless `url.protocol` is 'https:' or 'http:', return null unless CSP_SAFE_HOSTNAME.test(url.hostname), then return url.origin. Copy upstream's doc comment explaining *, %2A, ; and javascript:. Make the same change in event-manager, mp-senior-care and music-db (each file's line 34).

**Tests:**

In src/lib/security-headers.test.ts, add a case to the 'originOf' describe that expects null for 'https://*', 'https://%2A', 'https://a;sandbox', 'https://a%3Bsandbox', 'ftp://h', 'javascript:alert(1)' and "https://a'b", and that still accepts 'http://localhost:3000' and an IDN (which becomes punycode). Optionally add a buildContentSecurityPolicy test showing that originOf('https://a;sandbox') leaves img-src as "'self' data: blob:". Mirror these in the three sibling test files.

### N14 — next.config gaps: X-Powered-By sent, /_next/image optimizer live and unauthenticated, dev logs Server Function arguments (upstream 9904f67)

**State:** open · **Recommendation:** port · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 9904f67, 6e160a3

**Evidence:**

next.config.ts:3-43 sets only output, cacheComponents, experimental.serverActions, cacheHandlers and headers. It has no poweredByHeader, no images and no logging. In Next 16.4.5, node_modules/next/dist/server/config-shared.js:113 defaults poweredByHeader to true, and config-shared.d.ts:1851 defaults logging.serverFunctions to true (the option exists at :307 and in config-schema.js:760). The proxy matcher excludes `_next/image` (src/proxy.ts:110), so the optimizer has no auth check. All 6 <Image> sites already pass `unoptimized`: contact-lookup-results.tsx:122/130, person-avatar.tsx:33/38, header.tsx:56/66, detail-modal-photo-upload.tsx:41/46, member-card.tsx:31/36 and contact-lookup-details.tsx:718/723. There are no static image imports, no placeholder="blur", no getImageProps and no next/legacy/image, so nothing uses the optimizer. On vendored picomatch: with images.unoptimized, next-server.js:193 calls render404 before validateParams. As a result image-optimizer.js:235/259 (hasLocalMatch/hasRemoteMatch) never runs. Today it runs on every unauthenticated /_next/image?url=/... request and compiles the default localPatterns [{pathname:'**'}] from config.js:527-534 with next/dist/compiled/picomatch's makeRe against an attacker-chosen pathname. The other users of the vendored copy are either dev-only (shared/lib/image-loader.js:58-80 is gated on NODE_ENV !== 'production' and is skipped for unoptimized images), only used when remotePatterns and assetPrefix are both set (config.js:567; we set neither), or build-time (build/segment-config/middleware/middleware-config.js:93). The vendored file still ships inside `next`, but nothing reaches it at runtime once the flag is set. Pin: src/test-only-imports.test.ts:376 has REVIEWED_OPTIONS = [cacheComponents, cacheHandlers, experimental, headers, output], and :390-395 asserts the exact key set, so adding any of the three keys fails until that list is updated. The extglob guard at :397-401 is unaffected, since unoptimized adds no patterns. Siblings: event-manager already has images.unoptimized:true (next.config.ts:6-17, fd538c0, 2026-09-04, with 'images' in its REVIEWED_OPTIONS:378) but lacks poweredByHeader and logging. mp-senior-care has none of the three (REVIEWED_OPTIONS:376). music-db has poweredByHeader:false but keeps the optimizer live through `images.remotePatterns` [moody.ministryplatform.com] (next.config.ts:7-13), although its one <Image> (header.tsx:102-108) is unoptimized and its proxy also excludes _next/image (proxy.ts:104), and it lacks logging.serverFunctions.

**Rationale:**

All three switches cost nothing in function terms. The optimizer is unused (every Image is unoptimized), so turning it off makes the existing convention enforced and removes an unauthenticated compute and fetch endpoint that has had its own advisories. It also takes the only production request path to Next's vendored picomatch (GHSA-fc5q-39xc-vjpf) out of reach, which narrows the remaining exposure that the allow-list reason describes. logging.serverFunctions:false matters because `next dev` points at production MP and would print pastoral notes and search terms. event-manager has run unoptimized:true in production since 2026-09-04 with no regressions, which validates the images change for this template. The only pinned-setting interaction is the deliberate one: the test-only-imports REVIEWED_OPTIONS list has to grow in the same commit, after review against check:standalone. Of the three, only `images` can change the build trace.

**Proposed change:**

next.config.ts: add `poweredByHeader: false`, `logging: { serverFunctions: false }` and `images: { unoptimized: true }`, each with a short comment (copy event-manager's images comment). src/test-only-imports.test.ts:376: change REVIEWED_OPTIONS to ["cacheComponents","cacheHandlers","experimental","headers","images","logging","output","poweredByHeader"] and extend the doc comment at :370-374. Docs: in .claude/rules/security.md, update the 'Next itself vendors picomatch 4' paragraph to say that with images.unoptimized the optimizer 404s before any pattern match, so the vendored copy ships but no runtime request path reaches it. Optionally refresh scripts/audit-allowlist.json's reason text the same way. The allow-list is test-pinned, so edit only the reason string. Siblings: event-manager adds poweredByHeader and logging. mp-senior-care adds all three. music-db replaces remotePatterns with unoptimized:true (its only Image is already unoptimized, so the dev-only remote check never runs) and adds logging. Each sibling updates its own REVIEWED_OPTIONS.

**Tests:**

New src/lib/next-config.test.ts (or a describe block in test-only-imports.test.ts) that imports ../next.config and asserts poweredByHeader === false, logging.serverFunctions === false and images.unoptimized === true, following upstream's next-config-headers.test.ts. Run src/test-only-imports.test.ts. CI `verify` must also run npm run build and npm run check:standalone, since `images` is the option the pin calls out as able to change the trace. After deploying to :dev, confirm by hand that GET /_next/image?url=%2Ffavicon.ico&w=64&q=75 returns 404, that responses carry no X-Powered-By, and that avatars and MP photos still render.

**Conflicts with pinned settings:**

src/test-only-imports.test.ts:376 pins next.config.ts's option set. Adding images/logging/poweredByHeader fails it by design until REVIEWED_OPTIONS is updated after a check:standalone review. Nothing in CLAUDE.md conflicts, and the extglob rule (:397-401) still holds because no patterns are added.

### upstream:6e160a3-extras — 6e160a3 extras: COOP/CORP same-origin and CSP base-uri 'none'

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 6e160a3

**Evidence:**

COOP/CORP are done in mp-charts. next.config.ts:27-30 sends Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Resource-Policy: same-origin on '/(.*)' (added in 9e27f7e, 2026-06-24, F14), and the audit's P11 row (security-audit-2026-10-10.md:353) records them as '✓ done'. No test pins them, though: grep finds 'Cross-Origin-Opener' in no file under src/ or scripts/, while upstream's 6e160a3 adds a config test for them. Compatibility check: sign-in and sign-out are full-page navigations (signIn.social redirect; the sign-out form ends in redirect() to MP endsession, per the comment at security-headers.ts:79-85). Nothing calls window.open, and nothing uses beforeinstallprompt or opener (grep src/public). Every target=_blank link carries rel=noopener noreferrer (e.g. contact-logs.tsx:426-427, compliance-detail-modal.tsx:159-160). The manifest, sw.js and icons are same-origin, and MP photos are fetched from MP, which our CORP does not affect. The headers have been in production since June with no reported breakage. base-uri is still open: security-headers.ts:177 emits "base-uri 'self'", and security-headers.test.ts:150 pins 'self'. No <base> element exists in src/ or in node_modules/next/dist/client (grep). Siblings: none of the three sends COOP/CORP (event-manager, mp-senior-care and music-db next.config headers list only XFO, nosniff, Referrer-Policy, DNS-prefetch, HSTS and Permissions-Policy), and all three emit base-uri 'self' (event-manager security-headers.ts:177, mp-senior-care :218, music-db :178).

**Rationale:**

In mp-charts only two small pieces remain. First, tighten base-uri to 'none': nothing renders a <base>, and 'none' is strictly tighter with no functional cost. Second, add a test pinning the COOP/CORP headers we already send, so that a future edit to next.config cannot silently drop them. The sibling repos never got F14, so they need COOP/CORP added. The same compatibility reasoning applies to them (full-page OAuth redirects, no popups), but each sibling should check its own window.open and popup use before shipping, because COOP same-origin would cut the opener link of any cross-origin popup flow. No pinned setting is affected: this does not touch the auth config, allowedAuthRoutes or the proxy matcher.

**Proposed change:**

src/lib/security-headers.ts:177: change to "base-uri 'none'" with upstream's comment ('neither this app nor Next renders a <base>'). Update security-headers.test.ts:150 to expect 'none'. Add a next.config headers test asserting COOP=same-origin and CORP=same-origin, and that no Content-Security-Policy is set in config. It can share the new src/lib/next-config.test.ts proposed under N14. Siblings: add the two COOP/CORP header lines to each next.config.ts headers() array, change base-uri to 'none' in each security-headers.ts, and update each one's base-uri test.

**Tests:**

Update security-headers.test.ts:150 to expect base-uri 'none'. Add a new test for the config headers. After deploying to :dev, do a manual sign-in/sign-out walk under the enforced CSP. This is needed in the siblings in particular, where COOP is new, and should also cover opening an MP file link in a new tab.

### N15 — Three CodeQL js/log-injection alerts (#10, #11, #21) on the N1 file actions

**State:** fixed · **Recommendation:** already_done · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** —

**Evidence:**

The audit (.claude/notes/security-audit-2026-10-10.md:61, :209-214) lists alerts #10 (compliance-processing/actions.ts:179), #11 (:208) and #21 (journey-processing/actions.ts:140). The 2026-10-21 addendum (:389-430) says errorForLog replaced the raw Error logging at those sites. GitHub API, checked today: #10, #11 and #21 are state=fixed, fixed_at 2026-10-21T16:40:52Z. The other log-injection alerts #19, #20, #22-#25 and #28 are state=dismissed (false positive, with written justification) as of the same date. #26 and #27 were fixed 2026-08-21. In the current tree, src/components/compliance-processing/actions.ts:194 and src/components/journey-processing/actions.ts:145 log with errorForLog(error). The helper is src/lib/log-safe.ts (it keeps the verbatim .replace(/\n|\r/g, "") form that CodeQL recognises). Of the open-alerts query (`gh api .../code-scanning/alerts --paginate`, state==open), exactly ONE alert is open, and it is not log-injection: #37, js/incomplete-sanitization (security_severity "high"), at src/services/dashboardService.core.test.ts:95, opened 2026-11-17T21:48Z on refs/heads/main, message "This does not escape backslash characters in the input." The code there is `const escaped = column.replace(/[.[\]]/g, '\\$&');` inside the test-only helper inList(). It came in with the #302 / #304 test rewrites (db65ea5 and fa8b21e, 2026-11-17). Its inputs are hard-coded column literals (lines 302, 421, 432, 452, 510, 602, 697, 711, 770), so nothing can exploit it. The alert is still real noise on the Security tab. About 34 other `console.error("…", error)` sites still log the raw Error (e.g. contact-logs/actions.ts x7, compliance-processing x10, journey-processing x9). CodeQL either does not flag them or they are among the dismissed false positives.

**Rationale:**

The three alerts the audit names are closed by the 2026-10-21 change, and every other log-injection alert is fixed or dismissed with a reason, so N15 itself is complete and the audit table row (line 61, still "confirm the alerts close") can be marked done. The only open alert is the new test-file #37. It is not exploitable, but it is a one-line fix and leaving a "high" alert open trains people to ignore the tab. Fixing it in code is smaller and more honest than adding paths-ignore for tests to codeql.yml, which would also hide real findings in test helpers. The remaining raw-Error console.error sites are not open alerts. They are already dismissed with reasons, and their error messages are static or numeric per the dismissal notes. A sweep to errorForLog would be hygiene (.claude/rules/security.md "Log caught errors with errorForLog"), not a fix for N15, and is not proposed here.

**Proposed change:**

(1) Close CodeQL #37: in src/services/dashboardService.core.test.ts:95 replace `column.replace(/[.[\]]/g, '\\$&')` with a full regex-metacharacter escape, `column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`. Backslash is included, which is what CodeQL wants. (2) Docs only: update the N15 row at security-audit-2026-10-10.md:61 to "Fixed 2026-10-21 (alerts #10/#11/#21 fixed; #19-#25, #28 dismissed FP)" and note #37 and its fix.

**Tests:**

None new. Run `npx vitest run src/services/dashboardService.core.test.ts` (passes today: 72 tests across the three files run). After merge, confirm the next CodeQL run on main marks #37 fixed (`gh api repos/The-Moody-Church/mp-charts/code-scanning/alerts/37 -q .state`).

### N16 — session_data cookie cache is signed-but-readable JWT; /get-session hands token/ipAddress/userAgent to page JS

**State:** open · **Recommendation:** port · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** f2af96d

**Evidence:**

Audit: .claude/notes/security-audit-2026-10-10.md:62, :216-220, and the P3 row at :338 ("strategy: jwe; session fields withheld | open"). Current tree: src/lib/auth.ts:618-623 sets `cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS, strategy: "jwt", refreshCache: false }`. src/lib/auth.ts:765-774 `customSession` returns the session unchanged (`session,`) and adds unused firstName/lastName. The jwt pin is in src/lib/auth.session-lifetime.test.ts:156; the negative control at :195 deliberately stays jwt. CLAUDE.md ("cookieCache { 1h, `jwt`, `refreshCache: false` }") and .claude/rules/security.md (Better Auth Sessions table) document it. Upstream: f2af96d ("cookieCache.strategy jwe … enrichSessionUser: withhold session token/ipAddress/userAgent"), reached via merges 5e9d7af (#99) and 8a1b161 (#107), after our last logged review 75d249d and not in upstream-sync-log.md. Upstream implements it as WITHHELD_SESSION_FIELDS plus withholdSessionFields() inside enrichSessionUser called from customSession (upstream/main:src/lib/auth.ts:156-212), and `strategy: "jwe" as const` (:887). better-auth 1.7.18 (installed) supports jwe: dist/cookies/index.mjs:102 encodes with symmetricEncodeJWT (dir + A256CBC-HS512, HKDF from the secret), :130 decodes it, and decode failure returns null (dist/crypto/jwt.mjs). jwe is also better-auth's own stateless default (dist/context/create-context.mjs:49-54), which our explicit jwt overrides. Probes (scratchpad n16/*.probe.test.ts, a scratch vitest config running the real auth.session-lifetime harness against `betterAuth({...auth.options, cookieCache.strategy:"jwe"})`): the 12h ceiling (lastValid 12h, firstInvalid 12h+10m), the copied-pair-dies-within-1h walk, and cookieRefreshCache===false all pass under jwe. session_data grows from 1017 to 1213 bytes, well under 4096, and better-auth chunks anyway (cookies/session-store.mjs). A jwt-minted cookie decodes to null under jwe. Today the readable jwt payload's session keys are expiresAt,token,createdAt,updatedAt,ipAddress,userAgent,userId,id, plus the user's name, mpEmail and userGuid. /get-session currently returns session keys id,createdAt,updatedAt,userId,expiresAt,token,ipAddress,userAgent. Swapping customSession for one that deletes token/ipAddress/userAgent removes them on the fresh, cookie-cache-hit and store paths and from server-side auth.api.getSession. Sign-out still works (200, then token-only replay → null). Nothing in src reads session.session.token/ipAddress/userAgent or user.firstName/lastName: grep finds only unrelated `member.firstName` and navigator.userAgent. The readers of auth.api.getSession use only user.* (src/lib/auth-helpers.ts:10, src/components/user-menu/actions.ts:35-52, src/components/layout/auth-wrapper.tsx:6-21). Current suites pass: auth.session-lifetime, route.flow, dashboardService.core (72 tests).

**Rationale:**

It is a small, low-risk change. Cookies are HttpOnly, so exposure needs something that already sees Cookie headers (proxy/APM logs, HAR files, extensions), but those currently get the real MP email, name, userGuid, IP, UA and raw session token in plaintext base64. On the questions asked: (a) Switching jwt→jwe signs everyone out once, and that costs the same as a deploy. Every deploy already empties the in-memory store, and users already re-auth within 1h of a deploy (CLAUDE.md). With jwe the old jwt session_data fails to decode, and better-auth falls back to the (empty) store, so they re-auth on the first request instead of within the hour. The redirect is silent while their MP session is alive. A rollback to a jwt build costs the same one-time sign-out. (b) 1.7.18 supports jwe with our exact config, and the 12h, no-slide, refreshCache:false guarantees hold (probed). jwe keys from secretConfig, and since assertAuthEnvironment refuses BETTER_AUTH_SECRETS, that is the single BETTER_AUTH_SECRET. Rotation is still the emergency sign-out. (c) Do the strip in customSession, as upstream does, NOT in the route.ts allowlist. customSession covers both the HTTP /get-session and in-process auth.api.getSession on every path (probed). A response filter in src/app/api/auth/[...all]/route.ts would touch only HTTP and would mean re-parsing better-auth's JSON in our deny-by-default layer. The values stay inside the now-encrypted session_data and the in-memory row, which is fine. This deviates from a pinned setting only in a narrow way: CLAUDE.md, security.md and auth.session-lifetime.test.ts:156 pin strategy "jwt". That value was incidental, and the load-bearing pins (maxAge 1h, refreshCache:false explicit, 12h, disableSessionRefresh) are untouched. The pin text must still change in the same commit. None of the deliberate divergences (pkce:false, no discoveryUrl, providerId, in-memory sessions, allowedAuthRoutes) is touched. Deploy needs a :dev soak with a human sign-in, as for the 2026-10-01 hardening, because it changes the cookie every user holds.

**Proposed change:**

src/lib/auth.ts: (1) at :621 change `strategy: "jwt"` to `strategy: "jwe"` and add a comment (encrypted dir/A256CBC-HS512 keyed from BETTER_AUTH_SECRET; changing strategy invalidates existing session_data once, like a deploy). (2) Export `WITHHELD_SESSION_FIELDS = ["token","ipAddress","userAgent"] as const` and a pure `withholdSessionFields(session)` (or upstream's `enrichSessionUser` shape, minus its resolveMpUserId/userId, which we do not use). Make customSession at :765 return `{ user, session: withholdSessionFields(session) }`. Optionally drop the unused firstName/lastName split, as upstream did; nothing reads them. (3) Update the doc comment at :389 ("signed session_token + session_data") and the comment at src/components/user-menu/user-menu.tsx:23 ("one-hour JWT cookie cache"). Docs in the same commit: CLAUDE.md session-lifetime bullet and .claude/rules/security.md "Better Auth Sessions" table (jwt→jwe), the audit N16 row (:62, :338), and an upstream-sync-log.md entry for f2af96d (partially adopted: jwe + field strip; requireIdTokenVerification and the id_token exp/azp checks belong to the N17 posture decision, not this). Mirror the same two edits into the siblings.

**Tests:**

src/lib/auth.session-lifetime.test.ts:156 pin "jwe"; leave the :195 negative control on jwt (it reproduces the pre-fix block). The existing walks already pass under jwe (probed). Add one assertion that the minted session_data is a 5-segment JWE whose protected header is {alg:"dir",enc:"A256CBC-HS512"} and whose segments do not base64url-decode to JSON containing mpEmail or userGuid. In src/app/api/auth/[...all]/route.flow.test.ts after :124-133, assert `session.session` has none of token/ipAddress/userAgent on the fresh response. In the :138-157 token-only re-issue test, assert the same on the store path. Add a cache-hit replay check and an `auth.api.getSession` check. Add a unit test for withholdSessionFields (removes exactly the three keys, does not mutate its input). Run the full `npm run test:run` plus the security lint, then soak on :dev with a real MP sign-in and sign-out (id_token_hint still sent).

**Conflicts with pinned settings:**

CLAUDE.md (Architecture > Session lifetime: "cookieCache { 1h, `jwt`, `refreshCache: false` }"), .claude/rules/security.md "Better Auth Sessions" table, and src/lib/auth.session-lifetime.test.ts:156 pin strategy "jwt". The change edits only that one value. maxAge 1h, explicit refreshCache:false, expiresIn 12h and disableSessionRefresh stay exactly as pinned, and the pin text and test must be updated in the same commit.

### N17 — id_token not signature-verified (upstream #101/#107 lazy JWKS verifier: 6ae05df, 23660fd, aa1bc64)

**State:** open · **Recommendation:** needs_user_decision · **Effort:** L · **Risk:** medium · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 6ae05df, 23660fd, aa1bc64

**Evidence:**

CURRENT TREE (mp-charts main dbf2050):
- src/lib/auth.ts:213-230 `idTokenSubject` base64url-decodes the payload WITHOUT verification; its comment (218-219) relies on 'if discovery is ever re-enabled better-auth has already verified the token', which is not the case today.
- src/lib/auth.ts:739-760 `getUserInfo`: identity comes from `getMpUserInfo(tokens.accessToken)` (120-209, `/connect/userinfo` over TLS, sanitizeGuid on sub at 151); the id_token is used ONLY for a sub cross-check (744-750) and for sign-out's id_token_hint (`rememberIdToken`, 758). The cross-check runs only `if (tokens.idToken)`, so a missing id_token is accepted, pinned by src/lib/auth.test.ts:487 ('still signs in when MP returns no ID token'). No `exp`/`aud`/`iss`/`azp` check.
- src/lib/auth.ts:635-647 explicit endpoints, no discoveryUrl; 730 `disableIdTokenNonceBinding: true`; 738 `accountSubject`. better-auth 1.7.18 genericOAuth builds `idTokenConfig` only inside `if (c.discoveryUrl)` (node_modules/better-auth/dist/plugins/generic-oauth/index.mjs:110-142), so nothing verifies today. This is the playbook's state C.
- The only path where a CALLER-supplied id_token could reach the app, the /sign-in/social idToken branch, is closed three ways: route body filter, hooks.before at src/lib/auth.ts:552-575, plus better-auth's own ID_TOKEN_NOT_SUPPORTED without idTokenConfig.
- The audit lists it as LOW, accepted posture: .claude/notes/security-audit-2026-10-10.md:63, 222-228, 341, 362, and line 380 ('N17 needs an owner decision first'). The divergence is recorded in .claude/notes/upstream-sync-log.md:67 (2026-09-24). #101/#107 are not in the sync log yet.

UPSTREAM (git show upstream/main:src/lib/auth.ts):
- 323-328: OIDC_DISCOVERY_TIMEOUT_MS = 5000.
- 339: ID_TOKEN_ALGORITHMS = ['RS256'].
- 363-407 `fetchIdTokenVerifier`: redirect:'error', AbortSignal.timeout; issuer and jwks_uri from discovery; jose createRemoteJWKSet.
- 429-439 `lazyIdTokenVerifier`: single-flight, cached on success for the process lifetime, failure not cached.
- 453-459 `idTokenClaimFailure`: missing_exp, and azp when aud is an array.
- 699-725 `verifyMpIdToken`: jwtVerify with issuer, audience = OIDC_CLIENT_ID and RS256. NO clockTolerance.
- 1028-1031: a missing id_token is refused.
- Playbook .claude/playbooks/port-oidc-lazy-discovery.md (aa1bc64), Phase 1 table: 'C. Explicit endpoints, no id_token verification → Not affected by the outage. Adding verification is a posture change: ask the user. If they decline, stop.'

PROBES (read-only, 2026-11-18):
- MP's public discovery doc: issuer https://moody.ministryplatform.com/ministryplatformapi/oauth; jwks_uri …/oauth/.well-known/jwks (same host as token and userinfo); id_token_signing_alg_values_supported ['RS256']; authorization_response_iss_parameter_supported absent.
- JWKS: HTTP 200 in 0.13 s, one RSA 'sig' key with no `alg`.
- jose 6.2.16 is already installed transitively (better-auth and @better-auth/core), but it is not a direct dependency in any of the four repos.
- jose node_modules/jose/dist/webapi/jwks/remote.js:44: cacheMaxAge defaults to 600 s and cooldown to 30 s.
- remote.js:68: `(!local || !isFreshFor(jwksTimestamp, cacheMaxAge)) && await reload()`. A JWKS older than 10 min is re-fetched on the next verify, and there is NO stale fallback, so a failed refetch throws.
- jose jwt_claims_set.js:72-86: clockTolerance defaults to 0, and nbf/exp are checked against the local clock.

SIBLINGS: all three share the identical gap. Each has the unverified `idTokenSubject` and a conditional cross-check:
- event-manager/src/lib/auth.ts:221, 723-724
- mp-senior-care/src/lib/auth.ts:223, 729-730
- music-db/src/lib/auth.ts:224, 718-719
No jwtVerify or createRemoteJWKSet in any of them. All are on better-auth >=1.7.18 <1.8.0.

**Rationale:**

My recommendation is to DECLINE the port. Keep the current posture, record the decision in the audit, the sync log and CLAUDE.md, and at most take the zero-network tightening described under proposed_change (option B).

(1) Does lazy verification bring back the boot-time failure CLAUDE.md warns about? No. Upstream keeps no discoveryUrl in the provider config, so CLAUDE.md's 'no discoveryUrl' pin is NOT contradicted. Building the instance makes no MP call. Discovery is fetched inside the OAuth callback with a 5 s timeout, single-flight, and a failure is never cached. There is no process-lifetime provider drop and no ~300 s hang of session checks. What it DOES add is a new per-sign-in runtime dependency:
  (a) discovery, until the first success; it is then cached for the process lifetime, so a changed issuer or jwks_uri needs a restart;
  (b) the JWKS, re-fetched whenever the cached key set is older than 10 min, with no stale fallback (jose remote.js:68). For our sporadic staff sign-ins this means most sign-ins hit the JWKS endpoint;
  (c) up to +5 s (discovery) and +5 s (JWKS) of callback latency against a slow MP;
  (d) zero clock tolerance. Upstream sets none, so TMC1 clock drift behind MP fails `nbf`/`exp` and breaks sign-in in all four apps at once;
  (e) RS256 is pinned, so an algorithm change at MP breaks sign-in until a code change.

(2) What happens to sign-in when MP's JWKS is down? `verifyMpIdToken` returns null. The callback lands on /auth-error?error=unable_to_get_user_info for every sign-in whose cached JWKS is older than 10 min. Existing sessions are unaffected, because session checks never call MP. The first sign-in after the JWKS recovers works again with no restart. Because the JWKS is on the same host as the token and userinfo endpoints (verified), a whole-MP outage already blocks sign-in today. The new exposure is a JWKS-only or discovery-only fault, such as a WAF or caching rule, a key-rotation or IdentityServer misconfiguration, or clock skew, which today would not affect sign-in.

(3) What concrete attack does it close, given a confidential client and TLS userinfo? I could not construct one.
  - Identity is the userinfo `sub`, fetched with an access token that came straight from MP's client-authenticated token endpoint over TLS. The id_token is only a cross-check and a sign-out hint.
  - Forging the id_token requires tampering with the TLS back channel. That attacker could equally rewrite userinfo, and since upstream reads jwks_uri from discovery on the same host, also the JWKS.
  - A code issued to another client fails at the token endpoint, so `aud` adds nothing.
  - Login CSRF and code injection are handled by the state cookie; signature verification would not stop them, and PKCE and nonce are what would. Both are unavailable (pkce:false is pinned; MP sends no nonce).
  - Mix-up attacks are moot with a single provider.
  - The one path where an attacker-supplied id_token could matter, the /sign-in/social idToken branch, is already closed three ways.
  - The `exp` check is moot for a token minted moments earlier by the token endpoint.
  OIDC Core §3.1.3.7(6) explicitly allows TLS server validation in place of a signature check for code-flow tokens. The gain is spec-conformance and defence in depth only; the cost is a new sign-in failure mode in four production apps.

If the owner prefers conformance (for example to stay aligned with upstream's playbook state D), port it with the deviations listed under proposed_change. Pinned-setting conflicts: upstream's full port removes `disableIdTokenNonceBinding` (pinned in CLAUDE.md as a guard; keep it), refuses a missing id_token (flips our pinned test at auth.test.ts:487), and uses `endSessionEndpoint` in place of our pinned `disableProviderLogout: true` (keep ours). pkce:false, providerId 'ministryplatform', the cookieCache settings and allowedAuthRoutes are untouched either way.

**Proposed change:**

OPTION A, decline (my recommendation): no code change. Docs only:
- mark N17 'accepted (owner decision YYYY-MM-DD)' in .claude/notes/security-audit-2026-10-10.md (lines 63, 222-228, 341, 362, 380);
- add a #101/#107/aa1bc64 row to .claude/notes/upstream-sync-log.md stating 'state C, declined' with the reasoning above;
- correct the `idTokenSubject` comment at src/lib/auth.ts:213-220, which implies verification happens somewhere, in all four repos.

OPTION B, minimal no-network tightening (optional, XS per repo): in `getUserInfo` (src/lib/auth.ts:744), refuse a missing id_token instead of skipping the cross-check, since we always request `openid`. Optionally also compare the decoded `aud` against OIDC_CLIENT_ID and `iss` against `${mpOauthUrl}`. This adds no network dependency and no clock dependency. It is not a signature check; it only removes the 'no id_token' leniency. Flip the test at auth.test.ts:487 and the route.flow test.

OPTION C, port upstream (only if the owner wants verification):
- Copy `fetchIdTokenVerifier`, `lazyIdTokenVerifier`, `verifyMpIdToken` and `idTokenClaimFailure` from upstream/main:src/lib/auth.ts (323-459, 676-725) into src/lib/auth.ts. Replace the `idTokenSubject` decode in `getUserInfo` with the verified claims; keep the case-insensitive sub binding and the never-throw contract.
- Deviate from upstream in four places:
  (i) add `clockTolerance: 60` to jwtVerify;
  (ii) consider constructing createRemoteJWKSet with a longer `cacheMaxAge` (e.g. 6 h) so a JWKS blip does not fail sign-in. Key rotation still triggers a reload on an unknown kid (30 s cooldown);
  (iii) keep `userInfoUrl`, `disableIdTokenNonceBinding: true`, `disableProviderLogout: true` and `pkce: false` as pinned;
  (iv) do not adopt upstream's `env.ts` here (that is N19).
- Add `jose` to package.json dependencies (required by src/test-only-imports.test.ts) and relock.
- Mirror the same change into event-manager, mp-senior-care and music-db (same `idTokenSubject` and getUserInfo shape at the lines cited).
- Update CLAUDE.md (Architecture bullet), .claude/rules/security.md and the root CLAUDE.md Better Auth family section.
- Each repo gets a :dev soak with a human sign-in before promotion, per house practice.

**Tests:**

Option A: none. Docs only.

Option B: in auth.test.ts, flip the test at line 487 so a missing id_token returns null with `auth.userinfo.sub_mismatch` logged and nothing captured. Add a route.flow.test.ts case where the fake MP's token response omits id_token and the callback lands on /auth-error?error=unable_to_get_user_info. If the aud/iss checks are adopted, cover a wrong aud and a wrong iss.

Option C:
- Convert every fake id_token (auth.test.ts `fakeIdToken`, route.flow.test.ts:42) to a jose-signed RS256 token. Have the fetch stubs serve discovery plus JWKS.
- New regression suite modelled on upstream src/auth.oidc-discovery.test.ts:
  - zero MP calls at module load;
  - discovery 500, refused or hung: that callback returns null, and the next callback recovers on the same instance;
  - JWKS down: null, then recovery;
  - 5 s timeout;
  - redirect refused;
  - single-flight;
  - failure never cached;
  - alg confusion (HS256 or none) refused;
  - wrong iss, wrong aud, expired token, missing exp, azp mismatch;
  - clock-skew tolerance within ±60 s accepted and beyond it refused.
- Mutation check: re-adding `discoveryUrl` or removing the verify call turns tests red.
- Keep the existing pins (pkce:false, disableIdTokenNonceBinding, accountSubject, hooks.before).
- Run the src/test-only-imports.test.ts and check:standalone checks with jose as a direct dependency.
- Real-MP sign-in smoke on :dev in each of the four apps, confirming no `auth.userinfo.id_token_unverified` in the logs.

**Conflicts with pinned settings:**

Option A and Option B conflict with nothing.

Upstream's full port (Option C, copied as-is) conflicts with three pins:
(1) it removes `disableIdTokenNonceBinding: true`, which CLAUDE.md pins as a guard (auth.test.ts:415). Keep it.
(2) it refuses a missing id_token, which contradicts the pinned test auth.test.ts:487. That is a deliberate posture change if taken.
(3) it uses `endSessionEndpoint` without `disableProviderLogout`, while CLAUDE.md pins `disableProviderLogout: true`. Keep ours.

It does NOT conflict with 'no discoveryUrl': upstream also has none in the provider config and fetches discovery lazily in its own code. It does, however, re-add a runtime dependency on the discovery document, which the 2026-09-24 divergence (sync log line 67) was written to avoid at boot.

**Decision needed:**

N17 / upstream #107: Should the four Better Auth apps (mp-charts, event-manager, mp-senior-care, music-db) start verifying MP's id_token signature against MP's JWKS?

I found no attack it would stop in our setup. Identity already comes from MP's userinfo endpoint over TLS, using a confidential client, and the one path where an attacker could supply an id_token is already closed. What it would add: sign-in in all four apps would also depend on MP's discovery and JWKS endpoints (re-fetched about every 10 minutes) and on server clock accuracy. It is roughly a day of work plus a :dev sign-in soak in each app.

The options:
(A) Decline and record it as accepted. This is my recommendation.
(B) Decline, but also refuse a sign-in when MP's token response has no id_token, and check its aud/iss. No network cost, about an hour per repo.
(C) Port upstream's lazy verifier into all four apps, with a 60-second clock tolerance and a longer JWKS cache than upstream's.

### N18 — CI hardening: actions pinned by tag, no workflow-level permissions on docker-build-push.yml / audit-nightly.yml, persist-credentials left at default (upstream fc224f3)

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** fc224f3

**Evidence:**

Every `uses:` in mp-charts is still tag-pinned. docker-build-push.yml:35,76,182 actions/checkout@v7; :79 actions/setup-node@v7; :132,185 docker/setup-buildx-action@v4; :141,218 docker/build-push-action@v7; :210 docker/login-action@v4; :163,252 aquasecurity/trivy-action@v0.36.0. audit-nightly.yml:37 checkout@v7, :40 setup-node@v7. codeql.yml:28 checkout@v7, :31 github/codeql-action/init@v4, :43 analyze@v4. sync-issues-to-ideas.yml:29,367 checkout@v7, :32,372 actions/github-script@v9.

Permissions: docker-build-push.yml has no `permissions:` key at any level (the file goes from concurrency at :26-28 straight to `jobs:` at :30). audit-nightly.yml has none either (:29 `jobs:`). codeql.yml:21-24 sets job-level security-events:write, contents:read, actions:read. sync-issues-to-ideas.yml:16-18 sets workflow-level contents:write, issues:write.

persist-credentials: no checkout in any workflow sets it, so all use the default (true). sync-issues-to-ideas.yml depends on that default: it runs `git pull --rebase` and `git push` at :355-356 and :758-759.

What this exposes today is small. `gh api repos/The-Moody-Church/mp-charts/actions/permissions/workflow` returns default_workflow_permissions "read" (the same in event-manager, mp-senior-care and music-tools). The repo is public, so a leaked read token reveals nothing new. `.dockerignore` excludes `.git`, so the persisted token never enters the build context; `docker/build-push-action` uses `context: .` (:143, :220), a path context with no git authentication. `actions/permissions` reports sha_pinning_required: false.

Tag mutability, resolved 2026-11-18 with `gh api repos/<o>/<r>/git/ref/tags/<tag>`, annotated tags dereferenced: these are floating major tags (v7, v4, v9). Their exact-version releases are immutable for setup-node v7.1.0, setup-buildx v4.4.1, build-push v7.4.0, login v4.8.0 and codeql v4.39.3, but NOT for checkout v7.0.1 or github-script v9.0.0 (`releases/tags/<v> .immutable` = false). trivy-action v0.36.0 is an immutable release, and its own action.yaml pins setup-trivy@3fb12ec… and actions/cache@27d5ce7… by SHA (action.yaml:129,142).

Dependabot: .github/dependabot.yml:3-12 already covers package-ecosystem github-actions (weekly, one grouped PR), so SHA pins with `# vX.Y.Z` comments will keep updating.

CI wiring tests: scripts/audit-gate-lib.test.ts:1541-1580 (steps split on `- name:`), scripts/standalone-check-lib.test.ts:347-374 (jobs split on `\n {2}(?=[A-Za-z0-9_-]+:\n)`) and src/server-actions-key-wiring.test.ts:24-31 (slices on `\n  verify:` / `\n  build-scan-and-push:`; verify must contain no `secrets:`). I wrote modified copies of docker-build-push.yml and audit-nightly.yml with SHA pins, workflow-level `permissions: contents: read` and `persist-credentials: false`, and ran every regex from those three tests against them (scratchpad/n18/probe.mjs). All 13 checks pass. The real tests also pass on the current tree (`npx vitest run` on the three files: 12 passed).

Upstream fc224f3 (after our last logged review 75d249d, not in HEAD) pins actions by SHA with version comments, sets workflow-level `permissions: contents: read`, sets `persist-credentials: false` on checkout, adds a github-actions dependabot entry and adds a lint + `tsc --noEmit` job. We already run lint (docker-build-push.yml:99-100). `next build` type-checks, since next.config.ts has no ignoreBuildErrors (:109-110).

**Rationale:**

Port fc224f3's three hardening pieces, adapted to our four workflows and to the one place that needs more than read. Upstream's lint/tsc job and dependabot github-actions entry are already covered here.

The real risk is SHA pinning. A floating major tag (checkout@v7, github-script@v9) can be force-moved, and these steps run in a job that holds the GitLab deploy token and NEXT_SERVER_ACTIONS_ENCRYPTION_KEY (build-scan-and-push). Pinning removes that window, and Dependabot keeps the pins moving.

Explicit `permissions:` and `persist-credentials: false` add little today, because the repo default is already read and .git is dockerignored. They are defense in depth, so a flip of the repo or org default, or a token kept in .git/config while `npm ci` runs dependency lifecycle scripts, cannot widen it. mp-senior-care already carries exactly this permissions block (docker-build-push.yml:30-33), so it is a known-good shape.

No auth setting pinned in CLAUDE.md is touched. verify stays secret-free and Dependabot-runnable; build-scan-and-push keeps its actor gate. No job here needs packages:write, because the image goes to GitLab with repository secrets, not GHCR. sync-issues-to-ideas must KEEP persisted credentials and contents:write, or its git push breaks.

**Proposed change:**

Change only `.github/workflows/*.yml`. It is code under the repo rule, so it goes on a branch and through a PR. A commit that touches only .github leaves the Docker context unchanged and reuses the cached build layer, which is harmless here.

1) Pin every `uses:` to a full SHA with a version comment. Re-resolve at implementation time, since the major tags move.

| action (current tag) | pin to | comment | used at |
|---|---|---|---|
| actions/checkout@v7 | 3d3c42e5aac5ba805825da76410c181273ba90b1 | # v7.0.1 | docker-build-push.yml:35,76,182; audit-nightly.yml:37; codeql.yml:28; sync-issues-to-ideas.yml:29,367 |
| actions/setup-node@v7 | 949feb2413d6458794dcd2491c4babbbce0c15c1 | # v7.1.0 | docker-build-push.yml:79; audit-nightly.yml:40 |
| docker/setup-buildx-action@v4 | f87e5991a6d7451dcb8d9637bfbc97413f497069 | # v4.4.1 | docker-build-push.yml:132,185 |
| docker/build-push-action@v7 | c3c9e263c25d99ce0380d002d59b67737d91b0dc | # v7.4.0 | docker-build-push.yml:141,218 |
| docker/login-action@v4 | 8aa5831fb8d48d8f76594c7ddde61ae58019f550 | # v4.8.0 | docker-build-push.yml:210 |
| aquasecurity/trivy-action@v0.36.0 (annotated tag, dereferenced) | ed142fd0673e97e23eac54620cfb913e5ce36c25 | # v0.36.0 | docker-build-push.yml:163,252 |
| github/codeql-action/init@v4 and /analyze@v4 (annotated) | 33d7b85da1a04171e211befe2c739303b9a4c066 | # v4.39.3 | codeql.yml:31,43 |
| actions/github-script@v9 (annotated) | 3a2844b7e9c422d3c10d287c895573f7108da1b3 | # v9.0.0 | sync-issues-to-ideas.yml:32,372 |

2) Permissions, the minimum per job:
- docker-build-push.yml: add a workflow-level `permissions:\n  contents: read` between `concurrency:` and `jobs:`, with mp-senior-care's comment. security-lint, verify and build-scan-and-push need nothing more: GitLab login uses secrets, the GHA cache and setup-node cache use ACTIONS_RUNTIME_TOKEN, and trivy's setup-trivy reads a public release with github.token.
- audit-nightly.yml: workflow-level `permissions: contents: read`, matching all three siblings' audit-nightly.yml:27-28.
- codeql.yml: leave as is. Job-level security-events:write and contents:read are needed; actions:read matters only for private repos and is harmless.
- sync-issues-to-ideas.yml: keep contents:write (git push) and issues:write (issues.create/update at :253,:268,:315). Optional tightening: move them to job level and give sync-issues-to-ideas only contents:write + issues:read, since it only lists and gets issues (:511,:555).

3) Add `with:\n  persist-credentials: false` to the checkout steps that never push: docker-build-push.yml:35,76,182; audit-nightly.yml:37; codeql.yml:28. Do NOT add it to sync-issues-to-ideas.yml:29,367, which rely on it for `git push`; a one-line comment saying so stops someone tidying it later.

4) Optional follow-up, a repo setting (needs the owner): once everything is pinned, turn on 'Require actions to be pinned to a full-length commit SHA' (sha_pinning_required is currently false). trivy-action's nested uses are already SHA-pinned, so it would pass.

Sibling repos (I grepped all three):
- event-manager: tag-pinned everywhere. docker-build-push.yml has no workflow-level permissions; only build-scan-and-push sets job-level contents:read + packages:write (:130-132), and packages:write must stay for GHCR. Add workflow-level contents:read. audit-nightly already has it (:27-28). No persist-credentials.
- mp-senior-care: tag-pinned. Workflow-level permissions are already present (docker-build-push.yml:32-33, audit-nightly.yml:28-29). docker/login-action@v4.7.0 at :221 differs from the other repos: pin it to its own SHA or unify on v4.8.0. No persist-credentials.
- music-db (music-tools repo): `aquasecurity/trivy-action@master` at docker-build-push.yml:197 is a floating BRANCH, the weakest pin in the family, and should be fixed first. It also uses docker/setup-qemu-action@v4 (:95). No permissions in docker-build-push.yml (audit-nightly has them, :27-28). No persist-credentials. No sync workflow.

**Tests:**

No existing test breaks. I ran the exact regexes from scripts/audit-gate-lib.test.ts (CI wiring), scripts/standalone-check-lib.test.ts (CI wiring) and src/server-actions-key-wiring.test.ts against a pinned, permissioned copy: all pass.

Two cautions:
- Do not write a job-level `permissions:` at 2-space indent. standalone-check splits jobs on `\n {2}<name>:\n`.
- The audit-gate tests are meant to be byte-identical across four repos, so do not add the new guard there.

Optional new guard in its own file (e.g. scripts/workflow-hardening.test.ts), which the four repos could share. It would assert that:
(a) every `uses:` in .github/workflows matches `@[0-9a-f]{40} # v\d`;
(b) docker-build-push.yml and audit-nightly.yml declare workflow-level `permissions:` with `contents: read` and no `write`, other than event-manager's job-level packages:write;
(c) every checkout outside sync-issues-to-ideas.yml sets `persist-credentials: false`.

After merging, confirm one green run of each workflow, including a manual workflow_dispatch of audit-nightly and the next Issues sync push.

### upstream:3e9e96d — Upstream: build in CI + fail on unexpected prerendered routes; run scripts tests in test:run

**State:** fixed · **Recommendation:** already_done · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** 3e9e96d

**Evidence:**

Our verify job already runs `npm run build` (docker-build-push.yml:109-110), then `npm run check:shells` (:117-118 → scripts/check-prerender-shells.mjs, from #228 per upstream-sync-log.md row #86/#88), then `npm run check:standalone` (:128-129).

check:shells fails when a prerendered shell carries scripts. That is a stricter form of upstream's prerender-manifest allowlist, aimed at the same nonce-CSP failure. src/app/layout.test.tsx:54 pins that the workflow calls it.

scripts/*.test.ts already run in `npm run test:run`: vitest.config.ts:12 includes `scripts/**/*.{test,spec}.{ts,tsx}`. `next build` type-checks, since next.config.ts has no ignoreBuildErrors. Upstream's dummy-env `mp.invalid` trick exists to make OIDC discovery fail harmlessly. We have no discoveryUrl (a pinned setting), so nothing contacts MP at build time (docker-build-push.yml:105-108).

**Rationale:**

Every protection 3e9e96d adds is already in our CI, and in a stronger form: a shell-script check plus a standalone production-graph check after the build. Upstream's vitest two-project split solves a problem we do not have, because our single config already includes scripts/. Porting the prerender-manifest allowlist would duplicate check:shells. Log it as reviewed and skipped in .claude/notes/upstream-sync-log.md.

**Proposed change:**

No code change. Add a row to .claude/notes/upstream-sync-log.md for upstream PRs #98-#107 recording 3e9e96d as 'Already incorporated (#228 check:shells + check:standalone)' and fc224f3 as 'Adapted (N18)'.

**Tests:**

None.

**Conflicts with pinned settings:**

Upstream's build env assumes OIDC discovery at build time. Ours pins 'no discoveryUrl' (CLAUDE.md, Architecture), so its dummy MP URL is unnecessary here and must not be read as a reason to bring discovery back.

### N19 — BETTER_AUTH_URL / MINISTRY_PLATFORM_BASE_URL not validated at boot; localhost fallbacks; MP URL read with `!` (upstream 6616310 + 2227a80, src/lib/env.ts)

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 6616310, 2227a80

**Evidence:**

Every runtime read of the two vars in src/ (tests and scripts excluded):
- src/lib/auth.ts:16-17: `const mpBaseUrl = process.env.MINISTRY_PLATFORM_BASE_URL; const mpOauthUrl = `${mpBaseUrl}/oauth`` is unchecked, so an unset value becomes `undefined/oauth`. It is used at auth.ts:123 (userinfo fetch) and at 645-647 (authorize, token and userinfo URLs).
- src/lib/auth.ts:526 `baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000"`.
- src/lib/auth.ts:101-103: the only module-load guard, `if (NEXT_PHASE !== "phase-production-build") assertAuthEnvironment(process.env)`. assertAuthEnvironment (59-86) checks only the secret, BETTER_AUTH_SECRETS and TEST.
- src/components/user-menu/actions.ts:114-117 checks only that the MP URL is present. :124 `postLogoutUri: process.env.BETTER_AUTH_URL || 'http://localhost:3000'`.
- src/lib/providers/ministry-platform/client.ts:49 and auth/client-credentials.ts:16 both read `process.env.MINISTRY_PLATFORM_BASE_URL!`. The audit said `!` was used in three places; today it is these two plus the unchecked read in auth.ts:16.
- src/proxy.ts:30 `originOf(MINISTRY_PLATFORM_BASE_URL)` is already safe: it returns null on a bad value (security-headers.ts:31-38).

What the fallback does in better-auth 1.7.18: node_modules/better-auth/dist/cookies/index.mjs:23 derives the `__Secure-` prefix and `secure` from `baseURLString.startsWith("https://")`. If BETTER_AUTH_URL is unset, the localhost fallback therefore mints non-Secure, unprefixed cookies. The trusted origin also becomes http://localhost:3000, so sign-in breaks in a confusing way instead of the process refusing to run. That matches the audit text (security-audit-2026-10-10.md:237-242, table row :65, P2 row :334).

Upstream: both commits are inside unlogged PR #99 (75d249d..upstream/main). Upstream validates the URLs at module load with no build exemption (upstream auth.ts:648-649) and keeps a NEXTAUTH_URL fallback. Our build cannot work that way: CI `verify` runs `npm run build` with no env (.github/workflows/docker-build-push.yml:105-110), and the Docker builder has no URL env either (Dockerfile:40-44; .dockerignore excludes .env*).

Probe (scratchpad/n19/probe.ts runs upstream env.ts against the local env files and prints only pass/fail): the .env.local of mp-charts, event-manager, mp-senior-care and music-db, and .env.example, all pass in both development and production. Synthetic cases: unset in production throws; `https://host/` normalises to `https://host`; `http://<lan-host>:3000` throws; `http://localhost:3000` passes in production, which is what 2227a80 added.

Tests: src/test-setup.ts:5,10 stubs https MP and http://localhost auth URLs, both valid. The current tests pass: secret-guard, user-menu actions and client-credentials, 28/28.

Siblings have the identical gap:
- event-manager: auth.ts:16, :103, :511; user-menu/actions.ts:113, :123; client.ts:40; client-credentials.ts:2. Also app-url.ts:13, which falls back to the production URL.
- mp-senior-care: auth.ts:16, :103, :516; actions.ts:115, :125; client.ts:40; client-credentials.ts:2; app-url.ts:13.
- music-db: auth.ts:17, :104, :500; components/layout/actions.ts:137, :147; client.ts:19; client-credentials.ts:2.

None of the four has src/lib/env.ts.

**Rationale:**

This is a real but LOW-severity gap. A bad or missing value today shows up as broken sign-in or a redirect_uri mismatch, not a forgeable session. Only a missing or plain-http BETTER_AUTH_URL weakens anything, by producing non-Secure cookies. The fix is cheap and pure, so it is worth taking for fail-fast diagnosis.

Adapt rather than port, because upstream's form breaks our builds and adds a fallback we do not want:
(1) Keep our NEXT_PHASE build exemption. Upstream validates unconditionally (it exempts only VITEST, and we exempt nothing in Vitest). Our CI `verify` build and Docker builder run with no URL env, so an unconditional check would fail every build.
(2) Drop upstream's NEXTAUTH_URL fallback. This fork reads no NEXTAUTH_* variables (CLAUDE.md: 'no NEXTAUTH_SECRET fallback').
(3) Take 2227a80's rule: loopback http is allowed for BETTER_AUTH_URL even when NODE_ENV=production, so a local `next start` and the test files that set NODE_ENV=production (auth.rate-limit.test.ts:25, secret-guard prod cases) keep working with the test-setup http://localhost value. The MP URL stays strict (https except loopback outside production).

None of this touches a pinned setting: pkce:false, no discoveryUrl, providerId, cookieCache, sessions and allowedAuthRoutes are unchanged, and the explicit authorize/token/userinfo URLs just gain a validated base. The optional `advanced.useSecureCookies: true` (only when production and the origin is https) restates what better-auth already derives (cookies/index.mjs:23), so it is a guard, not a behaviour change. It sits next to the pinned `disableOriginCheck: false` in the same spirit.

Failure semantics stay the same as the secret guard. Next loads auth.ts lazily, so a bad URL shows as a 500 plus a logged `[env] ...` reason on the first auth request; the process stays up and there is no Docker HEALTHCHECK. The guard is fail-closed, but someone has to read the log.

Two normalising side effects, both benign: a trailing slash in BETTER_AUTH_URL is stripped to the origin, which matches the post-logout and redirect URIs registered in TM.Widgets (docs/OAUTH_LOGOUT_SETUP.md:118-148, no slashes); a trailing slash on the MP URL no longer produces `//oauth`.

If the owner wants a boot-time signal rather than first-request logging, a call from instrumentation.ts register() (nodejs runtime only; it currently reads neither var) could log the same message at start-up. That is optional and not part of the smallest fix.

**Proposed change:**

1. New src/lib/env.ts: a port of upstream's getMpBaseUrl(env = process.env) and getAuthBaseUrl(env = process.env), pure, error messages never echo the value. Take 2227a80's version (loopbackHttpInProduction for the auth URL). Remove the NEXTAUTH_URL fallback so getAuthBaseUrl reads BETTER_AUTH_URL only, with the message `[env] BETTER_AUTH_URL is not set.`

2. src/lib/auth.ts:
- Replace lines 16-17 and 101-103 with:
```ts
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (!isBuildPhase) assertAuthEnvironment(process.env);
const mpBaseUrl = isBuildPhase ? "" : getMpBaseUrl();
const authBaseUrl = isBuildPhase ? BUILD_PHASE_PLACEHOLDER_ORIGIN : getAuthBaseUrl();
const mpOauthUrl = `${mpBaseUrl}/oauth`;
```
  BUILD_PHASE_PLACEHOLDER_ORIGIN is "http://localhost:3000". It is never used to serve a request; it only keeps createAuth (run at module load via sharedInstance, :821) from logging better-auth's 'Base URL is not set' warning during next build.
- Keep assertAuthEnvironment's signature and checks unchanged. Its three pure-call tests pass envs with no URLs.
- createAuth (:526): set `baseURL: authBaseUrl`. Optionally add `...(process.env.NODE_ENV === "production" && authBaseUrl.startsWith("https:") && { useSecureCookies: true })` in `advanced`.

3. src/components/user-menu/actions.ts:114-124: `const baseUrl = getMpBaseUrl(); postLogoutUri: getAuthBaseUrl()`. This removes the localhost fallback.

4. src/lib/providers/ministry-platform/client.ts:49 and auth/client-credentials.ts:16: use getMpBaseUrl() in place of `!`. Neither is constructed at build time: services are lazy singletons and `'use cache'` reads run under connection(). CI `verify`'s build proves that.

5. Docs:
- .env.example:44/:73 comments: https origin with no path or trailing slash (http only for localhost); MP URL https, no query.
- CLAUDE.md 'Required Environment Variables' bullet and .claude/rules/security.md 'Authentication & Authorization': the URL checks join the same build-exempt, 500-plus-log guard.
- DOCKER.md:330-345: the stale NEXTAUTH_URL/NEXTAUTH_SECRET/OIDC_WELL_KNOWN_URL block becomes BETTER_AUTH_*.
- Mark N19 fixed in the audit table and ideas.md.
- Log 6616310/2227a80 as adapted in upstream-sync-log.md.

6. Operator step before promoting: confirm BETTER_AUTH_URL is an https origin and MINISTRY_PLATFORM_BASE_URL is https in /srv/mpcharts/.env on TMC1 and in the Ironside dev .env. Not checked here (read-only, no SSH).

7. Mirror the change into event-manager, mp-senior-care and music-db. Their auth.ts guard has the same structure. In event-manager and mp-senior-care, also route lib/app-url.ts:13 through getAuthBaseUrl, or keep its production fallback deliberately and say so.

**Tests:**

- src/lib/env.test.ts (port upstream's, minus the NEXTAUTH_URL cases): unset or blank; not absolute; http on a real host refused in all environments; loopback http allowed for the auth URL even in production; MP loopback http refused in production; credentials, query, fragment and a bare `?` refused; trailing slash stripped; path refused for the auth URL but allowed and kept for the MP URL; error messages never contain the value.
- src/lib/auth.secret-guard.test.ts: add BETTER_AUTH_URL and MINISTRY_PLATFORM_BASE_URL to KEYS. Cases: production import refused with BETTER_AUTH_URL unset; refused with `http://mptools.example.org`; refused with the MP URL unset; NEXT_PHASE=phase-production-build imports with BOTH URLs and the secret unset (pins the CI and Docker build path); NEXT_PHASE=phase-production-server is not exempt.
- src/components/user-menu/actions.test.ts:88-92: update the expected message to `[env] MINISTRY_PLATFORM_BASE_URL is not set`. Add a case where BETTER_AUTH_URL is unset and the call rejects (no localhost post_logout_redirect_uri), and one where `https://myapp.example.com/` yields post_logout_redirect_uri `https://myapp.example.com`.
- client-credentials.test.ts: an unset or http MP URL rejects before any fetch.
- Optionally pin useSecureCookies: https plus production gives `__Secure-` cookies (route.test.ts already measures that cookie name).
- Then `npm run test:run`, CI `verify` (`npm run build` with no env proves the exemption), and a `:dev` soak with a human sign-in and sign-out.

**Conflicts with pinned settings:**

None. pkce:false, no discoveryUrl, providerId 'ministryplatform', session and cookieCache settings, allowedAuthRoutes and disabledAuthPaths are untouched; the explicit authorize/token/userinfo URLs keep their shape on a validated base. Two places deliberately differ from upstream: the NEXT_PHASE build exemption is kept (upstream exempts only VITEST; we exempt nothing in tests), and the NEXTAUTH_URL fallback is dropped, matching our 'no NEXTAUTH_* fallback' rule.

### upstream:6c0c46b/f1ad0c8 (#98) — Header layout shift on every load/navigation (Suspense-on-useUser header, ServerProviders, sidebar next/link)

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** 6c0c46b, f1ad0c8

**Evidence:**

The bug as upstream describes it does not exist here. Our header never suspends. src/contexts/user-context.tsx:86-104 loads the profile client-side in an effect, and src/components/layout/header.tsx:38 and :74-82 render a same-size placeholder avatar button (h-8 w-8 inside p-1) while isLoading. No component calls use() on a promise. The layout Suspense in src/app/(web)/layout.tsx:50-54 wraps AuthWrapper and has a full-screen 'Loading...' fallback. It has no in-flow h-16 header stand-in. One part of #98 does apply: src/components/layout/sidebar.tsx:87-95 renders plain <a href={item.href}>, and git log -S'next/link' on that file is empty, so it has never used Link. Every sidebar click is a full document reload. That reload re-runs AuthWrapper, flashes the layout's full-screen Loading fallback, and re-fires getCurrentUserProfile + getUserAuthorization (2 server actions, 3 MP reads). src/components/home/home-cards.tsx:3 already uses next/link. ServerProviders (the streamed profile promise) is not adopted. Our design deliberately loads client-side.

**Rationale:**

Take only the sidebar <a> to <Link> change, which is the one part of #98 that maps to our tree. ServerProviders and HeaderAvatar Suspense would bring in the streamed-promise architecture, and that architecture caused upstream's #102 crash. Our header has no shift to fix. The Link change cuts a full reload plus two server actions per navigation. Server actions and pages still self-gate (requireSession/requireFeatureAccess), so skipping the (web) layout re-render on client navigation loses no protection. AuthWrapper is only a presence and userGuid check.

**Proposed change:**

src/components/layout/sidebar.tsx: import Link from 'next/link' and replace the <a href={item.href} ... onClick={onClose}> at :87-95 with <Link href={item.href} ... onClick={onClose}>. No other files.

**Tests:**

Sidebar test (none exists in src/components/layout/ today): render Sidebar with a mocked useAuthorization/useUser and assert each visible entry is an anchor produced by next/link (mock next/link, or assert no full-navigation side effect). Manual check: CLS and no full reload on sidebar clicks in next dev.

### upstream:7342517/4380b22 (#102) — UserProvider crash on React Flight ReactPromise (.catch returns undefined)

**State:** not_applicable · **Recommendation:** skip · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** 7342517, 4380b22

**Evidence:**

The bug needs a profile promise streamed from a server component and consumed with use(). We have no src/app/server-providers.tsx. Providers (src/app/providers.tsx:12-26) mounts UserProvider with no promise prop. UserProvider (src/contexts/user-context.tsx:69-104) calls the server actions getCurrentUserProfile/getUserAuthorization from an effect and handles errors with .then/.catch on native promises returned by the action client. grep for 'use(' in src/contexts finds nothing. The 2026-10-10 audit section 3 (P13) recorded the same: 'n/a'.

**Rationale:**

It only becomes relevant if #98's ServerProviders is ever ported, and that is recommended against above. The .gitignore addition of .playwright-mcp/ is worth checking separately: it captures real MP data in snapshots.

### upstream:96ab2f5 — Anchor the /sign-in/social Content-Type check on the raw header (no trim())

**State:** fixed · **Recommendation:** already_done · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** 96ab2f5

**Evidence:**

src/app/api/auth/[...all]/route.ts:154-157: contentType = header.toLowerCase(); refuse if it includes(',') or fails /^application\/json[ \t]*(?:;|$)/. This is an anchored match with no trim(), equivalent to upstream's JSON_CONTENT_TYPE (case-folded instead of the /i flag). The comment at :147-153 records the U+00A0 rationale. The sync log 2026-09-29 row 48a871b says the same ('an anchored match, since trim() also strips U+00A0'). route.test.ts:152-182 covers leading/trailing NBSP and ASCII-space cases.

**Rationale:**

The fork led on this. Our filter is if anything stricter: it also refuses commas, which upstream calls belt-and-braces.

### upstream:721d6e5 + 5620831 — Cache-Control: no-store on every /api/auth response (incl. 404s), plus allowlist path-variant tests

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 721d6e5, 5620831

**Evidence:**

Our route sets no cache headers. src/app/api/auth/[...all]/route.ts:206 NOT_FOUND has no headers. GET (:208-214) and POST (:216-225) return better-auth's response unwrapped. grep -ri 'no-store|cache-control' src (non-test) returns nothing. In installed better-auth 1.7.18, only api/routes/session.mjs:33 sets 'cache-control: no-store'. Our customSession (src/lib/auth.ts:765) copies those headers through in custom-session/index.mjs:50, so /get-session is covered. The OAuth callback 302 that sets the session cookies and the /sign-in/social response that sets oauth_state carry none: grep -rli cache-control over dist/api and dist/oauth2 finds only session.mjs. The audit section 3 (P6) already says 'partial: better-auth sets it on /get-session; our 404s don't'. 5620831's mount-point tests ('' and '/' → 404, an outside-mount pathname) are absent from route.test.ts. relativeAuthPath (:197-204) is byte-identical to upstream's.

**Rationale:**

This is a small defence-in-depth change. Cloudflare sits in front of every endpoint, and a cached callback 302 or oauth_state Set-Cookie would hand one user's cookies to another. Cloudflare's defaults make that unlikely (no file extension, Set-Cookie present), but one cache rule changed later would make it real. Wrapping responses does not touch allowedAuthRoutes or the body filter, so no pinned setting moves.

**Proposed change:**

src/app/api/auth/[...all]/route.ts: add withNoStore(response), which sets 'Cache-Control: no-store' in place and falls back to new Response(response.body, response) when the headers are immutable. Wrap both betterAuthGET/betterAuthPOST returns with it, and give NOT_FOUND headers: { 'Cache-Control': 'no-store' }. Mirror the same change in the three siblings' route.ts.

**Tests:**

route.test.ts: every 404 path, GET /get-session, the /callback/ministryplatform 302 (route.flow.test.ts already drives one) and POST /sign-in/social all carry cache-control: no-store, and the Set-Cookie headers survive the copy path. Add 5620831's cases: GET '' and '/' → 404 with auth.handler never called; a NextRequest for /other/get-session → 404.

### upstream:6aa1633 — /auth-error echoes ?error= only when it looks like a machine code

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 6aa1633

**Evidence:**

Object.hasOwn is done: src/app/auth-error/page.tsx:103-105 (#242). The raw value is still echoed. :107 passes code={error} unconditionally, and :118-123 renders it as '...contact your administrator and mention the code <code>{code}</code>'. So /auth-error?error=Your%20account%20is%20locked.%20Call%20555-0100 puts attacker prose on our origin, and it can be chained through a real MP login via /signin?callbackUrl=/auth-error?error=..., since getSafeCallbackUrl permits same-origin paths. There is no type guard either. A repeated ?error=a&error=b arrives as an array, Object.hasOwn coerces it to 'a,b', and React renders 'ab'. The audit section 3 (P12) recorded '(code regex not adopted; React escapes)'. That addresses XSS, not upstream's stated reason (content spoofing). Our ERROR_MESSAGES contains the uppercase key MISSING_FIELD (:56), so upstream's /^[a-z0-9_]{1,64}$/ would hide one of our own codes.

**Rationale:**

This is a cheap fix for a phishing aid on our own domain. The earlier decision not to adopt it rested on escaping, which is not the threat. Adapt the regex to allow our uppercase code. The same echo exists in all three siblings.

**Proposed change:**

src/app/auth-error/page.tsx: const CODE_SHAPE = /^[A-Za-z0-9_]{1,64}$/; then code = typeof error === 'string' && CODE_SHAPE.test(error) ? error : undefined. Use code both for the hasOwn lookup and for <AuthErrorShell code={code}>. Mirror in event-manager (page.tsx:97), mp-senior-care (:97) and music-db (:98).

**Tests:**

page.test.tsx: free text with spaces or punctuation renders the fallback message and no <code>. An overlong (65-char) code is not echoed. An array-valued error (a repeated param) is not echoed. Every key of ERROR_MESSAGES matches CODE_SHAPE (pins MISSING_FIELD). An unknown well-formed code still shows (support visibility).

### upstream:a11c2a3 — Harden LIKE/filter sanitizers (non-strings, control chars, quote look-alikes) and cap contact search terms

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** a11c2a3

**Evidence:**

Already here: '[' escaping. src/lib/providers/ministry-platform/utils/filter-sanitize.ts:27-33 escapes ', [, % and _ (F15, 2026-06). Non-strings fail closed in practice: .replace/.trim on an array or object from Flight throws TypeError. The exception is sanitizeGuid (:91-96), which regex-tests a one-element array (coerced to its string) and returns the array. Its interpolation renders the same GUID, so it is harmless. Not here: rejecting control characters and quote look-alikes (U+2018/2019/02BC/FF07) in sanitizeFilterValue. No search-length cap: admin getAvailablePrograms/getAvailableGroups (src/components/admin/journey-tools/actions.ts:66-70, 87-91) are admin-gated and top:50. ContactService.contactSearch (src/services/contactService.ts:45-54) has no non-test caller (grep: only contactService.test.ts:56-82). Contact Lookup searches an in-memory cached list (getAllContactsForSearch, :61-65), not an MP filter. Sibling gap, the more important part: event-manager and mp-senior-care have NO sanitizeLikeValue at all. Their contactService.ts:55/56 and event-manager eventService.ts:224-225 build LIKE '%...%' with sanitizeFilterValue. That is the anti-pattern our .claude/rules/security.md names: %, _ and [ stay live, so a user search widens the match or errors the query. Their word split is also uncapped, so a long multi-word query builds an unbounded filter. music-db has no LIKE call sites.

**Rationale:**

In mp-charts the remaining delta is small: delete the dead contactSearch, which is an injection-shaped method with no caller, and optionally add typeof guards. Quote look-alike rejection is speculative, since MP's server-side parsing is unknown. Keep it optional. The real value is porting the fork's own F15 (sanitizeLikeValue) into event-manager and mp-senior-care, plus a term-length or word-count cap there.

**Proposed change:**

mp-charts: remove ContactService.contactSearch and its tests (src/services/contactService.ts:38-54). Optionally add `if (typeof value !== 'string') throw new Error('Invalid filter value')` to sanitizeFilterValue/sanitizeLikeValue/sanitizeGuid. Siblings: copy sanitizeLikeValue (with its tests) into event-manager and mp-senior-care filter-sanitize.ts. Switch contactService.contactSearch (both) and eventService search (event-manager) to it. Cap the search at about 100 characters and about 8 words before building the filter.

**Tests:**

mp-charts: sanitizer tests for array/object input throwing (sanitizeGuid with ['<guid>'] must throw). Siblings: sanitizeLikeValue tests (%, _, [, ' all literal) and a contactSearch test asserting the filter for 'a%b_c[d' plus the length/word cap.

### upstream:5e1d2cc + 66b9bf4 — Self-healing auth instance when OIDC discovery fails at boot; jwks_uri in the route-test discovery stub

**State:** not_applicable · **Recommendation:** skip · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** 5e1d2cc, 66b9bf4

**Evidence:**

We fetch no discovery document. src/lib/auth.ts:635-647 uses explicit authorizationUrl/tokenUrl/userInfoUrl with a comment 'NO discoveryUrl — deliberate', and CLAUDE.md pins 'no discoveryUrl' because 1.7 fetches discovery once with no retry. That once-only fetch is exactly the failure 5e1d2cc works around. 66b9bf4 only feeds a jwks_uri to upstream's lazy id_token verifier (security/c, #107), and we do not run that verifier (N17 posture). All three siblings also have discoveryUrl count 0.

**Rationale:**

Our pinned explicit-endpoints design removes the failure mode entirely, so a rebuild facade would add complexity and a second instance-swapping path next to sharedInstance, for no benefit.

**Conflicts with pinned settings:**

Porting 5e1d2cc presumes a discoveryUrl. CLAUDE.md pins 'no discoveryUrl' (explicit endpoints + accountSubject), and the selfHealingAuth facade would also interact with the pinned one-instance-per-process sharedInstance (auth.ts:811-821).

### upstream:6167cfd — Auth code-flow test harness: origin check, state tampering, cookie attributes, rate-limit wiring

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** M · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 6167cfd

**Evidence:**

We have a mock-MP flow through the real route: src/app/api/auth/[...all]/route.flow.test.ts:107-185 covers sign-in, session fields, session_data re-issue, code exchange with no PKCE verifier, userinfo failure and id_token/userinfo sub mismatch. Also present: auth.session-lifetime.test.ts (12h, sign-out), auth.rate-limit.test.ts (AUTH_IP_ADDRESS_HEADERS), auth.user-oauth-tokens.test.ts (no account_data), auth.secret-guard.test.ts:173-178 (disableOriginCheck pinned as config only). Missing compared with upstream's auth.origin-check / auth.code-flow / auth.session-config: (a) a BEHAVIOURAL origin check. The only 'evil.example' tests are the client-side getSafeCallbackUrl ones (src/components/sign-in/safe-callback-url.test.ts, sign-in.test.tsx). Nothing asserts that better-auth itself returns 403 for an absolute, protocol-relative or backslash callbackURL, or for a cross-site Origin on a cookie-bearing POST. (b) Callback state tampered, cookie-less or expired: route.test.ts:78 covers only state_not_found. (c) Cookie attributes: no test asserts HttpOnly, SameSite=Lax, Path, or __Secure- + Secure over https (grep -i httponly/samesite in auth tests: none). Siblings: event-manager and mp-senior-care have the same gaps. music-db has one HttpOnly test.

**Rationale:**

These are test-only changes that pin behaviour CLAUDE.md already depends on: disableOriginCheck:false, the cookie attributes, and state handling. Today a config-only assertion can pass while behaviour regresses on a better-auth minor bump. Translate rather than copy. Leave out upstream's id_token signature/iss/aud/jwks cases (we do not verify the id_token, N17) and auth.user-id-cache (no such cache).

**Proposed change:**

Extend src/app/api/auth/[...all]/route.flow.test.ts, or add src/lib/auth.origin-check.test.ts on the same mock-MP helpers, covering: POST /sign-in/social with callbackURL https://evil.example, //evil.example, '/\\evil.example' and '/\t/evil' (expect better-auth's refusal, not our body filter, so use a body that passes the filter); a cookie-bearing POST with Origin https://evil.example → 403; callback with a tampered state value, missing oauth_state cookie, and an expired state → /auth-error?error=state_* with no token-endpoint call. Parse Set-Cookie on the callback for HttpOnly, SameSite=Lax, Path=/, and with BETTER_AUTH_URL=https the __Secure- prefix and Secure. Mirror into siblings.

**Tests:**

The tests above, each with a negative control (e.g. disableOriginCheck:true or a hand-built instance shows the 403 disappears), and run in mutation style once by hand.

**Conflicts with pinned settings:**

Upstream's harness uses providerId 'ministry-platform', a discovery document and id_token verification. Ours must use MP_PROVIDER_ID ('ministryplatform'), explicit endpoints, pkce:false and no id_token verification, as pinned in CLAUDE.md.

### upstream:02731d4 (+ broadcast half of f3cb739) — SessionGuard: leave protected pages when the session ends in the browser (sign-out elsewhere, expiry)

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** medium · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 02731d4, f3cb739

**Evidence:**

grep -ri 'SessionGuard|BroadcastChannel|signed-out' src (non-test) returns nothing. AuthWrapper (src/components/layout/auth-wrapper.tsx:5-27) checks the session once, server-side. When the client session goes null, UserProvider only stops serving its bootstrap (src/contexts/user-context.tsx:120-127). The header loses its menu, but page components keep whatever member data they already fetched into local state. better-auth 1.7.18's client already refetches /get-session on focus or visibility change and on its localStorage 'better-auth.message' broadcast (node_modules/better-auth/dist/client/session-refresh.mjs:12-13,53-62). Our sign-out is a server action (src/components/user-menu/actions.ts:96-125), so it never posts that broadcast, and other tabs only re-check on focus. Nothing in the app acts on the null result. Audit section 3 (P12): '✗ open … shared-PC sign-back-in risk'.

**Rationale:**

This is the main shared-device exposure: a tab left open after sign-out elsewhere, or after the 12h cap, keeps showing PII. A small client guard closes it. Point it at /signin?callbackUrl=<current path>, not /signed-out (see the next entry), so expiry keeps the documented silent re-sign-in. Posting a broadcast from our sign-out is cheap, but better-auth's focus refetch already covers most cases, so it is optional.

**Proposed change:**

New src/components/layout/session-guard.tsx (client): const { data, isPending, error } = authClient.useSession(). Track whether a session was ever seen. When it goes from present to null with !isPending && !error, render nothing and window.location.replace('/signin?callbackUrl=' + encodeURIComponent(location.pathname + location.search)). Wrap the (web) shell in src/app/(web)/layout.tsx inside Providers. Optional: in user-menu.tsx before handleSignOut, call getGlobalBroadcastChannel().post({event:'session', data:{trigger:'signout'}}) via better-auth/client so other tabs refetch immediately. Mirror in siblings.

**Tests:**

session-guard.test.tsx: children render while the session is present; a present→null transition replaces the location with /signin?callbackUrl=… and stops rendering children; an initial null, a pending refetch and an error (network failure) do NOT redirect.

### upstream:ace4566 + 8393d7b — Land ended sessions on a static /signed-out page instead of auto-OAuth /signin

**State:** open · **Recommendation:** needs_user_decision · **Effort:** S · **Risk:** medium · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** ace4566, 8393d7b

**Evidence:**

No /signed-out route: src/app has auth-error, session-error and signin only. The proxy public allowlist (src/proxy.ts:57) admits only /api, /signin and /auth-error. Our post-logout target is the app root (src/components/user-menu/actions.ts:124, BETTER_AUTH_URL). handleSignOut ends the MP session through the end-session URL, so after an explicit sign-out /signin shows MP's login page rather than silently signing back in. The silent re-sign-in upstream is closing therefore happens here only when the app session ends while MP SSO is alive: the 12h cap, or within 1h of every deploy/restart. CLAUDE.md documents that as intended: 'users go back through sign-in at least every 12h, and within 1h of every deploy or restart (a silent redirect while their MP session is alive)'. 8393d7b is comment-only (upstream error.tsx and authorizationService.ts, neither of which matches anything here).

**Rationale:**

With SessionGuard pointed at /signed-out, every open staff tab would land on an interstitial within about 1h of each deploy and at each 12h cap, instead of silently re-authenticating. That trades the documented UX for shared-PC protection the explicit sign-out path already gives us, since it ends MP SSO. If adopted, the proxy allowlist must gain an exact '/signed-out' entry (coordinate with N9's proxy carve-out work), and the page must be force-dynamic for the enforced CSP (scripts/check-prerender-shells.mjs).

**Proposed change:**

If chosen: new src/app/signed-out/page.tsx (static content, connection() for the CSP nonce, a link to /signin, reads no session), an exact pathname === '/signed-out' entry in src/proxy.ts:57, and SessionGuard targeting it. Otherwise: no change. Keep SessionGuard → /signin.

**Tests:**

If adopted: page test (no OAuth start, link to /signin), proxy.test.ts entry for /signed-out as public through the real matcher, and a prerender-shell check that it is not static.

**Conflicts with pinned settings:**

Conflicts with the documented session-lifetime UX in CLAUDE.md (silent re-sign-in at the 12h cap and within 1h of a deploy, while MP SSO is alive).

**Decision needed:**

When a tab's app session ends (12h cap or within 1h of a deploy) while the user's Ministry Platform session is still alive, should the tab silently re-sign-in via /signin (today's documented behaviour), or stop on a 'You've been signed out' page that needs a click, which is safer on shared PCs but adds a step for every open tab after each deploy?

### upstream:595ecab — /signin surfaces start failures and caps automatic OAuth restarts per tab

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 595ecab

**Evidence:**

Start failures are surfaced: src/components/sign-in/sign-in.tsx:78-85 sends any { error } from signIn.social, or a rejection, to /auth-error?error=sign_in_start_failed, so there is no endless spinner. A useSession error yields session null and starts OAuth. That is not a spinner either. There is no restart counter: grep sessionStorage in src finds nothing. The already-signed-in bounce (:69-71, window.location.href = callbackUrl) and the OAuth start are uncapped. A loop needs the server (AuthWrapper, auth.api.getSession) and the client (/get-session) to disagree. Since the shared instance (auth.ts:821) both read the same store, so that is unlikely today. It becomes a real vector if SessionGuard (02731d4) redirects to /signin.

**Rationale:**

The error surfacing is already done in our own way. Port only the loop cap, and only together with SessionGuard, so that a guard→signin→callback→guard cycle stops with a visible error instead of hammering MP SSO. On its own it is low value.

**Proposed change:**

src/components/sign-in/sign-in.tsx: a small sessionStorage counter (try/catch around every access) incremented before each automatic navigation (the OAuth start and the session bounce). With 2 or more within 2 minutes, render an error with a link to /auth-error?error=sign_in_loop and no auto-navigation. Add 'sign_in_loop' to ERROR_MESSAGES in auth-error/page.tsx. The (web) shell (SessionGuard) clears the counter on seeing a live session.

**Tests:**

sign-in.test.tsx: a third automatic navigation within the window renders the stop state and does not call signIn.social; storage that throws still signs in; the counter resets after the window and when cleared by the guard.

### upstream:aa696f8 — global-error: recover without JavaScript on the prerendered 500 page

**State:** open · **Recommendation:** port · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** aa696f8

**Evidence:**

src/app/global-error.tsx:67-81: the only control is <button onClick={retry}>. There is no plain link. The static copy is known to ship un-hydratable: scripts/check-prerender-shells.mjs:29-35 explicitly allows _global-error.html to stay static, because the root layout's connection() opt-out cannot reach it. CSP is enforcing in production on all four apps (CSP_ENFORCE=true since 2026-09-18, per the upstream-sync-log #86/#88 row). So the static 500 page's scripts carry no nonce, never run, and its 'Try again' button does nothing. The same onClick={retry}-only markup is in event-manager, mp-senior-care and music-db global-error.tsx:69.

**Rationale:**

This is a small, self-contained fix for a dead control on the last-resort page, and it applies exactly as upstream describes because we enforce CSP. It keeps global-error's import-nothing, inline-style constraints (the file header).

**Proposed change:**

src/app/global-error.tsx: add a primary <a href="/"> (full reload, inline-styled like the button). Render the retry button only after hydration via useSyncExternalStore(() => () => {}, () => true, () => false), so the static copy never shows a dead button. Import only from 'react'. Mirror in the three siblings.

**Tests:**

global-error.test (or the existing error-boundaries.test.tsx): renderToString shows the home link and no retry button (server snapshot); a client render shows both, and clicking retry calls retry().

### upstream:f3cb739 — Always leave a sign-out control when the MP profile fails to load

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** f3cb739

**Evidence:**

src/components/layout/header.tsx:38 renders UserMenu (the only sign-out control in the shell) only when !isLoading && userProfile. Otherwise :74-82 renders a bare avatar button with no menu. The profile is undefined when the dp_Users row is missing (src/components/shared-actions/user.ts:31-37 → userService.ts:82-85). UserProvider moves to status 'failed' when MP errors (user-context.tsx:98-100, :113-114). In both cases the user has no way to sign out. UserMenu requires userProfile: MPUserProfile (src/components/user-menu/user-menu.tsx:43). src/app/(web)/error.tsx:60-71 offers only 'Try Again'. /session-error covers the missing-userGuid case (auth-wrapper.tsx:21-24), but not a missing or failed profile. Same header pattern in event-manager and mp-senior-care header.tsx:38.

**Rationale:**

This is the same trap /session-error was built to avoid: an MP outage or a user without a dp_Users row strands staff with no sign-out. The smallest fix is to make UserMenu work without a profile and always mount it once loading ends, plus a sign-out button in the (web) error boundary. Skip upstream's root error.tsx sign-out (our root boundary only covers /signin, /auth-error and /session-error) and the BroadcastChannel (covered by the SessionGuard entry).

**Proposed change:**

user-menu.tsx: make userProfile optional. With no profile, the label shows 'Your profile couldn't be loaded' and the Sign out item stays. header.tsx: when !isLoading, always wrap the avatar in <UserMenu userProfile={userProfile ?? undefined}>. (web)/error.tsx: add a Sign out button that calls the existing handleSignOut server action (no unstable_rethrow needed: redirect stays outside any catch, actions.ts:120). Mirror in event-manager and mp-senior-care.

**Tests:**

header test: with userProfile null and isLoading false the menu opens and shows Sign out. user-menu.test.tsx: renders without a profile. (web) error boundary test: Sign out button present and calls handleSignOut.

### upstream:0670531 — getCurrentUserProfile returns a minimal CurrentUserProfile DTO instead of the full MP row

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 0670531

**Evidence:**

src/components/shared-actions/user.ts:31-37 returns userService.getUserProfile(id) verbatim to the browser. That is the full MPUserProfile (src/lib/providers/ministry-platform/types/user-profile.types.ts:1-14): User_ID, User_GUID, Contact_ID, Mobile_Phone, roles, userGroups and userGroupIds. The client reads only First_Name, Nickname, Last_Name, Email_Address and Image_GUID (grep of userProfile.* across non-test src: header.tsx, sidebar.tsx, home-cards.tsx, user-menu.tsx). userService.ts:87-99 also reads dp_User_Roles on every profile miss, but `.roles` is consumed nowhere (grep: only the type and userService.ts:103). userGroupIds is needed server-side only (authorization.ts:228-229, shared-actions/user.ts:77-78). Siblings return the full row the same way: event-manager user.ts:24, mp-senior-care user.ts:23, music-db user.ts:13. All three still read dp_User_Roles (userService.ts:85, :85, :51).

**Rationale:**

This is the user's own data, so exposure is low. Still, our minimise-PII rule says the browser should get only what it renders, and dropping the unused dp_User_Roles read saves an MP call per profile miss (2-min cache). Upstream's AuthorizationService side has no equivalent here. Keep userGroupIds inside the server-side profile.

**Proposed change:**

Add src/lib/dto/user-profile.ts: CurrentUserProfile { First_Name, Nickname, Last_Name, Email_Address, Image_GUID }. getCurrentUserProfile builds it key by key from the service result. Change UserProvider/UserMenu/Header/Sidebar/HomeCards types from MPUserProfile to CurrentUserProfile. In userService.getUserProfile, drop the dp_User_Roles query and the roles field (also from MPUserProfile). Siblings: same DTO. Check event-manager/mp-senior-care/music-db for server-side roles use first (grep found none outside userService and types).

**Tests:**

shared-actions/user.test.ts: pin the exact key set returned (Object.keys equals the five fields), and that Mobile_Phone, User_ID and userGroupIds are absent. userService.test.ts: only dp_Users and dp_User_User_Groups are queried. Update header/user-menu/sidebar test fixtures to the DTO.

### upstream:69fa5c5 + 8370bcb — UserService.getUserProfile serves only the caller's own profile; private, self-sanitizing raw role read

**State:** fixed · **Recommendation:** already_done · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** 69fa5c5, 8370bcb

**Evidence:**

src/services/userService.ts is not a 'use server' module (line 1 is an import), so getUserProfile is not an HTTP endpoint. All three callers pass a session-derived GUID: shared-actions/user.ts:32-36 (requireSession → getUserGuid), :51-57 (same), and lib/authorization.ts:223-228 (requireFeatureAccess → requireSession → getUserGuid). The GUID is validated with sanitizeGuid (userService.ts:67). 8370bcb targets AuthorizationService.readSecurityRolesFromMp, which does not exist here (no authorizationService.ts in src/services). Our only role read interpolates User_ID through sanitizeIds (userService.ts:89-92). Audit section 3 (P10): 'self-only getUserProfile ✓'.

**Rationale:**

Our version is equivalent, with the session binding at every call site. Moving the check into the service would only guard a future caller, and the 0670531 entry already proposes removing the role read entirely. An `import "server-only"` in userService is the audit's separate P14 item, not this one.

### upstream:e775734 — Gate the contact-lookup [guid] page itself; a layout redirect is UX only

**State:** fixed · **Recommendation:** already_done · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** e775734

**Evidence:**

No server-rendered page here reads protected data on the strength of a layout gate alone. src/app/(web)/contact-lookup/[guid]/page.tsx:24-33 renders the client component ContactLookupDetails, which fetches through getContactDetails, gated by requireFeatureAccess('contact-lookup') and the search tier (src/components/contact-lookup-details/actions.ts:12-15). The /admin layout gate (src/app/(web)/admin/layout.tsx:22-32) is backed per page: journey-tools/page.tsx calls getJourneyToolsConfigAction and resolveToolNames, both of which call requireFeatureAccess('admin') themselves (journey-tools/actions.ts:171, :205-207), as does getComplianceToolsConfigAction (compliance-tools/actions.ts:135-137). Remaining same-class gap: journey/[slug] and compliance/[slug] pages pass tool config to any signed-in user. That is audit N10, a separate finding, not this commit.

**Rationale:**

Our pages either render client components that use self-gated actions or call self-gated actions server-side, so the layout-bypass upstream fixed has no equivalent here. N10 should be tracked on its own.

### upstream:e17c55e — Rethrow Next control-flow errors (unstable_rethrow) in the session lookup; log only the error name

**State:** not_applicable · **Recommendation:** skip · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** e17c55e

**Evidence:**

Upstream's fix is in SessionContextService.getCurrentUserId, which does not exist here. Our session helpers have no catch to swallow Next's dynamic-bailout/redirect errors: src/lib/auth-helpers.ts:9-11 (getSession) and :18-32 (requireSession). The places that catch around auth keep redirect() outside the try: src/app/(web)/admin/layout.tsx:22-32 (comment says so) and src/components/user-menu/actions.ts:120-121 ('redirect() throws NEXT_REDIRECT, so it must stay outside any catch'). admin layout calls connection() first (:20), so no build-time bailout is caught.

**Rationale:**

There is no swallowing catch to fix. The upstream-sync-log 2026-09-24 row tracks the menu-side unstable_rethrow (upstream #89 defect 3) separately, and it stays deferred.

### upstream:66b157e+2dbc8c6+2d14533 (#92) — CommunicationType as MP's real enum (upstream port of our #220), narrowed upstream to Email/SMS

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** XS · **Risk:** low · **Siblings:** mp-senior-care, event-manager · **Upstream:** 66b157e, 2dbc8c6, 2d14533

**Evidence:**

Ours already has the #220 shape: src/lib/providers/ministry-platform/types/provider.types.ts:59-67 COMMUNICATION_TYPES = ['Unknown','Email','SMS','RssFeed','GlobalMFA'] with CommunicationType derived from it, and a discriminated CommunicationInfo (:96-105) that requires TextPhoneNumberId for 'SMS'. communication.service.ts:21 calls assertSendable above ensureValidToken (:23), and :94-107 is the runtime guard. Remaining differences from upstream/main: (1) our message at :98 interpolates the caller value (`Invalid CommunicationType "${type}"`), which breaks .claude/rules/security.md ('Error messages the app throws must be static, never echoing a slug, type or other argument'); upstream throws a fixed `Invalid CommunicationType`. (2) Upstream narrowed the list to ['Email','SMS'] (upstream provider.types.ts:63) and built the runtime Set from it. Reachability: nothing in the app calls createCommunication/sendMessage. The only call sites are the passthroughs helper.ts:519 and provider.ts:243, so this is latent. Siblings: mp-senior-care has our #220 shape (provider.types.ts:52) and the same value-echoing throw (communication.service.ts:103). event-manager never got #220 and still has `CommunicationType: 'Email' | 'Text' | 'Letter'` (event-manager/src/lib/providers/ministry-platform/types/provider.types.ts:41), with no caller.

**Rationale:**

#92 is upstream adopting our own #220, so the core is already done here. The one real gap is small: the thrown message echoes caller input, against our own static-message rule. Upstream's narrowing to Email/SMS is a policy subset. It contradicts the CLAUDE.md pin 'MP enum fields mirror MP, never our guess… must list the enum's real members' and our comment 'Do not extend this by hand: it mirrors an MP enum', so it is not taken unless the user wants that policy. event-manager is behind our own fix, which is a sibling port of #220, not of upstream.

**Proposed change:**

src/lib/providers/ministry-platform/services/communication.service.ts:97-100: throw a fixed message naming the field and listing COMMUNICATION_TYPES, without the value (e.g. `Invalid CommunicationType. Ministry Platform accepts only: ${COMMUNICATION_TYPES.join(', ')}.`). Keep the 5-member list. Mirror the same one-line change in mp-senior-care communication.service.ts:103. Separately, port #220 (COMMUNICATION_TYPES, discriminated union, assertSendable) into event-manager provider.types.ts:41 + communication.service.ts.

**Tests:**

communication.service.test.ts: assert the rejection message for an `as`-cast 'Text' does not contain 'Text' and that no POST was made (existing pattern). event-manager: port mp-charts' communication.service tests along with #220.

**Conflicts with pinned settings:**

Adopting upstream's Email/SMS narrowing would conflict with the CLAUDE.md 'MP enum fields mirror MP' rule (it names this file as the reference, #220). The proposed change keeps the full enum.

### upstream:41bba94+3d9ae92 — Provider-service hardening: path-segment guards, deny-all procedure allowlist, trusted sender, no $ignorePermissions

**State:** open · **Recommendation:** adapt · **Effort:** M · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 41bba94, 3d9ae92

**Evidence:**

The upstream triage script (port-security-review-2026-09-28.md, Phase 9), run on our tree, prints '✗ P9 guards' and '✗ P9 any procedure callable'. There is no services/guards.ts. procedure.service.ts:36/:55 build `/procs/${encodeURIComponent(procedure)}` for any name, and encodeURIComponent leaves '..' intact. :40/:59 interpolate the name into the log and log the raw error. file.service.ts:79 builds `/files/${table}/${recordId}` with no encoding, unlike :34. fileId at :128/:153/:199 and uniqueFileId at :174/:213 are unvalidated. getFileContentByUniqueId's fetch (:176) has no timeout or `redirect:'error'`, and :182 echoes the uniqueFileId. table.service.ts:18/38/57/78 has no identifier check. $ignorePermissions is still in provider.types.ts:157 and documented at helper.ts:404. Every provider service logs `console.error(..., error)` raw, where security.md asks for errorForLog. Reachability (grep of src minus the provider dir): no app code calls executeProcedure/executeProcedureWithBody, createCommunication, sendMessage, getGlobalFilters, getFileContentByUniqueId, updateFile or deleteFile. The live file calls pass literal table names and IDs already passed through sanitizeId: memberService.ts:104, complianceProcessingService.ts:759 and :840. In journeyProcessingService.ts:172, assertMilestoneRecordInScope runs sanitizeId before uploadDocument via updateMilestone:468. So every gap is latent defence in depth. Siblings: no guards.ts or procedure allowlist in event-manager, mp-senior-care or music-db, and $ignorePermissions is at event-manager provider.types.ts:101 and mp-senior-care :150. event-manager DOES call procedures: eventSeriesService.ts:154 and eventService.ts:376,383 (executeProcedureWithBody).

**Rationale:**

The MP client is an admin-level service account, so any future action that forwards a table name, procedure name or file ID gets full reach. TypeScript types are erased at runtime, and today the only protection is call-site discipline. The cheap parts close that without breaking anything here: identifier and ID guards, a deny-all procedure list (we call none), dropping $ignorePermissions, and errorForLog. Upstream's CommunicationService rewrite (trusted sender plus rebuilding the payload from known keys) is ~180 lines for a path with no caller. Defer it until a feature sends mail, and design the sender then.

**Proposed change:**

1) Add src/lib/providers/ministry-platform/services/guards.ts with sanitizeIdentifier (/^[A-Za-z_][A-Za-z0-9_]*$/, max 128, fixed message). Reuse our errorForLog (src/lib/log-safe.ts) instead of upstream's errorName. 2) table.service.ts and procedure.service.ts: run sanitizeIdentifier on table/procedure names before ensureValidToken, and sanitizeIds on delete IDs. 3) file.service.ts: sanitizeIdentifier(table) + sanitizeId(recordId/fileId) + sanitizeGuid(uniqueFileId), then encodeURIComponent each segment (fixes :79). At :176 add `signal: AbortSignal.timeout(20_000), redirect: 'error'`. At :182 stop echoing the ID. 4) procedure.service.ts: `ALLOWED_PROCEDURES: ReadonlySet<string> = new Set()` checked before executing, plus a constructor/MPHelper option `allowedProcedures` as upstream has (3d9ae92 helper.ts/provider.ts). 5) Remove $ignorePermissions from GlobalFilterParams and the helper JSDoc. 6) Replace raw `console.error(msg, error)` in services/*.ts with errorForLog(error). In siblings: mirror into mp-senior-care and music-db as-is. In event-manager, pass its three procedure names via `new MPHelper({ allowedProcedures: [...] })` in eventSeriesService/eventService, or every event write breaks.

**Tests:**

guards.test.ts (accepts Contacts/dp_Users/api_Custom_X; rejects '../procs/x', 'a/b', 'a.b', '%2e', 129 chars, non-string). table/procedure/file service tests assert a rejected input makes no fetch and no token call. procedure.service.test.ts: deny-all by default, and the allowedProcedures option admits only its listed names. file.service test: uploadFiles path is encoded, getFileContentByUniqueId rejects a non-GUID and passes redirect:'error'. Also run event-manager's eventService/eventSeriesService tests with the allowlist wired.

### upstream:56bd228 — Codegen: escape MP metadata written into generated models

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** 56bd228

**Evidence:**

src/lib/providers/ministry-platform/scripts/generate-types.ts:163-166 formatFieldName emits `"${name}"` raw, so a '"' in a column name breaks out of the quoted key. Lines :232-248 interpolate `.max(${col.Size})` without checking the value is an integer, and :370 does the same in JSDoc. :361 puts ReferencedTable/ReferencedColumn into a `//` comment (a newline ends it). :411 and :440 put SpecialPermissions into a JSDoc block, where `*/` closes it. :454 writes FK names into Markdown. Env files load at import time (:15). No generate-types.test.ts exists. Ours deliberately emits `z.guid()` (:276), while upstream still emits `z.string().uuid()`. Siblings: event-manager and mp-senior-care generate-types.ts:165 have the same raw quoting. music-db has no generator.

**Rationale:**

The threat is narrow. Only someone who can edit MP schema metadata (an MP admin) could inject, and the output is committed and reviewed as a diff. The fix is mechanical, though, and upstream reports byte-identical output for ordinary metadata. Keep our Zod v4 `z.guid()`: CLAUDE.md says Zod v4 uses `z.guid()` instead of `z.string().uuid()`, so copying upstream's file wholesale would regress that.

**Proposed change:**

Hand-port into generate-types.ts: commentText/docText/safeSize helpers; formatFieldName via JSON.stringify; every Size use through safeSize; FK and SpecialPermissions text through commentText; Markdown through docText; the basic-fallback PK through formatFieldName; 'Unnamed' for an empty sanitized type name; loadEnvFiles() called inside main(). Keep line :276 `z.guid()`. Export the helpers for tests. Mirror into event-manager and mp-senior-care.

**Tests:**

Port upstream's generate-types.test.ts (408 lines), changing the Guid expectation to z.guid(). Then run `npm run mp:generate:models` read-only against MP and confirm `git diff --stat src/lib/providers/ministry-platform/models` is empty (byte-identical).

**Conflicts with pinned settings:**

Upstream's file emits z.string().uuid(), which conflicts with the CLAUDE.md Zod v4 note (`z.guid()`). Port the escaping only.

### upstream:606dc53+56fffd9 — server-only import guards on auth, the MP client and services; next 16.3.7

**State:** partially_fixed · **Recommendation:** port · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** 606dc53, 56fffd9

**Evidence:**

next: package.json:45 `^16.4.5`, and node_modules/next is 16.4.5 (package-lock.json:9072). That is past 16.3.6, the GHSA-vcvr-r3jv-pc5j fix, and nothing imports next/og (grep), so the Next half is done. server-only: no `server-only` dependency in package.json and no `import "server-only"` anywhere in src. The upstream triage line prints '✗ P14 server-only'. Client components import only types/models/utils from the provider (user-context.tsx:5, user-menu.tsx:4, contact-logs.tsx:5-6 import models + mp-datetime), so guards on auth.ts, client.ts, client-credentials.ts, http-client.ts and src/services/* would not break today's build. Three things need wiring: tsx scripts that load MPHelper (package.json:16-17 mp:generate*, and scripts/check-audit-member-status.ts:21 and the other scripts/*-milestones.ts) need `tsx --conditions=react-server`; Vitest needs an alias to server-only's no-op entry; src/test-only-imports.test.ts already accepts any package.json `dependencies` entry that reaches the production graph. No sibling has server-only (event-manager, mp-senior-care and music-db package.json have no entry; all on next ^16.4.5).

**Rationale:**

It is a cheap build-time tripwire. A future `"use client"` file that imports a service or the MP client would otherwise bundle service-account code (token logic, base URL) into browser JS, and nothing in CI would catch it: check-standalone only reads server chunks and skips .next/static. Nothing breaks today because client components import only types and utils.

**Proposed change:**

Add `server-only` to dependencies. Restore the better-auth `>=1.7.18 <1.8.0` range if `npm install` rewrites it (see memory npm-install-rewrites-bounded-range). Add `import "server-only";` as the first line of src/lib/auth.ts, src/lib/providers/ministry-platform/{client.ts,auth/client-credentials.ts,utils/http-client.ts} and each src/services/*.ts that is not a test. vitest.config: `resolve.alias['server-only']` → `server-only/empty.js` (as upstream vitest.config.mts). package.json mp:generate* → `tsx --conditions=react-server …`. Document the same flag for the one-off scripts/*.ts. Mirror into event-manager, mp-senior-care and music-db.

**Tests:**

npm run test:run; npm run build in a worktree or CI, not the main tree; npm run check:standalone (server-only becomes a production node); a throwaway planted `"use client"` component importing @/services/contactService must fail next build (verify on a branch in CI, then remove); `npm run mp:generate -- --help` still loads.

### upstream:710dfa8 — Return only rendered contact-log fields to the browser

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** mp-senior-care, event-manager · **Upstream:** 710dfa8

**Evidence:**

src/components/contact-lookup-details/actions.ts:95-99 returns `{ ...log, Contact_Log_Type, MadeByContact } as ContactLogDisplay`. The spread ships every column contactLogService.ts:140 selects, including Planned_Contact_ID, Contact_Successful, Original_Contact_Log_Entry and Feedback_Entry_ID. The dp_Users select at actions.ts:65 adds each author's Contact_ID, Email_Address, Mobile_Phone and Image_GUID to MadeByContact, but contact-logs.tsx:529 renders only Nickname/First_Name/Last_Name. Unlike upstream, our UI needs Made_By (contact-logs.tsx:507, the owner-only Edit button) and Contact_Log_Type_ID. Siblings: mp-senior-care contact-lookup-details/actions.ts:63 (same select) and :95 (`...log`); event-manager :62 and :94.

**Rationale:**

Only users with contact-lookup feature access receive this, so it is minimisation rather than a privilege gap. Still, staff phone numbers and emails, plus cross-record link IDs, go to every browser that opens a contact and are never shown. Upstream drops Made_By, which would break our owner-only edit control, so adapt rather than copy.

**Proposed change:**

contact-lookup-details/actions.ts: build each ContactLogDisplay explicitly: Contact_Log_ID, Contact_Date, Notes, Contact_Log_Type, Contact_Log_Type_ID, Made_By, and MadeByContact as {First_Name, Nickname, Last_Name}. Reduce the dp_Users select at :65 to User_ID + those three name columns. Trim ContactLogMadeBy/ContactLogDisplay in src/lib/dto/contact-logs.ts to match (drop Contact_ID, Email_Address, Mobile_Phone, Image_GUID). Mirror into mp-senior-care and event-manager.

**Tests:**

contact-lookup-details/actions.test.ts: assert Object.keys of each returned log equals the exact set, and that MadeByContact has only the three name keys. contact-logs.test.tsx still shows the Edit button for the owner.

### upstream:dc4a25b — Contact-log write allowlist (vs our ContactLogSchema .omit())

**State:** partially_fixed · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** mp-senior-care, event-manager · **Upstream:** dc4a25b

**Evidence:**

Ours (adapted from #85) already strips Made_By on create (contactLogService.ts:186-188) and strips Made_By, Contact_ID and the three linkage FKs on update (:245-255). It stamps Made_By from the session (:208) and sends $userId on all three writes (:214, :267, :287). Contact_Log_ID cannot be overridden because the schema omits it (:262). Gaps against upstream: (1) the create omit drops only Contact_Log_ID+Made_By, so a crafted create can set Planned_Contact_ID, Contact_Successful, Original_Contact_Log_Entry and Feedback_Entry_ID (ContactLogSchema.ts allows all four). The form sends them as nulls (contact-logs.tsx:142-145, actions.ts:197-200). (2) Update still accepts Contact_Successful. (3) Contact_Log_Type_ID is not checked against Contact_Log_Types (createAutoContactLog only sanitizeIds it, actions.ts:184), so a bad ID becomes an opaque MP FK 500. (4) Unused service method searchContactLogs (:95-111) takes an unvalidated `top: limit` and, with no contactId, reads every log. It is not an endpoint. getContactLogsByContactId already has top: 500 (:141). Siblings: mp-senior-care matches ours (contactLogService.ts:165, :219-226). event-manager is pre-#85: contactLogService.ts:127/:159 omit only Contact_Log_ID; actions.ts re-stamps Made_By on update; there is no $userId; Contact_ID is not stripped on update (an owner can re-parent a log). It is reachable via the (web)/contact-lookup/[guid] page.

**Rationale:**

Our blocklist leaves link and flag fields writable on create that the UI never edits. That widens what a crafted POST can do: linking a note to another contact's planned contact or feedback entry. An allowlist states the intent directly. Upstream's switch to `.pick()` is compatible with our rule (a z.object parse strips undeclared keys either way), but security.md and the service JSDoc name `.omit()` as the control, so the docs must change with the code.

**Proposed change:**

contactLogService.ts: create → `ContactLogSchema.pick({ Contact_ID: true, Contact_Date: true, Contact_Log_Type_ID: true, Notes: true })`; update → `ContactLogSchema.pick({ Contact_Date: true, Contact_Log_Type_ID: true, Notes: true }).partial()`. Optionally verify Contact_Log_Type_ID against getContactLogTypes() before writing. Delete searchContactLogs. Drop the null fields from contact-logs.tsx:142-145 and contact-logs/actions.ts:197-200. Narrow ContactLogCreateInput/UpdateInput accordingly. Update the .claude/rules/security.md 'Attribution is Server-Authoritative' text (.omit → .pick; keep 'never .passthrough()'). mp-senior-care: same change. event-manager: port the full #85 shape first (session-stamped Made_By as a separate argument, Contact_ID/FKs stripped on update, $userId), then the pick.

**Tests:**

contactLogService.test.ts smuggled-key tests: Planned_Contact_ID/Feedback_Entry_ID/Original_Contact_Log_Entry/Contact_Successful on create, and Contact_Successful on update, are absent from the createTableRecords/updateTableRecords payload. Existing Made_By/Contact_ID tests still pass. Mutation check: reverting to omit fails the new tests.

**Conflicts with pinned settings:**

.claude/rules/security.md ('The runtime control is the Zod .omit() in the service') and the contactLogService JSDoc pin .omit() as the control. A .pick() is stricter and keeps the strip semantics, but those docs must be updated in the same commit. 'Do not add .passthrough()/z.looseObject' still holds.

### upstream:defd338 — Stop echoing caller input into logs; drop unused contact-log actions

**State:** partially_fixed · **Recommendation:** port · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** defd338

**Evidence:**

Unused 'use server' exports in src/components/contact-logs/actions.ts: getContactLogsByContactId (:139, general tier; the N11 tier-bypass duplicate of contact-lookup-details/actions.ts:35, which is search tier) and getContactLogById (:213). No file imports either: the importers, contact-logs.tsx:7 and contact-lookup-details.tsx:9, use getContactLogTypes/createContactLog/updateContactLog/getCurrentUserMpUserId/createAutoContactLog. deleteContactLog (:102) also has no importer but is owner-gated. The DomainTimezoneService part does not apply: we use mp-datetime.ts, whose throws echo the input (:128 toMpSqlDatetime, :175 parseMpDatetime). The only caller-reachable input, Contact_Date, is validated as z.string().datetime() first (ContactLogSchema.ts), so no newline can reach a log. Actions log raw errors (`console.error("…", error)`, e.g. :51, :94), which is N15/errorForLog territory. Siblings: event-manager (:141, :213) and mp-senior-care (:145, :214) export the same two unused actions.

**Rationale:**

Every 'use server' export is a reachable POST endpoint. Deleting the two dead reads removes the N11 rate-tier bypass at no cost. Making the mp-datetime messages static aligns with security.md's static-message rule, even though no injection is reachable today. This overlaps the N11 and N15 analysts, so coordinate so it is done once.

**Proposed change:**

Delete getContactLogsByContactId and getContactLogById from src/components/contact-logs/actions.ts (and their tests). Decide on deleteContactLog: unused and owner-gated, so removing it is optional. mp-datetime.ts:128/:175: fixed messages without the value. Switch the contact-logs action catch blocks to errorForLog(error). Mirror the deletions in event-manager and mp-senior-care.

**Tests:**

Remove the deleted actions' tests. Add a test that contact-logs/actions exports exactly the expected function names. mp-datetime tests assert the thrown message does not contain the input.

### upstream:7aae2ae — setup.ts: exact .env.local writes, npm ci instead of npm install/update, dedicated OIDC client

**State:** open · **Recommendation:** adapt · **Effort:** S · **Risk:** low · **Siblings:** event-manager, mp-senior-care · **Upstream:** 7aae2ae

**Evidence:**

scripts/setup.ts:258-265 updateEnvFile uses `content.replace(regex, newLine)` with a string replacement, so `$'`, `$&` and `` $` `` in a value are expanded. A probe (scratchpad upstream-provider/probe-replace.mjs) with value `p4ss$'word` turned the file into `…CLIENT_SECRET=p4ss\nBETTER_AUTH_SECRET=topsecret\nword\nBETTER_AUTH_SECRET=topsecret\n`, copying the rest of the file, secret included, into the value. Values are written unquoted (:262), so @next/env's dotenv-expand mangles a `$` in a secret and `#` can truncate. :275 and :615 write with default permissions, not 0600. Setup runs `npm install` (:1165) and then `npm update` (:1187), which pull unreviewed in-range versions into the lockfile. Our OIDC default is TM.Widgets (:1014). Siblings: event-manager and mp-senior-care setup.ts have the same :262 replace and :1184 `npm update`. music-db has no setup.ts.

**Rationale:**

It is a local developer tool, but the replace bug can corrupt .env.local and duplicate a secret into another key. `npm update` also contradicts our reviewed-lockfile discipline (audit gate, bounded better-auth range). Upstream's 'dedicated MPNext sign-in client' guidance does not fit: CLAUDE.md pins TM.Widgets as the sign-in client for all four apps.

**Proposed change:**

scripts/setup.ts: replace with a replacer function, `content.replace(regex, () => newLine)`, and escape the key for RegExp. Write values double-quoted with `$` escaped as `\$` and newlines as `\n`, and refuse values quoting cannot carry (port scripts/setup-env.ts encode/decode, ~220 lines, or a minimal subset). Write .env.local with mode 0o600 and chmod an existing one. Replace the npm install + npm update steps with `npm ci`. Do NOT change the OIDC_CLIENT_ID default from TM.Widgets. Mirror into event-manager and mp-senior-care.

**Tests:**

Port scripts/setup-env.test.ts round-trip cases (`p4ss$'word#tail`, `Xy9$Qz7Lm#Kp2Vw8Rt5Nb3`) checked against @next/env loadEnvConfig. It runs under the existing vitest include `scripts/**/*.test.ts`.

**Conflicts with pinned settings:**

Upstream's dedicated-OIDC-client default and wording conflict with the CLAUDE.md pin that the sign-in client is TM.Widgets (OIDC_CLIENT_ID) in all four apps. Skip that part.

### upstream:3e9e96d — CI build + prerendered-route check; scripts tests in test:run

**State:** fixed · **Recommendation:** already_done · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** 3e9e96d

**Evidence:**

Our verify job already runs `npm run build` (.github/workflows/docker-build-push.yml:110), `npm run check:shells` (:118, scripts/check-prerender-shells.mjs from #228, which checks the build output for scripts in prerendered shells, a stronger signal than upstream's prerender-manifest allowlist) and `npm run check:standalone` (:129). The Dockerfile rebuilds at :44. vitest.config include already has 'scripts/**/*.{test,spec}.{ts,tsx}' (vitest.config:12), so audit-gate-lib, standalone-check-lib and node-base-image tests run in test:run (:103).

**Rationale:**

Every outcome of the commit exists here in a fork-specific form, which predates or exceeds upstream. The only difference is that check-prerender-shells.mjs has no unit test of its own. Optional, and not a gap the commit closes.

**Tests:**

Optional: a small scripts/check-prerender-shells.test.ts (fixture dir with a nonce-less shell → exit 1; _global-error.html allowed).

### upstream:b93d4c9+a6eb503 (#106) — Remove unused dependencies and the Tailwind v3 config

**State:** open · **Recommendation:** port · **Effort:** XS · **Risk:** low · **Siblings:** event-manager, mp-senior-care, music-db · **Upstream:** b93d4c9, a6eb503, 213b76b

**Evidence:**

package.json lists @types/js-cookie under dependencies (:38), and @types/react-syntax-highlighter and autoprefixer under devDependencies. A grep of src, scripts and the root configs finds no import of js-cookie, react-syntax-highlighter or autoprefixer, and postcss.config uses only @tailwindcss/postcss. tsx sits in dependencies but is used only by package.json:16-19 scripts. tailwind.config.js (a v3 content config) is still present, and components.json `"config": "tailwind.config.js"`. Tailwind v4 is configured from src/app/globals.css. @tailwindcss/typography is not present. dotenv must STAY in dependencies: src/test-only-imports.test.ts runtimeFiles() (:234) scans all of src/, including src/lib/providers/ministry-platform/scripts/generate-types.ts, which imports dotenv. Siblings: event-manager (@types/js-cookie :42, tsx :55, autoprefixer :71, tailwind.config.js); mp-senior-care (tsx :52, @types/react-syntax-highlighter :66, tailwind.config.js); music-db (tsx :51, autoprefixer :63, components.json pointing to a tailwind.config.js that does not exist).

**Rationale:**

Dead dependencies widen the audit surface: @types/js-cookie and tsx sit in the production graph that `npm audit --omit=dev` and check-standalone reason about. A stale v3 config misleads shadcn's CLI and readers. No runtime behaviour changes.

**Proposed change:**

`npm uninstall @types/js-cookie @types/react-syntax-highlighter autoprefixer`; move tsx to devDependencies; delete tailwind.config.js; set components.json tailwind.config to "". Afterwards check the better-auth range is still `>=1.7.18 <1.8.0` (npm can rewrite it). Keep dotenv. Mirror the applicable subset into event-manager, mp-senior-care and music-db (music-db only needs the components.json fix plus tsx/autoprefixer).

**Tests:**

npm ci; node scripts/audit-gate.mjs; npm run test:run (test-only-imports must stay green); npm run lint; CI build + check:standalone + check:shells; visual spot-check that Tailwind styles are unchanged.

### upstream:1d58475 (#104) — Prepare the repo for public use (LICENSE, placeholders, remove internal working files, .gitignore)

**State:** open · **Recommendation:** needs_user_decision · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** 1d58475, bc104e1

**Evidence:**

`gh repo view The-Moody-Church/mp-charts` reports visibility PUBLIC with licenseInfo null. There is no LICENSE file and no license/repository field in package.json. Upstream added an MIT LICENSE in this commit. The repo tracks .claude/notes/security-audit-2026-02-24.md, -05-21.md, -06-23.md and -10-10.md; the last lists open LOW findings with file and line detail. The .env.example mpi.ministryplatform.com host (:73, :76) is a generic placeholder, not our tenant, so there is nothing to change there. Local working files are already ignored: scripts/registered-milestone-backfill-*.log (member names) is ignored by .gitignore:96 `*.log` and was never committed (git log --all is empty). Related small gap from upstream b46034c: .gitignore has no `.claude/worktrees/` (git status shows it untracked), and eslint.config.mjs:8 globalIgnores does not exclude it, so `npm run lint` would walk agent worktree checkouts.

**Rationale:**

Upstream's cleanup was for publishing a template. Ours is already public, so two questions follow that only the owner can answer: licensing of a public fork of MIT-licensed code, and whether detailed security audits, open items included, should stay in a public repository. The .gitignore and eslint worktree entries are a clear, safe docs/config fix.

**Proposed change:**

Unconditional: add `.claude/worktrees/` to .gitignore and to eslint.config.mjs globalIgnores. Then, depending on the answer: add LICENSE (MIT, keeping MPNext's copyright notice plus ours) and package.json license/repository fields; and/or move .claude/notes/security-audit-*.md out of the public tree (private repo or local-only). Git history keeps them unless rewritten, so that part is mostly about future audits.

**Tests:**

npm run lint with a worktree present stays clean. No code tests.

**Decision needed:**

mp-charts is a PUBLIC repo with no LICENSE and with full security audit reports, open findings included, committed under .claude/notes/. Do you want (a) an MIT LICENSE added, matching upstream MPNext's and keeping its copyright notice, and (b) future security audits kept out of the public repo (private location or local-only), or are both fine as they are?

### upstream:ea3853d (#105) — Docs accuracy pass across CLAUDE.md, README and references

**State:** not_applicable · **Recommendation:** skip · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** ea3853d, 94b5f81

**Evidence:**

Every change targets upstream's own documents and architecture: requireSecurityRole/$userId examples (we use requireFeatureAccess + getMpUserId), a JWE-sessions README (our cookieCache is jwt, see CLAUDE.md), a Node 22 minimum (we are Node 24: .nvmrc and engines `>=24.0.0`), and their TestCoverage, playbook and SECURITY.md text. Our equivalents are maintained separately (.claude/rules/*, docs/).

**Rationale:**

Nothing in it describes our code. Porting the Node 22 floor would be a regression from our pinned Node 24.

**Conflicts with pinned settings:**

The Node 22 minimum (setup.ts check, engines) conflicts with CLAUDE.md's Node 24 LTS pin (.nvmrc, engines >=24, REQUIRED_NODE_VERSION=24 at scripts/setup.ts:80).

### upstream:0f7941b (#100) — Bump checkout/setup-node/codecov actions

**State:** fixed · **Recommendation:** already_done · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** 0f7941b, c882246

**Evidence:**

Our workflows already use actions/checkout@v7 and actions/setup-node@v7 (docker-build-push.yml:35,76,79,182; audit-nightly.yml:37,40; codeql.yml:28; sync-issues-to-ideas.yml:29,367). We do not use codecov. Upstream's file is test.yml, which we do not have. SHA pinning versus our tag pinning is N18, owned by the N18 analyst.

**Rationale:**

We are on the same major versions. Dependabot's github-actions updates handle this here.

### upstream:6b03e5b+aa1bc64 (#103, playbooks) — Downstream port playbooks (2026-09-28 review; #101 lazy OIDC discovery)

**State:** not_applicable · **Recommendation:** skip · **Effort:** XS · **Risk:** low · **Siblings:** — · **Upstream:** 6b03e5b, d2824fc, aa1bc64

**Evidence:**

Docs only (.claude/playbooks/port-security-review-2026-09-28.md, port-oidc-lazy-discovery.md). Its Phase 1 triage, run read-only on our tree for the provider and tooling phases, reports '✗ P9 guards', '✗ P9 any procedure callable', the P10 `.omit()` hits in contactLogService.ts and '✗ P14 server-only'. Those are items upstream:41bba94+3d9ae92, upstream:dc4a25b and upstream:606dc53 above. aa1bc64 is the playbook for 6ae05df (id_token verification), which is N17 and owned by the N17 analyst. Its 'state C' (explicit endpoints, no verification) is our deliberate posture (sync log 2026-09-24).

**Rationale:**

These are upstream's instructions to forks, not code. They are a useful checklist, and the gaps they expose are covered by the items above. Nothing to port as files. Record the review in .claude/notes/upstream-sync-log.md (a new section for 75d249d..aa1bc64), since the last logged review stops at 75d249d.

**Proposed change:**

Docs-only, direct to main: add a 'Review: <date> — upstream 75d249d..aa1bc64' section to .claude/notes/upstream-sync-log.md recording the per-commit decisions from this analysis.

**Conflicts with pinned settings:**

The playbooks' Phase 3/4 target state (JWE cookie cache, upstream providerId, `MP_SECURITY_ROLES`) conflicts with our pinned cookieCache jwt, providerId 'ministryplatform' and feature-RBAC model. Do not follow them wholesale.
