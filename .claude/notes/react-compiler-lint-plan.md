# React Compiler Lint Remediation — Plan & Analysis

Generated 2026-08-07 from a 10-agent analysis of all 20 `react-hooks/*` violations
introduced when next 16.3.0 pulled eslint-plugin-react-hooks 7.1.

**Status: COMPLETE (2026-08-12).** All 20 violations fixed across PRs 0–8; all three rules enforced at
`error`. Enforcement verified by injecting a violation — lint exits 1.

The plan below is kept as written, because the reasoning is still the best record of why each site was
approached the way it was. **Everything in it is superseded by the rulings and corrections in the next
section** — read those first; §1's shape assignments in particular were wrong at four of six sites.

---

## Rulings and corrections (in the order they were settled)

**Ruling 1 — unsaved form state clears on reopen. Ratified 2026-08-11.** A modal remount discards
everything, including the fields the `[open]` effects did not reset. Verified: in the journey and
compliance detail modals exactly **three** survived a close/reopen — `milestoneNotes`, `milestoneDate`,
`selectedMilestoneKey`. Everything else in those 13–14-field effects was already reset or a transient
boolean. Clearing them closed a wrong-write path (notes typed for Alice submitted against Bob) and made
`milestoneDate` re-evaluate to today on every open instead of once per mount.

**Finding C — RESOLVED 2026-08-13, and it REPRODUCES.** Run on TMC1 with `:dev`: edited
`data/compliance-tools.json` in the `mpcharts_data` volume, navigated to `/admin`, hit Back — the grid
still showed the old value. A hard refresh, which re-runs the RSC, picked it up.

**The plan's prediction was wrong.** §0 reasoned that `staleTimes.dynamic: 0` plus `await connection()`
would keep Back refreshing. That analysis was aimed at the wrong layer: the router cache is not what
breaks. React destroys a hidden `<Activity>`'s effects and re-creates them when it becomes visible, but
**preserves state** — so a client component seeded from RSC props survives the restore with its stale
`useState` value and has no effect left to re-run. Before PR 1 the mount fetch lived in an effect, which
is exactly why Back used to refresh.

**Mitigation shipped and verified end-to-end** (TMC1, 2026-08-13): both admin grids re-read on mount and
on Activity restore, with the fetch inlined in the effect. Same experiment re-run against the fix — page
loaded showing "Enabled", config flipped out-of-band, `/admin` then Back, and the badge read "Disabled"
with no refresh. The server-side read stays, so first paint is unchanged and the effect reconciles behind
it. This also confirms the mechanism: effects really are re-created on Activity restore, which is what
makes the fix work and what made the pre-PR-1 code refresh. Costs one duplicate read per page load — the pre-PR-1 cost returning — and note the journey
grid's duplicate includes an MP round trip, since program/group names resolve through the API.

