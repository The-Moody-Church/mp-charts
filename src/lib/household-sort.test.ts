import { describe, it, expect } from "vitest";
import { sortHouseholdMembers, type HouseholdSortable } from "@/lib/household-sort";

/**
 * Extracted from a `setFamilyMembers(...)` callback in contact-lookup-details,
 * where it was unreachable by any test. These pin the ordering that was already
 * shipping, so the extraction is provably behavior-preserving.
 */
describe("sortHouseholdMembers", () => {
  const member = (
    Contact_ID: number,
    Household_Position_ID: number | null,
    Date_of_Birth: string | null
  ): HouseholdSortable => ({ Contact_ID, Household_Position_ID, Date_of_Birth });

  const ids = (members: HouseholdSortable[]) => members.map((m) => m.Contact_ID);

  it("removes the contact whose card is being shown", () => {
    const result = sortHouseholdMembers(
      [member(1, 1, "1980-01-01"), member(2, 1, "1982-01-01")],
      1
    );

    expect(ids(result)).toEqual([2]);
  });

  it("orders by household position ascending", () => {
    const result = sortHouseholdMembers(
      [member(3, 3, null), member(1, 1, null), member(2, 2, null)],
      99
    );

    expect(ids(result)).toEqual([1, 2, 3]);
  });

  it("puts members with no household position last", () => {
    const result = sortHouseholdMembers(
      [member(1, null, null), member(2, 5, null), member(3, 1, null)],
      99
    );

    expect(ids(result)).toEqual([3, 2, 1]);
  });

  it("orders oldest first within the same position", () => {
    const result = sortHouseholdMembers(
      [member(1, 2, "2010-06-15"), member(2, 2, "2004-01-02"), member(3, 2, "2007-12-31")],
      99
    );

    expect(ids(result)).toEqual([2, 3, 1]);
  });

  it("sorts a member with no birthday after one who has it, within a position", () => {
    const result = sortHouseholdMembers(
      [member(1, 2, null), member(2, 2, "2010-06-15")],
      99
    );

    expect(ids(result)).toEqual([2, 1]);
  });

  it("treats two members with no birthday as equal", () => {
    const result = sortHouseholdMembers([member(1, 2, null), member(2, 2, null)], 99);

    expect(ids(result)).toEqual([1, 2]);
  });

  it("compares MP date strings without parsing them, so no timezone shift applies", () => {
    // Same calendar day either side of a DST boundary; a Date-based compare in a
    // UTC container is where CLAUDE.md's timezone hazard would bite.
    const result = sortHouseholdMembers(
      [member(1, 1, "2010-03-14"), member(2, 1, "2010-03-13")],
      99
    );

    expect(ids(result)).toEqual([2, 1]);
  });

  it("does not mutate the input array", () => {
    const input = [member(3, 3, null), member(1, 1, null)];
    const snapshot = ids(input);

    sortHouseholdMembers(input, 99);

    expect(ids(input)).toEqual(snapshot);
  });

  it("returns an empty list when the household holds only this contact", () => {
    expect(sortHouseholdMembers([member(1, 1, "1980-01-01")], 1)).toEqual([]);
  });
});
