# Session Summary — 2026-10-10

## Objective

Read-only security audit of the fork's current position and of upstream MPNext. No code changes, no tests run,
no Ministry Platform writes. Record findings for a later session to act on.

## Status: COMPLETED (audit) — follow-ups OPEN

Report: [`.claude/notes/security-audit-2026-10-10.md`](../../.claude/notes/security-audit-2026-10-10.md)
(22 findings; verified-and-held list; upstream delta table).

## What was done

- Fetched `upstream` (`aa1bc64`, 2026-09-29) and `origin` (`14d34e6`); the local checkout was 8 commits behind
  and was fast-forwarded only at the end of the session, to save these notes.
- Read every non-UI source file; traced all 85 `filter:` interpolations; tabled all 72 exported server actions
  against their gates and scope assertions; ran upstream's own triage greps against our tree.
- Read-only GitHub checks: repo is PUBLIC, no branch protection, secret scanning + push protection + Dependabot
  on, CodeQL on with 3 open `js/log-injection` alerts, 22 public `user-feedback` issues.

## Findings to act on (priority order)

1. **N1 HIGH** — `complianceProcessingService.getRecordFiles` (575-595) has no scope assertion; a compliance-tool
   user can list files for any Background_Checks / Participant_Certifications / Form_Responses record, and each
   `fileUrl` is MP's unauthenticated `/files/{UniqueFileId}` download. `getMilestoneFiles` (597-604) shows the fix.
2. **N4 MEDIUM** — `summerBlastService.removeFromSummerBlast` end-dates any Group_Participants row;
   `addToSummerBlast` closes any Response and never checks `Opportunity_ID`.
3. **N2 MEDIUM** — `memberService.getMilestoneFiles` has no scope check.
4. **N3 MEDIUM** — shared `uploadContactPhoto` accepts any `Contact_ID` with `isDefaultImage: true`.
5. **N5 MEDIUM** — feedback issues in the public repo carry staff names and `/contact-lookup/<GUID>` URLs
   (issue #148 verified). Private `GITHUB_FEEDBACK_REPO`, or strip the GUID and submitter.
6. **N6 MEDIUM (policy)** — internal IPs in `docs/sessions/session-summary-2026-04-04.md`, `2026-09-01.md`,
   `archive/2026-02-06.md`; the review checklist forbids this in a public repo.
7. **N8** — upstream review wave #99 + #107 unreviewed; next sync starts at `f1ad0c8`. Cheap ports: `/api`
   exact match + anchored matcher (N9), `originOf` validation (N13), `poweredByHeader` / `images.unoptimized` /
   `serverFunctions: false` (N14), CI SHA pins + `permissions` (N18), URL env validation (N19), MP fetch hygiene
   (N12). **N17 (id_token verification) needs an owner decision before any port.**
8. **N15** — close the three CodeQL alerts (#10 sits on the N1 action).

## Notes for the next session

- `node_modules` was stale (next 16.3.4 vs 16.3.8 locked) — run `npm ci` before anything else.
- Everything in CLAUDE.md's auth description was re-verified present on 2026-10-10; see §2 of the report
  before re-reviewing the auth core.
- All N1–N4 fixes are MP-write-path changes: they are code, so branch + PR, and test with a `report`-mode
  dry run (`F2_SCOPE_ENFORCEMENT=report`) before `enforce` if the scope definition is in doubt.

## Files

- **Created:** `.claude/notes/security-audit-2026-10-10.md`, `docs/sessions/session-summary-2026-10-10.md`
- **Modified:** `docs/status.md`
