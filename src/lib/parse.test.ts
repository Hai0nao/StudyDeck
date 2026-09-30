import { describe, expect, it } from "vitest";
import { parseAiReply, parseCards } from "./parse";

describe("parseCards", () => {
  it("auto-detects tabs, dashes and colons", () => {
    const cards = parseCards("apple\tquả táo\nbook - quyển sách\npen: bút");
    expect(cards).toEqual([
      { term: "apple", def: "quả táo" },
      { term: "book", def: "quyển sách" },
      { term: "pen", def: "bút" },
    ]);
  });

  it("keeps hyphenated words intact in auto mode", () => {
    expect(parseCards("well-known - nổi tiếng")[0]).toEqual({
      term: "well-known",
      def: "nổi tiếng",
    });
  });

  it("supports custom separators", () => {
    const cards = parseCards("a|1;;b|2", {
      termSep: "custom",
      customTermSep: "|",
      cardSep: "custom",
      customCardSep: ";;",
    });
    expect(cards).toEqual([
      { term: "a", def: "1" },
      { term: "b", def: "2" },
    ]);
  });

  it("keeps lines without a separator as term-only cards", () => {
    expect(parseCards("serendipity")).toEqual([{ term: "serendipity", def: "" }]);
  });
});

describe("parseAiReply", () => {
  it("reads fenced JSON with chatter around it", () => {
    const reply =
      'Sure! Here you go:\n```json\n{"title":"Food","cards":[{"term":"rice","definition":"cơm"}]}\n```\nEnjoy.';
    expect(parseAiReply(reply)).toEqual({ title: "Food", cards: [{ term: "rice", def: "cơm" }] });
  });

  it("reads a bare array with front/back keys", () => {
    expect(parseAiReply('[{"front":"a","back":"b"}]').cards).toEqual([{ term: "a", def: "b" }]);
  });

  it("falls back to bulleted text lines", () => {
    expect(parseAiReply("1. cat - con mèo\n- dog – con chó").cards).toEqual([
      { term: "cat", def: "con mèo" },
      { term: "dog", def: "con chó" },
    ]);
  });
});
