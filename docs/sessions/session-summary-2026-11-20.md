# Session summary — 2026-11-20

## Batch 4 close-out — COMPLETED

Recorded in `session-summary-2026-11-19.md`: #325 and the sibling ports merged after the overnight `:dev` soak and
deployed; music-tools needed #213 (`effect` override) first.

## Batch 5: feature page gates (N10) — COMPLETED (#326)

- **Owner decisions:** do batch 5; include the menu filtering (plan's optional follow-up). Keep `/admin`'s
  semantics: any failure in the gate redirects home.
- **Change:** `requireFeaturePageAccess(feature)` in `src/lib/authorization.ts`; called in the async content
  component of `/journey/[slug]` and `/compliance/[slug]` (right after `await params`, before `get*ToolBySlug`,
  `notFound()` kept after) and `/summer-blast-volunteers` (before `getSummerBlastConfig`); `admin/layout.tsx`
  uses it in place of its inline copy. `getUserAuthorization` filters `journeyTools`/`complianceTools` to the
  user's `accessibleFeatures`; no visible change, since the sidebar and home cards already filtered by `canAccess`.
- **Not ported:** the siblings have no such pages (mp-senior-care's contact-lookup page already self-gates).
- **Tests:** `authorization.test.ts` (12 new cases), new `shared-actions/user.test.ts` (5), new
  `src/app/(web)/feature-page-gates.test.ts` (5). Mutants: removing the journey filter fails 3 user tests; moving
  the Summer Blast gate after the config read fails the order test.
- **Review (3 lenses + adversarial verify):** 1 confirmed, test-only. The no-session and no-GUID redirect tests
  inherited a null-profile mock from the previous test, so a `requireFeatureAccess` that swallowed a failed session
  still passed them; they now use a super-admin profile, and that mutant fails. The compliance row now uses an
  enabled compliance tool. Refuted as out of scope: the journey/compliance actions look up the slug before
  `requireFeatureAccess`, so exhausting one's own rate limit can confirm a guessed slug exists (pre-existing, no
  name/ID leaks; the plan says the gate hides IDs, not which tools exist); the source-order test can be beaten by
  deliberately commenting out the gate (it pins order, not intent). Next.js runtime lens: no findings.
- **Checks:** lint, tsc, 102 files / 2293 tests, coverage 60.35 / 51.52 / 51.7 / 61.57 (floors hold), build,
  `check:standalone`.
- **Soak plan:** a user without a tool's groups is sent home from `/journey/<slug>`, `/compliance/<slug>` and
  `/summer-blast-volunteers` (and the page source carries no config); a member sees the pages as before, including
  `?applicant=` deep links; a super-admin gets a 404 on an unknown slug.
- **Soak:** `:dev` (`b632f5a`) on mptools from 17:01 UTC 2026-11-20; owner confirmed it passed. Merged as #326 (`5c8eafc`),
  `:latest` deployed 18:31 UTC; cache warm complete, `/` 307, `/signin` 200.

## Batch 6: auth UI — COMPLETED (#327)

Soaked on `:dev` 2026-11-20 from 20:58 UTC, all four apps together; an automated Edge run of the soak checklist passed 22/22 (session ended by clearing the app's cookies; tab visibility dispatched, since Playwright keeps pages visible) and no server errors were logged; owner approved. Merged and deployed to `:latest`.

Branch `security/batch6-auth-ui`. Upstream f3cb739, 0670531, f1ad0c8 (#98's sidebar part), 02731d4 and 595ecab,
adapted. ace4566 not adopted.

- **Owner decisions:** keep the silent re-sign-in through `/signin`; **no `/signed-out` page** (ace4566 declined).
  When the session ends on a page with unsaved edits, **warn and wait** instead of redirecting (the plan's open
  question about losing a half-written contact-log note).
- **Sign-out always available (f3cb739):** `UserMenu` takes an optional profile and reads "Your profile couldn't be
  loaded" without one; the header mounts it whenever loading has finished; the `(web)` error boundary has a Sign out
  button calling `handleSignOut`. Upstream's root-boundary sign-out not taken (our root boundary covers only
  `/signin`, `/auth-error`, `/session-error`).
- **Profile DTO (0670531):** `src/lib/dto/user-profile.ts` `CurrentUserProfile` (`First_Name`, `Nickname`,
  `Last_Name`, `Email_Address`, `Image_GUID`; names nullable as in MP's `Contacts`), built field by field by
  `toCurrentUserProfile`. Only `header.tsx` and `user-menu.tsx` read `userProfile` (sidebar and home cards read only
  the tool lists). `UserService.getUserProfile` drops the `dp_User_Roles` read and `roles` (nothing read it).
- **Sidebar (f1ad0c8):** `next/link`, `onClick={onClose}` kept.
- **SessionGuard (02731d4):** `src/components/layout/session-guard.tsx`, inside `Providers` in the `(web)` layout.
  Acts only on seen-session → settled null with no error, which is how better-auth 1.7.18's session atom reports an
  ended session (200 `null`); refetches keep `data`, network errors keep `data` and set `error`, a 401 sets `error`.
  Nothing unsaved: `location.replace('/signin?callbackUrl=<path+search>')`, page unrendered. Unsaved: an always-open
  Radix `AlertDialog` (see "Review fixes" below) with "Sign in again in a new tab" (`/signin?callbackUrl=%2F`, `noopener`), "check again"
  (`refetch()`, for a sign-in done in a separate window, where no visibility change fires) and "Discard changes and
  sign in". Detection in `src/lib/unsaved-changes.ts`: a capture-phase `input` listener records typed textareas,
  text-like inputs and contenteditable hosts (a Set pruned on every use, since a WeakSet cannot be enumerated);
  `useUnsavedChanges(dirty)` for non-text state. Ten search inputs marked `data-session-guard-ignore`.
- **No sign-out broadcast:** better-auth exports `getGlobalBroadcastChannel`, but our sign-out is a server action
  that redirects off-origin (a post before it races the session deletion; nothing runs after it), and waking every tab
  at once would start parallel OAuth flows sharing one `oauth_state` cookie, so all but one would hit
  `state_mismatch`. Visibility refetch is the baseline.
- **Loop cap (595ecab):** `src/lib/sign-in-loop.ts`; the third automatic navigation in 2 minutes shows a stop state
  (link to `/auth-error?error=sign_in_loop`, plus a "Try again" button that clears the cap: a click is not a loop).
  Fail-open storage. The stop flag is a small external store read with `useSyncExternalStore`, not state set in the
  effect.
- **Checks (first pass, working tree):** lint clean, tsc clean, 108 files / 2378 tests, coverage 61.33 / 52.7 / 53.15 / 62.54
  (floors 59/50/50/60 hold, unchanged), build, `check:standalone`, `check:shells`. Mutants, each reverted: guard
  redirects despite a dirty textarea (7 tests fail); guard acts on `error` (3 fail); profile spread instead of the
  DTO (8 fail); loop cap removed (3 fail).
- **Review fixes (same day, working tree):**
  - HIGH: the warning was a plain banner, so with a modal Radix Dialog open (the contact-log note, the detail
    modals, the transition dialog) it could not be clicked or focused (`body { pointer-events: none }`, aria-hidden,
    focus trap), and a click on it would have dismissed the Dialog and unmounted the note. It is now a Radix
    `AlertDialog`, always open while holding: as the newest dismissable layer it gets pointer events and focus, and
    the Dialog below is not dismissed (react-dismissable-layer 1.2.1 `dist/index.mjs:46-52, 65-76, 147, 257-262`;
    Escape goes only to the top layer, `:90, :101-107`, and is prevented; the modal Dialog prevents focus-outside
    itself, react-dialog 1.3.1 `:184-187`; the new FocusScope pauses the old, react-focus-scope 1.3.1 `:246-258`).
    Tested with a real `ui/dialog` Dialog holding a typed textarea.
  - Focus goes to the warning's title (`tabIndex -1`), never a button, and returns to the field on close.
  - A visible tab never re-checked (better-auth polls only with `refetchInterval`, default 0,
    `session-refresh.mjs:12, 48-51`): the client now sets `sessionOptions.refetchInterval: 300` (polls only while
    it holds a session, `session-atom.mjs:161`, and online, `session-refresh.mjs:19-23`; hidden tabs too), and
    the guard refetches at `expiresAt` + 5 s (re-arming past setTimeout's 24.8-day ceiling).
  - The hold is re-checked every 2 s and on each refetch that settles null again; it leaves once nothing unsaved
    is left. "leave" is now final (a live session no longer clears it mid-navigation).
  - A live session for a different user (`userGuid`, falling back to `user.id`, which changes on every sign-in after
    a restart) reloads the page, after a hold or not.
  - The loop-cap docs overstated it: it caps `/signin`'s own automatic navigations, not a guard → `/signin` →
    callback cycle (the guard clears the counter on every live session). Comment, CLAUDE.md and security.md fixed.
  - New tests: SessionGuard (modal Dialog, focus, re-check x4, identity x4, expiry timer x3), the real auth client
    polling with fake timers (`auth-client.test.ts`), sign-in re-render (one flow, one counter entry), the
    ignore-mark count per file (`session-guard-ignore-marks.test.ts`), the layout nesting
    (`layout-session-guard.test.ts`), `requireSession` rejection and the session passed to `getUserGuid` in both
    user actions, capture-phase and nested contenteditable tracking plus `datetime-local`/`month`/`week`, and the
    loop window's exact boundary.
- **Checks (after review fixes):** lint clean, tsc clean, 111 files / 2415 tests, coverage 61.67 / 53.03 / 53.8 /
  62.87 (floors unchanged), build, `check:standalone`, `check:shells`. Mutants, each reverted: hold never re-checks
  (3 fail); expiry timer dropped (2 fail); identity ignored on resume (2 fail); the old plain-div warning instead of
  the AlertDialog (3 fail, including the modal-Dialog test); `refetchInterval` removed (1 fail); bubble-phase
  listener (2 fail); innermost contenteditable host (1 fail); no `isRedirecting` guard on /signin (1 fail); window
  boundary `<=` (1 fail).
- **Second review fixes (same day, working tree):**
  - MEDIUM: the 300 s poll and the `expiresAt` + 5 s timer run in hidden tabs, so hidden tabs left on their own,
    landed on `/signin` and started unattended OAuth flows. With no database better-auth keeps OAuth state in ONE
    `oauth_state` cookie, so tabs ending together (they share `expiresAt`) overwrote each other's state and all but
    one ended on `state_mismatch`; on a shared PC a parked tab's flow could be completed by the next person. Now
    "stop showing the data" and "start signing in" are split: on "leave" the children stop rendering at once in every
    tab, but `location.replace('/signin…')` runs only while `document.visibilityState === 'visible'`; a hidden tab
    navigates once, on its first `visibilitychange` to visible (listener removed on navigation and on unmount). A
    hidden tab that holds does nothing; when its re-check switches it to "leave" the same rule applies.
  - Docs correction: after a container restart `/get-session` keeps answering from the 1h `session_data` cookie
    cache (`refreshCache: false`, `better-auth/dist/api/routes/session.mjs:55-95`), so the guard notices a restart
    only when that cache lapses, **within 1h, not at the next poll**. Sign-out in this browser (cookies deleted via
    `nextCookies`) and the 12h cap (the cached copy's own `expiresAt`, `:72-74`) are still caught at the next poll
    or by the expiry timer. Fixed in the component header, the `auth-client.ts` comment, security.md, CLAUDE.md,
    README.md and components.md, which also now say hidden tabs remove the page but start sign-in only when shown.
    The soak's "deploy mid-session" check should expect the guard to act up to 1h after the restart.
  - New tests (session-guard.test.tsx, 36 → 43): hidden + ended → page gone, no replace, replace exactly once on
    becoming visible (and not again on later switches); unmount while hidden → no replace; hidden hold → re-check
    clears → page gone, no replace until shown; "leave is final" (present → ended → present: page still gone,
    placeholder shown, one replace), visible and hidden; the `user.id` identity fallback with no `userGuid`
    (u1 → ended (hold) → u2 reloads; u1 → ended → u1 keeps the page).
  - Checks: lint clean, tsc clean, 111 files / 2422 tests, coverage 61.73 / 53.11 / 53.84 / 62.91 (floors
    59/50/50/60 unchanged), build, `check:standalone`, `check:shells`. Mutants, each reverted: navigate even when
    hidden (3 fail); no visibility-listener cleanup (1 fail); no listener removal on navigation (1 fail); no
    `user.id` fallback (1 fail).
- **Typed-form audit (same day, working tree):** every form with a typed field, checked for (a) a field that stays
  mounted and filled after a successful save (would read as unsaved forever and keep PII on screen) and (b) a step
  that unmounts a textarea while its text is still unsaved in state (tracking lost).
  | Component | After a successful save | Verdict | Fix |
  |---|---|---|---|
  | Journey / compliance tool editors (+ milestone/requirement pickers) | `onSaved` → admin page unmounts the editor | ~~Fine~~ **Hazard (b), found in review:** "Refresh from MP" (and in compliance every group-role toggle, via `fetchAndMergeRequirements`) swaps the picker for a loading line and back, so a typed label returns in a new, untracked input; checkbox/select/reorder edits were never held | `useUnsavedChanges(loadedEditState !== null && editState(…) !== loadedEditState)`: the form against the state it loaded (see "Form audit, second round") |
  | Permissions admin | only an ignored filter box; checkboxes | Fine (checkbox-only edits not held) | none |
  | `MilestoneEditForm` (both modals) | `setEditingKey(null)` unmounts it; failure keeps it | Fine | none |
  | `QuickActionsPanel` (both modals) | notes/date/item cleared, fields unmounted | Hazard (b): "Select..." or a compliance form item unmounts the notes textarea with notes still in state | `useUnsavedChanges(expanded && availableItems.length > 0 && notes.trim() !== "")` |
  | Journey modal pause reason | dialog closes; a FAILED pause hid the step in `finally` | Hazard (b) on failure (a pause failing because the session ended dropped the reason); **also, found in review:** Cancel keeps `pauseNotes`, and "Pause Process" brings it back pre-filled in a new, untracked textarea | step closes only on success, and `useUnsavedChanges(open && showPauseConfirm && pauseNotes.trim() !== "")` like the compliance twin |
  | Compliance modal pause reason | same as journey, plus "Remove from Tracking Group" hides the pause controls | Hazard (b) twice | step closes only on success, and `useUnsavedChanges(open && showPauseConfirm && pauseNotes.trim() !== "")` (the modal stays mounted while closed) |
  | Contact-log create / edit dialogs | dialog closed and form `reset()`; failure keeps it open | Fine | none |
  | Transition dialog | fields reset and dialog closed; failure keeps it | Fine | none |
  | `DetailModalPhotoUpload`, member detail modal, Summer Blast intake modal | file input / select only | Not tracked (no typed text) | none |
  | Search boxes (10 marks, unchanged) | n/a | ignored by design | none |
  - Tests: `quick-actions-panel.test.tsx` (+4), new `journey-detail-modal.test.tsx` (4) and
    `compliance-detail-modal.test.tsx` (6) rendering the real modals, new `src/lib/session-guard-unsaved-wiring.test.ts`
    (7: exact calls before the early return, no unlisted call, both callers clear notes on success, pause step closes
    only on success). Mutants, each reverted: panel declaration removed (6 fail); compliance declaration
    removed (4 fail); compliance claim without `open` (1 fail); panel claim without the `availableItems` term (1 fail);
    journey pause step hidden in `finally` again (3 fail); compliance likewise (2 fail); journey quick action no longer
    clearing notes on success (1 fail).
  - Checks: lint clean, tsc clean, 114 files / 2443 tests, coverage 62.18 / 53.5 / 54.34 / 63.4 (floors 59/50/50/60
    unchanged), build, `check:standalone`, `check:shells`, audit gate 0 violations.
  - `route.ts`'s `/get-session` caller table now names `session-guard.tsx` (`useSession`, `refetch()` at
    `expiresAt` + 5 s and "check again") and the client-wide `refetchInterval` poll.
- **Form audit, second round (same day, working tree):** two defects in the audit above, both "text returns in a
  field the tracker never saw":
  - **Tool editors.** Each now computes `editState` (every field `handleSave` sends, raw, plus
    `milestoneEditState` / `requirementEditState`, new exports of the two pickers: label, visibility, sort order and
    discontinue config, sorted by ID because a refresh rebuilds the lists in MP's order; compliance also sorts the role
    IDs) and takes `loadedEditState` in the reference-data load's `finally` (in the journey editor after its milestone
    reconcile, so a milestone MP added since the save is part of the baseline, not an edit). `useUnsavedChanges` runs
    while the two differ: false untouched (also across a refresh or a role toggled on and off), true after any typed,
    checkbox, select or picker edit (also across a refresh), false again when an edit is undone; it ends when the
    admin page unmounts the editor (Cancel, successful save) and the baseline is reset on a successful save in case a
    parent ever keeps the editor mounted. A refused save keeps it.
  - **Journey pause reason.** Same declaration as compliance. The modal stays mounted while closed, so `open` is in
    the claim.
  - Tests: new `journey-tool-editor.test.tsx` (7) and `compliance-tool-editor.test.tsx` (+7) render the real editors
    in an admin-page harness (untouched → Refresh → no hold; typed label → Refresh → new input, still holds; checkbox
    edit and undo; picker visibility; role toggled on/off with and without a typed label; Cancel; successful and
    refused save). `journey-detail-modal.test.tsx` (+2: type → Cancel → reopen → new pre-filled textarea → refused
    confirm → still holds; dialog closed → nothing). The wiring test lists five declarations.
  - Mutants, each reverted: journey editor declaration removed (4 fail); journey baseline taken before the reconcile
    (2 fail); compliance editor declaration removed (6 fail); `requirementEditState` unsorted (2 fail);
    `milestoneEditState` unsorted (1 fail); milestone labels left out of the state (2 fail); requirement labels left
    out (2 fail); journey modal declaration removed (3 fail, incl. the wiring test); journey claim without `open`
    (1 fail).
  - Checks: lint clean, tsc clean, 115 files / 2462 tests; the full suite run 6 times: 5 clean, 1 with an unrelated
    flake in `manage-members-shell.test.tsx` ("refetches the detail when the SAME member is reopened", which imports
    none of the changed code; 15/15 clean alone). Coverage 64.11 / 54.94 / 56.68 / 65.36 (floors 59/50/50/60
    unchanged), build, `check:standalone`, `check:shells`, audit gate 0 violations.
  - Docs: CLAUDE.md and security.md (five declarations; a pre-filled remount needs one), ui-standards.md (editor
    pattern row), components.md.
- **Trade-off to confirm in the soak:** while holding, the page is dimmed and not interactive (the AlertDialog is
  modal), so the edits cannot be copied out until the session is back. Before, the banner left the page usable but
  failed over an open Dialog.
- **Not ported yet:** event-manager, mp-senior-care, music-db (the plan says check music-db's header first).
- **Follow-up candidates:** wire `useUnsavedChanges` into permissions (its checkboxes are not text, so those edits
  are not held; it needs a dirty flag against the loaded state, as the tool editors now have); the soak should include a deploy mid-session with an unsaved contact-log note.

