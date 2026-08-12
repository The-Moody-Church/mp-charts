# Session Summary — 2026-08-11

## Objectives

Continue the React Compiler lint remediation from `.claude/notes/react-compiler-lint-plan.md`.
Target: the plan's **PR 2** — both admin tool editors (Shape 2).

Starting state: 15 × `set-state-in-effect` remaining, all `warn`. Branch
`fix/react-compiler-tool-editors` stacked on `fix/react-compiler-lint-rules` (PR #200), which is
green and mergeable but **deliberately unmerged** — the whole series gets tested together at the end,
so branches keep stacking.

## Outcome — PR 2 complete

`set-state-in-effect`: **15 → 14**. Lint 0 errors, 558 tests (up from 553), build clean.

| Commit | What |
|---|---|
| `294e044` (prev session) | journey tool editor — mount reconcile into the reference-data effect, change into `handleJourneySelect` |
| new | compliance tool editor — all three branches into `handleJourneySelect`, mount case into the `useState` initializer |
| new | delete the dead no-op requirements effect (`compliance-tool-editor.tsx:191-198`) |

### Why the compliance editor is not a copy of the journey one

Its `<select>` is **not** `disabled={isEditing}`, and the three branches carry different semantics:

- `null` → clear the list
- **back to the saved journey → restore `existingTool.journeyMilestones` verbatim, no MP call.**
  This is the staff undo. The journey editor merges MP's list against the saved config on every
  load; doing that here would silently rewrite an admin's labels from MP.
- anything else → fresh MP defaults, no merge against the previous journey

Verified `setJourneyId` has exactly one call site (the `<select>`'s `onChange`) before relying on the
handler to be the only mutation path.

Only the pure default-mapping is shared: the fresh-defaults branch calls
`mergeSavedMilestones(mp, [])` from `journey-tools-config-types`, the same call the journey editor
makes for the same job, so the `Sort_Order ?? idx + 1` fallback has one tested implementation.

### The initializer ternary

`useState(existingTool?.journeyId ? existingTool.journeyMilestones : [])` — **not** `?? []`. The
effect being deleted cleared orphaned milestones on mount, and the ternary reproduces that. Getting
this wrong would have been a silent behavior change on the save payload with nothing to catch it.

## Characterization tests — and one that had no teeth

`compliance-tool-editor.test.tsx`, 5 tests, written against the unrefactored code and passing before
anything was touched. **Mutation-tested rather than assumed:**

| Injected bug | Fails |
|---|---|
| remove the "switch back to saved journey" restore branch | 3 tests |
| drop the mount-time wipe of orphaned milestones | 1 test |
| positional carry-over of the saved milestone's visibility/order | 1 test |

A fourth mutation — **adopting the journey editor's ID-keyed merge**, the single thing the plan warns
hardest against — **passed all 5 tests**. The first draft asserted "no merge" through the rendered
rows, and two different journeys never share a `Milestone_ID`, so an ID-keyed merge is unobservable
that way. The assertion moved to the **save payload**, where the whole transformation (id, MP label,
sortOrder, `visible: true`) is checked at once; that version catches the positional-carry-over
mutation the rendered-row version also missed.

Worth carrying forward: a characterization test that passes under the mutation it was written to
catch is worse than no test, because it reads as coverage.

## Three pre-existing bugs filed, not fixed

The plan asked for these in PR 1 and they were never filed. All three verified against the code
before writing them up, then added to `docs/ideas.md`:

- **`member-detail-modal.tsx:84`** — photo upload calls `onUpdate()` but never re-fetches `detail`,
  so the modal keeps rendering the stale `fileUniqueId` and the old photo until it's reopened.
- **`compliance-tool-editor.tsx`** — orphaned milestones wiped on open (now the initializer ternary),
  and `pauseMilestoneId` never cleared when the journey changes, so a stale ID reaches the save
  payload through a hidden `<select>`.
- **`journey-tool-editor.tsx:309`** — `Number(e.target.value)` with no empty guard, so the blank
  placeholder sets `selectedJourneyId` to `0` rather than `null`. Harmless today (every check is
  falsy-based); the compliance editor's equivalent select already guards it.

## Files Changed (PR 2)

- **Modified**: `src/components/admin/compliance-tools/compliance-tool-editor.tsx`
- **Created**: `src/components/admin/compliance-tools/compliance-tool-editor.test.tsx` (5 tests)

## PR 3 — summer-blast (4 sites, 3 shapes)

`set-state-in-effect`: **14 → 10**. Lint 0 errors, 563 tests, build clean.

Three decisions were taken before writing any code, and two of them changed the plan.

**Ruling 1 — a modal remount clears unsaved form state.** Verified what is actually at stake before
asking: in summer-blast, **nothing** — both modals' `[open]` effects already reset every field they
hold, so the remount is byte-identical to today. In the journey/compliance modals (PR 4) exactly
three fields survive a close/reopen: `milestoneNotes`, `milestoneDate`, `selectedMilestoneKey`.
Clearing them closes the path where notes typed for Alice get submitted against Bob, and makes
`milestoneDate` re-evaluate to today instead of once per mount.

*Correction to the plan:* it also lists the **file input** among the survivors. It isn't one —
`DialogContent` has no `forceMount`, so Radix unmounts the dialog subtree on close and the input's
DOM node is already destroyed. One less user-visible change than the plan priced.

**Ruling 2 — summer-blast is Shape 1b, not Shape 1.** The plan assigned it to Shape 1 (read moves to
the RSC). Its page fallback is a bare `Loading Summer Blast volunteers...` text div, while the
component renders the full header, search, tabs and a skeleton grid — the exact criterion the plan
used to keep the two processing screens on 1b. Staying client-side also preserves the Back-navigation
refresh on the one screen whose cache was deliberately removed, which took **Finding C off this PR's
critical path**. Shape 1 count drops 6 → 5.

**Ruling 3 — Finding C deferred** to the end-to-end pass. PRs 5–7 proceed on the prediction that Back
still refetches. The experiment surface already exists from PR 1 (`/admin/compliance-tools` + editing
`data/compliance-tools.json` on disk).

### The per-open counter

`key={responseId}` / `key={groupParticipantId}` would have been wrong. Confirmed by reading the
parent: neither `selectedIntake` nor `selectedVolunteer` is ever cleared on close, so a record-id key
does not change on a same-record reopen — the reset silently stops happening for exactly that case,
leaving a stale `Group_Role_ID` bound for MP or a "Confirm Remove" pre-armed for a different
volunteer. Used **one counter per modal**, not one shared: a shared bump would remount the other
modal mid-exit-animation.

### Tests

`summer-blast-volunteers.test.tsx`, 5 tests, written against the unrefactored code and
mutation-tested. The sharpest result: keying the resets on `[card]` — the behavioral proxy for
`key={recordId}` — fails **exactly** the two same-record reopen tests and leaves the different-record
test green, which is precisely the trap they exist for. Neutering the prune fails both bulk tests.

One test-harness note: Radix `TabsTrigger` switches on mousedown/focus, not on a synthetic click, so
`fireEvent.mouseDown(tab, { button: 0 })` is required to reach the Volunteers tab.

## Files Changed (PR 3)

- **Modified**: `src/components/summer-blast-volunteers/summer-blast-volunteers.tsx` — `fetchAll`
  split into `loadAll` / `applyData` / `refresh`; prune folded into `applyData`; per-modal session
  counters and `key`
- **Modified**: `src/components/summer-blast-volunteers/intake-detail-modal.tsx`,
  `volunteer-detail-modal.tsx` — `[open]` reset effects deleted, unused `React` default import
  dropped
- **Created**: `src/components/summer-blast-volunteers/summer-blast-volunteers.test.tsx` (5 tests)
- **Modified**: `.claude/notes/react-compiler-lint-plan.md` (rulings + two corrections),
  `docs/ideas.md`, `docs/status.md`; **Created**: this file

## PR 4 — both processing families (6 sites, 3 shapes)

`set-state-in-effect`: **10 → 4**. Lint 0 errors, 574 tests, build clean. Two commits — journey pair,
then compliance pair — so a revert is per-family.

Same three shapes as summer-blast, applied to a pair of screens `ui-standards.md` requires to stay
structurally identical. Notable decisions:

- **`LoadedParticipants` leaves the inapplicable lists `undefined`, not `[]`.** The plan expected
  "always writes all three" and flagged tab-count-badge flicker as something to verify. Sidestepped
  instead: applying a result never writes a list the current mode doesn't read.
- **The deep-link latch became a `useRef` and moved into the load continuation.** It still latches
  when nothing matched — the old fall-through — but a *failed* load never reaches the continuation, so
  unlike before, a transient MP error no longer burns the deep link.
- **Every open routes through `openParticipant()`,** including the deep link, so "an open is always a
  fresh mount" holds unconditionally rather than by argument about which paths can reach
  `setSelectedParticipant`.
- **Rejected the plan's derived-`loading` machine for compliance** (`settledRequestId !== requestId`),
  as §4 of the plan itself concluded once Finding B established that dynamic segments remount.
- **Extracted compliance's modal render into one const.** It was duplicated across the tabs and
  no-tabs branches, so `key=` would have had to be added twice and could silently diverge.

This is where Ruling 1 first has teeth: `milestoneNotes`, `milestoneDate` and `selectedMilestoneKey`
now clear on reopen.

### The mock that silently defanged a test

`journey-processing.test.tsx` (6) and `compliance-processing.test.tsx` (5) were written against the
unrefactored code. Mutation results: keying the modal effect on `[participant]` alone — the proxy for
`key={recordId}` — fails the same-participant-reopen tests; removing `setActiveTab` from the paused
branch fails the paused-tab test.

**Dropping the latch initially passed all 11.** The cause was in the test, not the code:
`mockResolvedValue([...])` evaluates its argument once and resolves the *same array instance* on every
call, so `setCurrentParticipants` got a reference-equal value, React bailed out of the re-render, and
a list refresh was unobservable. Switched to `mockImplementation(async () => [...])` and the mutation
fails as it should.

That is the second time this session a characterization test passed under the exact mutation it was
written to catch. Both times the test looked reasonable and the assertion was real — the reachability
was the problem. **Mutation-testing every characterization test is not optional here.**

Also worth keeping: an open Radix dialog `aria-hidden`s the rest of the page, so asserting on
background elements needs `{ hidden: true }` in the role query.

## PR 5 — manage-members (2 sites)

`set-state-in-effect`: **4 → 2**. Lint 0 errors, 580 tests, build clean.

**The shell's deep-link site is not a Shape 1 site.** The plan put it under "mount fetch → Server
Component props", then in its own risk table priced the hazard that creates: a `useState` initializer
doesn't re-run on soft navigation, so a `<Link>` to `?member=N` would stop opening the modal. It
justified proceeding by verifying that today's only producer is a clipboard Copy Link — a full
navigation. Safe now, fragile later.

None of it was needed. The violation is one line: the synchronous `setHasAutoOpened(true)`. Everything
else in that effect already ran in the promise continuation, which the rule permits. A `useRef` latch
retires the warning with no server-side move, no initializer, no soft-navigation exposure. Not
Finding A's cop-out either — the setState is *gone*, not relocated into a nested function, and the
latch is read in exactly one place (its own guard), so nothing renders from it.

**It also fixed the latch.** As state the guard never worked where it could matter: under StrictMode's
double-invoke — Next leaves `reactStrictMode` on in dev — the second run read the stale `false` from
its own closure and fetched twice. A ref mutates immediately. In production the guard was unreachable
either way, since the effect's only dep is `initialMemberId`, which can't change without a navigation
that remounts. That's also why no characterization test could catch its removal: mutation L (drop the
latch) passed all five, correctly.

**The detail modal was the odd one in the set** — its resets lived on the effect's *close* branch, not
the open one. Both branches had synchronous setState. Converged on the per-open key idiom per the plan
rather than the analyst's close-handler + `loadedFor` sentinel, keeping their one good point: `loading`
is not derived from `detail === null`, because `fetchMemberDetail` legitimately resolves `null`. Also
added the `.catch` the chain never had — a failed detail fetch was an unhandled rejection.

### Tests

`manage-members-shell.test.tsx`, 6 tests. Five are characterization tests; mutation-tested — keying the
modal effect on `[member]` alone (the `key={contactId}` proxy) fails both same-member reopen tests, and
dropping the close-branch resets fails the milestone-collapse test.

The sixth is **labelled in-file as not a characterization test**: it asserts the StrictMode
single-fetch the ref latch adds, and it was verified to fail against the old state latch (2 calls vs
1). Kept because it's the only executable evidence the latch does anything.

One dead end worth noting: a first attempt tried to observe the modal's reset through "the previous
member's detail must not show while the next loads". Not observable — `loading` gates the entire modal
body, so nothing member-specific renders during the fetch. The milestone-expansion state was the
observable reset.

## PR 6 — contact-lookup-details (1 site) — 2026-08-12

`set-state-in-effect`: **2 → 1**. Lint 0 errors, 595 tests, build clean.

**Shape 1b, not Shape 1 — the third time a shape assignment didn't hold.** The plan wanted five MP
reads moved into the page's async RSC behind a new `page-data.ts`, with the Suspense fallback reworked.
That is MED-HIGH, carries a security-review obligation (a `'use server'` module called from an RSC, with
`requireFeatureAccess` and `enforceRateLimit` still on every read), and depends on the unresolved
Finding C — on the one screen where badge freshness is explicitly load-bearing. `loading` was already a
`useState(true)` initialiser, so the standard 1b split retires the warning outright.

**The plan's real prize was testability, and it's kept.** The household filter+sort moved to
`src/lib/household-sort.ts` with 9 co-located tests. It had been buried in a `setFamilyMembers()`
callback where no test could reach it, and that extraction is independent of where the fetch runs. Also
documented there why the lexicographic `Date_of_Birth` compare is correct: MP date strings sort
chronologically, so it sidesteps the `Date` parsing that CLAUDE.md's timezone rule warns about.

The deferred server-side read is **filed in `docs/ideas.md`** with its prerequisites rather than dropped.

Preserved deliberately: the four synchronous resets live in the event-handler reload only (no-ops on
mount, but on a reload they collapse the Groups section and drop its cached list — now tested), and
`related` is left *undefined* rather than zeroed when a contact has no `Contact_ID`, matching the
skipped branch. Two accepted differences, both hidden under the spinner: the breadcrumb name lands one
round trip later, and a second-stage failure no longer leaves a name in the breadcrumb above an error
page.

### Tests, and the discipline slip

I refactored before writing the component tests here. Corrected by reverting the file, authoring the 6
tests against the original, verifying, mutation-testing, then reapplying — rather than shipping tests
that only ever saw the new code.

Mutations: dropping the groups resets from the reload fails the collapse test; using `First_Name`
instead of the nickname fails the breadcrumb test. **Breaking the household filter initially passed** —
the fixture's own household entry rendered as "Jonathan Tester" while the assertion only matched the
other two members. Added an explicit "the legal first name must not appear" assertion (the card header
shows the nickname, so it can only appear if the wrong `excludeContactId` was passed) and confirmed it
fails. Third time this session; the pattern is always the same — real assertion, unreachable by the bug.

## Remaining — 1 site

Next per the plan: **PR 7** — `contexts/user-context.tsx`, the highest-blast-radius change in the
series, which is why the plan sequenced it last. Its constraints:

- `getUserBootstrap` goes in `src/components/shared-actions/user.ts` and must derive the GUID from
  `requireSession()` only (the F4 security invariant); `AuthWrapper`'s two redirects must still run
  before `WebLayoutContent` is invoked. Both need a line in the PR's security review.
- `shared-actions/user.test.ts` is **mandatory**, not optional — it is a server action, and it replaces
  the assertions the rewritten `user-context.test.tsx` loses. Net assertion count must not drop.
- Keep `UserContextValue.error: Error | null` and reconstruct from `errorMessage` client-side; do not
  change the context's public shape mid-refactor.
- Measure layout TTFB cold vs. warm `UserService` cache. The risk the plan named is real: the layout's
  single Suspense boundary would make every page wait on MP, converting a degraded-avatar failure mode
  into a whole-app-slow one. Escape hatch on the shelf — create the promise without awaiting in the
  layout and read it in the provider with React 19's `use()` behind its own boundary.
- Do **not** wire `refreshUserProfile()` into the admin Permissions screen here; file it instead.

Then **PR 8**: flip `react-hooks/set-state-in-effect` to `error`.

**Finding C's live exposure is now just the PR 1 admin pair** — the only server-side move that shipped,
admin-only, which is why the plan picked it as the test surface. Given Corrections B, D and E, no other
shipped site depends on it. Still worth the two-minute check in the end-to-end pass:
`/admin/compliance-tools` → edit `data/compliance-tools.json` on disk → `/admin` → Back.

## Files Changed (PR 6)

- **Modified**: `src/components/contact-lookup-details/contact-lookup-details.tsx` —
  `fetchContactDetails` split into `loadContactDetails` / `applyContactDetails` /
  `refreshContactDetails`; household sort extracted out
- **Created**: `src/lib/household-sort.ts` + `src/lib/household-sort.test.ts` (9 tests)
- **Created**: `src/components/contact-lookup-details/contact-lookup-details.test.tsx` (6 tests)
- **Modified**: `.claude/notes/react-compiler-lint-plan.md` (Correction E), `docs/ideas.md` (deferred
  server-render entry), `docs/status.md`

## Files Changed (PR 5)

- **Modified**: `src/components/manage-members/manage-members-shell.tsx` — latch → `useRef`; per-open
  `detailSession` counter and `openMember()`; `handleCardClick` removed
- **Modified**: `src/components/manage-members/member-detail-modal.tsx` — close-branch resets deleted,
  `loading` initialiser → `true`, cancel guard and `.catch` added
- **Created**: `src/components/manage-members/manage-members-shell.test.tsx` (6 tests)

## Files Changed (PR 4)

- **Modified**: `src/components/journey-processing/journey-processing.tsx`,
  `journey-detail-modal.tsx`; `src/app/(web)/journey/[slug]/page.tsx`
- **Modified**: `src/components/compliance-processing/compliance-processing.tsx`,
  `compliance-detail-modal.tsx`; `src/app/(web)/compliance/[slug]/page.tsx`
- **Created**: `src/components/journey-processing/journey-processing.test.tsx` (6 tests),
  `src/components/compliance-processing/compliance-processing.test.tsx` (5 tests)
