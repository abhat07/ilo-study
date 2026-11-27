/**
 * Your reef, worked out from your answers plus two small kinds of record that sync between devices:
 *   reef:pick:<level>   {id, at}             the creature you chose at that level-up
 *   reef:lec:<lectureId> {at, moduleId, index} when a lecture first reached 100% (so its fish never leave,
 *                                             even if a later wrong answer drops the ring below 100%)
 * "Start again" removes records from before the reset, like everything else that came from answering.
 */
import { db, ensureModules, notifyChange } from '../db';
import type { Module } from '../types';
import { loadGame, xpForAttempt, type GameState } from '../engine/game';
import { CORALS, LECTURE_SPECIALS, ORG, PICKS, SCHOOLS, STREAK_VISITORS, type CoralSpecies, type Organism } from './catalogue';
import { rng } from './art';
import { seasonStatus, type SeasonStatus } from './seasons';
import { examDate } from '../plan/store';

export const PICK_PREFIX = 'reef:pick:';
export const LEC_PREFIX = 'reef:lec:';
export const POLYP_XP = 50;
export const FISH_PER_LECTURE = 3;
/** a new reef starts with a couple of scouts from each school */
const SCOUTS = 2;

export interface PickRec { id: string; at: number }
export interface LecRec { at: number; moduleId: string; index: number }

export interface ReefModule {
  id: string;
  short: string;
  index: number;
  coral: CoralSpecies;
  xp: number;
  polyps: number;
  school: Organism;
  lecturesDone: number;
}

export interface Owned {
  org: Organism;
  count: number;
  how: string;
}

export interface ReefState {
  modules: ReefModule[];
  owned: Owned[];
  /** level-ups whose creature hasn't been chosen yet */
  pending: number[];
  game: GameState;
  polyps: number;
  creatures: number;
  /** seasonal events: what's on now, what's next, and visitors earned */
  season: SeasonStatus;
}

export const schoolFor = (moduleIndex: number) => SCHOOLS[moduleIndex % SCHOOLS.length];
export const coralFor = (moduleIndex: number) => CORALS[moduleIndex % CORALS.length];

/** What finishing a lecture adds: 3 fish to the module's school, and every 3rd lecture a special creature. */
export function lectureReward(moduleIndex: number, lectureIndex: number): { school: Organism; n: number; special?: Organism } {
  const special = lectureIndex % 3 === 2 ? LECTURE_SPECIALS[(moduleIndex * 3 + Math.floor(lectureIndex / 3)) % LECTURE_SPECIALS.length] : undefined;
  return { school: schoolFor(moduleIndex), n: FISH_PER_LECTURE, special };
}

/** The 3 creatures offered at a level-up: the same on every device, preferring ones you don't have yet. */
export function offersFor(level: number, ownedPicks: Set<string>): Organism[] {
  const r = rng('level:' + level);
  const pool = [...PICKS].sort(() => r() - 0.5);
  const fresh = pool.filter((o) => !ownedPicks.has(o.id));
  return [...fresh, ...pool.filter((o) => ownedPicks.has(o.id))].slice(0, 3);
}

async function kvPrefix<T>(prefix: string): Promise<[string, T][]> {
  const d = await db();
  const keys = (await d.getAllKeys('kv')).map(String).filter((k) => k.startsWith(prefix));
  const vals = await Promise.all(keys.map((k) => d.get('kv', k)));
  return keys.map((k, i) => [k, vals[i] as T] as [string, T]).filter(([, v]) => v != null);
}

export async function sortedModules(): Promise<Module[]> {
  return (await ensureModules()).sort((a, b) => a.createdAt - b.createdAt);
}

