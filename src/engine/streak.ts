/**
 * The study streak, worked out day by day from your answers (nothing extra is stored except your rest-day choice).
 *
 *  - A day counts if you answered anything at all, so a bad day still keeps it alive.
 *  - Cryptobiosis (streak freeze): every 7 days of streak earns one, up to 2 held. A missed day uses one
 *    automatically, like a tardigrade drying out into its "tun" and reviving later.
 *  - Repair window: miss a day with no freeze left and the streak is saved if, within the next 2 days, you
 *    have a big day (double the daily goal).
 *  - Rest day: one weekday of your choice never breaks the streak (from the day after you choose it).
 *  - Streak boost: each full week of streak adds +10% XP (up to +50%) on days you reach the daily goal.
 *  - Bleaching: each missed day drains colour from the reef; studying brings it straight back.
 */
export const DAILY_GOAL = 20;
export const REPAIR_GOAL = DAILY_GOAL * 2;
export const MAX_FREEZES = 2;
const REPAIR_DAYS = 2;

export type DayStatus = 'study' | 'rest' | 'frozen' | 'missed' | 'repaired' | 'today';

export interface RestChoice {
  /** 0 = Sunday … 6 = Saturday; -1 = no rest day */
  day: number;
  at: number;
}

export interface DayInfo {
  key: string;
  date: number; // local midnight
  answers: number;
  graded: number;
  status: DayStatus;
  streak: number; // streak at the end of this day
  boost: number; // XP boost (0–0.5) earned on this day
}

export interface StreakState {
  streak: number;
  longest: number;
  studiedToday: boolean;
  freezes: number;
  /** a broken streak you can still save today */
  repair: { saved: number; need: number; done: number; lastDay: number } | null;
  /** how washed out the reef is, 0 (full colour) to 1 */
  bleach: number;
  missedInARow: number;
  restDay: number;
  /** XP boost if you reach the goal today */
  boostToday: number;
  days: DayInfo[];
  tier: StreakTier;
  nextTier?: StreakTier;
}

export interface StreakTier {
  at: number;
  name: string;
  desc: string;
}

export const TIERS: StreakTier[] = [
  { at: 0, name: 'Still water', desc: 'Answer something today to start a streak.' },
  { at: 3, name: 'Clear water', desc: 'Sunlight ripples through the tank.' },
  { at: 7, name: 'Spawning night', desc: 'The corals release spawn after dark. +10% XP on goal days.' },
  { at: 14, name: 'Bioluminescence', desc: 'Glowing plankton drift through the water. +20% XP on goal days.' },
  { at: 30, name: 'Thriving reef', desc: 'Golden light and the whole reef in bloom. +40% XP on goal days.' },
  { at: 60, name: 'Ancient reef', desc: 'A reef that has stood for ages. +50% XP on goal days.' },
  { at: 100, name: 'Living legend', desc: 'A hundred days. The reef is visible from space.' },
];

export function tierFor(streak: number): { tier: StreakTier; next?: StreakTier } {
  let i = 0;
  while (i + 1 < TIERS.length && streak >= TIERS[i + 1].at) i++;
  return { tier: TIERS[i], next: TIERS[i + 1] };
}

export const boostFor = (streak: number) => Math.min(0.5, 0.1 * Math.floor(streak / 7));

export const midnight = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
const addDays = (t: number, n: number) => {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return midnight(d.getTime());
};

/** The rest day in force on a given day: the latest choice made before that day began. */
export function restDayOn(choices: RestChoice[], dayStart: number): number {
  let day = -1, at = -1;
  for (const c of choices) if (c.at < dayStart && c.at > at) { day = c.day; at = c.at; }
  return day;
}

export function computeStreak(
  activity: Map<string, { answers: number; graded: number }>,
  rest: RestChoice[] = [],
  now = Date.now(),
): StreakState {
  const today = midnight(now);
  const keys = [...activity.keys()].filter((k) => (activity.get(k)?.answers ?? 0) > 0);
  const starts = keys.map((k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); });
  const first = starts.length ? Math.min(...starts, today) : today;

  let streak = 0, longest = 0, freezes = 0, missedInARow = 0;
  let pending: { saved: number; lastDay: number; missIndex: number } | null = null;
  const days: DayInfo[] = [];
  for (let t = first, i = 0; t <= today; t = addDays(t, 1), i++) {
    const key = dayKey(t);
    const a = activity.get(key) ?? { answers: 0, graded: 0 };
    const isToday = t === today;
    let status: DayStatus;
    let boost = 0;
    if (a.answers > 0) {
      if (pending && t <= pending.lastDay && a.graded >= REPAIR_GOAL) {
        streak += pending.saved;
        days[pending.missIndex].status = 'repaired';
        pending = null;
      }
      const before = streak;
      streak++;
      if (Math.floor(streak / 7) > Math.floor(before / 7)) freezes = Math.min(MAX_FREEZES, freezes + 1);
      if (a.graded >= DAILY_GOAL) boost = boostFor(streak);
      status = 'study';
      missedInARow = 0;
    } else if (isToday) {
      status = 'today';
    } else if (restDayOn(rest, t) === new Date(t).getDay()) {
      status = 'rest';
    } else if (streak > 0 && freezes > 0) {
      freezes--;
      status = 'frozen';
    } else {
      status = 'missed';
      // a second miss in a row ends any pending repair
      pending = streak > 0 ? { saved: streak, lastDay: addDays(t, REPAIR_DAYS), missIndex: i } : null;
      streak = 0;
      missedInARow++;
    }
    if (pending && t >= pending.lastDay && !isToday) pending = null;
    longest = Math.max(longest, streak);
    days.push({ key, date: t, answers: a.answers, graded: a.graded, status, streak, boost });
  }

  const todayInfo = days[days.length - 1];
  const studiedToday = todayInfo.answers > 0;
  const repair = pending && today <= pending.lastDay
    ? { saved: pending.saved, need: REPAIR_GOAL, done: todayInfo.graded, lastDay: pending.lastDay }
    : null;
  const bleach = studiedToday ? 0 : Math.min(1, missedInARow / 3);
  const { tier, next } = tierFor(streak);
  return {
    streak,
    longest,
    studiedToday,
    freezes,
    repair,
    bleach,
    missedInARow,
    restDay: restDayOn(rest, today + 1),
    boostToday: boostFor(studiedToday ? streak : streak + 1),
    days,
    tier,
    nextTier: next,
  };
}
