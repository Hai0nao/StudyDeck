import { describe, expect, it } from "vitest";
import { convertLegacy, mergeData, parseBackup } from "./backup";
import { reminderIsDue } from "./reminders";

const legacy = {
  version: 2,
  folders: [{ id: "f1", name: "English", emoji: "📁", parent: null, created: 1 }],
  sets: [
    {
      id: "s1",
      title: "IELTS",
      desc: "band 7",
      folder: "f1",
      terms: [
        {
          id: "t1",
          term: "abate",
          def: "giảm bớt",
          m: 2,
          star: true,
          srs: { lvl: 3, added: 0, due: 5 },
        },
        { id: "t2", term: "brisk", def: "nhanh nhẹn" },
      ],
    },
  ],
  stats: { days: { "2026-09-01": { n: 12, ok: 9 } } },
};

describe("backup", () => {
  it("converts a StudyDeck 2 backup", () => {
    const data = parseBackup(JSON.stringify(legacy));
    expect(data.folders[0]).toMatchObject({ id: "f1", name: "English", parentId: null });
    const s = data.sets[0];
    expect(s).toMatchObject({ id: "s1", title: "IELTS", description: "band 7", folderId: "f1" });
    expect(s.cards[0]).toMatchObject({ term: "abate", star: true, learn: 2 });
    expect(s.cards[0].srs.state).toBe(2);
    expect(s.cards[1].srs.state).toBe(0);
    expect(data.days["2026-09-01"]).toEqual({ answers: 12, correct: 9, newCards: 0 });
  });

  it("round-trips a StudyDeck 3 backup", () => {
    const data = convertLegacy(legacy);
    const again = parseBackup(JSON.stringify({ app: "studydeck", version: 3, ...data }));
    expect(again.sets[0].cards).toHaveLength(2);
  });

  it("rejects unrelated files", () => {
    expect(() => parseBackup('{"hello":1}')).toThrow();
  });

  it("merges without clobbering existing ids", () => {
    const a = convertLegacy(legacy);
    const merged = mergeData(a, convertLegacy(legacy));
    expect(merged.sets).toHaveLength(2);
    expect(new Set(merged.sets.map((s) => s.id)).size).toBe(2);
    // the copied set follows its copied folder
    const copiedFolder = merged.folders[1].id;
    expect(copiedFolder).not.toBe("f1");
    expect(merged.sets[1].folderId).toBe(copiedFolder);
  });
});

describe("reminderIsDue", () => {
  const at = (h: number, m: number) => new Date(2026, 8, 30, h, m);
  it("fires once after the chosen time", () => {
    expect(reminderIsDue("20:00", null, at(19, 59))).toBe(false);
    expect(reminderIsDue("20:00", null, at(20, 1))).toBe(true);
    expect(reminderIsDue("20:00", "2026-09-30", at(21, 0))).toBe(false);
  });
});
