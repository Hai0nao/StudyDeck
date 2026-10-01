import { beforeEach, describe, expect, it } from "vitest";
import { makeCard, makeSet } from "@/store/defaults";
import { referencedImages, useStore } from "@/store/useStore";
import { buildChoices, canType, hasSide } from "./quiz";

const card = (term: string, def: string, defImage: string | null = null) => ({
  ...makeCard(term, def, 0, { defImage }),
  id: term,
});

describe("cards with images", () => {
  it("treats an image-only side as present but not typeable", () => {
    const c = card("dog", "", "img_dog");
    expect(hasSide(c, "def")).toBe(true);
    expect(canType(c, "def")).toBe(false);
    expect(hasSide(card("x", ""), "def")).toBe(false);
  });

  it("offers image-only answers as distinct choices, never duplicates", () => {
    const pool = [
      card("dog", "", "img_dog"),
      card("cat", "", "img_cat"),
      card("cow", "", "img_cow"),
      card("dog2", "", "img_dog"), // same picture as "dog"
      card("empty", ""), // nothing to show → never a choice
    ];
    for (let i = 0; i < 20; i++) {
      const ids = buildChoices(pool[0], pool, "def");
      expect(ids).toContain("dog");
      expect(ids).not.toContain("dog2");
      expect(ids).not.toContain("empty");
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("saving cards with images", () => {
  beforeEach(() =>
    useStore.setState({
      sets: [makeSet({ id: "s", cards: [card("dog", "chó")] })],
      dirty: {},
      tombstones: {},
    }),
  );

  it("adding an image to an existing card keeps its progress but marks it changed", () => {
    const before = useStore.getState().sets[0].cards[0];
    useStore.getState().saveCards("s", [{ id: "dog", term: "dog", def: "chó", defImage: "img_1" }]);
    const after = useStore.getState().sets[0].cards[0];
    expect(after.defImage).toBe("img_1");
    expect(after.srs).toEqual(before.srs);
    expect(useStore.getState().dirty["card:dog"]).toBeDefined();
    expect(referencedImages(useStore.getState().sets)).toEqual(new Set(["img_1"]));
  });

  it("creates image-only cards", () => {
    const id = useStore
      .getState()
      .createSet({ title: "Pics" }, [{ term: "", def: "", termImage: "img_a" }]);
    const s = useStore.getState().sets.find((x) => x.id === id)!;
    expect(s.cards[0].termImage).toBe("img_a");
  });
});
