# Session Summary — 2026-10-28

## Deploys from the 2026-10-27 session — COMPLETED

- **mp-charts #277** (N2–N4, N7) merged as `1981801` and deployed to `:latest` after the owner's `:dev`
  test. All 5 caches warmed (57 s), and the log shows no errors and no `[scope:deny]` lines.
- **music-tools #185** (prisma 7.10.1, undici/zod/fast-uri) merged as `86efb7f` and deployed. Its
  `docs/status.md` records #180 and #185 as deployed and `npm audit` as clean (`99fd410`).
- TMC1 cleanup: the owner deleted the four superseded rollback pins (`rollback-ec5ea9a.yml` in mpcharts,
  `rollback-pre-2026-10-23.yml` in event-manager, mp-senior-care and music-tools). Each app keeps its
  `docker-compose.rollback.yml`.

## #277 follow-up: ended rows and member photo errors — COMPLETED (#281)

- **Pause/resume** (journey and compliance `assertGroupParticipantBelongsTo`): the row read now carries
  `End_Date IS NULL OR End_Date >= now`, so an ended row is refused and its End_Date is never rewritten.
  #277 found this gap and fixed it only for Summer Blast remove.
- **Complete** (`assertGroupParticipantInScope`, used only by `completeParticipant`): it accepted any
  row of an in-scope participant, so a caller could end-date that person's row in an unrelated group.
  It now requires an active row in the tool's tracking group. Complete runs only on current-tab cards in
  group mode, and those cards come from exactly these rows (`getParticipantsForGroup(trackingGroupId)`),
  so the UI cannot hit a false denial. Paused cards come from the paused group's active rows, which
  resume requires.
- **manage-members photo upload**: the modal swallowed every failure, including a scope refusal, a
  wrong type and an oversize file. It now shows the error, as the journey and compliance modals do,
  and refreshes the list only on success.
- **Tests:** 1206 (+14). The service tests use a `Group_Participants` fake that honours the row read's
  own `Group_ID` and active-row clauses. Removing either clause from either service (6 mutants) fails a
  test. The two new modal tests fail against `main`'s modal.
- **Soak:** `:dev` (`cad691e`) ran on mptools from 2026-10-28 15:11 UTC to 2026-10-30 with the owner
  testing. The log showed no errors and no `[scope:deny]` lines. Merged and deployed to `:latest`.

## Files

- **Modified:** `src/services/journeyProcessingService.ts`, `src/services/complianceProcessingService.ts`
  (+ their tests), `src/components/manage-members/member-detail-modal.tsx`,
  `src/components/manage-members/manage-members-shell.test.tsx`, `.claude/rules/security.md`,
  `docs/status.md`
- **Created:** `docs/sessions/session-summary-2026-10-28.md`

## Pending

- Audit gate parity: music-tools gates only at `critical` and has no nightly audit; event-manager has
  no nightly audit or Dependabot alerts.
- Dependabot majors (vitest 5 group #263/#265/#271 first), audit LOW items N9–N19.
