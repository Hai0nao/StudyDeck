import { beforeEach, describe, expect, it } from "vitest";
import { makeCard, makeSet } from "@/store/defaults";
import { combinedDays, useStore } from "@/store/useStore";
import type { StudySet } from "@/store/types";
import { buildPush, chunkPush, toRemoteChanges, type PushPayload } from "./payload";

/** Turn an upload into the rows another device would pull. */
function asPulled(p: PushPayload) {
  return toRemoteChanges({
    folders: p.folders,
    sets: p.sets,
    cards: p.cards,
    days: p.days,
    settings: p.settings,
  });
}

function reset(sets: StudySet[] = []) {
  useStore.setState({
    sets,
    folders: [],
    days: {},
    dirty: {},
    tombstones: {},
    needsFullPush: false,
    remoteDays: {},
    settingsModifiedAt: 0,
  });
}

const deviceA = () => {
  const set = makeSet({
    id: "s1",
    title: "Words",
    modifiedAt: 100,
    cards: [
      { ...makeCard("one", "một"), id: "c1", modifiedAt: 100 },
      { ...makeCard("two", "hai"), id: "c2", modifiedAt: 100 },
    ],
  });
  return set;
};

describe("sync payloads", () => {
  beforeEach(() => reset());

  it("full push uploads every entity and settings", () => {
    reset([deviceA()]);
    const p = buildPush(useStore.getState(), "dev-a", null, true);
    expect(p.sets.map((s) => s.id)).toEqual(["s1"]);
    expect(p.sets[0].data?.cardIds).toEqual(["c1", "c2"]);
    expect(p.cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(p.settings).not.toBeNull();
  });

  it("incremental push only carries dirty entities and deletions", () => {
    reset([deviceA()]);
    useStore.getState().toggleStar("s1", "c2");
    const st = useStore.getState();
    const p = buildPush(st, "dev-a", "2026-01-01", false);
    expect(p.cards.map((c) => c.id)).toEqual(["c2"]);
    expect(p.sets).toHaveLength(0);

    useStore.getState().deleteSet("s1");
    const q = buildPush(useStore.getState(), "dev-a", "2026-01-01", false);
    expect(q.sets).toEqual([expect.objectContaining({ id: "s1", deleted: true })]);
    expect(
      q.cards
        .filter((c) => c.deleted)
        .map((c) => c.id)
        .sort(),
    ).toEqual(["c1", "c2"]);
  });

  it("clears change markers once uploaded", () => {
    reset([deviceA()]);
    useStore.getState().toggleStar("s1", "c1");
    const p = buildPush(useStore.getState(), "dev-a", null, false);
    useStore.getState().markPushed(p.stamps);
    expect(useStore.getState().dirty).toEqual({});
  });

  it("splits large uploads into chunks", () => {
    const cards = Array.from({ length: 950 }, (_, i) => ({
      ...makeCard(`t${i}`, "d"),
      id: `c${i}`,
    }));
    reset([makeSet({ id: "big", cards })]);
    const chunks = chunkPush(buildPush(useStore.getState(), "dev", null, true), 400);
    expect(chunks.map((c) => c.cards.length)).toEqual([400, 400, 150]);
    expect(chunks[0].sets).toHaveLength(1);
    expect(chunks[1].sets).toHaveLength(0);
  });
});

describe("applying remote changes", () => {
  beforeEach(() => reset());

  it("adds a set from another device with its cards in order", () => {
    reset([deviceA()]);
    const pulled = asPulled(buildPush(useStore.getState(), "dev-a", null, true));
    reset([]);
    useStore.getState().applyRemote(pulled, "dev-b");
    const s = useStore.getState().sets[0];
    expect(s.title).toBe("Words");
    expect(s.cards.map((c) => c.term)).toEqual(["one", "two"]);
  });

  it("keeps the newer copy when both devices changed a card", () => {
    const local = deviceA();
    local.cards[0] = { ...local.cards[0], term: "ONE (newer)", modifiedAt: 500 };
    reset([local]);
    const remote = deviceA();
    remote.cards[0] = { ...remote.cards[0], term: "one (older)", modifiedAt: 300 };
    const pulled = asPulled(
      buildPush({ ...useStore.getState(), sets: [remote] }, "dev-a", null, true),
    );
    useStore.getState().applyRemote(pulled, "dev-b");
    expect(useStore.getState().sets[0].cards[0].term).toBe("ONE (newer)");
  });

  it("applies deletions from another device", () => {
    reset([deviceA()]);
    const pulled = toRemoteChanges({
      folders: [],
      sets: [],
      cards: [{ id: "c1", set_id: "s1", data: null, modified_at: 200, deleted: true }],
      days: [],
      settings: null,
    });
    useStore.getState().applyRemote(pulled, "dev-b");
    expect(useStore.getState().sets[0].cards.map((c) => c.id)).toEqual(["c2"]);
  });

  it("does not resurrect something deleted locally", () => {
    reset([deviceA()]);
    useStore.getState().deleteSet("s1");
    const stale = asPulled(
      buildPush({ ...useStore.getState(), sets: [deviceA()] }, "x", null, true),
    );
    useStore.getState().applyRemote(stale, "dev-b");
    expect(useStore.getState().sets).toHaveLength(0);
  });

  it("adds up daily stats from other devices", () => {
    useStore.getState().applyRemote(
      toRemoteChanges({
        folders: [],
        sets: [],
        cards: [],
        days: [
          { device_id: "phone", day: "2026-10-01", answers: 5, correct: 4, new_cards: 2 },
          { device_id: "me", day: "2026-10-01", answers: 99, correct: 99, new_cards: 99 },
        ],
        settings: null,
      }),
      "me",
    );
    const st = useStore.getState();
    const days = combinedDays(
      { "2026-10-01": { answers: 3, correct: 3, newCards: 1 } },
      st.remoteDays,
    );
    expect(days["2026-10-01"]).toEqual({ answers: 8, correct: 7, newCards: 3 });
  });
});