**A trap worth recording:** the obvious version of this mitigation — `useEffect(() => { reloadConfig(); })`
— does NOT lint, even though every setState inside `reloadConfig` is post-await. The rule flags a
`useCallback` loader invoked from an effect wherever its setState sits (Finding A's asymmetry), and that
is precisely the violation `journey-tools-admin.tsx:42` had before PR 1. The continuation has to be
inline for the rule to see it.

**Correction A — the file input was never at stake.** §3 and the cross-cutting notes list it among the
fields a remount would newly clear. It isn't: `DialogContent` has no `forceMount`, so Radix unmounts the
dialog subtree on close and the input's DOM node is already destroyed.

**Correction B — `summer-blast-volunteers.tsx:114` is Shape 1b, not Shape 1.** The page's Suspense
fallback is a bare `Loading Summer Blast volunteers...` text div, while the component renders the full
header, search, tabs and a skeleton grid. Moving the read server-side would swap all of that for the one
line — the same criterion §1 used to keep the two processing screens on 1b.

**Correction C — the compliance derived-`loading` machine is rejected**, as §4 already concluded once
Finding B landed. Recorded because §1 still lists it as the recipe for `compliance-processing.tsx:54`.
Both processing screens use the journey split.

**Correction D — `manage-members-shell.tsx:103` is not a Shape 1 site.** §1 lists it under "mount fetch →
Server Component props" and §3 row 13 then prices the hazard that creates (a `useState` initialiser that
won't re-run on soft navigation, so a `<Link>` to `?member=N` would stop opening the modal). None of it
was needed: the only violation was the synchronous `setHasAutoOpened(true)`, and everything else in that
effect already ran in the promise continuation. A `useRef` latch retires the warning outright.

That also **fixed** the latch. As state it never worked under StrictMode's double-invoke — the second run
read the stale `false` from its own closure — and in production it was unreachable, since the effect's
only dep is `initialMemberId`, which cannot change without a navigation that remounts.

**Correction E — `contact-lookup-details.tsx:291` is Shape 1b, not Shape 1.** `loading` was already a
`useState(true)` initialiser, so the client-side split retires the warning; the component's centred
spinner is also richer than the page's bare "Loading contact..." fallback. The planned `page-data.ts` is
not needed and does not exist. `household-sort.ts` was still extracted with tests — that was the
proposal's real value, and it is independent of where the fetch runs. The deferred server-side read is
filed in `docs/ideas.md` with its prerequisites.

**Correction F — `user-context.tsx:80` is not a Shape 1 site.** Its two synchronous setState blocks
existed only to reset six state variables to their initial values (one for the no-guid case, one for
sign-out). State that is a pure function of the session does not need storing: each load is now tagged
with the `userGuid` it was made for, so "is this the current user's data?" is a comparison and the reset
disappears. No `getUserBootstrap`, no layout await, no TTFB measurement, and the layout never blocks on
MP — the risk §4 priced at HIGH. All 11 existing tests passed unchanged, so the "mandatory" replacement
`shared-actions/user.test.ts` was moot; no server action was touched. The rewrite also fixed a defect the
plan did not identify: the old provider served the previous user's profile and feature list while the
next user's load was in flight.

**Also settled in passing:** the per-open remount counter is one counter *per modal*, not one shared
across a screen's modals — a shared bump remounts the other modal mid-exit-animation.

---

## Final tally on Shape 1 — the one lesson to carry forward

§1 assigned Shape 1 ("move the read into a Server Component, seed `useState` from props") to **six**
sites. It was the right recipe at **one**: the PR 1 admin exemplar. Corrections B, D, E and F each found
a fix that removed the setState instead of relocating the read.

The rule flags *where a setState is reachable*, so the cheapest correct fix is usually to make the state
unnecessary — derive it during render, move it to a `useState` initialiser, or move it into an event
handler — not to move the fetch to the server. Reach for a server-side move when the first paint
genuinely needs it, as a performance decision on its own merits.

Because of that, Finding C's exposure was limited to the PR 1 admin tool grids — where it **did** bite,
and is now fixed. It remains a confirmed blocker for the deferred contact-detail server read: that idea
needs the same mount-and-restore mitigation to be worth doing, and on that screen the staleness would hit
the "Last Activity" badge rather than an admin grid.

Two more things worth keeping, both learned the hard way:

- **Finding A's cop-out is real and tempting.** The rule does not descend into nested function
  expressions, so wrapping an effect body in an async IIFE silences it with the pattern intact. This is
  now written into `eslint.config.mjs` next to the rule, where the next person will actually see it.
- **Mutation-test every characterization test.** Four times in this migration a test passed under the
  exact bug it was written to catch. Every time the assertion was real and the *reachability* was the
  problem: a merge keyed on an id two fixtures never shared, `mockResolvedValue` handing back one array
  instance so React bailed out of the re-render, a fixture whose own row the assertion filtered out, and
  a latch that was unreachable in production to begin with.

---

# React Compiler Lint Remediation — Execution Plan

**Scope:** 20 `react-hooks/*` warnings across 14 files, verified against the working tree at `7283553`. Confirmed inventory (`npx eslint . --format json`): 18 × `set-state-in-effect`, 1 × `immutability`, 1 × `incompatible-library`. All currently `severity: 1` (warn).

---

## 0. Three findings that change the plan before you read it

These came out of verifying the dossier against the actual repo and `node_modules`. Each one alters what the right fix is.

### Finding A — the rule under-approximates, so "warnings: 0" ≠ "pattern eliminated"

`src/components/contact-logs/contact-logs.tsx:186` is **the exact dominant shape** — fetch on mount, `setState` — and it lints **clean**:

```ts
useEffect(() => {
  const fetchLogTypes = async () => {
    setIsLoadingLogTypes(true);        // ← same violation, not reported
    const types = await getContactLogTypes();
    setLogTypes(types);
    ...
  };
  fetchLogTypes();
}, []);
```

The rule's `getSetStateCall` walks only the effect's own basic blocks and never descends into nested function expressions. A loader **declared inside** the effect is invisible; the identical loader hoisted into a `useCallback` is flagged. That asymmetry is why `journey-tools-admin.tsx:42` fires on the *call site* rather than any `setState`.

**Consequence for this work:** there is a trivially available non-fix at every one of the 18 sites — wrap the body in an async IIFE. Two analysts explicitly verified it clears the rule; one offered it as a fallback and honestly labelled it a cop-out. It is.

> **Merge gate for every PR in this series:** no warning may be resolved by moving code into a nested function expression, and no `useCallback` loader may simply be inlined into its effect. If the diff's only structural change is nesting depth, reject it. This is not enforceable by lint — it is a review rule.

Corollary: `contact-logs.tsx:186` should be fixed as part of PR 8 for consistency even though it is not reported.

### Finding B — the analysts contradict each other on `[slug]` remounting, and one of them is right

The journey/compliance-processing analysts assumed navigating `/journey/a → /journey/b` **reuses** the component instance (this is the sole justification for the derived-`loading` state machine in `compliance-processing`, and for `key={slug}`). The contact-lookup analyst asserted the opposite and cited `layout-router.js`. I verified:

```
node_modules/next/dist/client/components/layout-router.js:549
  const activeStateKey = createRouterCacheKey(activeSegment, true)
```

`activeStateKey` is the React `key` on the `TemplateContext.Provider` / `<Activity>` wrapper for that level, and the dynamic segment's *value* is part of it. Slug changes ⇒ new key ⇒ **remount**. The same applies to `/contact-lookup/[guid]`.

**Consequences:**

- The **derived-`loading` state machine proposed for `compliance-processing.tsx:54` is unnecessary complexity** solving a problem that does not exist. Reject it in favour of the journey analyst's simpler split (`useState(true)` initializer + pure fetcher + event-handler refresh). Keeping the two processing screens structurally identical is also a `ui-standards.md` requirement.
- `key={slug}` on `<JourneyProcessing>` / `<ComplianceProcessing>` is **redundant but free**. Add it anyway as an explicit, cheap assertion of the invariant — and note it therefore does *not* reset `searchQuery`/`sortOption`/`activeTab` on tool switch, because those were already being reset. That retires one of the journey analyst's "behavior sign-off needed" open questions: **there is no behavior change to sign off.**
- It also **closes** the contact-logs analyst's flagged data-integrity worry (`useForm({ defaultValues: { contactId } })` captured at mount, wrong contact on navigation). The `[guid]` segment remounts, so `ContactLogs` remounts, so the mount-time `contactId` is always correct. **Not a bug. Do not "fix" it.**

### Finding C — the `<Activity>` bfcache regression that only one analyst priced

`cacheComponents: true` makes Next wrap the last N segments at each level in `<Activity mode="hidden">` (`layout-router.js:686`). React destroys a hidden Activity's effects and re-creates them when it becomes visible again.

That means **today, every effect-based mount fetch silently re-runs on back-navigation.** Go to a contact, navigate away, hit Back → the card refetches from MP.

Every "move the fetch to a Server Component and seed `useState`" proposal — **six sites** — deletes that refresh, because `useState` initializers do not re-run on Activity restore. Only the contact-lookup analyst raised it, and only for their own file. It applies equally to `summer-blast-volunteers` (a screen whose cache layer was *deliberately removed* in `4d521c2` so staff always see real-time signups), `manage-members`, and both admin tool lists.

**This is the single highest-value manual smoke test in the whole programme**, and it must be run once, early, on the exemplar PR, before the pattern is replicated five more times. If it reproduces, the Shape-1 recipe needs a mitigation clause (a `visibilitychange`/`router.refresh()` hook, or keeping those screens on the client loader) and roughly half this plan changes.

---

## 1. Canonical patterns — 4 shapes + 2 singletons

The 18 `set-state-in-effect` warnings collapse into **four** shapes. Agree on these four recipes with the user *before* any code is written; everything downstream is mechanical application.

### Shape 1 — Mount fetch → Server Component props (6 sites)

> *"A `useCallback` loader that `setState`s, invoked once from `useEffect` on mount, and re-invoked from event handlers after a mutation."*

**Recipe.** The page's async RSC (already wrapped in `Suspense`, already `await connection()` in most cases) performs the read and passes it as a required prop. The client component seeds `useState` from the prop and **deletes** the `loading` state plus its `if (loading)` early-return — the existing Suspense fallback already renders byte-identical markup. The loader survives as a **refresh-only** function called exclusively from event handlers, where synchronous `setState` is legal.

Error handling moves to an `initialError: string | null` prop, seeded into the same `error` state that already drives the existing early-return, so the failure UI is untouched.

| Site | Notes |
|---|---|
| `admin/compliance-tools/compliance-tools-admin.tsx:31` | purest instance — **exemplar** |
| `admin/journey-tools/journey-tools-admin.tsx:42` | + `resolveToolNames` must move server-side too, else the name fetch becomes a *new* violation |
| `summer-blast-volunteers/summer-blast-volunteers.tsx:114` | page already has `await connection()` |
| `manage-members/manage-members-shell.tsx:103` | deep-link resolution, not a list load |
| `contact-lookup-details/contact-lookup-details.tsx:291` | needs two new extracted modules |
| `contexts/user-context.tsx:80` | app-wide blast radius — sequence last |

**Shape 1b (2 sites)** — same shape, but the fetch **stays client-side** because the page's Suspense fallback is a bare `Loading...` div and moving the fetch server-side would replace the header + tabs + skeleton grid with a blank line. Recipe: split the loader into a **pure fetcher returning data (no `setState`)** and an **event-handler `refresh()` that may `setState` freely**; the mount effect becomes `loadAll().then(applyData)` with every `setState` in the continuation, and the initial `loading: true` comes from the `useState` initializer that is *already there*. Applies to `journey-processing.tsx:67` and `compliance-processing.tsx:54`.

> This is **not** Finding A's cop-out: the `setState`s genuinely moved (into an async continuation the rule permits by design) and the loading flag genuinely became an initializer. Nothing was merely nested.

### Shape 2 — Effect keyed on a form control's value → move into that control's `onChange` (3 sites)

> *"`useEffect(..., [someStateBackedByASelectOrCheckbox])` — because the handler would have read the stale pre-commit value."*

**Recipe.** Delete the effect. Make the handler `async`, and pass the control's **new** value as an explicit, **required** parameter so the stale-closure problem the effect existed to dodge cannot recur.

| Site | Control | Notes |
|---|---|---|
| `admin/journey-tool-editor.tsx:125` | journey `<select>` (`disabled={isEditing}`) | mount half folds into the existing reference-data `load()` |
| `admin/compliance-tool-editor.tsx:203` | journey `<select>` (**not** disabled) | 3 branches, different semantics — **do not copy-paste from journey** |
| `contact-lookup/contact-lookup-search.tsx:32` | "Active contacts only" checkbox | the lone `immutability` warning — structurally the same shape |

### Shape 3 — Per-open modal reset → remount via a bumped `key` (5 sites)

> *"One long-lived modal instance whose `participant`/`card` prop is swapped; an `[open]` effect hand-resets 3–14 state fields."*

**Recipe.** Parent holds `const [modalSession, setModalSession] = useState(0)`, bumps it in the card-click handler (batched with the existing `setSelected*` / `setOpen`), and passes `key={modalSession}`. The modal deletes every reset call; `useState` initializers supply them. Modals that also fetch flip `loading` to `useState(true)`.

**The trap, and it is the whole shape:** `key={card.id}` is the obvious choice and is **wrong**. Parents never clear the selected record on close, so closing and reopening the *same* record would not remount → no reset and no refetch. In `volunteer-detail-modal` that means a modal that opens with **"Confirm Remove" already armed** for a different volunteer.

| Site | Resets | Also fetches on open? |
|---|---|---|
| `summer-blast/intake-detail-modal.tsx:50` | 3 | no |
| `summer-blast/volunteer-detail-modal.tsx:45` | 3 (incl. `showRemoveConfirm`) | no |
| `journey-processing/journey-detail-modal.tsx:101` | 13 | yes |
| `compliance-processing/compliance-detail-modal.tsx:228` | 14 | yes |
| `manage-members/member-detail-modal.tsx:51` | 3 (resets on **close**, not open) | yes |

`member-detail-modal` is the odd one; its analyst proposed a close-handler + derived-`loading` variant instead. **Converge it on the key idiom** for consistency (`ui-standards.md` spirit) — its parent already owns `detailOpen`, so it is a three-line addition, and it removes the need for the `loadedFor` sentinel entirely.

### Shape 4 — Post-load side effect → fold into the load's async continuation (3 sites)

> *"A second effect that waits for `loading === false`, reads the just-loaded arrays out of state, and does something once (guarded by a `hasAutoOpened` latch)."*

**Recipe.** Delete the effect and the latch state. Do the work inside the loader's `.then()`, reading the resolved `data` directly instead of round-tripping through a render. Latches that gate an action but are never read during render become `useRef`.

| Site | What it does |
|---|---|
| `journey-processing.tsx:81` | `?applicant=N` deep-link auto-open (matchFn varies by mode) |
| `compliance-processing.tsx:65` | same, group mode only |
| `summer-blast-volunteers.tsx:120` | prune `bulkSelected` of response IDs no longer in the intake list |

Note the summer-blast analyst **correctly rejected** the tempting derive-during-render alternative here: deriving `effectiveSelected = bulkSelected ∩ present` leaves stale IDs in state forever, so a re-opened Opportunity Response would come back **pre-checked**. Today's prune is permanent. Endorse that reasoning.

### Singletons

- **Shape 5** — `contact-logs.tsx:254`: `useForm().watch()` → `useWatch({ control, name })`. Different rule (`incompatible-library`), different mechanism.
- **Dead code** — `compliance-tool-editor.tsx:191-198`: an effect whose body only early-returns, carrying a stale `exhaustive-deps` disable. Not flagged. Delete it in PR 2, but as its **own commit with its own line in the PR body**, not folded silently.

---

## 2. The exemplar: `admin/compliance-tools`

**Fix first, show as the reference diff:**
- `src/app/(web)/admin/compliance-tools/page.tsx`
- `src/components/admin/compliance-tools/compliance-tools-admin.tsx`

**Why this one:**

1. **It is the purest instance of the shape the user named as dominant.** `useCallback` loader + `useEffect(() => { loadConfig(); }, [loadConfig])`, and nothing else — no name resolution, no deep link, no modal, no MP query (it reads `data/compliance-tools.json` off disk). The diff shows the recipe with zero confounders.
2. **Lowest blast radius of any Shape-1 site.** Admin-only, gated by `requireFeatureAccess("admin")` in both the layout and the action; used by roughly two people. A mistake here is a bad afternoon, not a Sunday morning outage.
3. **It settles all three cross-cutting Shape-1 policy questions in one small diff** — (i) does the Suspense fallback acceptably replace the client `if (loading)` block? (ii) `initialError` prop vs `router.refresh()` for the error path? (iii) after a mutation, keep the client refetch or `router.refresh()`? Those three answers then apply mechanically to five more sites.
4. **It is where Finding C gets tested.** Load the page, navigate to `/admin`, hit Back. If the grid is stale, we learn it on the cheapest possible screen before replicating the pattern into `summer-blast` and `contact-lookup-details`.
5. **The type checker becomes a guard.** Making `initialConfig` a required prop means `npm run build` fails if `page.tsx` was not updated — the only automated safety net Shape 1 has.

**Not test-covered** — nothing at component level is, except `user-context`. Accept that and compensate with the manual checklist in §6.

**Caveat:** `ui-standards.md` requires the journey twin to land in the same PR. So the *PR* is the admin pair; the *diff you show the user* is the compliance file, because it is the one without the `resolveToolNames` wrinkle.

**Recommended answers to the three policy questions,** for ratification in this PR:
- (i) Yes — the fallback markup is byte-identical to the deleted `if (loading)` block and now covers one round trip instead of two.
- (ii) `initialError` prop. It reuses the existing `if (error)` early-return unchanged; `router.refresh()` on the error path would change what the user sees.
- (iii) **Keep the client refetch** (`reloadConfig()` from the event handler), not `router.refresh()`. `router.refresh()` is a transition against the RSC payload and, per the journey analyst's own flagged risk, may flash the Suspense fallback over the grid. The client refetch is what ships today and preserves "cards stay visible until fresh data arrives" exactly.

---

## 3. Risk ranking — all 20 sites

Ordered most → least dangerous. "Trap" is the specific way the proposal could plausibly change what a user sees.

| # | Site | Shape | Risk | Trap to check |
|---|---|---|---|---|
| 1 | `contexts/user-context.tsx:80` | 1 | **HIGH** | The `(web)` layout now **blocks on MP for every page**, not just the avatar. `UserService` has a 2-min profile cache, but a cold cache or MP hiccup delays *all* content behind the layout's single Suspense boundary. Also: the only component-level test file in the repo loses 4 of its 6 tests. |
| 2 | `compliance-processing.tsx:54` | 1b | **HIGH** | Proposed derived-`loading` machine (`settledRequestId !== requestId`) is a hand-rolled state machine on a daily-use screen, built to solve a problem Finding B says doesn't exist. **Reject; use the journey split.** |
| 3 | `compliance-detail-modal.tsx:228` | 3 | **HIGH** | 14 resets → remount. Wrong `key` (participant ID) ⇒ reopening the same volunteer shows **stale compliance detail**. Also silently clears `milestoneNotes` / `milestoneDate` / `selectedMilestoneKey` / file input, which today survive an open — arguably a latent-bug fix, definitely a visible change. |
| 4 | `journey-detail-modal.tsx:101` | 3 | **HIGH** | Same as above, 13 resets. `refetch-on-reopen` is load-bearing: staff edit milestones directly in MP and expect fresh data. |
| 5 | `compliance-tool-editor.tsx:203` | 2 | **HIGH** | The `<select>` is **not** `disabled={isEditing}`, so three branches must all survive: `null` → clear; back to saved journey → restore saved config **without an MP call** (staff's undo); anything else → fresh MP defaults, **no merge**. Do not adopt the journey editor's merge semantics. The `useState` initializer must be `existingTool?.journeyId ? … : []`, not `?? []` — that ternary reproduces the mount-time wipe of orphaned milestones. |
| 6 | `journey-tool-editor.tsx:125` | 2 | **HIGH** | Merge on Edit-open must preserve custom labels / `visible` / drag order / `discontinuesJourney` / `completionBadge`, **and** surface milestones added in MP since configuration, **and** drop discontinued ones. The `Promise.all` needs a per-promise `.catch(() => null)` on the milestone fetch — without it a milestone failure blanks all four dropdowns *and* raises the red banner. |
| 7 | `summer-blast-volunteers.tsx:114` | 1 | **MED-HIGH** | Screen exists specifically to show **real-time** signups (cache removed on purpose in `4d521c2`). Finding C bites hardest here. Also: initial-load failure moves from an inline red banner to the full-page `error.tsx` boundary. |
| 8 | `contact-lookup-details.tsx:291` | 1 | **MED-HIGH** | The `onRefresh` path must remain a **full** reload, not `router.refresh()` — the "Last Activity" badge is derived from `getContactBadges`, so a partial refresh silently stops it flipping to "Today". Also: proposal changes the page's Suspense fallback text from `Loading contact...` to a spinner block. |
| 9 | `member-detail-modal.tsx:51` | 3 | **MED** | Close/reopen the **same** member must refetch — milestones come from a live MP query, not the 6h contacts cache, so a just-run Change Status must show up. Any `key={contactId}` breaks this. |
| 10 | `journey-processing.tsx:67` | 1b | **MED** | `applyData` now always writes all three lists (`[]` where inapplicable) where today the inapplicable ones are never written. Same end state; verify the tab count badges don't flicker. |
| 11 | `journey-tools-admin.tsx:42` | 1 | **MED** | `resolveToolNames` must move server-side in the same change; the `'Unknown'` fallbacks depend on the `{ programs: {}, groups: {} }` default surviving. `router.refresh()` (if used) may flash the Suspense fallback over the grid. |
| 12 | `compliance-tools-admin.tsx:31` | 1 | **MED** | Grid must still refresh after save **and** after delete. Simplest instance; this is the exemplar. |
| 13 | `manage-members-shell.tsx:103` | 1 | **MED** | `useState` initializers don't re-run on soft navigation — a `<Link>` to `?member=N` would stop opening the modal. Verified today's only producer is a clipboard "Copy Link" (full navigation), so it's safe *now*. **Do not** patch with `key={memberId}`: that wipes tab/search/page. |
| 14 | `journey-processing.tsx:81` | 4 | **LOW-MED** | One-shot latch. If lost, the modal springs back open after every save. Also `setActiveTab` must precede the open so `isCurrentTab` gives the right action set. |
| 15 | `compliance-processing.tsx:65` | 4 | **LOW-MED** | Same. Extra hazard: showing "Remove from Tracking Group / Pause" instead of "Resume" for a paused volunteer is a wrong-write risk. |
| 16 | `volunteer-detail-modal.tsx:45` | 3 | **LOW-MED** | `showRemoveConfirm` leaking across records = a pre-armed destructive control that end-dates a `Group_Participant`. Low technical risk, high consequence if the key is wrong. |
| 17 | `summer-blast-volunteers.tsx:120` | 4 | **LOW** | Partial bulk-add failure: succeeded rows must vanish, failed rows must stay **checked** for retry, banner must read "Added 2; 1 failed". |
| 18 | `intake-detail-modal.tsx:50` | 3 | **LOW** | Group Role select must reset to "Temp" on **every** open including same-record reopen (wrong `Group_Role_ID` written to MP otherwise). Must stay `value === undefined`, never `""`, or the placeholder disappears. |
| 19 | `contact-lookup-search.tsx:32` | 2 | **LOW** | Forgetting to pass the new checkbox value ⇒ searches with the **previous** scope, silently returning/hiding inactive contacts. Make the parameter required (see §4). |
| 20 | `contact-logs.tsx:254` | 5 | **LOW** | Edit a log typed "Email", close, edit a log with `Contact_Log_Type = NULL` → must show the placeholder, not a leftover "Email". |

### Cross-cutting traps, called out explicitly

- **Modal prop→state sync (Shape 3, 5 sites).** The single failure mode is `key={recordId}`. Every one of those five parents keeps the selected record non-null after close (so Radix can animate out), so a record-ID key does not remount on same-record reopen. **Always a per-open counter.** Conversely the key must **not** change on close, or the exit animation dies.
- **Unsaved form edits (Shape 3).** The journey and compliance detail modals reset 13–14 fields today but *not* `milestoneNotes` / `milestoneDate` / `selectedMilestoneKey` / the file input. A remount clears those too. That means notes and an attachment typed for Alice can no longer be submitted against Bob — I agree that's a latent PII/audit bug being fixed, **but it is a user-visible change on a daily-use screen and needs an explicit yes.** Get that ruling once, in PR 3 (summer-blast), and apply it to PR 4.
- **Refetch timing after save (Shapes 1, 3, 4).** In every Shape-1 site the post-mutation refresh must stay a client-side refetch from the event handler. In every Shape-3 site the detail modal must **not** re-fetch when the parent list refreshes (`onUpdate` already triggers a list reload *and* the modal does its own targeted refetch — a second automatic one doubles MP load, and `CLAUDE.md` caps MP concurrency at 6 for good reason).
- **Large-list derive cost.** Only one proposal was tempted by derive-during-render on a list (summer-blast `bulkSelected`), and it was correctly rejected on *correctness* grounds, not perf. The intake query is `Opportunity_ID = X AND Closed = 0` — tens to low hundreds of rows — and `filteredIntake` already sorts every render. **Perf is not a live concern anywhere in this set.** Don't let it become the justification for a riskier fix.

---

## 4. Disagreements and weak proposals

### `contact-logs.tsx:254` — `incompatible-library` — **proposal accepted, with a scheduling correction**

The `useWatch({ control, name })` swap is right, and unusually well-evidenced (the analyst read the installed RHF source; I confirmed **7.84.0** is installed despite `package.json` pinning `^7.71.1`). No `defaultValue` is correct — the Select must stay `undefined`, not `""`, or the placeholder vanishes.

Two corrections:

1. **It is not blocking, and it is not "unfixable".** No one claimed it was, but the framing in the brief invited that. `incompatible-library` is `Warning` severity in the plugin's Recommended preset and is **not one of the two rules `eslint.config.mjs` downgrades**. Restoring `set-state-in-effect` and `immutability` to `"error"` does **not** require this site to be fixed. It is genuinely optional and can be sequenced anywhere. **No `eslint-disable` is warranted here or anywhere else in the set** — the one candidate for a scoped disable turned out to have a clean fix.
2. **Reject the `<Controller>` alternative**, as the analyst did. Registering `contactLogType` changes reset-to-defaults semantics and validation timing for a field that is currently `.optional()` and unregistered — real behavioral risk for zero additional lint benefit (`setValue` is not flagged).

**And close their open question:** the flagged `defaultValues: { contactId }` mount-capture is **not reachable**. Per Finding B, `/contact-lookup/[guid]` is part of the router cache key, so navigating between contacts remounts `ContactLookupDetails` and therefore `ContactLogs`. Don't add a defensive `key`, don't change `onCreateLog`.

### `contact-lookup-search.tsx:32` — `immutability` — **proposal accepted, with one hardening change**

The analyst did **not** give up early — they explicitly identified that simply moving the effect below `handleSearch` would silence the rule (it's a temporal-dead-zone complaint, not a `setState` complaint) and refused to do it. Correct call. Moving the re-search into the checkbox's `onChange` is the right fix and is Shape 2.

**One change to their code:** they proposed `handleSearch(query: string, activeOnlyOverride?: boolean)` with a `?? activeOnly` fallback. The single realistic regression at this site — which they themselves named — is *forgetting to pass the override*, which then silently searches with the stale scope and changes whether inactive contacts are returned. An **optional** parameter with a silent fallback is exactly the shape that lets that ship.

Make it **required**:

```ts
const handleSearch = async (query: string, scopeActiveOnly: boolean) => { … }

const performSearch = () => {
  if (searchTerm.trim()) handleSearch(searchTerm.trim(), activeOnly);
};

const handleActiveOnlyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const next = e.target.checked;
  setActiveOnly(next);
  if (hasSearched.current && searchTerm.trim()) handleSearch(searchTerm.trim(), next);
};
```

Now the type checker enforces what the reviewer would otherwise have to notice.

**Sequencing bonus:** this is the *only* `immutability` violation. Fix it and flip `"react-hooks/immutability": "error"` **in the same PR**. That answers the question four separate analysts raised ("can the rules only be flipped at the very end?") — **no**: one of the two rules can be restored on day one, in a ~20-line diff, which is both a real milestone and a guard against regressions during the remaining eight PRs.

### `contexts/user-context.tsx:80` — **proposal accepted architecturally, rejected on sequencing, and under-priced on two axes**

I independently verified the load-bearing claims, and they hold:

- `AuthWrapper` is a Server Component that `redirect("/signin")` on no session and `redirect("/session-error")` on missing `userGuid`, and it wraps `<Providers>` in `(web)/layout.tsx`. ✓
- `<Providers` appears in exactly **one** place — `src/app/(web)/layout.tsx:57`. ✓
- Both server actions **already ignore** their `_requestedId` parameter and derive the GUID from `requireSession()` (the F4 fix). ✓ So `getUserBootstrap()` is a faithful consolidation with zero security delta.

Therefore both guard branches in the effect really are dead code, and the consolidation is sound. **But:**

**Under-priced #1 — the layout now blocks on MP for every page.** Today the chrome paints instantly and the avatar fills in over ~200–800ms. After the change, `getUserBootstrap()` is awaited inside `WebLayoutContent`, which sits inside the layout's *single* Suspense boundary — so on a cold `UserService` cache (2-minute TTL) or an MP slowdown, **every page's content** waits behind it, not just the avatar. The analyst described this as "amortized" and "should be net faster." That's plausible and probably true in steady state, but it converts a degraded-avatar failure mode into a whole-app-slow failure mode. **Measure it before merging**, and keep the escape hatch on the shelf: create the promise without awaiting in the layout and read it in the provider with React 19's `use()` behind its own boundary.

**Under-priced #2 — this deletes the repo's only component-level test coverage.** `src/contexts/user-context.test.tsx` has 6 tests; 4 exercise the deleted effect. Net assertion count must not go down. `src/components/shared-actions/user.test.ts` (new, unit-testing `getUserBootstrap`) is **mandatory in the same PR**, not a nice-to-have — `testing.md` targets 90%+ for server actions and this is a server action.

**Rejected — sequencing.** The analyst implicitly treats this as a clean, standalone win. It is architecturally the *most* satisfying fix in the set, which is precisely why it's tempting to do first. **Do it last (PR 7).** Every other site degrades one screen; this one degrades sign-in for everyone. By PR 7 the Shape-1 recipe will have been validated on six lower-stakes screens and the Finding C question will have been answered.

**Minor rulings to stop bikeshedding:**
- Keep `UserContextValue.error: Error | null` and reconstruct from `errorMessage` on the client. Do **not** change the context's public shape mid-refactor.
- Put `getUserBootstrap` in `src/components/shared-actions/user.ts` (the `'use server'` module) so it doubles as the client-callable refresh. The layout importing from a `'use server'` module is fine and already precedented.
- **Do not** wire `refreshUserProfile()` into the admin Permissions screen in this PR. It's a real latent bug (server cache flushed, client context stale) but it is a behavior *addition*. File it in `docs/ideas.md`.

### Other proposals I'd change

- **`compliance-processing.tsx:54` derived-`loading`** — reject (Finding B). Use the journey split so both screens stay structurally identical per `ui-standards.md`.
- **`member-detail-modal.tsx:51` close-handler + `loadedFor` sentinel** — reject in favour of the key-remount idiom used by the other four modals. The analyst's version is defensible in isolation but leaves the repo with two competing reset strategies, which is exactly what `ui-standards.md` exists to prevent. Their `loadedFor` reasoning does yield one keeper: *don't* derive `loading` from `detail === null`, because `fetchMemberDetail` legitimately resolves `null`. With a remount that concern evaporates.
- **`journey-tool-editor` deep-link latch placement** — the journey analyst sets `hasAutoOpenedRef.current = true` on the success path only (so a failed first load doesn't burn the deep link); the compliance analyst is byte-faithful. Pick **success-path-only** for both and note it in the PR; it's strictly better and the divergence is unreachable in practice.
- **Pre-existing bugs deliberately reproduced** — three were found and correctly *not* fixed inline: the `Number('') === 0` blank-journey selection in `journey-tool-editor`; the orphaned `pauseMilestoneId` when a compliance tool's journey is detached; the stale `fileUniqueId` after a photo upload in `member-detail-modal`. **Keep them reproduced.** File all three in `docs/ideas.md` in PR 1 so they're tracked before the refactor makes them harder to spot.

---

## 5. Work order

Nine PRs. Each is independently revertable; each reduces the warning count monotonically; parallel journey/compliance pairs always ship together.

| PR | Files | Sites | Shape | Notes |
|---|---|---|---|---|
| **0** | `contact-lookup/contact-lookup-search.tsx`, `eslint.config.mjs` | 1 | 2 | **Retires `react-hooks/immutability` entirely — flip that rule to `"error"` in this PR.** Smallest, most obviously-correct diff in the set. Ships with a new `contact-lookup-search.test.tsx`. |
| **1** ⭐ | `admin/compliance-tools/{page,compliance-tools-admin}` + journey twin | 2 | 1 | **EXEMPLAR.** Ratifies the Shape-1 recipe. Also carries the three `docs/ideas.md` entries for the deliberately-reproduced pre-existing bugs. **Run the Finding C back-navigation smoke test here.** |
| **2** | `admin/{journey,compliance}-tool-editor.tsx` (+ `lib/journey-tools-config-types.ts`) | 2 | 2 | Two commits: journey, then compliance — **do not copy-paste between them** (the compliance select isn't disabled; three branches; no merge). Third commit: delete the dead effect at `compliance-tool-editor.tsx:191-198`. |
| **3** | `summer-blast-volunteers/*` (4 files + `page.tsx`) | 4 | 1 + 4 + 3×2 | Self-contained feature folder covering three shapes at once. **This is where the "unsaved form state now clears on open" ruling gets made** — it's cheapest here (a role `<select>`, not a notes textarea). Establishes the `modalSession` idiom for PR 4. |
| **4** | `journey-processing/*` + `compliance-processing/*` (4 files, 2 pages) | 6 | 1b + 4 + 3 | Largest PR, unavoidably: the modal `key` lives in the processing component, so the files are entangled. **Two commits — journey pair, then compliance pair — so a revert is per-family.** Add `key={slug}` to both pages as an explicit invariant. |
| **5** | `manage-members/{page,manage-members-shell,member-detail-modal}` | 2 | 1 + 3 | Use `fetchMemberDetail` for the deep link (parity); defer the cache-only `fetchMemberCard` optimisation. |
| **6** | `contact-lookup-details/*` (+ 2 new modules), `contact-lookup/[guid]/page.tsx` | 1 | 1 | Introduces `household-sort.ts` and `page-data.ts` — both **require** co-located tests per `testing.md`. Keep `page-data.ts` importing the `'use server'` actions so `requireFeatureAccess` + `enforceRateLimit` stay in one place. |
| **7** | `contexts/user-context.tsx`, `app/providers.tsx`, `(web)/layout.tsx`, `shared-actions/user.ts` | 1 | 1 | Highest blast radius. Ships with `shared-actions/user.test.ts` **and** the rewritten `user-context.test.tsx`. Measure layout TTFB before/after. |
| **8** | `contact-logs/contact-logs.tsx`, `eslint.config.mjs` | 1 | 5 | `useWatch` swap. Also fix the *unreported* `contact-logs.tsx:186` mount-fetch for consistency (Finding A). **Flip `react-hooks/set-state-in-effect` to `"error"`.** Optionally pin `incompatible-library` to `"error"` so a future `useForm().watch()` / TanStack adoption fails CI. |

**Why this order:** PR 0 retires a whole rule immediately and proves the process. PR 1 validates the highest-count recipe on the lowest-traffic screen and answers Finding C before it's replicated. PRs 2–6 are ordered by ascending traffic and blast radius. PR 7 is last because it gates sign-in. PR 8 closes out.

**If Finding C reproduces at PR 1**, stop and re-plan: PRs 3, 5, 6, 7 all depend on the Shape-1 recipe and would each need a refresh mitigation (or fall back to Shape 1b, staying client-side).

**Per-PR gate.** Warning count must strictly decrease and no new rule may appear:

```bash
npx eslint . --format json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);const o={};for(const f of r)for(const m of f.messages)if((m.ruleId||'').startsWith('react-hooks'))o[m.ruleId]=(o[m.ruleId]||0)+1;console.log(o)})"
```
Baseline today: `{ 'react-hooks/set-state-in-effect': 18, 'react-hooks/incompatible-library': 1, 'react-hooks/immutability': 1 }`

---

## 6. Verification strategy

### What the existing 539 tests actually cover

Of 35 test files, only **3** are `.tsx`, and only **one** touches anything in this remediation:

| Test file | Relevance |
|---|---|
| `src/contexts/user-context.test.tsx` | **The only real coverage.** 6 tests; PR 7 invalidates 4. Would catch a mis-wired context field; would **not** catch broken layout prop threading. |
| `src/components/layout/auth-wrapper.test.tsx` | Guards the redirect contract PR 7's entire correctness argument rests on. **Must stay green — it is a prerequisite, not a target.** |
| `src/lib/auth.test.ts`, `src/lib/authorization.test.ts` | Guard the `userGuid` / `additionalFields` invariants PR 7 depends on. |
| `src/lib/journey-tools-config-types.test.ts`, `compliance-tools-config-types.test.ts` | Co-located tests for the lib modules where new pure helpers should land. |
| `src/lib/processing-utils*.test.ts` | `sortCards` / `searchByName` — untouched by every proposal. Useful as proof the filtering logic isn't in play. |
| `*/actions.test.ts` (contact-logs, contact-lookup, summer-blast, user-menu) | Server actions only. Never render a component. |

**Bottom line: 13 of the 14 changed components have zero test coverage.** Every regression described in §3 would ship green today. `npm run test:run` is a *non-signal* for this work — treat a green suite as meaningless except in PR 7.

### Strongest automated guard: the type checker

`npm run build` is worth more than the test suite here. Every Shape-1 fix adds a **required** prop, so a missed `page.tsx` update is a compile error. Run it on every PR, not just lint.

### New tests, ranked by value-per-effort

`testing.md` says React components want integration/E2E, not unit tests. Resolve that tension by **extracting pure logic into `src/lib/` modules with co-located unit tests** (fully rules-compliant), and using RTL only for the handful of assertions that encode a specific trap.

| # | Test | PR | Why it earns its place |
|---|---|---|---|
| 1 | `journey-tools-config-types.test.ts` += `mergeSavedMilestones` (4 cases) | 2 | Pure, cheap, co-located in a file that already has tests. Guards the highest-consequence data behavior in the set: an admin's custom milestone labels, visibility and drag order surviving Edit-open. |
| 2 | `shared-actions/user.test.ts` — `getUserBootstrap` (4 cases) | 7 | **Mandatory.** Replaces the assertions the rewritten context tests lose; a server action per `testing.md`. |
| 3 | `user-context.test.tsx` rewrite (2 tests) | 7 | Net assertions must not drop. |
| 4 | `summer-blast-volunteers.test.tsx` — **same-record reopen** clears the role select | 3 | The single test that fails under the naive `key={responseId}`. Wrong `Group_Role_ID` written to MP is a data bug, not cosmetic. |
| 5 | …+ **volunteer**: same-record reopen shows collapsed "Remove from Group", not armed "Confirm Remove" | 3 | Guards a destructive MP write behind a one-click control. |
| 6 | …+ bulk partial-failure: 2 succeed / 1 fails → bar reads "1 selected", failed row still checked | 3 | Guards the Shape-4 prune move. `actions.test.ts` covers the server semantics; nothing covers the UI's use of them. |
| 7 | `journey-detail-modal.test.tsx` / `compliance-detail-modal.test.tsx` — **same participant, new key → refetch called twice** | 4 | The regression guard against a participant-ID key. Staff edit milestones directly in MP; a lost refetch is silent and wrong. |
| 8 | `compliance-processing.test.tsx` — after auto-open + close, `onUpdate` does **not** reopen the modal | 4 | Direct replacement for the deleted `hasAutoOpened` latch. |
| 9 | `contact-lookup-search.test.tsx` — Enter → `('smith', true)`; toggle → second call `('smith', false)` | 0 | Pins the required-parameter hardening. |
| 10 | `household-sort.test.ts` + `page-data.test.ts` | 6 | New modules; required by `testing.md`. Extracting the sort out of a `setState` callback is a net testability win. |
| 11 | `contact-logs.test.tsx` — edit typed log → close → edit `NULL`-type log → placeholder, not leftover value | 8 | The one assertion the `useWatch` swap could plausibly break. |
| 12 | `member-detail-modal.test.tsx` — close/reopen same member refetches | 5 | Same trap as #7. |

### Must be smoke-tested by hand (no test can reach it)

**Once, on PR 1 — the gating experiment:**
- [ ] **Finding C.** Load `/admin/compliance-tools`. Edit `data/compliance-tools.json` on disk out-of-band. Navigate to `/admin`, hit **Back**. Does the grid show the new value? Today it does (the effect re-runs on `<Activity>` restore). If it doesn't after the change, **stop the programme and re-plan Shape 1.**
- [ ] `await connection()` keeps the page out of build-time prerender (`npm run build` must not attempt the MP/disk read).
- [ ] Non-admin still redirects to `/`.
- [ ] Force a load failure (rename the JSON) → red Alert replaces the page, not the error boundary.
- [ ] Delete a tool → card disappears with **no flash of the Suspense fallback** over the grid.

**Per-PR:**
- **PR 2** — Edit a configured journey tool: custom labels/hidden flags/drag order intact; a milestone added in MP since configuration appears with defaults; a discontinued one is gone. Kill the MP milestone endpoint → dropdowns still populate, no red banner. Compliance editor: select "No journey attached" → milestones block disappears; re-select the saved journey → saved config returns **with no network call**.
- **PR 3** — Card A → change role → close → card B: select reads "Temp". Same for reopening A. Volunteer A → "Remove from Group" → close → volunteer B: button collapsed.
- **PR 4** — Deep link `?applicant=N` for a paused/completed participant: tab switches **before** the modal paints, right action set shown. Close it, save something, confirm it does not spring back. Sidebar-navigate between two journey tools; confirm skeletons, never tool A's cards under tool B's heading. Close and reopen the *same* participant → detail refetches.
- **PR 6** — ~~Create a contact log → "Last Activity" badge flips to **Today**.~~ **This expectation was
  wrong** (confirmed in production 2026-08-13): the badge reads MP's `Activity_Log`, not `Contact_Log`, so
  creating a contact log does not move it. Nothing to fix — the check itself was invalid. Click an email/phone pill → log list refreshes with **no** full-page spinner. Groups section starts collapsed and resets to collapsed after a full reload. Breadcrumb reads `Home / Contact Lookup / <Nickname> <LastName>` and clears on leave.
- **PR 7** — Sign in as non-admin: no "Setup", correct journey/compliance entries in **both** sidebar and home grid. Sign in as admin: "Setup" present. Header avatar on first paint with no placeholder flash. Point `MINISTRY_PLATFORM_BASE_URL` at a dead host → app renders **degraded**, not the error boundary. **Measure layout TTFB cold vs. warm `UserService` cache.**
- **PR 8** — Add Log → placeholder → pick a type → trigger updates → submit → dropdown resets.

### Pre-PR security review (per `.claude/rules/git-workflow.md`)

None of the 20 fixes touches `filter:` construction, file uploads, or redirects — the CI `security-lint` job is not in play. Two PRs need an explicit line in the review section anyway:

- **PR 6** — `page-data.ts` calls `'use server'` actions from a Server Component. Confirm `requireFeatureAccess("contact-lookup")` and `enforceRateLimit(…, "search")` still run on every read, and that the MP call count per page load is unchanged (5).
- **PR 7** — Confirm `getUserBootstrap` derives the GUID from `requireSession()` only (the F4 invariant), and that `AuthWrapper`'s two redirects still execute **before** `WebLayoutContent` is invoked.

### Not required

No `'use cache'` function is introduced by any of the 20 fixes. **No `src/lib/cache-warming.ts` registration is needed** — confirming this on the record, since `caching.md` makes registration mandatory for any *new* cached function, and four analysts independently asked. If any PR grows a `'use cache'` wrapper during implementation, that PR must also add the `serviceCache.getOrFetch()` wrapper and the warming registration.