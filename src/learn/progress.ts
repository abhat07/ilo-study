/**
 * Lesson progress (pure functions).
 *
 * A section is taught in small steps: read one point, answer its question(s), answer a link-back question
 * tying it to the step before, then move on. It is complete only when every step has been read AND your
 * most recent answer to every one of its questions was correct. Wrong answers keep coming back until they are right, so the lecture ring
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

/** How many steps of a section have been read (older sections only recorded "read it all"). */
export function readToOf(section: LearnSection): number {
  const n = section.points.length;
  return Math.min(n, Math.max(section.readTo ?? 0, section.seenAt ? n : 0));
}

export function sectionState(section: LearnSection, items: Map<string, Item>, latest: Latest): SectionState {
  const live = liveItems(section, items);
  const n = section.points.length;
  const read = n ? readToOf(section) / n : section.seenAt ? 1 : 0;
  const correct = live.filter((i) => (latest.get(i.id)?.score ?? -1) >= CORRECT).length;
  const total = live.length;
  const frac = EXPLAIN_SHARE * read + (1 - EXPLAIN_SHARE) * (total ? correct / total : read);
  return { frac, done: read >= 1 && correct === total, correct, total };
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

export type LessonStep = { kind: 'read'; index: number } | { kind: 'item'; item: Item; review: boolean } | null;

/**
 * The next step inside a section, taught one point at a time:
 *   read step k → its own questions → its link-back question → (a wrong answer from earlier, retried) → read step k+1 …
 * then end-of-section link questions, then anything still wrong until it is right. Every 5th question in a
 * row from this section is a spaced review from an earlier section or the previous lecture.
 */
export function nextLessonStep(opts: {
  section: LearnSection;
  items: Map<string, Item>;
  latest: Latest;
  askedThisSitting: string[];
  reviewPool: Item[];
  now?: Date;
}): LessonStep {
  const { section, items, latest, askedThisSitting } = opts;
  const n = section.points.length;
  const readTo = readToOf(section);
  if (n === 0) return section.seenAt ? null : { kind: 'read', index: 0 };
  if (readTo === 0) return { kind: 'read', index: 0 };
  const live = liveItems(section, items);
  const last = askedThisSitting[askedThisSitting.length - 1];
  const unanswered = live.filter((i) => !latest.has(i.id));
  const wrong = live.filter((i) => latest.has(i.id) && latest.get(i.id)!.score < CORRECT);

  const sinceReview = (() => {
    let k = 0;
    for (let j = askedThisSitting.length - 1; j >= 0; j--) {
      if (!live.some((i) => i.id === askedThisSitting[j])) break;
      k++;
    }
    return k;
  })();
  const review = (): LessonStep => {
    if (sinceReview < 5 || !opts.reviewPool.length) return null;
    const now = opts.now ?? new Date();
    const asked = new Set(askedThisSitting);
    const pool = opts.reviewPool.filter((i) => i.status === 'active' && !asked.has(i.id));
    pool.sort((a, b) => Number(isDue(b.card, now)) - Number(isDue(a.card, now)) || retrievability(a.card, now) - retrievability(b.card, now));
    return pool[0] ? { kind: 'item', item: pool[0], review: true } : null;
  };

  // questions on the steps read so far: the step's own questions first, then its link-back
  const atSteps = unanswered
    .filter((i) => (i.pointIndex ?? -1) >= 0 && (i.pointIndex ?? 0) < readTo)
    .sort((a, b) => (a.pointIndex ?? 0) - (b.pointIndex ?? 0) || Number(a.kind === 'link') - Number(b.kind === 'link'));
  if (atSteps.length) return review() ?? { kind: 'item', item: atSteps[0], review: false };
  if (readTo < n) {
    // before the next step, retry something you got wrong a little while ago
    const recent = new Set(askedThisSitting.slice(-2));
    const retry = wrong.filter((i) => !recent.has(i.id)).sort((a, b) => latest.get(a.id)!.at - latest.get(b.id)!.at)[0];
    if (retry) return { kind: 'item', item: retry, review: false };
    return { kind: 'read', index: readTo };
  }
  const ordered = [
    ...unanswered.sort((a, b) => (a.pointIndex ?? 99) - (b.pointIndex ?? 99)),
    ...wrong.sort((a, b) => latest.get(a.id)!.at - latest.get(b.id)!.at),
  ];
  if (!ordered.length) return null;
  const r = review();
  if (r) return r;
  return { kind: 'item', item: ordered.find((i) => i.id !== last) ?? ordered[0], review: false };
}

// ---------------- time estimates ----------------

export type Pace = Record<Item['type'], number>; // seconds per question, including reading the feedback
export const DEFAULT_PACE: Pace = { cloze: 30, mcq: 35, order: 50, short: 100 };
const READ_WPM = 180;
const UNWRITTEN_ILO_SECS = 9 * 60; // a section not written yet

/** Your own pace: the median time you take per question type (after 5 answers of that type). */
export function paceFrom(attempts: Attempt[], items: Map<string, Item>): Pace {
  const by = new Map<string, number[]>();
  for (const a of attempts) {
    const it = items.get(a.itemId);
    if (a.elaboration || !it || !(a.durationMs > 0)) continue;
    by.set(it.type, [...(by.get(it.type) ?? []), a.durationMs / 1000]);
  }
  const out = { ...DEFAULT_PACE };
  for (const t of Object.keys(out) as Item['type'][]) {
    const xs = (by.get(t) ?? []).sort((x, y) => x - y);
    if (xs.length >= 5) out[t] = Math.round(Math.min(300, Math.max(8, xs[Math.floor(xs.length / 2)])) + 12);
  }
  return out;
}

const pointSecs = (text: string) => 8 + (text.split(/\s+/).length / READ_WPM) * 60;

/** Estimated minutes for a lecture's lesson: in total, and what is left (unread steps, unanswered or wrong questions). */
export function lectureMinutes(lecture: Lecture, sections: LearnSection[], items: Map<string, Item>, latest: Latest, pace: Pace = DEFAULT_PACE): { total: number; left: number; recap: number } {
  const mine = sections.filter((s) => s.lectureId === lecture.id);
  let total = 0, left = 0, recap = 0;
  const now = new Date();
  for (const s of mine) {
    const readTo = readToOf(s);
    s.points.forEach((p, k) => {
      const t = pointSecs(p.text);
      total += t;
      if (k >= readTo) left += t;
    });
    for (const it of liveItems(s, items)) {
      const t = pace[it.type] ?? 40;
      const sc = latest.get(it.id)?.score;
      total += t * 1.15; // includes the usual allowance for repeats
      if (sc === undefined) left += t * 1.15; // allowance for repeats
      else if (sc < CORRECT) left += t;
      if (it.seenCount > 0 && isDue(it.card, now)) recap += t;
    }
  }
  // sections not written yet: like the written ones on average (or a default before any exist)
  const perSection = mine.length ? total / mine.length : UNWRITTEN_ILO_SECS;
  const missing = Math.max(0, lecture.iloIds.length - mine.length) * perSection;
  const T = Math.ceil((total + missing) / 60);
  return { total: T, left: Math.min(T, Math.ceil((left + missing) / 60)), recap: Math.ceil(recap / 60) };
}

export function fmtMin(m: number): string {
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
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
