# Session Summary — 2026-04-09

## Objectives

- Add sort options (by name, most/least milestones completed) to journey and compliance processing pages

## Work Completed

### Sort options for processing pages — COMPLETED

Added a sort dropdown to journey tools and compliance tools pages. Users can now sort participant cards by:
- **Last Name (A–Z)** — existing default behavior
- **Most Completed** — highest milestone count first
- **Least Completed** — lowest milestone count first

**Files created:**
- `src/components/processing/processing-sort-select.tsx` — Sort dropdown component
- `src/lib/processing-utils-sort.test.ts` — 6 tests for sort utility

**Files modified:**
- `src/lib/processing-utils.ts` — `ProcessingSortOption` type, `SORT_OPTIONS`, `sortCards()` utility
- `src/components/processing/index.ts` — barrel export for `ProcessingSortSelect`
- `src/components/journey-processing/journey-processing.tsx` — sort state + UI in both layouts
- `src/components/compliance-processing/compliance-processing.tsx` — same changes for consistency

## Decisions

- Client-side sorting (not server-side) since all participant data is already loaded
- Sort applies after search filtering, so search + sort work together
- Applied to both journey and compliance tools per ui-standards rule about keeping them in sync
- Last name used as tiebreaker for milestone-based sorts
