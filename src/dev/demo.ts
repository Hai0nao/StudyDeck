import { dayKey, DAY } from "@/lib/time";
import { useStore } from "@/store/useStore";
import type { DayStat } from "@/store/types";

const IELTS: [string, string][] = [
  ["ubiquitous", "(adj.) present or found everywhere"],
  ["mitigate", "(v.) make something less severe or harmful"],
  ["resilient", "(adj.) able to recover quickly from difficulties"],
  ["meticulous", "(adj.) showing great attention to detail"],
  ["ambiguous", "(adj.) open to more than one interpretation"],
  ["candid", "(adj.) truthful and straightforward; frank"],
  ["deteriorate", "(v.) become progressively worse"],
  ["eloquent", "(adj.) fluent or persuasive in speaking or writing"],
  ["feasible", "(adj.) possible to do easily or conveniently"],
  ["inevitable", "(adj.) certain to happen; unavoidable"],
  ["pragmatic", "(adj.) dealing with things sensibly and realistically"],
  ["scrutinize", "(v.) examine or inspect closely and thoroughly"],
];
const KITCHEN: [string, string][] = [
  ["spatula", "cái xẻng lật"],
  ["ladle", "cái muôi"],
  ["whisk", "cái đánh trứng"],
  ["colander", "cái rổ lọc"],
  ["grater", "cái nạo"],
  ["tongs", "cái kẹp gắp"],
];
const KANA: [string, string][] = [
  ["あ", "a"],
  ["い", "i"],
  ["う", "u"],
  ["え", "e"],
  ["お", "o"],
  ["か", "ka"],
  ["き", "ki"],
  ["く", "ku"],
];

/** Dev-only: open the app with `?demo` to load sample data (replaces local data). */
export function loadDemo() {
  const st = useStore.getState();
  st.replaceAll({ sets: [], folders: [], days: {} });
  const english = st.createFolder("English", null);
  const ielts = st.createFolder("IELTS", english);
  const japanese = st.createFolder("Japanese", null);
  const toDrafts = (list: [string, string][]) => list.map(([term, def]) => ({ term, def }));

  st.createSet({ title: "Hiragana basics", folderId: japanese, termLang: "ja-JP" }, toDrafts(KANA));
  st.createSet({ title: "Kitchen words", folderId: english }, toDrafts(KITCHEN));
  const main = st.createSet(
    {
      title: "IELTS Vocabulary — Unit 4",
      description: "Academic words for writing task 2",
      folderId: ielts,
    },
    toDrafts(IELTS),
  );

  // Some progress so every screen has something to show.
  const set = useStore.getState().sets.find((s) => s.id === main)!;
  set.cards.slice(0, 8).forEach((c, i) => st.recordAnswer(main, c.id, i % 4 !== 1));
  set.cards.slice(0, 4).forEach((c) => st.setLearnLevel(main, c.id, 2));
  useStore.setState((s) => ({
    sets: s.sets.map((x) =>
      x.id !== main
        ? x
        : {
            ...x,
            id: "demo", // stable URL: #/sets/demo
            studiedAt: Date.now(),
            cards: x.cards.map((c, i) =>
              i < 5
                ? { ...c, srs: { ...c.srs, due: Date.now() - 1000 } }
                : i < 8
                  ? { ...c, srs: { ...c.srs, due: Date.now() + (i - 3) * DAY } }
                  : c,
            ),
          },
    ),
  }));

  const days: Record<string, DayStat> = {};
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 1; i < 300; i++) {
    if (rand() < 0.55) {
      const n = Math.floor(rand() * 150);
      days[dayKey(Date.now() - i * DAY)] = {
        answers: n,
        correct: Math.floor(n * 0.8),
        newCards: 0,
      };
    }
  }
  for (let i = 1; i < 6; i++)
    days[dayKey(Date.now() - i * DAY)] = { answers: 40 + i * 9, correct: 40, newCards: 0 };
  days[dayKey()] = { answers: 26, correct: 21, newCards: 8 };
  useStore.setState({ days });
}
