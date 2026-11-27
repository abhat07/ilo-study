/**
 * The weekly reef report (Monday–Sunday): what grew, who arrived, and how the week went.
 * Worked out from your answers and reef records; nothing new is stored except, on this device,
 * that you've seen a report (`local:report:<week>`).
 */
import { db } from '../db';
import type { Attempt } from '../types';
import { DAILY_GOAL, dayKey } from '../engine/streak';
import { xpForAttempt } from '../engine/game';
import { ORG, type Organism } from './catalogue';
import { lectureReward, LEC_PREFIX, PICK_PREFIX, POLYP_XP, sortedModules, type LecRec, type PickRec } from './state';

const DAY = 86_400_000;

/** Local midnight of the Monday starting the week containing t. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
const addDays = (t: number, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };

export interface WeekReport {
  start: number;
  end: number; // exclusive (next Monday)
  xp: number;
  xpLastWeek: number;
  bestWeekEver: boolean;
  polyps: number;
  answered: number;
  correct: number;
  days: { date: number; answers: number; goal: boolean }[];
  bestDay?: { date: number; answers: number };
  lectures: { moduleShort: string; fish: number; school: string; special?: Organism }[];
  picks: Organism[];
}

export function computeWeek(
  attempts: Attempt[],
  lecs: (LecRec & { short: string; moduleIndex: number })[],
  picks: PickRec[],
  start: number,
): WeekReport {
  const end = addDays(start, 7);
  const inWeek = (t: number) => t >= start && t < end;
  const xpIn = (a: number, b: number) => attempts.filter((x) => x.at >= a && x.at < b).reduce((s, x) => s + xpForAttempt(x).total, 0);
  const mine = attempts.filter((a) => inWeek(a.at));
  const xp = xpIn(start, end);
  const graded = mine.filter((a) => !a.elaboration); // self-explanations aren't marked
  const byDay = new Map<string, number>();
  for (const a of mine) byDay.set(dayKey(a.at), (byDay.get(dayKey(a.at)) ?? 0) + 1);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const answers = byDay.get(dayKey(date)) ?? 0;
    return { date, answers, goal: answers >= DAILY_GOAL };
  });
  const best = days.reduce<{ date: number; answers: number } | undefined>((b, d) => (d.answers > (b?.answers ?? 0) ? d : b), undefined);
  // every earlier week's XP, to spot a personal best
  const first = attempts.length ? weekStart(Math.min(...attempts.map((a) => a.at))) : start;
  let bestBefore = 0;
  for (let w = first; w < start; w = addDays(w, 7)) bestBefore = Math.max(bestBefore, xpIn(w, addDays(w, 7)));
  return {
    start,
    end,
    xp,
    xpLastWeek: xpIn(addDays(start, -7), start),
    bestWeekEver: xp > 0 && xp > bestBefore && first < start,
    polyps: Math.floor(xp / POLYP_XP),
    answered: graded.length,
    correct: graded.filter((a) => a.score >= 0.7).length,
    days,
    bestDay: best,
    lectures: lecs.filter((l) => inWeek(l.at)).map((l) => {
      const rw = lectureReward(l.moduleIndex, l.index);
      return { moduleShort: l.short, fish: rw.n, school: rw.school.name, special: rw.special };
    }),
    picks: picks.filter((p) => inWeek(p.at)).map((p) => ORG.get(p.id)).filter((o): o is Organism => !!o),
  };
}

export async function loadWeek(start: number): Promise<WeekReport> {
  const d = await db();
  const [attempts, keys, mods] = await Promise.all([d.getAll('attempts'), d.getAllKeys('kv'), sortedModules()]);
  const ks = keys.map(String);
  const lecs: (LecRec & { short: string; moduleIndex: number })[] = [];
  for (const k of ks.filter((x) => x.startsWith(LEC_PREFIX))) {
    const v = (await d.get('kv', k)) as LecRec | undefined;
    const mi = mods.findIndex((m) => m.id === v?.moduleId);
    if (v && mi >= 0) lecs.push({ ...v, short: mods[mi].short, moduleIndex: mi });
  }
  const picks = (await Promise.all(ks.filter((x) => x.startsWith(PICK_PREFIX)).map((k) => d.get('kv', k)))) as PickRec[];
  return computeWeek(attempts, lecs, picks.filter(Boolean), start);
}

/**
 * Which report the home screen offers: this week's on Sunday, last week's on Monday and Tuesday,
 * unless you've closed it.
 */
export async function reportToShow(now = Date.now()): Promise<number | null> {
  const dow = new Date(now).getDay(); // 0 Sunday
  const start = dow === 0 ? weekStart(now) : dow <= 2 ? addDays(weekStart(now), -7) : null;
  if (start === null) return null;
  if (await (await db()).get('kv', seenKey(start))) return null;
  return start;
}
export const seenKey = (start: number) => `local:report:${dayKey(start)}`;
export async function markReportSeen(start: number): Promise<void> {
  await (await db()).put('kv', { at: Date.now() }, seenKey(start));
}
export { DAY };
