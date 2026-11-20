# Session Summary — 2026-11-19

Continuation of the 2026-11-18 session (open items plan, `.claude/plans/open-items-2026-11-18.md`).

## Batch 2 — auth core (#322) — COMPLETED

- **Operator check:** `BETTER_AUTH_URL` is a bare https origin and `MINISTRY_PLATFORM_BASE_URL` is https with the
  `/ministryplatformapi` path in all four TMC1 `.env` files (mp-charts, event-manager, mp-senior-care, music-tools).
  Ironside was unreachable; none of these apps run there.
- **PR #322** (`042a2f5`): CI green (security-lint, verify, build-scan-and-push, CodeQL). Added on top of the batch
  commit: an `/auth-error` test for a one-element array (only the `typeof` guard stops it; fails with the guard
  removed) and the `src/proxy.ts` `originOf` exception sentence in `.claude/rules/security.md`.
- **`:dev` soak** from 13:33 UTC (rollback pin: batch 1 `a10376b` image by digest). Startup clean (no `[env]` or
  `[auth]` lines, cache warm on attempt 1). Live: `/` 307, `/signin` 200; `get-session` 200, unknown `/api/auth`
  path 404 and `POST /sign-in/social` 200, all `Cache-Control: no-store`; `__Secure-better-auth.oauth_state`
  HttpOnly/Secure/SameSite=Lax/Path=/; `/auth-error` drops free text and echoes `state_mismatch`. Owner signed in,
  browsed and signed out back to the app.
- **Merged** as `57f4723`; main build green; **deployed `:latest` 15:43 UTC** (labels `main` / `57f4723`). Cache warm
  on attempt 1; `/` 307, `/signin` 200, `get-session` 200 with `no-store`.

## Batch 2 sibling ports — COMPLETED

event-manager #93 (`6d4700e`), mp-senior-care #254 (`71b0222`), music-tools #210 (`d93172a`), each prepared by a
parallel agent and reviewed here. Differences from mp-charts: `app-url.ts` (event-manager, mp-senior-care) goes through
`getAuthBaseUrl()` with no production-hostname fallback (every caller sits in a notification try/catch);
event-manager's `taskService.resolveTask` validates the MP URL before its reassign write (was `?? ""`); the profile
log uses each repo's `logError` (no `errorForLog` there); music-tools gained `client.ts`/`client-credentials.ts` tests.

All three soaked on `:dev` from 16:01 UTC (rollback pins = the batch 1 images). Live checks matched mp-charts. **Sign-out
finding:** the owner's first sign-out in all four apps (mptools included) landed on MP's `/oauth/account/profile`,
each logging `[signout] id_token_hint omitted (no-mp-account)`. Cause: the session cookie predated the container
restart (cookie cache valid up to 1h), so no sign-in ran in the new process and the in-memory token store and account
row were empty. The known post-restart gap, not a batch 2 regression: the redirect URI is unchanged (all four
`BETTER_AUTH_URL`s are bare origins) and `route.flow.test.ts` pins the token being stored. After a fresh sign-in, sign-out
returned to the app in all four. Merged and `:latest` deployed 16:22 UTC; cache warm, no `[env]`/`[auth]` lines.

**Soak tip:** sign out (or wait out the hour) and sign in fresh after a swap before judging sign-out.

## Batch 3 — MP client, low risk — COMPLETED (#323, merged `486c0a7`, deployed 2026-11-19)

Branch `security/batch3-mp-client`. N12 (MP client half) and N21; upstream 9b7b4d1, 5aa0b5e (minus the 401 retry and
negative cache, batch 8), 41bba94 + 3d9ae92 (minus the trusted-sender rewrite: no caller).

