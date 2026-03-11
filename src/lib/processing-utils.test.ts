import { describe, it, expect } from "vitest";
import { searchByName, searchByNameFlat, soundex, soundexMatch, levenshtein, normalizeApostrophes } from "./processing-utils";

/** Helper to create a wrapped name record for searchByName. */
function person(first: string, last: string, nickname: string | null = null) {
  return {
    info: { First_Name: first, Nickname: nickname, Last_Name: last },
  };
}

/** Helper to create a flat name record for searchByNameFlat. */
function flatPerson(first: string, last: string, nickname: string | null = null, email: string | null = null, phone: string | null = null) {
  return { First_Name: first, Nickname: nickname, Last_Name: last, Email_Address: email, Mobile_Phone: phone };
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

describe("soundexMatch", () => {
  it("matches same first letter with same digits (Jon/John)", () => {
    expect(soundexMatch("Jon", "John")).toBe(true);
  });

  it("matches equivalent first-letter groups (Catherine/Katherine)", () => {
    expect(soundexMatch("Catherine", "Katherine")).toBe(true);
  });

  it("matches equivalent first-letter groups (Filip/Philip)", () => {
    expect(soundexMatch("Filip", "Philip")).toBe(true);
  });

  it("rejects different first-letter groups even with same digits (Huff/Sophia)", () => {
    expect(soundexMatch("Huff", "Sophia")).toBe(false);
  });

  it("rejects completely different names", () => {
    expect(soundexMatch("Jon", "Huff")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(soundexMatch("", "Jon")).toBe(false);
    expect(soundexMatch("Jon", "")).toBe(false);
  });
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("guerra", "guerra")).toBe(0);
  });

  it("returns 1 for single substitution (huerra → guerra)", () => {
    expect(levenshtein("huerra", "guerra")).toBe(1);
  });

  it("returns 1 for single insertion", () => {
    expect(levenshtein("huf", "huff")).toBe(1);
  });

  it("returns 1 for single deletion", () => {
    expect(levenshtein("hufff", "huff")).toBe(1);
  });

  it("returns full length for empty vs non-empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
});

