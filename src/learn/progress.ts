/**
 * Lesson progress (pure functions).
 *
 * A section is complete only when you have read its explanation AND your most recent answer to every one
 * of its questions was correct. Wrong answers keep coming back until they are right, so the lecture ring
 * stalls rather than moving on with gaps. Once a lecture reaches 100% it switches to spaced recap (FSRS).
 */
import type { Attempt, Item, LearnSection, Lecture } from '../types';
import { isDue, retrievability } from '../engine/scheduler';

export const CORRECT = 0.7;
const EXPLAIN_SHARE = 0.1;

export type Latest = Map<string, { score: number; at: number }>;

export function latestScores(attempts: Attempt[]): Latest {
  const m: Latest = new Map();
  for (const a of attempts) {
    if (a.elaboration) continue;
    const cur = m.get(a.itemId);
    if (!cur || a.at > cur.at) m.set(a.itemId, { score: a.disputed ? 1 : a.score, at: a.at });
  }
  return m;
}

export function liveItems(section: LearnSection, items: Map<string, Item>): Item[] {
  return section.itemIds.map((id) => items.get(id)).filter((i): i is Item => !!i && i.status === 'active');
}

export interface SectionState {
  frac: number; // 0..1
  done: boolean;
  correct: number;
  total: number;
}

export function sectionState(section: LearnSection, items: Map<string, Item>, latest: Latest): SectionState {
  const live = liveItems(section, items);
  const seen = !!section.seenAt;
  const correct = live.filter((i) => (latest.get(i.id)?.score ?? -1) >= CORRECT).length;
  const total = live.length;
  const frac = (seen ? EXPLAIN_SHARE : 0) + (1 - EXPLAIN_SHARE) * (total ? correct / total : seen ? 1 : 0);
  return { frac, done: seen && correct === total, correct, total };
}

export interface LectureState {
  frac: number;
  done: boolean;
  started: boolean;
  sections: number; // generated so far
  expected: number; // one per ILO
  currentSectionId?: string;
  due: number; // recap questions due now
}

export function lectureState(lecture: Lecture, sections: LearnSection[], items: Map<string, Item>, latest: Latest, now = new Date()): LectureState {
  const mine = sections.filter((s) => s.lectureId === lecture.id).sort((a, b) => a.order - b.order);
  const expected = Math.max(lecture.iloIds.length, mine.length, 1);
  let sum = 0;
  let current: string | undefined;
  let started = false;
  for (const s of mine) {
    const st = sectionState(s, items, latest);
    sum += st.frac;
    if (st.frac > 0) started = true;
    if (!st.done && !current) current = s.id;
  }
  const frac = sum / expected;
  const done = mine.length >= lecture.iloIds.length && mine.length > 0 && !current;
  const due = done
    ? mine.flatMap((s) => liveItems(s, items)).filter((i) => i.seenCount > 0 && isDue(i.card, now)).length
    : 0;
  return { frac: done ? 1 : Math.min(frac, 0.99), done, started, sections: mine.length, expected, currentSectionId: current, due };
}

/**
 * What to ask next inside a section: unanswered questions in teaching order, then link questions, then
 * anything you got wrong (it repeats until right). Every 4th question is a spaced review from earlier.
 */
export function nextLessonItem(opts: {
  section: LearnSection;
  items: Map<string, Item>;
  latest: Latest;
  askedThisSitting: string[];
  reviewPool: Item[]; // completed earlier sections of this lecture + previous lectures
  now?: Date;
}): { item: Item; review: boolean } | null {
  const { section, items, latest, askedThisSitting } = opts;
  const live = liveItems(section, items);
  const last = askedThisSitting[askedThisSitting.length - 1];
  const pending = live.filter((i) => (latest.get(i.id)?.score ?? -1) < CORRECT);
  if (!pending.length) return null;
  const sinceReview = (() => {
    let n = 0;
    for (let k = askedThisSitting.length - 1; k >= 0; k--) {
      if (!live.some((i) => i.id === askedThisSitting[k])) break;
      n++;
    }
    return n;
  })();
  if (sinceReview >= 4 && opts.reviewPool.length) {
    const now = opts.now ?? new Date();
    const asked = new Set(askedThisSitting);
    const pool = opts.reviewPool.filter((i) => i.status === 'active' && !asked.has(i.id));
    pool.sort((a, b) => Number(isDue(b.card, now)) - Number(isDue(a.card, now)) || retrievability(a.card, now) - retrievability(b.card, now));
    if (pool[0]) return { item: pool[0], review: true };
  }
  const unanswered = pending.filter((i) => !latest.has(i.id));
  const ordered = [
    ...unanswered.filter((i) => i.kind !== 'link').sort((a, b) => (a.pointIndex ?? 0) - (b.pointIndex ?? 0)),
    ...unanswered.filter((i) => i.kind === 'link'),
    ...pending.filter((i) => latest.has(i.id)).sort((a, b) => latest.get(a.id)!.at - latest.get(b.id)!.at),
  ];
  // don't ask the exact same question twice in a row if there is anything else
  const pick = ordered.find((i) => i.id !== last) ?? ordered[0];
  return { item: pick, review: false };
}
