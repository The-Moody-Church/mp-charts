import { describe, it, expect } from "vitest";
import { searchByName, searchByNameFlat, soundex, normalizeApostrophes } from "./processing-utils";

/** Helper to create a wrapped name record for searchByName. */
function person(first: string, last: string, nickname: string | null = null) {
  return {
    info: { First_Name: first, Nickname: nickname, Last_Name: last },
  };
}

/** Helper to create a flat name record for searchByNameFlat. */
function flatPerson(first: string, last: string, nickname: string | null = null) {
  return { First_Name: first, Nickname: nickname, Last_Name: last };
}

describe("soundex", () => {
  it("maps phonetically similar names to the same code", () => {
    expect(soundex("Jon")).toBe("J500");
    expect(soundex("Jonny")).toBe("J500");
    expect(soundex("Johnny")).toBe("J500");
  });

  it("distinguishes different-sounding names", () => {
    expect(soundex("Jon")).not.toBe(soundex("Huff"));
  });

  it("handles empty string", () => {
    expect(soundex("")).toBe("");
  });

  it("matches Catherine/Katherine via digit comparison", () => {
    // First letter differs but digit portion is the same
    expect(soundex("Catherine").slice(1)).toBe(soundex("Katherine").slice(1));
  });
});

describe("normalizeApostrophes", () => {
  it("strips curly quotes and modifier letters", () => {
    expect(normalizeApostrophes("O\u2019Brien")).toBe("OBrien");
    expect(normalizeApostrophes("O'Brien")).toBe("OBrien");
  });
});

describe("searchByName", () => {
  const items = [
    person("Jonny", "Huff"),
    person("John", "Huff"),
    person("Jon", "Smith"),
    person("Alice", "Johnson"),
    person("Jon", "Huff"),
  ];

  it("returns all items when query is empty", () => {
    expect(searchByName(items, "")).toHaveLength(items.length);
  });

  it("ranks exact name match highest for multi-word search", () => {
    const results = searchByName(items, "Jon Huff");
    const names = results.map(r => `${r.info.First_Name} ${r.info.Last_Name}`);

    // "Jon Huff" should be first (exact first + exact last)
    expect(names[0]).toBe("Jon Huff");
  });

  it("ranks starts-with match above soundex-only match", () => {
    const results = searchByName(items, "Jon Huff");
    const names = results.map(r => `${r.info.First_Name} ${r.info.Last_Name}`);

    // "Jonny Huff" starts with "Jon" → higher than "John Huff" (soundex only)
    const jonnyIdx = names.indexOf("Jonny Huff");
    const johnIdx = names.indexOf("John Huff");
    expect(jonnyIdx).toBeLessThan(johnIdx);
  });

  it("filters out non-matching names", () => {
    const results = searchByName(items, "Jon Huff");
    const names = results.map(r => `${r.info.First_Name} ${r.info.Last_Name}`);
    expect(names).not.toContain("Alice Johnson");
  });

  it("handles single-word search", () => {
    const results = searchByName(items, "Huff");
    // Should find both Huffs
    expect(results.length).toBeGreaterThanOrEqual(2);
    const lastNames = results.map(r => r.info.Last_Name);
    expect(lastNames.every(n => n === "Huff")).toBe(true);
  });

  it("ranks exact single-word match above starts-with", () => {
    const items2 = [
      person("Jonathan", "Doe"),
      person("Jon", "Doe"),
      person("Jonny", "Doe"),
    ];
    const results = searchByName(items2, "Jon");
    // Exact match "Jon" should be first
    expect(results[0].info.First_Name).toBe("Jon");
  });

  it("includes soundex matches for phonetically similar names", () => {
    const results = searchByName(items, "John Huff");
    const names = results.map(r => `${r.info.First_Name} ${r.info.Last_Name}`);
    // "John Huff" is exact, but "Jonny Huff" should also appear (soundex match on first name)
    expect(names).toContain("John Huff");
    expect(names).toContain("Jonny Huff");
  });

  it("handles null nickname without crashing", () => {
    const items2 = [
      person("Jon", "Huff", null),
      person("Jane", "Doe", null),
    ];
    expect(() => searchByName(items2, "Jon")).not.toThrow();
    const results = searchByName(items2, "Jon");
    expect(results[0].info.First_Name).toBe("Jon");
  });

  it("uses nickname for matching", () => {
    const items2 = [
      person("Jonathan", "Huff", "Jon"),
      person("Robert", "Huff", null),
    ];
    const results = searchByName(items2, "Jon");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].info.First_Name).toBe("Jonathan");
  });

  it("tiebreaks alphabetically by last name then first name", () => {
    const items2 = [
      person("Zara", "Smith"),
      person("Alice", "Smith"),
      person("Alice", "Adams"),
    ];
    const results = searchByName(items2, "a");
    // Both match on "a" in first name. Adams < Smith for last name.
    const firstResult = results[0];
    expect(firstResult.info.Last_Name).toBe("Adams");
  });
});

describe("searchByNameFlat", () => {
  it("produces the same ordering as searchByName for equivalent data", () => {
    const wrappedItems = [
      person("Jonny", "Huff"),
      person("John", "Huff"),
      person("Jon", "Huff"),
    ];
    const flatItems = [
      flatPerson("Jonny", "Huff"),
      flatPerson("John", "Huff"),
      flatPerson("Jon", "Huff"),
    ];

    const wrappedResults = searchByName(wrappedItems, "Jon Huff");
    const flatResults = searchByNameFlat(flatItems, "Jon Huff");

    expect(flatResults.map(r => r.First_Name)).toEqual(
      wrappedResults.map(r => r.info.First_Name)
    );
  });

  it("returns all items for empty query", () => {
    const items = [flatPerson("Jon", "Huff"), flatPerson("Jane", "Doe")];
    expect(searchByNameFlat(items, "")).toHaveLength(2);
  });

  it("filters and ranks correctly", () => {
    const items = [
      flatPerson("John", "Huff"),
      flatPerson("Jonny", "Huff"),
      flatPerson("Alice", "Jones"),
    ];
    const results = searchByNameFlat(items, "Jon Huff");
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Jonny starts with "Jon" → should rank above John (soundex only)
    expect(results[0].First_Name).toBe("Jonny");
  });
});
