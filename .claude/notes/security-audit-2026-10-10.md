# Security Audit Report — 2026-10-10

Read-only audit of mp-charts and of upstream MinistryPlatform-Community/MPNext. No code was changed, no tests
were run (see N20), no Ministry Platform write was made. Every finding below was re-read against the source a
second time before it was recorded; the evidence line names the exact file and line range that was checked.

**Baseline audited:** `origin/main` @ `14d34e6` (2026-10-07, PR #248). The local checkout was at `ec5ea9a`
(8 commits behind) — differences are called out where they matter. Installed: next 16.3.8, better-auth 1.7.5,
zod 4.6.5, react 19.2.8, node 24. **Upstream:** `upstream/main` @ `aa1bc64` (2026-09-29).

## Executive summary

**Overall risk: MEDIUM.** The auth stack is in better shape than at any prior audit: every load-bearing
better-auth 1.7 setting described in CLAUDE.md is present and pinned, every `filter:` interpolation in `src/`
traces back to a sanitizer or a server constant, and every exported server action is behind a session or
feature gate. The residual risk is again **per-record authorization**, concentrated in file-listing and photo
paths that were added after the F2 scope work and never received a scope check:

- **N1 (HIGH)** — a compliance-tool user can list the attached files of **any** Background_Checks,
  Participant_Certifications or Form_Responses record church-wide, and each listed `fileUrl` is MP's
  unauthenticated `/files/{UniqueFileId}` download.
- **N2–N4 (MEDIUM)** — the same class in manage-members milestone files, the shared contact-photo upload, and the
  Summer Blast enroll/remove writes.
- **N5–N6 (MEDIUM)** — the repository is **public**; feedback issues carry staff names and `/contact-lookup/<GUID>`
  URLs, and two session summaries carry internal server IPs that the project's own checklist forbids.

Upstream MPNext closed a ~60-item review on 2026-09-28/29 (no Critical/High there). **None of it has been
reviewed by this fork yet** (the sync log stops at `75d249d`). Section 3 maps every item to our tree: 17 do not
apply or are already done here, 21 are open hardening deltas, none is a confirmed High for us.

### Methodology

Single reviewer, no subagents. Read every non-UI source file (auth, route, proxy, helpers, all 14 `actions.ts`
files, all 9 services, the MP provider, config writers, headers, instrumentation), traced every `${}` inside a
`filter:` to its origin, tabled every exported server action against `requireSession` / `requireFeatureAccess`
/ `enforceRateLimit` / scope assertions, then compared the tree against upstream's two port playbooks
(`.claude/playbooks/port-security-review-2026-09-28.md`, `port-oidc-lazy-discovery.md`) and its review record
(`docs/security/2026-09-28-auth-review.md`) using upstream's own triage greps. Read-only GitHub API calls checked
repo visibility, protection, scanning status, open alerts and advisory data.

---

## 1. Findings — fork (mp-charts)

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| N1 | Compliance requirement files: no scope check → church-wide file enumeration + unauthenticated download URLs | **HIGH** | Open |
| N2 | Manage-members milestone files: no scope check | MEDIUM | Open |
| N3 | Shared contact-photo upload replaces any contact's default photo | MEDIUM | Open |
| N4 | Summer Blast add/remove write to arbitrary Group_Participants / Responses rows | MEDIUM | Open |
| N5 | Public repo: feedback issues publish staff names + contact GUIDs | MEDIUM | Open |
| N6 | Public repo: internal IPs/hosts in tracked docs (checklist violation) | MEDIUM (policy) / LOW (exploit) | Open |
| N7 | `transitionMember` writes any participant's Member_Status_ID | LOW | Open |
| N8 | Upstream 2026-09-28 wave unreviewed (see §3) | LOW–MEDIUM aggregate | Open |
| N9 | `proxy.ts` `/api` prefix match and unanchored matcher | LOW | Open |
| N10 | Journey/compliance pages render tool config without a feature gate | LOW | Open |
| N11 | Duplicate reachable action at a weaker rate tier; one orphan export | LOW | Open |
| N12 | Outbound fetches without timeout/redirect refusal; token refresh not single-flight; token body unvalidated | LOW | Open |
| N13 | `originOf` allows env-controlled CSP directive injection | LOW | Open |
| N14 | `X-Powered-By`, live `/_next/image`, dev action-arg logging | LOW | Open |
| N15 | Three CodeQL `js/log-injection` alerts open since 2026-08-07 | LOW | Open |
| N16 | Cookie cache `jwt` (signed, readable) and `/get-session` returns token/IP/UA | LOW | Open |
| N17 | id_token not signature-verified; no `exp`/`azp` check | LOW (accepted posture) | Open |
| N18 | CI actions pinned by tag; no workflow-level `permissions`; `persist-credentials` default | LOW | Open |
| N19 | `BETTER_AUTH_URL` / MP URL not validated at boot; localhost fallback | LOW | Open |
| N20 | Local checkout 8 commits behind; stale `node_modules`; tests not run | INFO | Operational |
| N21 | `$ignorePermissions` still declared (unused) | INFO | Open |
| N22 | `main` has no branch protection; `.claude/settings.local.json` tracked (benign) | INFO | Open |

### N1 — Compliance requirement files have no scope check (HIGH)

**Files:** `src/components/compliance-processing/actions.ts` (`getComplianceRequirementFiles`),
`src/services/complianceProcessingService.ts:575-595` (`getRecordFiles`),
`src/lib/providers/ministry-platform/services/file.service.ts` (`getFileContentByUniqueId`, no bearer).

**What was verified.** `getComplianceRequirementFiles(slug, type, recordId)` maps `type` to one of
`Background_Checks`, `Participant_Certifications`, `Form_Responses`, `Participant_Milestones` and calls
`service.getRecordFiles(table, recordId)`. `getRecordFiles` only runs `sanitizeId` and then
`mp.getFilesByRecord`. Compare `getMilestoneFiles` (597-604), which calls `assertMilestoneRecordInScope` first —
the scope check exists for one of the four tables and is missing for the other three. Each returned item carries
`fileUrl = ${NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL}/${UniqueFileId}`; the client renders it as an `<a href>`
(`milestone-expanded-view.tsx:36`, `milestone-edit-form.tsx:78`) and the browser fetches it with no MP token,
which is why `file.service.ts` fetches the same endpoint with no Authorization header. The UniqueFileId is
therefore a download capability.

**Attack.** A user granted any single compliance tool replays the action with sequential `recordId`s and
`type: "background_check"`. They receive file names and download URLs for every background-check document
in the tenant — the most sensitive PII the app touches — with no relation to the tool they are allowed to use.
`requireComplianceAccess(slug)` gates *whether* they may use the tool, not *which* record.

**Fix shape (not applied).** Resolve the owning participant/contact for the record (`Background_Checks.Contact_ID`,
`Participant_Certifications.Participant_ID`, `Form_Responses.Contact_ID`) and run the existing
`assertParticipantInScope` / `assertContactInScope` before `getFilesByRecord`, exactly as `getMilestoneFiles`
does. Add the negative test (out-of-scope record → throws under `enforce`).

### N2 — Manage-members milestone files have no scope check (MEDIUM)

**Files:** `src/components/manage-members/actions.ts` (`fetchMilestoneFiles`), `src/services/memberService.ts:79-103`.

Only `sanitizeId`, then `getFilesByRecord('Participant_Milestones', id)`. `fetchMemberDetail` in the same file
validates the contact against the cached member set, but the file action does not. Any manage-members user can
list the attachments of any Participant_Milestones row, including rows created by the journey and compliance
tools (whose own file actions *do* check scope). Same download-capability consequence as N1. Fix: require the
milestone's `Participant_ID` to be in the member set, or restrict to `Milestone_ID_Table.Journey_ID = MEMBERSHIP_JOURNEY_ID`.

### N3 — Shared contact-photo upload replaces any contact's photo (MEDIUM, integrity)

**Files:** `src/components/shared-actions/processing.ts` (`uploadContactPhoto`), callers
`uploadContactLookupPhoto`, `uploadMemberPhoto`, `uploadJourneyParticipantPhoto`, `uploadComplianceParticipantPhoto`;
services `contactService.ts:316`, `journeyProcessingService.ts:549`, `complianceProcessingService.ts:623`.

`Contact_ID` comes from the form, is checked only for truthiness/NaN (not `sanitizeId`, though here it enters a
URL path segment, not a filter), and the upload sets `isDefaultImage: true`. None of the four callers binds the
contact to the tool's participant set. Any user with any one of those five features can overwrite the profile
photo of any contact church-wide (MIME + magic-byte + 20 MB checks hold, so the payload is a valid image).
Fix: in the journey/compliance callers resolve the contact to a participant and `assertParticipantInScope`; in
contact-lookup and manage-members accept the breadth but `sanitizeId` the ID.

### N4 — Summer Blast writes reach arbitrary rows (MEDIUM, integrity)

**Files:** `src/services/summerBlastService.ts:405-485`, `src/components/summer-blast-volunteers/actions.ts`.

- `removeFromSummerBlast(groupParticipantId)` end-dates whatever `Group_Participants` row the ID names. There
  is no check that the row belongs to `config.trackingGroupId` (journey/compliance use
  `assertGroupParticipantInScope` for the equivalent operation). A summer-blast user can remove anyone from
  any group in the tenant.
- `addToSummerBlast(contactId, responseId)` creates a tracking-group row for **any** contact and sets
  `Responses.Closed = true` on **any** `Response_ID`; the fetched response's `Opportunity_ID` is never compared
  to `config.intakeOpportunityId`, and a missing response does not stop the write.

Fix: in `removeFromSummerBlast` read the row and require `Group_ID === trackingGroupId`; in `addToSummerBlast`
require `response.Opportunity_ID === intakeOpportunityId` (and a response to exist).

### N5 — Feedback issues are public and carry PII-adjacent data (MEDIUM)

**Verified.** `gh repo view` → **PUBLIC**. `FeedbackService` posts to `GITHUB_FEEDBACK_REPO`, defaulting to
`The-Moody-Church/mp-charts`. The body appends `**Page:** ${pageUrl}` (client-supplied,
`window.location.origin + pathname`) and `**Submitted by:** ${session.user.name}`. 22 `user-feedback` issues
exist; issue #148's footer (read, not quoted beyond this) is a `/contact-lookup/<Contact_GUID>` URL plus a staff
member's full name. Free-text descriptions can carry member names. Contact GUIDs are stable identifiers of
congregants and the URL records who looked them up. Fix options: point `GITHUB_FEEDBACK_REPO` at a private repo;
strip the GUID segment server-side; drop the submitter line or replace it with `mpUserId`.

### N6 — Internal infrastructure in the public repo (MEDIUM policy / LOW exploit)

`.claude/notes/security-review-checklist.md` lists "internal infrastructure details: IP addresses, hostnames,
SSH usernames" as **Critical** for a public repo. Tracked and public: `docs/sessions/session-summary-2026-04-04.md`
(TMC1 IP, `docker cp` detail), `docs/sessions/session-summary-2026-09-01.md` (both server IPs),
`docs/sessions/archive/session-summary-2026-02-06.md` (reverse-proxy layout). RFC1918 addresses are not
reachable from the internet, so the practical risk is reconnaissance only, but the rule is the project's own.
`.gitignore` already hides the deploy commands for exactly this reason; the session summaries were missed.

### N7 — `transitionMember` accepts any participant (LOW)

`manage-members/actions.ts` → `MemberService.addMilestone` + `updateMemberStatus(participantId, newStatusId)`.
`participantId` is only truthiness-checked; it is not required to be in the member set (unlike `fetchMemberDetail`).
`newStatusId` is bounded by the `STATUS_TO_MILESTONE` map. The feature is church-wide membership
administration, so this is a widening of an already-broad write rather than a privilege escalation.

### N9 — Proxy carve-out and matcher (LOW)

`src/proxy.ts`: `pathname.startsWith('/api')` would also make a future `/apidocs` page public (no such page
today). Matcher exclusions `_next/static|_next/image|favicon.ico|...` are unanchored prefixes
(`/_next/imageX`, `/favicon.ico/x` skip the cookie check and CSP). Upstream fixed both (`9b61b82`).

### N10 — Tool pages render config without a feature check (LOW)

`src/app/(web)/journey/[slug]/page.tsx` and `compliance/[slug]/page.tsx` pass the full tool config
(group/program/milestone IDs, names) into a client component for any signed-in user; only `notFound()` on an
unknown slug. All data actions are gated, so only configuration metadata leaks. Same class as the 2026-06-23 F11
(`/admin`), which has since been fixed with a layout gate.

### N11 — Duplicate action at a weaker tier; orphan export (LOW)

`contact-logs/actions.ts:getContactLogsByContactId` (general tier, 120/min) duplicates
`contact-lookup-details/actions.ts:getContactLogsByContactId` (search tier, 30/min). Both are reachable POST
endpoints, so F9's tier is bypassable by calling the other. `dashboard/actions.ts:getDashboardMetrics` has no
importer; it is gated and bounded (`sanitizeMinistryYear`), so harmless, but unused `"use server"` exports are
still endpoints.

### N12 — Outbound fetch hygiene (LOW)

- `getMpUserInfo` userinfo fetch: no timeout, follows redirects (would re-send the user's bearer).
- `auth/client-credentials.ts`: no timeout, response not validated (`access_token` absent → `Bearer undefined`
  cached for an hour), `expires_in` unclamped (a huge value → never refreshes).
- `client.ts:ensureValidToken`: no single-flight; a cold cache-warm burst requests N tokens at once.
- `http-client.ts`: has a 30 s timeout (good) but follows redirects and has no path guard (`encodeURIComponent("..")`
  is `..`); all callers pass constants or sanitized IDs today.
- `feedbackService.ts`: no timeout.

### N13 — `originOf` (LOW)

`new URL(raw).origin` is returned for any scheme and any host characters. Verified:
`https://a;sandbox` → `https://a;sandbox` (a new CSP directive), `https://*` → `https://*`, `ftp://h` → `ftp://h`.
Input is operator-controlled env only, so impact needs a bad `.env`.

### N14 — next.config gaps (LOW)

No `poweredByHeader: false`; no `images.unoptimized: true` (all 6 `<Image>` pass `unoptimized`, but
`/_next/image` is excluded from the proxy and so is an unauthenticated optimizer endpoint; sharp is 0.35.5 on
`origin/main`); no `logging.serverFunctions: false` (`next dev` prints server-action arguments — pastoral notes,
search terms — and dev points at production MP).

### N15 — Open CodeQL alerts (LOW)

#10 `compliance-processing/actions.ts:179`, #11 `:208`, #21 `journey-processing/actions.ts:140`, all
`js/log-injection`, open since 2026-08-07. Each is `console.error("…", error)` where `error.message` carries
`enforceScope`'s context string with the caller-supplied ID. Low impact (stdout only), but #10 sits on the N1
action and the alerts have been unaddressed for two months.

### N16 — Cookie strategy and session payload (LOW)

`cookieCache.strategy: "jwt"` is signed but readable; upstream moved to `"jwe"`. `/get-session` returns
`session.token`, `ipAddress`, `userAgent` (upstream strips them). Cookies are HttpOnly, so exposure needs
something that already sees Cookie headers.

### N17 — id_token not verified (LOW, documented posture)

Explicit endpoints, identity from `/connect/userinfo` over TLS, `sub` cross-checked against the (unverified)
id_token. OIDC Core §3.1.3.7 permits this for the code flow with a confidential client. Upstream's issue #101
fix (`6ae05df`) keeps explicit endpoints but verifies the id_token lazily (RS256 against discovery-loaded JWKS,
`iss`/`aud`, plus `exp`/`azp`). This is a posture choice the fork made deliberately (sync log 2026-09-24); the
playbook's "state C" says to ask before changing it.

### N18 — CI hardening (LOW)

All actions in the four workflows are pinned by tag (`actions/checkout@v5`, `docker/build-push-action@v7`,
etc.), not SHA. `docker-build-push.yml` and `audit-nightly.yml` declare no workflow-level `permissions:` (codeql
and sync do). `persist-credentials` is left at its default. Upstream pinned by SHA and set
`permissions: contents: read` (`fc224f3`).

### N19 — URL env validation (LOW)

`assertAuthEnvironment` checks the secret but not `BETTER_AUTH_URL`; `createAuth` falls back to
`http://localhost:3000` and `handleSignOut` does the same for `post_logout_redirect_uri`. A production container
missing the variable would mint non-`__Secure-` cookies and register a wrong redirect URI rather than refuse to
start. `MINISTRY_PLATFORM_BASE_URL` is read with `!` in three places. Upstream added `src/lib/env.ts` (`6616310`).

### N20 — Local state (INFO, operational)

The local checkout (`ec5ea9a`) is 8 commits behind `origin/main` (#247 server-actions key, #248 audit gate).
`node_modules` is stale (next 16.3.4 installed vs 16.3.8 locked). A local `npm audit --package-lock-only`
reported 7 HIGH; `origin/main`'s lockfile resolves all but the allow-listed braces advisory (sharp 0.35.5,
source-map-js 1.2.2). **Tests were not run** for this audit because the installed tree does not match the lockfile.

### N21 / N22 — Informational

`$ignorePermissions?` remains in `types/provider.types.ts:157` and helper JSDoc; nothing sets it (upstream removed
it). `main` has no branch protection or ruleset — the "never commit code to main" rule is convention only. The
tracked `.claude/settings.local.json` is an empty permissions object (upstream untracks the file).

---

## 2. Verified and held (do not re-review from scratch)

Everything CLAUDE.md says about the auth stack was confirmed present in `src/lib/auth.ts` on 2026-10-10:
`assertAuthEnvironment` (secret unset / default / <32 / `BETTER_AUTH_SECRETS` / `TEST` in production, build-phase
exempt), `disableOriginCheck: false`, `disabledPaths` (7 entries incl. `/link-social`), `hooks.before` refusing
`idToken` on `/sign-in/social`, `accountLinking.enabled: false`, `storeAccountCookie: false`,
`stripUserOAuthTokens` on account create/update (idToken kept), `expiresIn` 12 h, `disableSessionRefresh: true`,
`cookieCache { 1 h, jwt, refreshCache: false }`, `userAdditionalFields` all `input: true` with `userGuid` required,
no `discoveryUrl`, explicit authorize/token/userinfo URLs, `pkce: false`, `disableIdTokenNonceBinding: true`,
`disableProviderLogout: true`, `accountSubject` → `sub`, `getUserInfo` sub cross-check + `rememberIdToken`,
synthetic `<sub>@mp.invalid` email with the real address on `mpEmail`, `emailVerified` from the claim, no
`offline_access`, `sharedInstance` on `globalThis` (`Symbol.for("tmc.auth")`), `parseIpAddressOptions` refusing
invalid headers/proxies, `/sign-in/social` 10 per 10 s.

Route: `allowedAuthRoutes` deny-by-default (GET `/get-session`, `/callback/ministryplatform`; POST
`/sign-in/social`), body filter (anchored `application/json`, no comma, Content-Length and streamed 4096 cap,
exact keys `provider`+`callbackURL`, `callbackURL` ≤ 2048, provider must be `ministryplatform`), `releaseLock()`
not `cancel()`. better-auth 1.7.5's `/get-session` itself sets `cache-control: no-store`
(`dist/api/routes/session.mjs:33`), so that upstream item is already satisfied for the one route that matters.

Proxy: cookie-presence redirect with `callbackUrl`, nonce CSP (`script-src 'self' 'nonce' 'strict-dynamic'`,
`object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self' <MP origin>`), enforced unless `CSP_ENFORCE=false`.
Static headers in `next.config.ts`: XFO DENY, nosniff, Referrer-Policy, COOP, CORP, HSTS, Permissions-Policy.

Sign-in: `getSafeCallbackUrl` rejects `\`/control chars, requires same-origin after resolution, refuses output
starting `//`, caps at 1536. `/auth-error` uses `Object.hasOwn`; React escapes the echoed code.
`AuthWrapper` → `/session-error` on a session without `userGuid`; `/admin` layout gate present (F11 fixed).

Filters: all 85 `filter:` lines in `src/` were traced. Every interpolated value is one of: `sanitizeId`/`sanitizeIds`
output (re-assigned at the top of the method where the line itself looks raw — journey 235-237, compliance 270-272,
summer-blast 412-413, admin journey-tools 46), `sanitizeGuid` output, `sanitizeLikeValue` output, a server-generated
date (`nowCentral()`, `toISOString()`), a module constant (dashboard milestone IDs 3/48/51/52, group types), or a
Zod-validated positive integer from an admin-written config file. No raw client string reaches a filter.

Server actions: 72 exported actions reviewed. Every one calls `requireFeatureAccess` or (for `submitFeedback`,
`getCurrentUserProfile`, `getUserAuthorization`, `uploadContactPhoto`) `requireSession`; `handleSignOut` is the
deliberate exception. Writes carry `enforceRateLimit("write")`; uploads add `"upload"`; PII reads in
contact-lookup-details use `"search"`. Journey/compliance detail reads, milestone create/update, certification,
form-response, complete/pause/resume and journey milestone files all go through `assertParticipantInScope` /
`assertGroupParticipantInScope` / `assertMilestoneRecordInScope` / `assertContactInScope` under
`F2_SCOPE_ENFORCEMENT=enforce`. Contact-log update/delete check `Made_By === getMpUserId(session)`; the service
`.omit()`s `Made_By`/`Contact_ID` on update. Admin actions validate feature keys with `Object.hasOwn` +
forbidden-key set and group IDs with Zod; config slugs match `^[a-z0-9]+(?:-[a-z0-9]+)*$` and file paths are
constants. Uploads check MIME allowlist, 20 MB, and magic bytes (`fileMagicMatchesType`). `bulkAddToSummerBlast`
caps at 100 and validates each pair.

Other: `/api/cache-warm` requires a 256-bit per-process token (plain `!==` compare; not constant-time, impractical
over the network). `sw.js` caches only `/_next/static/` and `/assets/`; navigations are network-only, so no PII is
cached. `.dockerignore` excludes `.env*`, `.claude`, `.github`; runner is non-root with npm removed; the Server
Actions key arrives as a BuildKit secret (#247). GitHub: secret scanning + push protection + validity checks +
Dependabot security updates enabled; CodeQL running; one open Dependabot alert (postcss-selector-parser, dev,
moderate). No GitHub advisories affect next 16.3.8, better-auth 1.7.5 or react 19.2.8 (better-auth 1.7.7 and
next 16.4.0 exist). The audit gate's single allow-list entry (braces GHSA-vfj7-8cjw-p6xm) is dev-only and
enforced as such by `scripts/audit-gate.mjs`; `review_by` 2026-11-07.

---

## 3. Upstream MPNext — state and delta

**Upstream state (`aa1bc64`, 2026-09-29).** Since our last sync point (`75d249d`) upstream merged #98 (header
layout), **#99 (the 2026-09-28 security review, ~60 items, 7 waves)**, #100 (actions bumps), #102 (streamed
profile promise crash), #103–#105 (docs), #106 (unused deps), #92 (our CommunicationType fix), and **#107
(issue #101: no boot-time discovery + lazy id_token verification)**. Upstream's record says no Critical/High
was found; the fork had already led on most of the 2026-09-12/25 items (F-UPDATE-USER, F2, F7, F12, F3b).
Upstream notes it is a template: its `MP_SECURITY_ROLES` role gate, `AuthorizationService`, procedure
allowlist and communications sender have **no equivalent code path in this fork** (we use RBAC groups, call no
stored procedures, and send no communications from the app — verified by grep).

Upstream's own triage block was run against our tree. Results, with the fork's disposition:

| Upstream phase / item | Fork status | Note |
|---|---|---|
| P2 secret guard, `disableOriginCheck` pinned | ✓ done | #244 |
| P2 `env.ts` URL validation | ✗ open | N19 |
| P2 `.env*` ignored, no tracked env, pre-commit env hook | ✓ / ✓ / ✗ | no hook here; push protection covers secrets |
| P2 `settings.local.json` untracked | ✗ (tracked, benign) | N22 |
| P3 12 h / no-slide / `refreshCache: false` / no account cookie / tokens stripped | ✓ done | #244 |
| P3 `strategy: "jwe"`; session fields withheld | ✗ open | N16 |
| P4 shared instance; `id_token_hint`; no boot-time discovery | ✓ done | #244 / #238 |
| P4 `endSessionEndpoint` | n/a | sign-out is hand-built (`buildEndSessionUrl`) |
| P5 id_token verified; `exp`/`azp` | ✗ (posture) | N17 — playbook state C, needs a decision |
| P5 no `offline_access`; userinfo never throws | ✓ done | userinfo lacks timeout/redirect refusal → N12 |
| P6 body cap, raw Content-Type, `callbackURL` ≤ 2048, IP config | ✓ done | #244 |
| P6 `no-store` on every auth-route response | partial | better-auth sets it on `/get-session`; our 404s don't |
| P7 fail-closed role gate | n/a | RBAC groups; `ADMIN_USER_GROUP_IDS` empty → nobody is admin (fail-closed) |
| P8 timeouts / `redirect: "error"` / path guard / single-flight / token validation / 401 retry | ✓ timeouts only | N12 |
| P9 identifier guards, procedure allowlist, trusted sender, `$ignorePermissions` removal, codegen escaping | mostly n/a | no procedures/communications called; `$ignorePermissions` type remains (N21); codegen escaping not checked |
| P10 `pick` not `omit`; `Made_By` preserved | partial | we `.omit()` but tests pin the smuggled-key strip; `Made_By` already not re-stamped |
| P10 sanitizers refuse non-strings/control chars; search term cap | ✗ open | low: all callers pass typed strings; search runs in-memory over a cached list, not in a filter |
| P10 self-only `getUserProfile`; unused actions removed | ✓ / partial | N11 |
| P11 `/api` exact + anchored matcher | ✗ open | N9 |
| P11 `poweredByHeader`, `images.unoptimized`, `serverFunctions: false` | ✗ open | N14 |
| P11 COOP/CORP | ✓ done | in `next.config.ts` since 2026-06 (F14) |
| P11 `base-uri 'none'`; `originOf` validation | ✗ open | `'self'` today; N13 |
| P12 `/auth-error` `Object.hasOwn` | ✓ done | #242 (code regex not adopted; React escapes) |
| P12 `/signed-out`, `SessionGuard`, cross-tab broadcast, sign-in loop cap, no-JS global-error | ✗ open | UX/safety hardening; shared-PC sign-back-in risk is real but MP SSO-level |
| P12 every page self-gates | partial | `/admin` yes; tool pages no (N10) |
| P13 Flight-promise `.catch` crash | n/a | our `UserProvider` loads client-side via server actions, not a streamed promise |
| P14 `server-only` guards | ✗ open | would fail the build on a client import of a service |
| P14 Next ≥ 16.3.7 | ✓ done | 16.3.8 |
| P15 SHA pins, `permissions`, lint+tsc job, prerender check | ✗ open | N18; CI already runs lint/tests/build |
| #107 lazy id_token verifier | ✗ (posture) | see N17 |
| Known-open upstream (F8 no PKCE/nonce; sign-out ≤ 1 h replay; MP login disable not propagated; no CSP reporting) | same here | already documented in our CLAUDE.md |

**Items upstream fixed that the fork had first:** F-UPDATE-USER route allowlist (#222-era), synthetic email /
no linking, `sanitizeId` everywhere, `Made_By` ownership, open-redirect dot-segment fix (#239, found during the
1.7 review here), `getSafeCallbackUrl` control-char refusal, LIKE `[` escaping (F15, 2026-06), COOP/CORP (F14).

---

## 4. Priorities

1. **N1** — add the scope assertion to `getRecordFiles` for the three non-milestone tables; negative test. One
   small change in `complianceProcessingService.ts`.
2. **N4, N2, N3** — the same assertion pattern for Summer Blast remove/add, member milestone files, and the
   journey/compliance photo callers.
3. **N5** — move feedback issues to a private repo or stop writing the GUID path and submitter name.
4. **N6** — redact the IPs from the three session summaries (history remains; decide whether that matters).
5. **N8** — schedule the upstream review in `.claude/notes/upstream-sync-log.md` starting at `f1ad0c8`; the
   cheap ports are N9, N13, N14, N18, N19 and the P8 fetch hygiene (N12). N17 needs an owner decision first.
6. **N15** — close or dismiss the three CodeQL alerts (they point at N1's action).
7. **N20** — `git pull` and `npm ci` locally before the next change; re-run the suite.

Previous audits: [2026-06-23](./security-audit-2026-06-23.md), [2026-05-21](./security-audit-2026-05-21.md),
[2026-02-24](./security-audit-2026-02-24.md).
