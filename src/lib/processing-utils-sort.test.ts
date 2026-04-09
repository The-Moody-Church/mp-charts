import { describe, it, expect } from "vitest";
import { sortCards, type ProcessingSortOption } from "@/lib/processing-utils";
import type { BaseCardData, BasePersonInfo } from "@/lib/dto/processing-shared";

function makeCard(
  lastName: string,
  firstName: string,
  completedCount: number,
  totalCount: number,
): BaseCardData<BasePersonInfo> {
  return {
    info: {
      Contact_ID: 1,
      Participant_ID: 1,
      First_Name: firstName,
      Nickname: null,
      Last_Name: lastName,
      Image_GUID: null,
      Group_Participant_ID: null,
      Start_Date: null,
    },
    checklist: [],
    completedCount,
    totalCount,
  };
}

describe("sortCards", () => {
  const cards = [
    makeCard("Smith", "John", 3, 5),
    makeCard("Adams", "Alice", 1, 5),
    makeCard("Baker", "Bob", 5, 5),
    makeCard("Adams", "Zara", 2, 5),
  ];

  it("sorts by last name (A-Z) with first name tiebreaker", () => {
    const result = sortCards(cards, "name");
    expect(result.map((c) => c.info.Last_Name)).toEqual([
      "Adams",
      "Adams",
      "Baker",
      "Smith",
    ]);
    expect(result[0].info.First_Name).toBe("Alice");
    expect(result[1].info.First_Name).toBe("Zara");
  });

  it("sorts by most completed first with last name tiebreaker", () => {
    const result = sortCards(cards, "most-completed");
    expect(result.map((c) => c.completedCount)).toEqual([5, 3, 2, 1]);
  });

  it("sorts by least completed first with last name tiebreaker", () => {
    const result = sortCards(cards, "least-completed");
    expect(result.map((c) => c.completedCount)).toEqual([1, 2, 3, 5]);
  });

  it("uses last name as tiebreaker for milestone sorts", () => {
    const tied = [
      makeCard("Zane", "A", 3, 5),
      makeCard("Adams", "B", 3, 5),
    ];
    const mostResult = sortCards(tied, "most-completed");
    expect(mostResult.map((c) => c.info.Last_Name)).toEqual(["Adams", "Zane"]);

    const leastResult = sortCards(tied, "least-completed");
    expect(leastResult.map((c) => c.info.Last_Name)).toEqual([
      "Adams",
      "Zane",
    ]);
  });

  it("does not mutate the original array", () => {
    const original = [...cards];
    sortCards(cards, "most-completed");
    expect(cards).toEqual(original);
  });

  it("returns empty array for empty input", () => {
    expect(sortCards([], "name")).toEqual([]);
  });
});
