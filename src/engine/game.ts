/**
 * Game layer: XP, levels, daily quests, badges, streaks. Everything is DERIVED from the
 * stored attempts and sessions (nothing extra is stored), so backups and restores carry it.
 *
 * Design rules, so the game rewards good learning rather than busywork:
 *  - First attempts at new questions and due reviews earn the most; repeats earn little.
 *  - Confidence is scored with a proper scoring rule (Brier): your expected calibration XP is
 *    highest when the confidence you report is your honest belief, so gaming it never pays.
 *  - "I don't know" still earns a little: attempting first (pretesting) helps learning.
 */
import type { Attempt, SessionRecord } from '../types';
import { db } from '../db';
import { CONF_PROB } from './mastery';

const DAY = 86_400_000;

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export interface XpBreakdown {
  total: number;
  parts: { label: string; xp: number }[];
}

/** XP for one stored attempt. */
export function xpForAttempt(a: Attempt): XpBreakdown {
  const parts: { label: string; xp: number }[] = [];
  if (a.elaboration) {
    if (a.response.trim()) parts.push({ label: 'Thought it through', xp: 5 });
    return { total: parts.reduce((s, p) => s + p.xp, 0), parts };
  }
  const skipped = !a.response && a.score === 0;
  if (skipped) {
    parts.push({ label: 'Tried first', xp: 3 });
  } else {
    parts.push(a.firstExposure ? { label: 'New question', xp: 10 } : { label: 'Review', xp: 6 });
    const correct = Math.round((a.firstExposure ? 10 : 5) * a.score);
    if (correct) parts.push({ label: 'Correct', xp: correct });
    if (a.transfer && a.score >= 0.7) parts.push({ label: 'Applied to a new case', xp: 10 });
    if (a.mark.by === 'ai' || a.mark.by === 'self') parts.push({ label: 'Written answer', xp: 5 });
    // Proper scoring rule: 20 × (1 − Brier). Honest confidence maximises expected XP
    // (scale 20, not 10, so rounding to whole XP never breaks that property; see tests).
    const p = CONF_PROB[a.confidence];
    const cal = Math.round(20 * (1 - (p - a.score) ** 2));
    parts.push({ label: 'Honest confidence', xp: cal });
  }
  return { total: parts.reduce((s, p) => s + p.xp, 0), parts };
}

// ---------------- Levels ----------------

export const LEVEL_TITLES = [
  'Nucleotide', 'Codon', 'Gene', 'Operon', 'Plasmid', 'Chromosome', 'Genome', 'Organelle',
  'Cell', 'Tissue', 'Organ', 'Organism', 'Population', 'Ecosystem', 'Biosphere',
];

/** Level L starts at 50·L·(L−1) XP: 0, 100, 300, 600, 1000, … */
export function levelFor(xp: number): { level: number; title: string; floor: number; next: number; progress: number } {
  let L = 1;
  while (50 * (L + 1) * L <= xp) L++;
  const floor = 50 * L * (L - 1);
  const next = 50 * (L + 1) * L;
  return { level: L, title: LEVEL_TITLES[Math.min(L - 1, LEVEL_TITLES.length - 1)], floor, next, progress: (xp - floor) / (next - floor) };
}

// ---------------- Daily quests ----------------

interface QuestDef {
  id: string;
  label: string;
  target: number;
  emoji: string;
  measure: (day: Attempt[], sessions: SessionRecord[]) => number;
}

const graded = (as: Attempt[]) => as.filter((a) => !a.elaboration);

