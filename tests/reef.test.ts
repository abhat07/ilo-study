import { describe, expect, it } from 'vitest';
import { computeStreak, dayKey, REPAIR_GOAL, type RestChoice } from '../src/engine/streak';
import { offersFor, lectureReward } from '../src/reef/state';
import { ALL_ORGANISMS, PICKS } from '../src/reef/catalogue';
import { emptySnapshot, mergeSnapshots } from '../src/sync/merge';

const NOW = new Date('2026-11-25T15:00:00').getTime();
const dayAt = (ago: number) => { const d = new Date(NOW); d.setDate(d.getDate() - ago); return d.getTime(); };
/** activity from a pattern read oldest → today: '#' studied, '.' missed, 'B' big day, '-' today not yet */
function act(pattern: string) {
  const m = new Map<string, { answers: number; graded: number }>();
  [...pattern].forEach((ch, i) => {
    const ago = pattern.length - 1 - i;
    if (ch === '#') m.set(dayKey(dayAt(ago)), { answers: 5, graded: 5 });
    if (ch === 'G') m.set(dayKey(dayAt(ago)), { answers: 25, graded: 25 });
    if (ch === 'B') m.set(dayKey(dayAt(ago)), { answers: REPAIR_GOAL, graded: REPAIR_GOAL });
  });
  return m;
}

describe('streak', () => {
  it('counts days in a row, with today still open', () => {
    expect(computeStreak(act('###'), [], NOW).streak).toBe(3);
    const s = computeStreak(act('###-'), [], NOW);
    expect(s.streak).toBe(3);
    expect(s.studiedToday).toBe(false);
  });
  it('earns a freeze every 7 days and spends it on a missed day', () => {
    const s = computeStreak(act('#######.#'), [], NOW);
    expect(s.streak).toBe(8);
    expect(s.days.find((d) => d.status === 'frozen')).toBeTruthy();
    expect(s.freezes).toBe(0);
    expect(computeStreak(act('#######'), [], NOW).freezes).toBe(1);
  });
  it('holds at most 2 freezes', () => {
    expect(computeStreak(act('#'.repeat(30)), [], NOW).freezes).toBe(2);
  });
  it('breaks without a freeze, but a big day within 2 days repairs it', () => {
    expect(computeStreak(act('###.#'), [], NOW).streak).toBe(1);
    expect(computeStreak(act('###.B'), [], NOW).streak).toBe(4);
    expect(computeStreak(act('###.#B'), [], NOW).streak).toBe(5);
    // too late: the window has closed
    expect(computeStreak(act('###.##B'), [], NOW).streak).toBe(3);
  });
  it('offers the repair today while the window is open', () => {
    const s = computeStreak(act('####.-'), [], NOW);
    expect(s.repair?.saved).toBe(4);
    expect(computeStreak(act('####..-'), [], NOW).repair).toBeNull(); // two misses in a row end it
  });
  it('a rest day never breaks the streak, but only from the day after you choose it', () => {
    // find how many days ago the last Sunday was, then make it the only missed day
    let ago = 1;
    while (new Date(dayAt(ago)).getDay() !== 0) ago++;
    const pattern = '#'.repeat(4) + '.' + '#'.repeat(ago);
    const early: RestChoice[] = [{ day: 0, at: dayAt(ago + 10) }];
    const late: RestChoice[] = [{ day: 0, at: dayAt(ago) + 3600_000 }];
    expect(computeStreak(act(pattern), early, NOW).streak).toBe(4 + ago);
    expect(computeStreak(act(pattern), late, NOW).streak).toBe(ago);
  });
  it('bleaches the reef with missed days and restores it when you study', () => {
    expect(computeStreak(act('###...-'), [], NOW).bleach).toBe(1);
    expect(computeStreak(act('###.-'), [], NOW).bleach).toBeCloseTo(1 / 3);
    expect(computeStreak(act('###...#'), [], NOW).bleach).toBe(0);
  });
  it('boosts XP on goal days by 10% per full week, capped at 50%', () => {
    const s = computeStreak(act('#'.repeat(13) + 'G'), [], NOW);
    expect(s.days[s.days.length - 1].boost).toBeCloseTo(0.2);
    expect(computeStreak(act('#'.repeat(13) + '#'), [], NOW).days.at(-1)!.boost).toBe(0); // goal not reached
    expect(computeStreak(act('#'.repeat(80) + 'G'), [], NOW).days.at(-1)!.boost).toBeCloseTo(0.5);
  });
});

describe('reef', () => {
  it('has a large catalogue with unique ids and a fact for every creature', () => {
    expect(ALL_ORGANISMS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(ALL_ORGANISMS.map((o) => o.id)).size).toBe(ALL_ORGANISMS.length);
    for (const o of ALL_ORGANISMS) expect(o.fact.length).toBeGreaterThan(20);
  });
  it('offers the same 3 distinct creatures for a level on every device, new ones first', () => {
    const a = offersFor(5, new Set()), b = offersFor(5, new Set());
    expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
    expect(new Set(a.map((o) => o.id)).size).toBe(3);
    const owned = new Set(PICKS.slice(0, PICKS.length - 2).map((o) => o.id));
    const c = offersFor(5, owned);
    expect(c.filter((o) => !owned.has(o.id))).toHaveLength(2);
  });
  it('gives every lecture fish for its school and every 3rd a special creature', () => {
    expect(lectureReward(0, 0).special).toBeUndefined();
    expect(lectureReward(0, 2).special).toBeDefined();
    expect(lectureReward(0, 0).school.id).toBe(lectureReward(0, 7).school.id);
    expect(lectureReward(1, 0).school.id).not.toBe(lectureReward(0, 0).school.id);
  });
  it('syncs reef records, and "Start again" removes the ones from before it', () => {
    const A = emptySnapshot(), B = emptySnapshot();
    A.stores.kv = [{ key: 'reef:pick:2', value: { id: 'blue-tang', at: 100 } }, { key: 'streak:rest:50', value: { day: 0, at: 50 } }];
    B.stores.kv = [{ key: 'reef:lec:L1', value: { at: 300, moduleId: 'M', index: 0 } }];
    const m = mergeSnapshots(A, B);
    expect(m.stores.kv.map((k) => k.key).sort()).toEqual(['reef:lec:L1', 'reef:pick:2', 'streak:rest:50']);
    B.stores.kv.push({ key: 'progressResetAt', value: 200 });
    const r = mergeSnapshots(A, B);
    expect(r.stores.kv.map((k) => k.key).sort()).toEqual(['progressResetAt', 'reef:lec:L1', 'streak:rest:50']);
  });
});
