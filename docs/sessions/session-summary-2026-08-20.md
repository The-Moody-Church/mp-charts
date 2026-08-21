# Session Summary — 2026-08-20

## Objective

Work the backlog from the 2026-08-18/19 security triage: clear the code-scanning
false positives, then fix the findings that survived verification.

## Status

- **Code-scanning triage — COMPLETE.** 28 alerts dismissed, 6 left open.
- **File-read path hardening — COMPLETE** (this PR). Closes the traversal and the
  cross-tool file-metadata IDOR.
- **Admin hardening — NOT STARTED.** Alert #2 plus the unvalidated
  `allowedGroupIds` write. Next PR.

## Correction to the triage report

The triage report mapped the compliance true-positives to alerts **#12/#13**. That
was wrong, and following it would have dismissed two real findings while keeping two
false positives. Verified against the source:

| Alert | Line | Enclosing function | Verdict |
|---|---|---|---|
| **#10** | 179 | `getComplianceMilestoneFiles` | **true positive** |
| **#11** | 203 | `getComplianceRequirementFiles` | **true positive** |
| #12 | 234 | `completeComplianceParticipant` | false positive — `Number(formData.get(...))` + falsy guard |
| #13 | 264 | `pauseComplianceParticipant` | false positive — same |

The report's dismissal count was also off by one: **28**, not 27.

Corrected true-positive set: **#2, #10, #11, #21, #26**, plus **#27** (disputed,
resolved by the `safeEndpoint` change below).

## Code-scanning dismissals (28)

All dismissed as *false positive* with a per-group reason:

| Group | Alerts | Reason |
|---|---|---|
| A — log-injection, static message + coerced IDs | #3–#9, #12–#20, #22–#24 (19) | Sink logs a static string plus an Error with a static/numeric message; IDs come from `Number(formData.get(...))` with falsy guards; MP error bodies excluded by F6 |
| B — log-injection, individual | #25, #28 (2) | #25 Contact_ID coerced, values returned not thrown, slug regex-constrained. #28 `console.warn` only under opt-in `F2_SCOPE_ENFORCEMENT=report`, unset everywhere |
| C — tainted-format-string | #1 | `util.format` not printf; sink dev-only and dead-code-eliminated; interpolates `endpoint`, never `$filter` data |
| D — file-system-race | #29 | Developer-only CLI; path is a compile-time `__dirname` constant; no privilege boundary, which CWE-367 requires |
| E — http-to-file-access | #30–#34 (5) | `sanitizeTypeName` reduces filenames to `^_?[A-Za-z0-9]*$`; other destinations are string literals; dev-only codegen |

Still open: **#2** (next PR), **#10, #11, #21, #26** (fixed here — should close on the
next CodeQL run), **#27** (mitigated here).

## What this PR fixes

An unvalidated `recordId` reached an **unencoded** MP URL path from four server
actions. TypeScript types are erased, so a client can send any JSON value over React
Flight. `buildUrl` concatenates the path without encoding, and `fetch` then runs it
through the WHATWG URL parser, which **normalizes dot-segments** — reproduced
locally:

```
in : .../ministryplatformapi/files/Participant_Milestones/../../tables/Contacts?$select=...
out: .../ministryplatformapi/tables/Contacts?$select=...
```

The request runs under the **client-credentials service account** and rows are mapped
back to the browser, so an aliased `$select` could return arbitrary MP data.

Affected entry points:

| Server action | Service |
|---|---|
| `getJourneyMilestoneFiles` | `journeyProcessingService.getMilestoneFiles` |
| `getComplianceMilestoneFiles` | `complianceProcessingService.getMilestoneFiles` |
| `getComplianceRequirementFiles` | `complianceProcessingService.getRecordFiles` |
| `fetchMilestoneFiles` | `memberService.getMilestoneFiles` |

These were the **only** ID-taking read paths in these services without `sanitizeId`
and a scope assert — every other one has both, with an explicit `SECURITY:` comment.

### Fixes, defence in depth

1. **`file.service.ts` — encode both path segments.** The choke point: this alone
   kills the traversal for every current and future caller, matching what
   `table.service.ts` and `procedure.service.ts` already do.
2. **`sanitizeId()` in all four service methods.** Rejects anything non-numeric
   before it reaches the path.
3. **Scope asserts** on the journey and compliance milestone paths
   (`assertMilestoneRecordInScope`), closing the cross-tool IDOR — file metadata
   carries the MP download URL, not just a filename.
4. **`Object.hasOwn` allowlist guard** at `compliance-processing/actions.ts:200`.
   `requirementTableMap[type]` with `type: "constructor"` returned a truthy inherited
   value that slipped past `if (!table)`. Also dropped the `${type}` interpolation
   from the thrown message.
5. **`safeEndpoint()` in `http-client.ts`** — strips control characters from
   `endpoint` in all six thrown messages and the dev log line. This resolves the
   `#27` verifier split: the sink at line 39 is dev-only and eliminated from the
   bundle, but the *same* value reached the ungated throw one line later, which is
   logged in production. `buildUrl` is deliberately untouched — changing it there
   would alter the URL actually requested.

### Known gap, deliberate

`getRecordFiles` still has **no scope assert for the non-milestone requirement
types** (`Background_Checks`, `Participant_Certifications`, `Form_Responses`). Each
needs its own FK resolver (Contact_ID vs Participant_ID), which is more than this PR
should carry. The traversal is fully closed for those paths; what remains is
cross-tool metadata enumeration. Tracked as a follow-up.

### Not done: confirming MP's behaviour

Whether MP actually **serves** the traversed path was not tested. Only URL
normalization was proven. Doing so would mean firing a traversal payload at the
production church database, which is not something to do casually even read-only. The
fix is warranted either way; the open question is severity — arbitrary MP read (high)
versus cross-tool IDOR (medium).

## Verification

- `npm run test:run` — 43 files, **602 tests** (up from 597; 5 added)
- **Mutation-tested**, all three caught:
  - encoding removed -> both `file.service` traversal tests fail
  - `safeEndpoint` neutered -> the newline test fails
  - restored -> 51/51 green
- `npm run lint` — 0 problems
- `npm run build` — clean
- security-lint grep — clean

## Follow-ups

1. **Admin hardening** (#2): `FORBIDDEN_KEYS` + `Object.hasOwn`, Zod on
   `allowedGroupIds`, `enforceRateLimit(..., "write")`.
2. **Scope asserts for the three non-milestone requirement types.**
3. **Sweep every server action for uncoerced ID arguments** — the four here were
   found by following code-scanning alerts, not by looking exhaustively.
4. Confirm MP's traversal behaviour to settle severity.
