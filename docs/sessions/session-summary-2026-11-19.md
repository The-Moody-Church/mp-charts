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

## Batch 3 — MP client, low risk — IN PROGRESS (branch pushed, review fixed, no PR yet)

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
- **Next:** PR, then a `:dev` soak with a cold dashboard warm (sign-in soak not required), then the sibling ports
  (event-manager must pass its three procedure names through `allowedProcedures`).

## Next

Batch 3 PR and soak, sibling ports, then batches 4–10 and the N17 verifier port.