function bestRun(as: Attempt[]): number {
  let best = 0, run = 0;
  for (const a of [...as].sort((x, y) => x.at - y.at)) {
    if (a.elaboration) continue;
    run = a.score >= 0.99 && a.response ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

const QUESTS: QuestDef[] = [
  { id: 'answer15', label: 'Answer 15 questions', target: 15, emoji: '🎯', measure: (d) => graded(d).length },
  { id: 'run5', label: 'Get 5 right in a row', target: 5, emoji: '🔥', measure: (d) => bestRun(d) },
  { id: 'written2', label: 'Answer 2 written questions', target: 2, emoji: '✍️', measure: (d) => graded(d).filter((a) => a.mark.by !== 'auto').length },
  { id: 'session1', label: 'Finish a session', target: 1, emoji: '🏁', measure: (_d, s) => s.filter((x) => x.endedAt && x.attemptIds.length).length },
  { id: 'think3', label: 'Answer 3 "Think it through" prompts', target: 3, emoji: '💭', measure: (d) => d.filter((a) => a.elaboration).length },
  { id: 'sure3', label: 'Get 3 right that you were sure about', target: 3, emoji: '💪', measure: (d) => graded(d).filter((a) => a.confidence >= 3 && a.score >= 0.99).length },
  { id: 'new5', label: 'Try 5 brand-new questions', target: 5, emoji: '✨', measure: (d) => graded(d).filter((a) => a.firstExposure).length },
  { id: 'review5', label: 'Do 5 spaced reviews', target: 5, emoji: '⏰', measure: (d) => graded(d).filter((a) => !a.firstExposure).length },
];
export const QUEST_XP = 30;

function questsForDay(key: string): QuestDef[] {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pool = [...QUESTS];
  const out: QuestDef[] = [];
  while (out.length < 3) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

export interface QuestStatus {
  id: string;
  label: string;
  emoji: string;
  progress: number;
  target: number;
  done: boolean;
}

// ---------------- Badges ----------------

export interface BadgeDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
}
export interface Badge extends BadgeDef {
  earned: boolean;
}

export const BADGES: BadgeDef[] = [
  { id: 'first', name: 'First Steps', emoji: '🧫', desc: 'Finish your first session' },
  { id: 'q50', name: 'Lab Regular', emoji: '🧪', desc: 'Answer 50 questions' },
  { id: 'q250', name: 'Research Fellow', emoji: '🔬', desc: 'Answer 250 questions' },
  { id: 'q1000', name: 'Principal Investigator', emoji: '🥼', desc: 'Answer 1,000 questions' },
  { id: 'run5', name: 'Chain Reaction', emoji: '⛓️', desc: '5 correct in a row' },
  { id: 'run10', name: 'PCR Amplified', emoji: '🧬', desc: '10 correct in a row' },
  { id: 'streak3', name: 'Habit Forming', emoji: '🔥', desc: '3-day streak' },
  { id: 'streak7', name: 'Circadian', emoji: '🌗', desc: '7-day streak' },
  { id: 'streak30', name: 'Homeostasis', emoji: '⚖️', desc: '30-day streak' },
  { id: 'transfer5', name: 'Horizontal Transfer', emoji: '🔀', desc: 'Get 5 apply-it-to-a-new-case questions right' },
  { id: 'written10', name: 'Scribe', emoji: '✍️', desc: 'Answer 10 written questions' },
  { id: 'think10', name: 'Deep Thinker', emoji: '💭', desc: 'Answer 10 "Think it through" prompts' },
  { id: 'calibrated', name: 'Well Calibrated', emoji: '🎯', desc: 'Over 30+ answers, your confidence matches reality (Brier < 0.15)' },
  { id: 'perfect', name: 'Flawless', emoji: '💎', desc: 'A session of 8+ questions, all correct' },
  { id: 'comeback', name: 'Repair Enzyme', emoji: '🩹', desc: 'Get a question right after missing it earlier' },
  { id: 'early', name: 'Early Bird', emoji: '🌅', desc: 'Study before 8am' },
  { id: 'owl', name: 'Night Owl', emoji: '🦉', desc: 'Study after 11pm' },
  { id: 'quests', name: 'Quest Complete', emoji: '🏆', desc: 'Finish all 3 daily quests in one day' },
];

// ---------------- Streak / summary ----------------

export interface GameState {
  xp: number;
  todayXp: number;
  level: ReturnType<typeof levelFor>;
  streak: number;
  studiedToday: boolean;
  answeredToday: number;
  answeredWeek: number;
  goal: { done: number; target: number };
  quests: QuestStatus[];
  badges: Badge[];
}

export const DAILY_GOAL = 20;

export function computeGame(attempts: Attempt[], sessions: SessionRecord[], now = Date.now()): GameState {
  const today = dayKey(now);
  const byDay = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const k = dayKey(a.at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(a);
  }
  const sessByDay = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    const k = dayKey(s.startedAt);
    if (!sessByDay.has(k)) sessByDay.set(k, []);
    sessByDay.get(k)!.push(s);
  }

  let xp = 0;
  let todayXp = 0;
  let allQuestsDay = false;
  let quests: QuestStatus[] = [];
  const dayKeys = new Set([...byDay.keys(), today]);
  for (const k of dayKeys) {
    const dayAttempts = byDay.get(k) ?? [];
    let dayXp = dayAttempts.reduce((s, a) => s + xpForAttempt(a).total, 0);
    const qs = questsForDay(k).map((q) => {
      const progress = Math.min(q.target, q.measure(dayAttempts, sessByDay.get(k) ?? []));
      return { id: q.id, label: q.label, emoji: q.emoji, progress, target: q.target, done: progress >= q.target };
    });
    dayXp += qs.filter((q) => q.done).length * QUEST_XP;
    if (qs.every((q) => q.done)) allQuestsDay = true;
    xp += dayXp;
    if (k === today) {
      todayXp = dayXp;
      quests = qs;
    }
  }

  // streak
  const days = new Set([...sessByDay.entries()].filter(([, ss]) => ss.some((s) => s.attemptIds.length)).map(([k]) => k));
  const studiedToday = days.has(today);
  let streak = 0;
  const d = new Date(now);
  if (!studiedToday) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d.getTime()))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  let longest = 0;
  {
    const sorted = [...days].map((k) => { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd).getTime(); }).sort((a, b) => a - b);
    let run = 0;
    for (let i = 0; i < sorted.length; i++) {
      run = i > 0 && Math.round((sorted[i] - sorted[i - 1]) / DAY) === 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
  }

  const g = graded(attempts);
  const answeredToday = graded(byDay.get(today) ?? []).length;
  const answeredWeek = g.filter((a) => now - a.at < 7 * DAY).length;

  // badges
  const recent = g.filter((a) => !a.disputed).slice(-60);
  const brier = recent.length ? recent.reduce((s, a) => s + (CONF_PROB[a.confidence] - (a.score >= 0.7 ? 1 : 0)) ** 2, 0) / recent.length : 1;
  const best = bestRun(attempts);
  const transferOk = g.filter((a) => a.transfer && a.score >= 0.7).length;
  const written = g.filter((a) => a.mark.by !== 'auto').length;
  const thinks = attempts.filter((a) => a.elaboration).length;
  const hours = sessions.filter((s) => s.attemptIds.length).map((s) => new Date(s.startedAt).getHours());
  const perfect = sessions.some((s) => {
    const as = g.filter((a) => a.sessionId === s.id);
    return as.length >= 8 && as.every((a) => a.score >= 0.99);
  });
  const missed = new Set<string>();
  let comeback = false;
  for (const a of [...g].sort((x, y) => x.at - y.at)) {
    if (a.score < 0.5) missed.add(a.itemId);
    else if (a.score >= 0.99 && missed.has(a.itemId)) comeback = true;
  }
  const earned: Record<string, boolean> = {
    first: sessions.some((s) => s.endedAt && s.attemptIds.length),
    q50: g.length >= 50,
    q250: g.length >= 250,
    q1000: g.length >= 1000,
    run5: best >= 5,
    run10: best >= 10,
    streak3: longest >= 3,
    streak7: longest >= 7,
    streak30: longest >= 30,
    transfer5: transferOk >= 5,
    written10: written >= 10,
    think10: thinks >= 10,
    calibrated: recent.length >= 30 && brier < 0.15,
    perfect,
    comeback,
    early: hours.some((h) => h >= 4 && h < 8),
    owl: hours.some((h) => h >= 23 || h < 4),
    quests: allQuestsDay,
  };

  return {
    xp,
    todayXp,
    level: levelFor(xp),
    streak,
    studiedToday,
    answeredToday,
    answeredWeek,
    goal: { done: answeredToday, target: DAILY_GOAL },
    quests,
    badges: BADGES.map((b) => ({ ...b, earned: !!earned[b.id] })),
  };
}

export async function loadGame(): Promise<GameState> {
  const d = await db();
  const [attempts, sessions] = await Promise.all([d.getAll('attempts'), d.getAll('sessions')]);
  return computeGame(attempts, sessions);
}

/** Messages for anything newly achieved between two game states. */
export function achievements(before: GameState, after: GameState): string[] {
  const out: string[] = [];
  if (after.level.level > before.level.level) out.push(`⬆️ Level ${after.level.level}: <b>${after.level.title}</b>!`);
  const had = new Set(before.badges.filter((b) => b.earned).map((b) => b.id));
  for (const b of after.badges) if (b.earned && !had.has(b.id)) out.push(`${b.emoji} Badge unlocked: <b>${b.name}</b>`);
  const qd = new Set(before.quests.filter((q) => q.done).map((q) => q.id));
  for (const q of after.quests) if (q.done && !qd.has(q.id)) out.push(`⚔️ Quest done: ${q.label} <b>+${QUEST_XP} XP</b>`);
  return out;
}