- **`utils/http-client.ts`**: `redirect: 'error'` on all six fetches; `assertSafeEndpoint` first in `buildUrl`
  (upstream's regex + resolved-URL root check, fixed message); 60 s for `postFormData`/`putFormData`, 30 s kept
  elsewhere; `readJson` (204 or an empty body → `undefined`, bad JSON → `<METHOD> <endpoint> failed: invalid
  JSON response`); GUIDs redacted to `{uniqueId}` in messages. No content-type check, no refactor, no extra log line.
- **`utils/timeouts.ts`** (new): `MP_API_TIMEOUT_MS` 30 s, `MP_UPLOAD_TIMEOUT_MS` 60 s, `MP_TOKEN_TIMEOUT_MS` 10 s.
- **`auth/client-credentials.ts`**: 10 s timeout, `redirect: "error"`, fetch failure → `...: <error name>`, `!ok` →
  `...: <status> <statusText>`, bad JSON → static message, non-empty string `access_token` required, `token_type`
  optional (bearer in any case if present, else refused). No message carries the secret, the token or the body.
- **`client.ts`**: single-flight `inflight` (cleared in `finally`; a failed refresh rejects every waiter, the next
  call retries); `expires_in` clamped to [30 s, 3600 s] with the 3600 default for absent/NaN/zero/negative and the
  5-min margin kept; `errorForLog`. User-token mode kept (batch 8).
- **`services/guards.ts`** (new) `sanitizeIdentifier`; table/procedure/file services check before `ensureValidToken`;
  file IDs `sanitizeId`, GUIDs `sanitizeGuid`, each segment encoded (`uploadFiles` used to interpolate raw);
  `getFileContentByUniqueId` gets `redirect: 'error'` + 30 s and no longer echoes the ID; `ALLOWED_PROCEDURES` empty,
  `allowedProcedures` threaded through `MPHelper` → provider (per-call `ProcedureService`); `$ignorePermissions`
  removed and `DomainService` forwards only a validated `$userId`; all provider services log `errorForLog`.
- **Live-caller check before the guards:** 32 distinct table literals across `src/` and `scripts/` plus the dynamic
  ones (`uploadDocument` literals, `REQUIREMENT_RECORDS`, `batchGetTableRecords` literals, the audit script's
  `dp_Audit_Log`/`Audit_Log`/`dp_Audit_Detail`) all match the identifier rule, as do all 278 tables in
  `ministryplatform.schema.md` (the generator's sampling path). No procedure caller. File callers pass literal tables
  and `sanitizeId`'d IDs; no app caller of the GUID methods.
- **Deviation:** delete IDs go through `sanitizeId` per ID rather than `sanitizeIds`, which silently drops bad IDs and
  admits floats; a bad ID now refuses the whole delete. The only caller (`deleteContactLog`) already passes
  `sanitizeId(contactLogId)`.
- **Tests:** new `guards.test.ts`, `provider-guards.wiring.test.ts` (real helper → provider → services); additions in
  http-client, client, client-credentials, table/procedure/file service, helper and provider tests. Reverting each
  source file to `main` fails the new tests (http-client 36, client 9, credentials 19, table 15, file 17, procedure
  ≥8, domain 3).
- **Review outcome (8 verified findings: 6 low, 2 nit; all fixed in a follow-up commit):**
  - `readJson` empty bodies (low + duplicate nit): any empty or whitespace body now returns `undefined` (read with
    `text()`, then `JSON.parse` under the same fixed message); a 204 still skips the read; a body-read failure
    propagates unchanged. Tests: empty-string/null-body 200, 205, whitespace 200, and an empty chunked 200 from a real
    local `node:http` server (Content-Length null).
  - Log sites (low, 17 of 20 unpinned): new `services/log-sites.test.ts` scans `services/*.ts` and `client.ts`; every
    console call must be `console.error('<fixed text>', errorForLog(error));` and every service catch log-then-rethrow.
  - Backslash guard (low): `/tables\Contacts`, `/files\1` added (no `..`), so dropping `\` from the regex fails.
  - GUID redaction in the invalid-JSON message (low): exact-message test on `/files/<guid>/metadata`.
  - Network cause lost from logs (low): `causeForLog` in `src/lib/log-safe.ts`, appended by `errorForLog` and the token
    error: ` (cause: <name> <code>)`, each `^[A-Za-z0-9_]{1,64}$`, never the cause message; undici's
    "unexpected redirect" → `redirect refused`. Tested with synthetic causes and real undici rejections (a 307 under
    `redirect: 'error'`, a closed port). The stale log-safe.ts docstring is corrected.
  - `errorName` filter (nit): a test with a name carrying text and a newline expects `...: object`.
  - Header-unsafe token (nit): `access_token` must match `^[\x21-\x7E]+$` (NUL, CR/LF, space, padding, non-ASCII
    refused with the static `invalid token response`); JWT/b64token/hex shapes accepted.
  - Mutants checked: each new test fails against the reverted line (backslash 2, GUID 1, errorName 1, token 5,
    log-site 2).
- **PR #323**, CI green. **`:dev` soak** from 17:13 UTC (rollback pin = batch 2 `57f4723` image): cold warm 4/4 on
  attempt 1 (37 s, the full ~31-call fan-out through the single-flight token), no MP errors; owner checked the
  dashboard, a manual refresh, a contact lookup with photo and a journey/compliance file list. Merged `486c0a7`;
  `:latest` deployed 17:22 UTC, warm 4/4 on attempt 1.
- **Sibling ports — COMPLETED.** A workflow ported, independently reviewed (production paths, parity, mutants) and
  fixed each: event-manager #95 (`469dce8`; per-service `allowedProcedures`: `EventService` →
  `api_Tools_GetRecordSequenceId`, `api_Tools_GetSequenceRecords`; `EventSeriesService` → `api_Custom_CreateEventSequence`;
  `taskService`'s direct `DELETE /tasks` hardened; its HttpClient gained the 30 s/60 s deadlines it lacked),
  mp-senior-care #255 (`283c7eb`; one nit fixed: a one-off script no longer puts MP response bodies in errors),
  music-tools #211 (`abd285d`; gained `sanitizeId`). Each copies `src/lib/log-safe.ts`. Reviews: no findings in
  event-manager or music-tools. All three on `:dev` from 17:40 UTC (cold warms on attempt 1, no MP errors); the owner
  tested event-manager (event creates) and chose to deploy the other two untested. `:latest` deployed 17:50 UTC.

## Batch 4 — contact logs and data minimisation — COMPLETED in mp-charts (#324, deployed 21:18 UTC); sibling ports pending

Scope from `.claude/plans/open-items-2026-11-18.md` (batch 4, gap 1, decision 7; N11, upstream defd338, 710dfa8,
dc4a25b, a11c2a3; CodeQL #37). Owner decisions: delete all three orphans, keep no dead contact code, no
`Contact_Log_Type_ID` existence check.

- **N11 / defd338.** Deleted `deleteContactLog`, `getContactLogsByContactId` (general-tier duplicate of the
  search-tier contact-lookup-details read) and `getContactLogById` (any log's Notes by ID) from
  `contact-logs/actions.ts`, with their tests and mocks; `ContactLogService.getContactLogById` stays (update
  ownership). The four remaining catch blocks log `errorForLog(error)`. `mp-datetime.ts` throws static messages.
  New `src/server-action-exports.test.ts`: every export of every file-level `'use server'` module under `src/` (13
  modules) needs a non-test importer (named imports, `ns.name`, re-exports through barrels; namespace-as-value and
  dynamic imports refused). On the old tree it fails naming exactly the three orphans.
- **710dfa8 (adapted).** `getContactLogsByContactId` (contact-lookup-details) builds each `ContactLogDisplay` field
  by field: `Contact_Log_ID`, `Contact_Date`, `Notes`, `Contact_Log_Type`, `Contact_Log_Type_ID`, `Made_By`,
  `MadeByContact` (`{ First_Name, Nickname, Last_Name }`). `dp_Users` select is `User_ID` + the three names. DTOs
  trimmed (`ContactLogMadeBy` lost Contact_ID/Email_Address/Mobile_Phone/Image_GUID, `ContactLogDisplay` lost
  Contact_ID). Exact-key-set tests.
- **dc4a25b (adapted).** Service create/update use `.pick()` allowlists; create record built field by field;
  `searchContactLogs` deleted; null link fields dropped from `contact-logs.tsx` and `createAutoContactLog`; input
  types narrowed (`ContactLogCreateInput`/`UpdateInput` are now `Pick`s, imported by the actions). Smuggled-key
  tests. `security.md` attribution section and the service JSDoc updated.
- **a11c2a3 + gap 1.** Deleted `ContactService.contactSearch` and `ContactService.updateContact` and their tests.
  `sanitizeFilterValue`/`sanitizeLikeValue`/`sanitizeGuid` refuse non-strings with fixed messages
  (`sanitizeGuid(['<guid>'])` used to return the array). Every live caller passes a string.
- **CodeQL #37.** `dashboardService.core.test.ts` `inList` uses a full regex-metacharacter escape incl. backslash.
- **Checks.** New tests fail on the old source (35 failures across 6 files with the old sources swapped in, then
  restored). `tsc`, lint clean; 100 files / 2259 tests; coverage 60.12 / 51.42 / 51.5 / 61.36 (floors 59/50/50/60
  hold); build and `check:standalone` pass. Manifest: 80 entries = 75 actions + 5 cache; contact-lookup-details
  `getContactLogsByContactId` present; contact-logs has only its five live actions, no read of logs.
- **Review (5 findings + 1 nit), all fixed, each with a test that fails without it (mutants run, then restored).**
  - *Medium: guard had no self-check that a test importer does not count.* `server-action-exports.test.ts` now runs
    its scan through `analyse(files)` and records importers per export. New self-checks: no recorded importer is a
    test file (`actions.test.ts` asserted to be one), and fixtures run the real scan in a temp dir: an export imported
    only by `actions.test.ts` / `__tests__/` is an orphan (the N11 shape), barrels are followed, namespace-as-value
    and dynamic imports are refused. The reviewer's mutant (drop `if (info.test) continue;`) now fails 2 tests; the
    old tree still fails naming exactly the three orphans.
  - *Low: named and star re-exports inside a 'use server' module were unchecked.* A named re-export
    (`export { a as b } from "…"`) is now a declared export `b` needing its own importer; `export *` in a 'use
    server' module is refused. Fixture tests for both.
  - *Low: the create `.pick()` was not pinned.* `ContactLogCreateSchema`/`ContactLogUpdateSchema` are exported and
    their exact key sets tested; a create smuggling wrongly-typed `Contact_Successful`/link fields/`Made_By` must
    succeed with the five-key payload. The reviewer's `.omit()` mutant now fails 2 tests.
  - *Low: `createContactLog`/`updateContactLog` returned MP's whole row to the browser via `as ContactLog`.* Both now
    resolve to `void` (the form discards the result); tests assert `resolves.toBeUndefined()` with a full-row mock.
    `$select` on the service writes not added (unverifiable without an MP write). `security.md` read-minimisation
    paragraph extended to write-action return values.
  - *Nit: contact-lookup-details `errorForLog` catches untested.* Both (Made_By lookup, outer) now asserted to log
    one stripped line; the rest of that file's catches are left to a later batch.
  - Re-run: `tsc`, lint clean; `test:run` 100 files / 2272 tests; coverage 60.12 / 51.42 / 51.5 / 61.36 (floors
    hold); build and `check:standalone` pass (102 lockfile nodes); manifest still 80 entries (75 actions + 5 cache).
- **Shipped.** PR #324 (CI green), merged as `619ddc3`, `:latest` deployed 21:18 UTC. **No `:dev` soak**: the owner
  chose to merge and deploy directly. Rollback pin rewritten first to the batch 3 image (`486c0a7`, by digest). Cold
  warm on attempt 1, no `[env]`/`[auth]` errors, `/` 307, `/signin` 200. (A first `/deploy` at 21:17 pulled
  `40da6f2`, docs-only over batch 3, because the CI check matched the CodeQL run; redeployed once the build finished.)
- **Next:** mirror to mp-senior-care as is; event-manager needs the #85 shape and `COMMUNICATION_TYPES` first; siblings
  also need `sanitizeLikeValue` and a search cap.

## Batch 4 follow-ups — COMPLETED (PR #325, merged 2026-11-20 as `c88c241`)

- **Owner decisions taken today (sibling batch 4 ports):** 8-word search cap accepted in the siblings; the F9
  search tier is NOT ported to the sibling contact-lookup-details reads (each card makes 4 reads, ~7 cards/min,
  and the badges/groups reads swallow errors); the service `deleteContactLog` is deleted in all three
  (mp-charts, event-manager, mp-senior-care); event-manager's events-list `q` is blocked over 75 characters;
  music-db's unused `sanitizeFilterValue` is deleted.
- **Service delete removed.** `ContactLogService.deleteContactLog` and its two tests deleted; grep confirms no
  caller (the orphan action that used it went in #324). New "service surface" test in `contactLogService.test.ts`
  pins the prototype's method list; with the method restored it fails naming `deleteContactLog`. `security.md`
  attribution paragraph no longer mentions "the service's delete" and says no contact-log delete exists at any layer.
- **Weak echo test fixed.** `filter-sanitize.test.ts` "the messages never echo the value" put `expect.unreachable()`
  inside the `try`, so the `catch` swallowed it: with `sanitizeGuid` mutated to `return guid` the old test passed.
  It now captures the error outside the `try`, asserts `toBeInstanceOf(Error)` (labelled with `fn.name`), then the
  message; the same mutant fails it (`sanitizeGuid: expected undefined to be an instance of Error`). Same fix,
  same shape, in `guards.test.ts` (already failed under a non-throwing mutant via `toBe`, but brittle) and
  `rate-limit.test.ts` "retry-after" (passed with the throw removed; now fails). `mp-datetime.test.ts` checked:
  both echo tests call `toThrow` first and pin `expect.assertions(4)`, so they were sound and are unchanged.
  New rule in `.claude/rules/testing.md`. All mutants restored (`git diff` on the sources empty).
- **Checks.** `tsc`, lint clean; coverage run 100 files / 2271 tests (2272 − 2 delete tests + 1 surface test);
  coverage 60.12 / 51.42 / 51.48 / 61.36 (floors 59/50/50/60 hold); build, `check:standalone` (102 lockfile nodes)
  and `check:shells` (18 shells) pass; manifest 80 entries (75 actions + 5 cache), unchanged.

## Batch 4 sibling ports and soak — COMPLETED

- **PRs:** event-manager #97 (also catches up #85 server-authoritative attribution and #220 `COMMUNICATION_TYPES`;
  events-list search blocked over 75 characters), mp-senior-care #256 (7 orphan actions deleted; `contactSearch` on
  `sanitizeLikeValue`, capped at 100 characters / 8 words; volunteer search on the `search` tier), music-tools #212
  (`server-action-exports.test.ts`, `sanitizeGuid` non-string guard, unused `sanitizeFilterValue` deleted). The
  service `deleteContactLog` is gone in all three contact-log apps.
- **`:dev` soak** of all four from 2026-11-19 23:36 UTC (rollback pins = the `:latest` running before). The owner
  clicked through and approved on 2026-11-20. Merged: mp-charts #325 `c88c241`, event-manager #97 `8e0fef3`,
  mp-senior-care #256 `d2b4467`, music-tools #212 `b99403b`. `:latest` deployed 2026-11-20 13:58 UTC to mp-charts, event-manager and
  mp-senior-care (each warmed on attempt 1, `/` 307, `/signin` 200). **music-tools not deployed:** its `main` build
  failed the audit gate on GHSA-7589-6fvf-x4pw (`effect`, published 2026-11-19, via `prisma` → `@prisma/config`'s
  exact `effect@3.20.0` pin); fixed by music-tools #213 (`overrides` `effect` ^3.22.1, merged `422d239`), and music-tools `:latest` deployed
  15:45 UTC (`/` 307, `/signin` 200, no `[env]`/`[auth]` errors). The other three have no `effect`.

## Next

Batches 5–10 and the N17 verifier port. Still open: the 401 retry (batch 8), deleting the user-token mode, the
`CommunicationType` enum, and `assertSendable` echoing an invalid type in its message (not reachable from input).
