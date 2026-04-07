# UI Standards

## Chart Formatting

All time-series charts must use consistent short date labels on the X-axis:

| View | Format | Example | `toLocaleDateString` options |
|------|--------|---------|------------------------------|
| **Monthly** | `Mon YY` | "Feb 26", "Sep 25" | `{ month: 'short', year: '2-digit' }` |
| **Weekly** | `Mon D` | "Feb 1", "Feb 8" | `{ month: 'short', day: 'numeric' }` |

**Do NOT** use full month names ("February", "September") as X-axis labels — they take too much space and are inconsistent across charts.

Charts that follow this standard:
- `AttendanceChart` — monthly and weekly views
- `CommunityAttendanceChart` — monthly and weekly views
- `SmallGroupTrends` (Communities and Groups Trends) — monthly only

When adding new time-series charts, use the same `toLocaleDateString('en-US', ...)` pattern with the options above.

### Year-over-Year Weekly Comparison (Single-Month View)

When a chart shows weekly data for a single month with previous-year comparison enabled, **interleave** dates from both years on the same x-axis sorted by month-day (MM-DD). Use solid lines for the current year and dashed lines (`strokeDasharray="5 5"`) for the previous year, with `connectNulls` so each line draws through gaps where only the other year has data.

**Merging same-day entries**: When both years have data on the same day-of-month, merge into a **single x-axis point** using a `Map` keyed by MM-DD. Never create duplicate x-axis entries for the same MM-DD. See `AttendanceChart` for the reference implementation.

Charts that follow this pattern:
- `AttendanceChart` — weekly single-month view
- `CommunityTotalAttendanceChart` — weekly single-month view

## Mobile & Responsive

All features must work on mobile (375px+). Use **mobile-first** Tailwind classes. Use `useIsMobile()` from `@/hooks/use-mobile` when component **behavior** must change by screen size; use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) for layout-only changes.

Full patterns, anti-patterns, and standards: `.claude/references/mobile-responsive.md`

## Contact Action Links (Email, Phone, External URLs)

When displaying actionable contact information (email, phone, links to external systems), render them as **bordered pill-style buttons** with an inline SVG icon — not as plain text links. This pattern provides a clear click target and consistent visual treatment across features.

```tsx
<a
  href={`mailto:${email}`}
  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
>
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    {/* icon path */}
  </svg>
  {email}
</a>
```

**Key classes**: `inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors`

Components using this pattern:
- `BaptismDetailModal` — email and phone links
- `MembershipDetailModal` — email and phone links

## Admin Tool Editors (Journey & Compliance)

The **Journey Tools** admin (`src/components/admin/journey-tools/`) and **Compliance Tools** admin (`src/components/admin/compliance-tools/`) share the same UX patterns and must stay in sync:

| Pattern | Implementation |
|---------|---------------|
| **Field-level error highlighting** | `errorFields: Set<string>` + `fieldErrorClass()` / `clearFieldError()` |
| **Error placement** | Error message displayed near save button, not at top of form |
| **Slug auto-sanitization** | `onChange` lowercases, replaces invalid chars with hyphens |
| **Duplicate slug protection** | Client-side check against `existingSlugs` + server-side `isNew` flag |
| **Zod error parsing** | Server catches `z.ZodError`, formats as `"field: message; ..."` |
| **Form sections** | `<fieldset>` with `<legend>` for visual grouping |
| **Used journey filtering** | `usedJourneyIds` prop filters journey dropdown to prevent duplicates |
| **Default group role** | Defaults to "Member" (ID: 2) for new tools |

**IMPORTANT**: When making changes to validation, error handling, form layout, or UX patterns in **either** editor, check whether the same change should be applied to the other. Always ask the user if unsure. The two editors are intentionally parallel — shared actions like `getAvailableJourneys`, `getAvailableGroups`, etc. live in the journey tools actions and are imported by the compliance editor.

Key files:
- `src/components/admin/journey-tools/journey-tool-editor.tsx` — Journey tool form
- `src/components/admin/journey-tools/actions.ts` — Journey admin server actions (shared MP queries)
- `src/components/admin/compliance-tools/compliance-tool-editor.tsx` — Compliance tool form
- `src/components/admin/compliance-tools/actions.ts` — Compliance admin server actions
