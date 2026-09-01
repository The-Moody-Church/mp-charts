/**
 * Ministry Platform datetime utilities.
 *
 * MP stores datetimes as wall-clock values in the domain's configured time zone (no UTC
 * normalization). For our deployment that zone is US Central (`America/Chicago`). Use these
 * helpers on every read/write path that crosses the MP boundary so the server's local TZ
 * (UTC in Docker) does not silently shift the value.
 *
 * Pattern reference: `.claude/references/ministryplatform.datetimehandling.md`
 *
 * Single-tenant note: the MP TZ is hard-coded to `America/Chicago`. If a non-Central
 * deployment is ever added, swap the constant for a dynamic read of
 * `MPHelper.getDomainInfo().TimeZoneName` (with a Windows → IANA map).
 */

const MP_TIMEZONE = "America/Chicago" as const;

/** Returns the IANA time zone MP wall-clock values are interpreted in. */
export function getMpTimezone(): string {
  return MP_TIMEZONE;
}

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/**
 * Given a UTC instant, return the ms offset of the supplied timeZone from UTC at that
 * instant (positive = ahead of UTC). This is the value you need to add to a wall-clock
 * built with `Date.UTC` to get the real UTC instant for that wall-clock in the zone.
 */
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const inTz = partsInTimeZone(new Date(utcMs), timeZone);
  const wallAsUtc = Date.UTC(inTz.year, inTz.month - 1, inTz.day, inTz.hour, inTz.minute, inTz.second);
  return wallAsUtc - utcMs;
}

/** Convert wall-clock components in `timeZone` to the corresponding UTC `Date`. */
function wallClockInTimeZoneToUtc(parts: DateParts, timeZone: string): Date {
  let utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let offset = timeZoneOffsetMs(utcGuess, timeZone);
  utcGuess -= offset;
  // One more pass to settle DST boundary ambiguity (the first guess may straddle the gap/overlap).
  offset = timeZoneOffsetMs(utcGuess, timeZone);
  utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - offset;
  return new Date(utcGuess);
}

function formatSql(parts: DateParts): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const SQL_DATETIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Convert a value into the SQL datetime string MP's `/tables/{table}/get` write paths
 * accept: `YYYY-MM-DD HH:MM:SS` interpreted as wall-clock in the MP time zone.
 *
 * Input behaviour:
 *
 * | Input                                | Treated as                                |
 * | ------------------------------------ | ----------------------------------------- |
 * | `"2026-05-17"`                       | MP-TZ midnight                            |
 * | `"2026-05-17 14:30:00"`              | already SQL, returned unchanged           |
 * | `"2026-05-17T14:30"` / `:14:30:00`   | MP-TZ wall-clock (no zone marker)         |
 * | `"2026-05-17T03:33:00.000Z"`         | UTC instant, converted to MP-TZ           |
 * | `"2026-05-17T03:33:00-04:00"`        | Instant at offset, converted to MP-TZ     |
 * | `Date` instance                      | UTC instant, converted to MP-TZ           |
 *
 * Rule of thumb: strings with no zone marker are wall-clock; strings/Dates with explicit
 * zone info are instants that get converted.
 */
export function toMpSqlDatetime(value: string | Date): string {
  if (value instanceof Date) {
    return formatSql(partsInTimeZone(value, MP_TIMEZONE));
  }

  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    return `${value} 00:00:00`;
  }

  if (SQL_DATETIME.test(value)) {
    return value;
  }

  const local = LOCAL_DATETIME.exec(value);
  if (local && !HAS_ZONE.test(value)) {
    const [, y, mo, d, h, mi, s] = local;
    const pad = (str: string | undefined) => (str ?? "00").padStart(2, "0");
    return `${y}-${mo}-${d} ${pad(h)}:${pad(mi)}:${pad(s)}`;
  }

  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`toMpSqlDatetime: cannot parse "${value}"`);
  }
  return formatSql(partsInTimeZone(instant, MP_TIMEZONE));
}

/**
 * Parse a wall-clock string returned by MP into a real `Date` instant by interpreting the
 * wall-clock components in the MP time zone. Use this when you need to do arithmetic on an
 * MP datetime (date diff, age calc, range membership). For display, prefer
 * `Intl.DateTimeFormat({ timeZone: getMpTimezone() })` against the raw string.
 *
 * Accepts MP's two on-the-wire shapes:
 *   - `"YYYY-MM-DD HH:MM:SS"` (datetime fields)
 *   - `"YYYY-MM-DD"` (date-only fields, treated as MP-TZ midnight)
 *
 * Throws if the input is neither shape.
 */
export function parseMpDatetime(value: string): Date {
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return wallClockInTimeZoneToUtc(
      { year: Number(y), month: Number(m), day: Number(d), hour: 0, minute: 0, second: 0 },
      MP_TIMEZONE,
    );
  }

  // MP can return datetimes in either `YYYY-MM-DD HH:MM:SS` or ISO-like `YYYY-MM-DDTHH:MM:SS`
  // depending on the endpoint shape — accept both with no zone marker.
  const sql = SQL_DATETIME.exec(value);
  const iso = LOCAL_DATETIME.exec(value);
  const match = sql ?? iso;
  if (match && !HAS_ZONE.test(value)) {
    const [, y, mo, d, h, mi, s] = match;
    return wallClockInTimeZoneToUtc(
      {
        year: Number(y),
        month: Number(mo),
        day: Number(d),
        hour: Number(h),
        minute: Number(mi),
        second: Number(s ?? 0),
      },
      MP_TIMEZONE,
    );
  }

  throw new Error(`parseMpDatetime: expected an MP wall-clock string, got "${value}"`);
}
