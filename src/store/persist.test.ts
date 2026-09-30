// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useStore } from "./useStore";

describe("persisted data", () => {
  it("keeps data saved by an older version and fills in new fields", async () => {
    localStorage.setItem(
      "studydeck.v3",
      JSON.stringify({
        version: 1,
        state: {
          sets: [
            {
              id: "s1",
              title: "Old set",
              description: "",
              folderId: null,
              termLang: "",
              defLang: "",
              createdAt: 1,
              updatedAt: 2,
              studiedAt: null,
              matchBest: null,
              cards: [
                {
                  id: "c1",
                  term: "a",
                  def: "b",
                  star: false,
                  learn: 0,
                  seen: 0,
                  correct: 0,
                  wrong: 0,
                  createdAt: 1,
                  srs: {
                    due: 0,
                    stability: 0,
                    difficulty: 0,
                    elapsed_days: 0,
                    scheduled_days: 0,
                    learning_steps: 0,
                    reps: 0,
                    lapses: 0,
                    state: 0,
                    last_review: null,
                  },
                },
              ],
            },
          ],
          folders: [{ id: "f1", name: "F", parentId: null, createdAt: 5 }],
          days: { "2026-09-30": { answers: 3, correct: 2, newCards: 1 } },
        },
      }),
    );
    await useStore.persist.rehydrate();
    const st = useStore.getState();
    expect(st.sets.map((s) => s.title)).toEqual(["Old set"]);
    expect(st.sets[0].modifiedAt).toBe(2);
    expect(st.sets[0].cards[0].modifiedAt).toBe(1);
    expect(st.folders[0].modifiedAt).toBe(5);
    expect(st.days["2026-09-30"].answers).toBe(3);
    // data from before sync must be uploaded on first sign-in
    expect(st.needsFullPush).toBe(true);
  });
});
