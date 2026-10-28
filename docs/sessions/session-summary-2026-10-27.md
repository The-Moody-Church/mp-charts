# Session Summary — 2026-10-24 to 2026-10-27

## Objectives

1. Clear the red deploy gate that appeared after the feedback-removal merges (2026-10-24).
2. Deploy the removal and the audit fix to all four apps.
3. Close out N5: the tokens, their backups, and the 22 public `user-feedback` issues.

## 2026-10-24 — undici + zod advisories — COMPLETED (#275)

After #274 merged, main builds failed the npm audit gate in mp-charts, mp-senior-care and event-manager:

- undici GHSA-xjj6-f33q-929c (HIGH), plus GHSA-4qv8-2p9j-2685 and GHSA-f72v-6w45-q472
- zod GHSA-mrhx-c7xc-m3w5 (HIGH, < 4.6.6)

`npm update undici zod` took undici to 7.30.1 / 8.12.3 and zod to 4.6.7, both within range.

GitHub had **withdrawn** braces GHSA-vfj7-8cjw-p6xm, and the gate was warning that the entry no longer
appeared in npm audit. The entry was removed, so `scripts/audit-allowlist.json` is now `[]`. The shared
`audit-gate-lib.test.ts` checks the file is valid and the braces id is gone. `.claude/rules/security.md`
now says "Current entries: none".

The same change went into mp-senior-care #225 and event-manager #70. All three main builds passed.

## 2026-10-24 — deploy — COMPLETED

All four apps run their main build: mp-charts `f7a37e8`, mp-senior-care `072962f`, event-manager
`29ac3cc`, music-tools `c964d56`.

- Cache warming finished on the first attempt for the three apps that have it.
- All four return `/` 307 and `/signin` 200.

## 2026-10-27 — N5 close-out — COMPLETED

- **Tokens:** the owner revoked both fine-grained feedback tokens. Each app had a `.env` backup from
  2026-10-23 that held a token. Before deletion, each backup was checked against the live `.env`: apart
  from the feedback lines (one of them a commented-out line), they matched. All four backups were deleted.
