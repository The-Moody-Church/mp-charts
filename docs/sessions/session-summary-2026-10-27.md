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

## Pending

- Owner / MP admin: remove the five TM.Widgets 1.6 redirect URIs, then retire the `rollback-1.6` pins.
- better-auth 1.7.x patch (1.7.12) across the four apps, with a sign-in soak.
- N23 binding checks: port to the siblings where they have the processing services.
- Open Dependabot majors (vitest 5 / coverage-v8 / jsdom 30, eslint 10, TypeScript 7, dotenv 18,
  chalk 6, jest-dom 7, lucide-react 1.x).
- Audit N2, N3, N4, N6, N7. Upstream sync log for `75d249d..aa1bc64`.

## Files

- **Modified:** `docs/status.md`, `.claude/notes/security-audit-2026-10-10.md`
- **Created:** `docs/sessions/session-summary-2026-10-27.md`
- The #275 code changes are recorded in that PR.
