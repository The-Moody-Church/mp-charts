# MP Date/Time Handling Reference

This document covers how date and datetime values must flow between the UI, our services, and the Ministry Platform (MP) API. Use it whenever you add a new MP date field, audit a server action that writes dates, or debug a "the saved date is wrong" report. Companion file: `ministryplatform.query-syntax.md` (for date filters in `$filter`).

## Why MP is not UTC

MP stores datetimes as **wall-clock values in the domain's configured time zone** (for us: `America/Chicago`). `2026-05-17 23:33:00` is literally "11:33 PM Central." It does **not** normalize to UTC on the way in or out.

If you send a value tagged as UTC, MP stores it as if those UTC clock numbers were the local clock numbers — the saved record drifts by the MP-to-UTC offset. The same anti-pattern in reverse on the read path causes drift on display and compounds across edits.

The classic shape of this bug: a form appends `T00:00:00.000Z` to a date string on submit, the server runs `new Date(...).getFullYear()` on the result, and each edit shifts the date back another day. Editing the already-shifted date applies the same transform again, so the date moves backwards another day every save.

## The utility

`src/lib/providers/ministry-platform/utils/mp-datetime.ts` — pure functions, hard-coded to `America/Chicago`. Always go through these for any MP read/write that crosses a TZ boundary; never call `new Date(mpString)` directly when you need arithmetic on the result.

```ts
import {
  getMpTimezone,
  toMpSqlDatetime,
  parseMpDatetime,
} from "@/lib/providers/ministry-platform/utils/mp-datetime";

getMpTimezone();                              // → "America/Chicago"
toMpSqlDatetime("2026-05-17");                // → "2026-05-17 00:00:00"
toMpSqlDatetime(new Date());                  // → MP-TZ wall-clock for "now"
parseMpDatetime("2026-05-17 12:00:00");       // → Date instant for May 17 12:00 Central
```

**Future generalization**: the MP timezone is currently a hard-coded constant. If a non-Central deployment ever lands, swap the constant for a dynamic read of `MPHelper.getDomainInfo().TimeZoneName` (which returns a Windows zone name like `"Central Standard Time"` and needs mapping to IANA `"America/Chicago"`). The function signatures don't need to change; only the constant lookup.

### `toMpSqlDatetime(value)` — write path

Returns the SQL datetime string MP's table API expects (`YYYY-MM-DD HH:MM:SS`).

| Input | Treated as | Output |
| --- | --- | --- |
| `"2026-05-17"` | MP-TZ midnight | `"2026-05-17 00:00:00"` |
| `"2026-05-17 14:30:00"` | already SQL | `"2026-05-17 14:30:00"` |
| `"2026-05-17T14:30"` | MP-TZ wall-clock | `"2026-05-17 14:30:00"` |
| `"2026-05-17T03:33:00.000Z"` | UTC instant | converted to MP-TZ |
| `"2026-05-17T03:33:00-04:00"` | Instant at offset | converted to MP-TZ |
| `Date` instance | UTC instant | converted to MP-TZ |

The rule: **strings with no zone marker are wall-clock**, strings/Dates with explicit zone info are instants that get converted.

### `parseMpDatetime(value)` — read path arithmetic

Use when you need a `Date` instant to do real arithmetic on a value MP returned (date diff, age calculation, comparison). For pure display, prefer `Intl.DateTimeFormat({ timeZone: getMpTimezone() })` against the raw string — it's cheaper and avoids constructing an intermediate `Date`.

Accepts MP's two on-the-wire shapes — `YYYY-MM-DD HH:MM:SS` and `YYYY-MM-DD` — and treats them as MP-TZ wall-clock. Throws on anything else (including strings with explicit zone markers — those are already instants, just pass to `new Date()`).

## Recipes

### Writing a date-only field (`<input type="date">`)

```tsx
// Client component — send the raw "YYYY-MM-DD" string, no Z, no time component.
const payload = { Contact_Date: form.contactDate /* "2026-05-17" */ };

// Server action / service
const mpDate = toMpSqlDatetime(payload.Contact_Date);
// → "2026-05-17 00:00:00"
```

### Writing a datetime field with a "save at current moment" intent

```ts
const mpDate = toMpSqlDatetime(new Date());
// → MP-TZ wall-clock representation of the server's "now"
```

### Writing from a `<input type="datetime-local">`