- **Issues:** 5 of the 22 `user-feedback` issues (#116, #129, #148, #160, #162) had a
  `/contact-lookup/<GUID>` page link. A read-only MP lookup showed all three contacts are in the owner's
  own household.
  - Each link was cut to `https://mptools.moodychurch.org/contact-lookup (contact link removed)`.
  - The owner deleted the original revisions from each issue's edit history. A GraphQL
    `userContentEdits` check found no revision still holding an ID.
  - The GUIDs never appeared in the repo or its git history.
  - **Decision:** all 22 issues stay in this repo. The submitter names, all staff, stay too.
  - Editing the issues ran `sync-issues-to-ideas`, which succeeded and changed nothing.
- The 2026-10-10 audit report now marks N5 closed.

## 2026-10-27 — TM.Widgets 1.6 redirect URIs removed — COMPLETED

The owner removed the five `…/api/auth/oauth2/callback/ministryplatform` redirect URIs (mptools, care,
events, musictools, localhost:3000). A probe of MP's authorize endpoint now returns `200` (refused) for all
five old URIs, and `302` (registered) for the five `/api/auth/callback/ministryplatform` ones. Before the
change all ten returned `302`, and an unregistered control URI returned `200`. README.md and
`docs/OAUTH_LOGOUT_SETUP.md` no longer say to keep the old entries.

The owner then deleted the four obsolete `docker-compose.rollback-1.6.yml` pins, since no 1.6 build can
sign in now. Each `docker-compose.rollback.yml` still holds the build from before the last soak.

## 2026-10-27 — better-auth 1.7.14 + vitest 4.1.12 — COMPLETED (#276)

- **better-auth** 1.7.5 → 1.7.14, together with `@better-auth/core`, the adapters, `better-call` 1.4.4 and
  `@better-auth/utils` 0.5.1. The range stays bounded: `npm install` wrote `^1.7.14`, which was put back
  to `>=1.7.14 <1.8.0`.
- **Release notes 1.7.6–1.7.14:** nothing we use. The changes cover magic link, the JWT plugin, OAuth proxy,
  ID-token sign-in (we refuse it three ways) and password routes (closed by the allowlist). The generic
  OAuth discovery retry only runs for a provider whose discovery failed, and we set no `discoveryUrl`.
- **Dist diff, 1.7.5 vs 1.7.14,** of every auth-relevant file:
  - `routes/callback` moved into a shared `exchangeOAuthCallback` with the same checks.
  - `generic-oauth` was restructured. `getUserInfo` now strips `expectedIdTokenNonce` before calling ours.
  - The rate limiter adds a JSON `Content-Type` to the 429.
  - The cookie and session changes are build-output churn.
- **Re-verified on 1.7.14:**
  - 30 mounted endpoints, the same list (runtime count).
  - `oauth2/errors.mjs` is byte-identical.
  - The `oauth_state` value is still exactly 556 + 2 × length (1536 → 3628 bytes, 2048 → 4652).
  - Every "1.7.5" claim in the code comments, CLAUDE.md and security.md was updated to 1.7.14 or annotated.
- **vitest** 4.1.11 → 4.1.12 (with `@vitest/coverage-v8`) clears GHSA-qxg6-89mg-rqv8 and
  GHSA-xp26-3454-mjgp. Both are medium and dev-only.
- **Checks:** `npm audit signatures`: all five updated packages have verified provenance, none missing or
  invalid. tsc, lint, 1157 tests, the audit gate and `npm run build` pass.
- **Soak:** `:dev` (`985208c`) ran in production, with the rollback pin on `f7a37e8`.
  - Cache warming finished on the first attempt. `/` returned 307, `/signin` 200, and
    `/api/auth/update-user` 404.
  - `/sign-in/social` built the MP authorize URL with TM.Widgets, the 1.7 callback and no
    `code_challenge`.
  - The owner signed in, browsed and signed out without problems. The log had no `[auth]` errors and no
    `id_token_hint omitted` line.
- **Deployed:** merged as `3dc78dd`; production runs it. Cache warming finished on the first attempt, `/` returns
  307 and `/signin` 200. The rollback pin still holds `f7a37e8`.
- **Siblings:** mp-senior-care #227 (with vitest 4.1.12), event-manager #72 and music-tools #180. The
  same checks were re-run in each, including the `oauth_state` measurement (556 + 2 × length in all three).
  All three soaked on `:dev` together; the owner signed in and out on each. Merged and deployed:
  mp-senior-care `3d97b4f`, event-manager `981c700`, music-tools `0ec62da`. Cache warming finished on the
  first attempt (the two apps that have it), `/` returns 307 and `/signin` 200, and neon-backup kept running.
  One `ETIMEDOUT` on a music-tools `choir_members` query to Neon at 17:18 during the soak. Prisma and the
  driver were untouched by the PR, and it fits Neon waking a suspended compute.

## 2026-10-27 — N6 internal IPs in public docs — COMPLETED

`git grep` over tracked files found server IPs only in `docs/sessions/session-summary-2026-04-04.md` (with
the dev server's SSH user name) and `-2026-09-01.md`. Both were reworded to name the servers without
addresses. The `10.x` values in `auth.rate-limit.test.ts` are RFC 1918 test fixtures, not ours.
`.claude/commands/deploy*.md` contain the IP, but they are gitignored and so were never public. The same
scan of the other public repos found one line in mp-n8n (`c2bd2d5`, fixed) and none in mp-mcp. The
three sibling app repos are private. Git history keeps the old text; it was not rewritten.

## 2026-10-27 — N2, N3, N4, N7 per-record scope — COMPLETED (#277)

- **N2:** `fetchMilestoneFiles` lists a milestone's files only when it is a membership-journey milestone
  (`MemberService.getMembershipMilestoneParticipant`) owned by a member. Before, any manage-members user
  could list any Participant_Milestones row, including journey and compliance rows.
- **N7:** `transitionMember` requires the participant to be a member and the contact to be that member's
  own. It runs before the milestone write and the status update.
- **N3:**
  - The shared `uploadContactPhoto` now `sanitizeId`s `Contact_ID`.
  - Journey (new `assertContactInScope`) and compliance check the contact against the tool's participants
    before uploading.
  - manage-members wraps the contact service with the member check.
  - Contact lookup stays church-wide by design.
- **N4:**
  - `addToSummerBlast` requires the response to exist and belong to the intake opportunity, and the
    contact to own the response's participant.
  - It now enrolls that participant, where it used to look up the contact's first participant.
  - The group role must be the temp role or a `roleConfigs` role. The audit missed this one: the role
    came straight from the form.
  - `removeFromSummerBlast` requires the row to be in the tracking group.
- **False-deny check:** every check mirrors what the UI sends. Member cards come from the member set;
  intake cards are built from those responses; the role picker lists `roleConfigs`; journey and compliance
  cards are the tool's participants.
- **Tests:** 1191 (+34): `manage-members/actions.test.ts`, `memberService.test.ts` and
  `shared-actions/processing.test.ts` are new, and the Summer Blast, journey and compliance service tests
  gained cases. Mutation check: 13 of 13 mutants caught.
- **MP:** the membership query was checked read-only. Its `Participant_Milestone_ID` returns the owner
  with journey 7 and nothing with journey 8.
- **Independent review:** no bypasses and no false denials. Its points were taken:
  - `addToSummerBlast` refuses a response that is already closed, which stops a replayed `Response_ID`
    re-enrolling someone and stops double-submit duplicates.
  - `removeFromSummerBlast` refuses a row that has already ended, using the same active-row filter as the
    volunteer cards.
  - Each refusal test now asserts which check fired.
  - `shared-actions/processing.ts` is no longer a `"use server"` module. Its helpers, including
    `uploadContactPhoto`, which checks only the session, had each been a callable endpoint. Only server
    modules import it.
  - Follow-up, not done here: journey and compliance `assertGroupParticipantBelongsTo` also ignore
    `End_Date`.
- **Final tests:** 1192 pass, and all 15 mutants are caught.
- **Not needed in the siblings:** N23's processing services exist only in mp-charts.
- **Soak (2026-10-28):** `:dev` (ee5fa67) on mptools. The owner tested member detail and milestone
  files, Summer Blast intake/volunteer tabs, and a photo upload. The log showed no errors and no
  `[scope:deny]` lines. Merged and deployed to `:latest`.
- **Sibling side work:** music-tools #185 (prisma 7.10.1 + undici/zod/fast-uri) clears all 7 npm audit
  findings, including zod HIGH in production.

## Pending

- Open Dependabot majors (vitest 5 / coverage-v8 / jsdom 30, eslint 10, TypeScript 7, dotenv 18,
  chalk 6, jest-dom 7, lucide-react 1.x).
- Audit LOW items N9–N19. Upstream sync log for `75d249d..aa1bc64`.

## Files

- **Modified:** `docs/status.md`, `.claude/notes/security-audit-2026-10-10.md`, `README.md`,
  `docs/OAUTH_LOGOUT_SETUP.md`
- **Modified (branch `chore/better-auth-1.7.14`):** `package.json`, `package-lock.json`, `CLAUDE.md`,
  `.claude/rules/security.md`, `src/lib/auth.ts`, `src/lib/auth.test.ts`, `src/lib/auth-callback-url.ts`,
  `src/app/auth-error/page.tsx`, `src/app/api/auth/[...all]/route.ts`, `src/app/api/auth/[...all]/route.test.ts`,
  `docs/status.md`, this summary
- **Created:** `docs/sessions/session-summary-2026-10-27.md`
- The #275 code changes are recorded in that PR.