export async function loadReef(game?: GameState): Promise<ReefState> {
  const d = await db();
  const [mods, attempts, picks, lecs, g] = await Promise.all([
    sortedModules(),
    d.getAll('attempts'),
    kvPrefix<PickRec>(PICK_PREFIX),
    kvPrefix<LecRec>(LEC_PREFIX),
    game ? Promise.resolve(game) : loadGame(),
  ]);
  const xpBy = new Map<string, number>();
  for (const a of attempts) xpBy.set(a.moduleId, (xpBy.get(a.moduleId) ?? 0) + xpForAttempt(a).total);

  const owned = new Map<string, Owned>();
  const add = (org: Organism | undefined, n: number, how: string) => {
    if (!org || n <= 0) return;
    const o = owned.get(org.id);
    if (o) o.count += n;
    else owned.set(org.id, { org, count: n, how });
  };

  const modules: ReefModule[] = mods.map((m, index) => {
    const xp = xpBy.get(m.id) ?? 0;
    const done = lecs.filter(([, v]) => v.moduleId === m.id);
    const school = schoolFor(index);
    add(school, SCOUTS + done.length * FISH_PER_LECTURE, `${m.short} school: +${FISH_PER_LECTURE} for every lecture you finish`);
    for (const [, v] of done) {
      const sp = lectureReward(index, v.index).special;
      add(sp, 1, `Finished a ${m.short} lecture`);
    }
    return { id: m.id, short: m.short, index, coral: coralFor(index), xp, polyps: Math.floor(xp / POLYP_XP), school, lecturesDone: done.length };
  });

  const picked = new Set<number>();
  for (const [k, v] of picks) {
    const level = Number(k.slice(PICK_PREFIX.length));
    if (level > g.level.level) continue; // after a reset, until you reach it again
    picked.add(level);
    add(ORG.get(v.id), 1, `Chosen at level ${level}`);
  }
  for (const v of STREAK_VISITORS) if (g.streakInfo.longest >= v.streakAt!) add(v, 1, `${v.streakAt}-day streak`);

  // seasonal visitors: reach your daily goal on enough days while an event runs
  const exams = (await Promise.all(mods.map(async (m) => ({ short: m.short, date: await examDate(m.id) }))))
    .filter((e) => e.date)
    .map((e) => { const [y, mo, dd] = e.date.split('-').map(Number); return { short: e.short, at: new Date(y, mo - 1, dd).getTime() }; });
  const season = seasonStatus(Date.now(), new Map(g.streakInfo.days.map((d) => [d.date, d.graded])), exams);
  for (const p of season.progress) if (p.earned && !owned.has(p.ev.visitor.id)) add(p.ev.visitor, 1, `${p.ev.name} ${new Date(p.ev.from).getFullYear()}`);

  const pending: number[] = [];
  for (let L = 2; L <= g.level.level; L++) if (!picked.has(L)) pending.push(L);

  const list = [...owned.values()];
  return {
    modules,
    owned: list,
    pending,
    game: g,
    polyps: modules.reduce((s, m) => s + m.polyps, 0),
    creatures: list.reduce((s, o) => s + o.count, 0),
    season,
  };
}

export async function choosePick(level: number, id: string): Promise<void> {
  const d = await db();
  if (await d.get('kv', PICK_PREFIX + level)) return;
  await d.put('kv', { id, at: Date.now() } satisfies PickRec, PICK_PREFIX + level);
  notifyChange();
}

/** Remember lectures that just reached 100%. Returns the rewards newly earned. */
export async function recordFinishedLectures(moduleId: string, rows: { lecture: { id: string; iloIds: string[] }; st: { done: boolean } }[]): Promise<string[]> {
  const mods = await sortedModules();
  const mi = mods.findIndex((m) => m.id === moduleId);
  if (mi < 0) return [];
  const d = await db();
  const out: string[] = [];
  const withIlos = rows.filter((r) => r.lecture.iloIds.length);
  for (let i = 0; i < withIlos.length; i++) {
    const r = withIlos[i];
    if (!r.st.done) continue;
    const key = LEC_PREFIX + r.lecture.id;
    if (await d.get('kv', key)) continue;
    await d.put('kv', { at: Date.now(), moduleId, index: i } satisfies LecRec, key);
    const rw = lectureReward(mi, i);
    out.push(`🐟 ${rw.n} ${rw.school.name.toLowerCase()} joined your reef`);
    if (rw.special) out.push(`✨ New in your reef: <b>${rw.special.name}</b>`);
  }
  return out;
}