`datetime-local` emits values like `"2026-05-17T14:30"`. These are **browser-local wall-clock** by definition (no zone). For users sitting in the MP timezone (Central), pass straight through. For users in a different zone who should still write MP-TZ wall-clock, capture the browser's IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and convert before calling `toMpSqlDatetime`. (We don't currently have a datetime-local picker in the app; revisit when one lands.)

### Pre-filling an edit form from a stored MP value

MP returns datetimes as wall-clock strings in MP-TZ (no zone marker). For a date input, take the date portion directly — **do not** parse with `new Date()`:

```tsx
setValue("contactDate", log.Contact_Date.split("T")[0]);
```

### Displaying a stored MP datetime in the browser

`new Date(stringFromMp).toLocaleDateString(...)` parses the string as **browser-local**, which silently disagrees with MP-TZ when the viewer's browser is in a different zone. Format with an explicit `timeZone`:

```tsx
import { getMpTimezone } from "@/lib/providers/ministry-platform/utils/mp-datetime";

function formatMpDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: getMpTimezone(),
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parseMpDatetime(value));
}
```

For date-only fields (where the time is meaningless), a local helper that splits `YYYY-MM-DD` from the string and builds `new Date(y, m-1, d)` (browser-local midnight) is fine — see `parseLocalDate` in `contact-lookup-details.tsx`. Use that pattern for membership dates, birthdays, last-activity dates.

### Filtering on a date column in `$filter`

`$filter` strings are also interpreted in MP-TZ. Quote the value and use MP-TZ wall-clock:

```ts
filter: `Contact_Date >= '2026-05-01' AND Contact_Date < '2026-06-01'`
```

Do not convert filter values to UTC. If you have a `Date` instant in JS, run it through `toMpSqlDatetime(instant)` first.

## Anti-patterns

These caused or could have caused timezone drift bugs. Grep for them when reviewing new code.

| ❌ Don't | ✅ Do |
| --- | --- |
| ``Contact_Date: `${date}T00:00:00.000Z` `` | `Contact_Date: date` (raw `"YYYY-MM-DD"` string) |
| `new Date(formValue).toISOString()` | `toMpSqlDatetime(formValue)` |
| `new Date(mpValue).getFullYear()` etc. for arithmetic | `parseMpDatetime(mpValue)` then arithmetic |
| `new Date(mpValue).toLocaleString(...)` for display in cross-TZ contexts | `Intl.DateTimeFormat("en-US", { timeZone: getMpTimezone(), ... }).format(parseMpDatetime(mpValue))` |
| `new Date("YYYY-MM-DD")` for date-only fields (parses as UTC midnight, shifts day in Central browser) | `parseLocalDate(dateStr)` (see `contact-lookup-details.tsx`) |

The shared signature of these bugs: a `Date` object that crosses a zone boundary silently. Whenever you see `new Date(...)` near an MP read/write, ask "what zone is this assumed to be in, and what zone is the caller expecting back?"

## Known anti-pattern sites (follow-up)

These work today only by coincidence (consistent-drift, or because our users happen to browse from Central). Worth a separate pass to migrate them to `parseMpDatetime` / `Intl.DateTimeFormat({ timeZone })` for correctness:

- `src/services/dashboardService.ts:574-575, 1078` — group/event date range comparisons. Both sides of the comparison currently drift the same way (UTC midnight on Docker), so the relative comparison is preserved. Real fix would `parseMpDatetime` the MP value AND build the loop boundaries via MP-TZ; for now leave as-is.
- `src/services/dashboardService.ts:1579` — DOB age comparison. Works for ~99% of cases; edge case for someone whose DOB date is "today" in Central but "yesterday" in UTC.
- `src/components/contact-logs/contact-logs.tsx:54` — `formatDateTime` uses `new Date(mpString).toLocaleDateString(...)`. Works for Central-locale browsers; would shift for users in other zones.

## Testing

When a test exercises code that goes through `mp-datetime`:

1. **Run tests under multiple `TZ` env vars** — at minimum `TZ=UTC` and `TZ=America/Los_Angeles`. The original drift bugs were invisible when the dev machine, server, and MP domain were all in the same zone. The `mp-datetime.test.ts` suite already covers this.
2. **No special mocking is needed** — `mp-datetime` is a pure function module hard-coded to `America/Chicago`. Mock the function itself (`vi.mock`) only when the test needs to bypass real conversions (rare).
3. **Round-trip checks catch the per-edit drift bug**: parse → re-serialize → parse → re-serialize should return the original string verbatim. See the regression test in `mp-datetime.test.ts`.
