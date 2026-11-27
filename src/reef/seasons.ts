/**
 * Seasonal events: the reef changes with the calendar, and each event brings a rare visitor that joins
 * your reef if you reach your daily goal on enough days while it runs. Worked out from your answers,
 * so nothing extra is stored or synced.
 *
 *  - Coral mass spawning: a few nights after the November and December full moons, when corals on the
 *    Great Barrier Reef really do spawn together (dates from the real lunar cycle).
 *  - The longest night (around the winter solstice): bioluminescence.
 *  - New Year: glowing bursts.
 *  - Exam season: the two weeks before each exam.
 */
import { DAILY_GOAL } from '../engine/streak';
import type { Organism } from './catalogue';

const DAY = 86_400_000;
/** A known full moon (21 Jan 2000, 04:40 UTC) and the mean synodic month. */
const FULL_MOON_REF = Date.UTC(2000, 0, 21, 4, 40);
const SYNODIC = 29.530588853 * DAY;

export type SeasonEffect = 'spawn' | 'glow' | 'bursts' | 'exam';

export interface SeasonEvent {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  from: number; // local midnight, first day
  to: number; // local midnight, last day (inclusive)
  effect: SeasonEffect;
  visitor: Organism;
  /** goal days needed during the event for the visitor to join */
  need: number;
}

const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const day = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
const addDays = (t: number, n: number) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };

/** Full moons (local midnight of the day they fall on) during a month. */
export function fullMoonsIn(year: number, month: number): number[] {
  const start = day(year, month, 1), end = day(year, month + 1, 1);
  let k = Math.floor((start - FULL_MOON_REF) / SYNODIC);
  const out: number[] = [];
  for (let t = FULL_MOON_REF + k * SYNODIC; t < end; t = FULL_MOON_REF + ++k * SYNODIC) if (t >= start) out.push(midnight(t));
  return out;
}

export const SEASONAL: Organism[] = [
  {
    id: 'basket-star', name: 'Basket star', latin: 'Astrophyton muricatum', zone: 'sand', source: 'season',
    fact: 'Curled up in a tight ball by day, at night it unfurls hundreds of branching arm tips into a net to catch drifting plankton.',
    draw: { kind: 'star', c: '#c98a4b', c2: '#f2c48d', arms: 5, thin: true },
  },
  {
    id: 'flashlight-fish', name: 'Splitfin flashlightfish', latin: 'Anomalops katoptron', zone: 'swim', source: 'season',
    fact: 'Glowing symbiotic bacteria live in an organ under each eye; the fish "blinks" by rotating the organ down out of view.',
    draw: { kind: 'fish', L: 20, h: 10, body: '#1f2937', fin: '#111827', tail: 'fork', dorsal: 'low', pat: [{ t: 'eyespot', x: 0.3, y: 0.12, r: 0.09, c: '#b8fbff' }] },
  },
  {
    id: 'spanish-dancer', name: 'Spanish dancer', latin: 'Hexabranchus sanguineus', zone: 'sand', source: 'season',
    fact: 'One of the largest sea slugs, up to about 40 cm; disturbed, it swims off by flexing its red mantle like a flamenco dancer\'s skirt.',
    draw: { kind: 'nudi', c: '#e11d48', c2: '#fda4af', c3: '#fff1f2' },
  },
  {
    id: 'bumphead-parrotfish', name: 'Bumphead parrotfish', latin: 'Bolbometopon muricatum', zone: 'swim', source: 'season', size: 1.3,
    fact: 'The largest parrotfish: it bites and grinds living coral, and one adult can turn several tonnes of reef into sand a year.',
    draw: { kind: 'fish', L: 32, h: 16, body: '#5b7f74', fin: '#486a60', tail: 'lunate', dorsal: 'low', nose: 'beak', shape: 'round', pat: [{ t: 'front', x: 0.34, c: '#8fb3a5' }] },
  },
];
const V = Object.fromEntries(SEASONAL.map((o) => [o.id, o])) as Record<string, Organism>;

/** Events in a calendar year (New Year's runs into the next), plus exam season for each exam. */
export function eventsFor(year: number, exams: { short: string; at: number }[] = []): SeasonEvent[] {
  const out: SeasonEvent[] = [];
  for (const month of [10, 11]) {
    for (const fm of fullMoonsIn(year, month)) {
      out.push({
        id: `spawn-${year}-${month + 1}`, name: 'Coral mass spawning', emoji: '🌕',
        desc: 'A few nights after the November and December full moons, corals on the Great Barrier Reef release their eggs and sperm all at once.',
        from: addDays(fm, 3), to: addDays(fm, 7), effect: 'spawn', visitor: V['basket-star'], need: 3,
      });
    }
  }
  out.push({
    id: `solstice-${year}`, name: 'The longest night', emoji: '🌌',
    desc: 'Around the winter solstice the nights are longest: the reef glows with bioluminescent plankton.',
    from: day(year, 11, 19), to: day(year, 11, 23), effect: 'glow', visitor: V['flashlight-fish'], need: 3,
  });
  out.push({
    id: `newyear-${year}`, name: 'New Year bloom', emoji: '🎆',
    desc: 'Bursts of bioluminescence see the year out.',
    from: day(year, 11, 31), to: day(year + 1, 0, 2), effect: 'bursts', visitor: V['spanish-dancer'], need: 2,
  });
  for (const e of exams) {
    if (new Date(e.at).getFullYear() !== year && new Date(addDays(e.at, -14)).getFullYear() !== year) continue;
    out.push({
      id: `exam-${e.short}-${new Date(e.at).toISOString().slice(0, 10)}`, name: `${e.short} exam season`, emoji: '📝',
      desc: `The two weeks before your ${e.short} exam. The reef turns gold while you revise.`,
      from: addDays(midnight(e.at), -14), to: addDays(midnight(e.at), -1), effect: 'exam', visitor: V['bumphead-parrotfish'], need: 7,
    });
  }
  return out;
}

export interface SeasonStatus {
  active: SeasonEvent[];
  next?: SeasonEvent;
  /** every event so far and how many goal days you had in it */
  progress: { ev: SeasonEvent; goalDays: number; earned: boolean }[];
}

/**
 * Where the seasons stand. `goalDays` maps a day key's local midnight → graded answers that day.
 * Events from last year onwards are checked, so a visitor earned last December stays.
 */
export function seasonStatus(now: number, graded: Map<number, number>, exams: { short: string; at: number }[] = []): SeasonStatus {
  const y = new Date(now).getFullYear();
  const all = [...eventsFor(y - 1, exams), ...eventsFor(y, exams), ...eventsFor(y + 1, exams)]
    .filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i)
    .sort((a, b) => a.from - b.from);
  const today = midnight(now);
  const progress = all.filter((e) => e.from <= today).map((ev) => {
    let goalDays = 0;
    for (let t = ev.from; t <= Math.min(ev.to, today); t = addDays(t, 1)) if ((graded.get(t) ?? 0) >= DAILY_GOAL) goalDays++;
    return { ev, goalDays, earned: goalDays >= ev.need };
  });
  return {
    active: all.filter((e) => e.from <= today && today <= e.to),
    next: all.find((e) => e.from > today),
    progress,
  };
}

export const daysUntil = (t: number, now: number) => Math.round((midnight(t) - midnight(now)) / DAY);
export { DAY };
