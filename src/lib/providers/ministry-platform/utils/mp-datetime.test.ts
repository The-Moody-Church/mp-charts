import { describe, it, expect } from "vitest";
import { getMpTimezone, parseMpDatetime, toMpSqlDatetime } from "./mp-datetime";

describe("getMpTimezone", () => {
  it("returns America/Chicago", () => {
    expect(getMpTimezone()).toBe("America/Chicago");
  });
});

describe("toMpSqlDatetime", () => {
  it("treats a date-only string as MP-TZ midnight", () => {
    expect(toMpSqlDatetime("2026-05-17")).toBe("2026-05-17 00:00:00");
  });

  it("returns an already-SQL string unchanged", () => {
    expect(toMpSqlDatetime("2026-05-17 14:30:00")).toBe("2026-05-17 14:30:00");
  });

  it("treats a datetime-local string (no zone marker) as MP-TZ wall-clock", () => {
    expect(toMpSqlDatetime("2026-05-17T14:30")).toBe("2026-05-17 14:30:00");
    expect(toMpSqlDatetime("2026-05-17T14:30:45")).toBe("2026-05-17 14:30:45");
  });

  it("converts a UTC ISO instant to MP-TZ wall-clock", () => {
    // 2026-05-17 03:33:00 UTC is 2026-05-16 22:33:00 in America/Chicago (CDT, -05:00)
    expect(toMpSqlDatetime("2026-05-17T03:33:00.000Z")).toBe("2026-05-16 22:33:00");
  });

  it("converts an instant with explicit offset to MP-TZ wall-clock", () => {
    // 2026-05-17 03:33:00-04:00 == 2026-05-17 07:33:00 UTC == 2026-05-17 02:33:00 CDT
    expect(toMpSqlDatetime("2026-05-17T03:33:00-04:00")).toBe("2026-05-17 02:33:00");
  });

  it("converts a Date instance to MP-TZ wall-clock", () => {
    // 2026-01-15 12:00:00 UTC == 2026-01-15 06:00:00 CST (-06:00)
    const date = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(toMpSqlDatetime(date)).toBe("2026-01-15 06:00:00");
  });

  it("handles a winter (CST) instant correctly", () => {
    // 2026-01-15 03:00:00 UTC == 2026-01-14 21:00:00 CST
    expect(toMpSqlDatetime("2026-01-15T03:00:00.000Z")).toBe("2026-01-14 21:00:00");
  });

  it("throws on an unparseable string", () => {
    expect(() => toMpSqlDatetime("not-a-date")).toThrow();
  });
});

describe("parseMpDatetime", () => {
  it("parses a date-only string as MP-TZ midnight", () => {
    const result = parseMpDatetime("2026-05-17");
    // MP-TZ midnight on 2026-05-17 (CDT, -05:00) is 05:00 UTC
    expect(result.toISOString()).toBe("2026-05-17T05:00:00.000Z");
  });

  it("parses a SQL datetime string as MP-TZ wall-clock", () => {
    const result = parseMpDatetime("2026-05-17 14:30:00");
    // 2026-05-17 14:30 CDT == 19:30 UTC
    expect(result.toISOString()).toBe("2026-05-17T19:30:00.000Z");
  });

  it("parses an ISO-style string without zone marker as MP-TZ wall-clock", () => {
    const result = parseMpDatetime("2026-05-17T14:30:00");
    expect(result.toISOString()).toBe("2026-05-17T19:30:00.000Z");
  });

  it("parses a winter (CST) wall-clock correctly", () => {
    const result = parseMpDatetime("2026-01-15 09:00:00");
    // 2026-01-15 09:00 CST (-06:00) == 15:00 UTC
    expect(result.toISOString()).toBe("2026-01-15T15:00:00.000Z");
  });

  it("round-trips with toMpSqlDatetime for a wall-clock string", () => {
    const original = "2026-05-17 14:30:00";
    const instant = parseMpDatetime(original);
    expect(toMpSqlDatetime(instant)).toBe(original);
  });

  it("round-trips repeatedly without drift (regression for per-edit shift)", () => {
    // Simulates the contact-log edit cycle: parse → re-serialize → parse → re-serialize.
    // The original bug shifted the date by the server↔UTC offset on every cycle.
    let value = "2026-05-17 14:30:00";
    for (let i = 0; i < 5; i++) {
      const instant = parseMpDatetime(value);
      value = toMpSqlDatetime(instant);
    }
    expect(value).toBe("2026-05-17 14:30:00");
  });

  it("throws on an unparseable string", () => {
    expect(() => parseMpDatetime("not-a-date")).toThrow();
  });

  it("throws on a string with a zone marker (caller should pass to new Date instead)", () => {
    expect(() => parseMpDatetime("2026-05-17T03:33:00.000Z")).toThrow();
  });
});
