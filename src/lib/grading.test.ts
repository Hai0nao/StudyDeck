import { describe, expect, it } from "vitest";
import { gradeAnswer, levenshtein } from "./grading";

describe("gradeAnswer", () => {
  it("accepts exact answers regardless of case and punctuation", () => {
    expect(gradeAnswer("  Hello! ", "hello")).toBe("exact");
  });
  it("ignores leading articles when lenient", () => {
    expect(gradeAnswer("apple", "an apple")).toBe("exact");
    expect(gradeAnswer("apple", "an apple", false)).toBe("wrong");
  });
  it("accepts any one of several meanings", () => {
    expect(gradeAnswer("big", "large, big")).toBe("exact");
    expect(gradeAnswer("to run", "chạy; to run")).toBe("exact");
  });
  it("marks small typos as close", () => {
    expect(gradeAnswer("recieve", "receive")).toBe("close");
  });
  it("rejects wrong or empty answers", () => {
    expect(gradeAnswer("", "x")).toBe("wrong");
    expect(gradeAnswer("banana", "apple")).toBe("wrong");
  });
  it("keeps Vietnamese diacritics significant", () => {
    expect(gradeAnswer("ban", "bàn")).toBe("close");
    expect(gradeAnswer("bàn", "bàn")).toBe("exact");
  });
});

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
});
