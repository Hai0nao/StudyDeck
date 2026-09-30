import { describe, expect, it } from "vitest";
import { fromLegacy, newSrs, previewIntervals, Rating, review } from "./srs";
import { DAY } from "./time";

const opts = { retention: 0.9, maxIntervalDays: 365 };
const now = new Date("2026-01-10T10:00:00Z").getTime();

describe("srs", () => {
  it("new cards start in state New and are due now", () => {
    const s = newSrs(now);
    expect(s.state).toBe(0);
    expect(s.due).toBe(now);
  });

  it("orders intervals Again < Hard < Good < Easy", () => {
    const p = previewIntervals(newSrs(now), opts, now);
    expect(p[Rating.Again]).toBeLessThan(p[Rating.Hard]);
    expect(p[Rating.Hard]).toBeLessThanOrEqual(p[Rating.Good]);
    expect(p[Rating.Good]).toBeLessThan(p[Rating.Easy]);
  });

  it("grows the interval after repeated Good reviews", () => {
    let s = newSrs(now);
    let t = now;
    const gaps: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = review(s, Rating.Good, opts, t);
      gaps.push(s.due - t);
      t = s.due;
    }
    expect(gaps[4]).toBeGreaterThan(gaps[2]);
    expect(s.state).toBe(2);
  });

  it("keeps the due date of migrated StudyDeck 2 cards", () => {
    const due = now + 3 * DAY;
    const s = fromLegacy({ lvl: 2, added: now - 10 * DAY, due }, now);
    expect(s.due).toBe(due);
    expect(s.state).toBe(2);
    // and the migrated card can be reviewed without errors
    expect(review(s, Rating.Good, opts, due).due).toBeGreaterThan(due);
  });

  it("treats level-0 legacy cards as new", () => {
    expect(fromLegacy({ lvl: 0, due: now }, now).state).toBe(0);
  });
});