describe("searchByName — fuzzy matching", () => {
  it("matches misspelling 'huerra' to 'Guerra' (edit distance 1)", () => {
    const items = [
      person("Sophia", "Guerra"),
      person("Alice", "Brown"),
    ];
    const results = searchByName(items, "huerra");
    expect(results.length).toBe(1);
    expect(results[0].info.Last_Name).toBe("Guerra");
  });

  it("matches multi-word misspelling 'Sofía Huerra' to 'Sophia Guerra'", () => {
    const items = [
      person("Sophia", "Guerra"),
      person("Alice", "Brown"),
    ];
    const results = searchByName(items, "Sofía Huerra");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].info.First_Name).toBe("Sophia");
  });

  it("does not match when edit distance is too large", () => {
    const items = [
      person("Sophia", "Guerra"),
    ];
    const results = searchByName(items, "xxxxxx");
    expect(results.length).toBe(0);
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

  it("does not false-positive Soundex on unrelated names (Huff vs Sophia)", () => {
    const items2 = [
      person("Sophia", "Guerra"),
      person("Jude", "Huff"),
    ];
    const results = searchByName(items2, "huff");
    const names = results.map(r => `${r.info.First_Name} ${r.info.Last_Name}`);
    expect(names).toContain("Jude Huff");
    expect(names).not.toContain("Sophia Guerra");
  });

  it("still matches Catherine/Katherine via Soundex first-letter equivalence", () => {
    const items2 = [
      person("Catherine", "Smith"),
      person("Katherine", "Jones"),
      person("Alice", "Brown"),
    ];
    const results = searchByName(items2, "Katherine");
    const names = results.map(r => r.info.First_Name);
    expect(names).toContain("Catherine");
    expect(names).toContain("Katherine");
    expect(names).not.toContain("Alice");
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

  it("handles 'Last, First' comma convention", () => {
    const items2 = [
      person("Jon", "Huff"),
      person("Jonny", "Huff"),
      person("Jon", "Smith"),
    ];
    const results = searchByName(items2, "Huff, Jon");
    const names = results.map(r => `${r.info.First_Name} ${r.info.Last_Name}`);
    // "Jon Huff" should be first (exact last + exact first)
    expect(names[0]).toBe("Jon Huff");
    // "Jonny Huff" should rank above "Jon Smith" (last name match)
    const jonnyIdx = names.indexOf("Jonny Huff");
    const jonSmithIdx = names.indexOf("Jon Smith");
    expect(jonnyIdx).toBeLessThan(jonSmithIdx);
  });

  it("tries both 'First Last' and 'Last First' without comma", () => {
    const items2 = [
      person("Jonny", "Huff"),
      person("Dixie", "Jonas"),
    ];
    const results = searchByName(items2, "Huff Jon");
    const names = results.map(r => `${r.info.First_Name} ${r.info.Last_Name}`);
    // "Jonny Huff" should rank first — last=Huff exact, first starts with Jon
    expect(names[0]).toBe("Jonny Huff");
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

describe("searchByNameFlat — email matching", () => {
  it("matches exact email address", () => {
    const items = [
      flatPerson("Jon", "Huff", null, "jon@example.com"),
      flatPerson("Jane", "Doe", null, "jane@example.com"),
    ];
    const results = searchByNameFlat(items, "jon@example.com");
    expect(results).toHaveLength(1);
    expect(results[0].First_Name).toBe("Jon");
  });

  it("matches email local part", () => {
    const items = [
      flatPerson("Jon", "Huff", null, "jhuff@example.com"),
      flatPerson("Jane", "Doe", null, "jdoe@example.com"),
    ];
    const results = searchByNameFlat(items, "jhuff");
    expect(results).toHaveLength(1);
    expect(results[0].First_Name).toBe("Jon");
  });

  it("matches partial email (contains)", () => {
    const items = [
      flatPerson("Jon", "Huff", null, "jonathan.huff@church.org"),
      flatPerson("Jane", "Doe", null, "jane.doe@church.org"),
    ];
    const results = searchByNameFlat(items, "huff@church");
    expect(results).toHaveLength(1);
    expect(results[0].First_Name).toBe("Jon");
  });

  it("name matches rank higher than email matches", () => {
    const items = [
      flatPerson("Alice", "Smith", null, "jon@example.com"),
      flatPerson("Jon", "Huff", null, "alice@example.com"),
    ];
    const results = searchByNameFlat(items, "jon");
    expect(results[0].First_Name).toBe("Jon"); // name match outranks email match
  });
});

describe("searchByNameFlat — phone matching", () => {
  it("matches full phone number", () => {
    const items = [
      flatPerson("Jon", "Huff", null, null, "312-555-1234"),
      flatPerson("Jane", "Doe", null, null, "312-555-5678"),
    ];
    const results = searchByNameFlat(items, "3125551234");
    expect(results).toHaveLength(1);
    expect(results[0].First_Name).toBe("Jon");
  });

  it("matches last 7 digits of phone", () => {
    const items = [
      flatPerson("Jon", "Huff", null, null, "1-312-555-1234"),
      flatPerson("Jane", "Doe", null, null, "1-312-555-5678"),
    ];
    const results = searchByNameFlat(items, "555-1234");
    expect(results).toHaveLength(1);
    expect(results[0].First_Name).toBe("Jon");
  });

  it("matches partial phone digits", () => {
    const items = [
      flatPerson("Jon", "Huff", null, null, "312-555-1234"),
      flatPerson("Jane", "Doe", null, null, "312-555-5678"),
    ];
    const results = searchByNameFlat(items, "1234");
    expect(results).toHaveLength(1);
    expect(results[0].First_Name).toBe("Jon");
  });

  it("ignores phone matching for queries with fewer than 3 digits", () => {
    const items = [
      flatPerson("Jon", "Huff", null, null, "312-555-1234"),
    ];
    const results = searchByNameFlat(items, "12");
    // Should not match on phone (too few digits), but may match name
    expect(results).toHaveLength(0);
  });

  it("handles formatted phone queries", () => {
    const items = [
      flatPerson("Jon", "Huff", null, null, "3125551234"),
    ];
    const results = searchByNameFlat(items, "(312) 555-1234");
    expect(results).toHaveLength(1);
    expect(results[0].First_Name).toBe("Jon");
  });
});
