/**
 * Exam countdown planner. A rolling plan, worked out afresh every time from what's actually left, so a
 * missed day simply spreads over the days remaining (there is nothing to "fall behind" on).
 *
 *  - Each module's unfinished lectures (in lecture order) are spread evenly over the days before its
 *    review phase: the last few days before the exam are kept for weak spots, recap and mock questions.
 *  - Modules are planned together, so two exams two days apart share the same evenings.
 *  - Today's list = today's share of lectures + any recap due + the weakest taught ILOs.
 */
import { dayKey } from '../engine/streak';

const DAY = 86_400_000;

export interface PlanLecture {
  id: string;
  number: number;
  title: string;
  /** minutes still needed to finish the lesson */
  left: number;
  done: boolean;
}

export interface PlanModuleIn {
  id: string;
  short: string;
  exam: string; // YYYY-MM-DD or ''
  lectures: PlanLecture[];
  due: number; // recap questions due now
  /** taught ILOs and their mastery (0..1) */
  weak: { id: string; text: string; mastery: number }[];
}

export interface DayTask {
  moduleId: string;
  short: string;
  kind: 'learn' | 'review' | 'exam';
  lectureId?: string;
  label: string;
  minutes: number;
}

export interface PlanDay {
  key: string;
  date: number;
  tasks: DayTask[];
  minutes: number;
}

export interface ModulePlan {
  id: string;
  short: string;
  exam: string;
  examAt: number;
  daysLeft: number; // whole days before the exam day (today counts)
  reviewDays: number;
  learnLeft: number; // minutes of lessons still to do
  perDay: number; // lesson minutes a day to finish before the review days
  lecturesDone: number;
  lecturesTotal: number;
  phase: 'learn' | 'review' | 'past' | 'none';
  /** the day the last lesson is planned (0 if none left) */
  learnEnds: number;
}

export interface Plan {
  modules: ModulePlan[];
  days: PlanDay[];
  today: DayTask[];
  /** minutes a day needed across modules for lessons (before review phases) */
  perDay: number;
  weak: (PlanModuleIn['weak'][number] & { moduleId: string; short: string })[];
}

const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const parseDay = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
const daysBetween = (a: number, b: number) => Math.round((midnight(b) - midnight(a)) / DAY);

/** A study day is at least this long, so a light load is done in proper sittings, not 2-minute slices. */
export const MIN_SESSION = 25;

/** Days kept for review before an exam: about a fifth of the time left, between 1 and 5. */
export const reviewDaysFor = (daysLeft: number) => Math.max(1, Math.min(5, Math.floor(daysLeft / 5)));

export function computePlan(mods: PlanModuleIn[], now = Date.now()): Plan {
  const today = midnight(now);
  const modules: ModulePlan[] = [];
  const queues = new Map<string, { lec: PlanLecture; left: number }[]>();
  for (const m of mods) {
    const todo = m.lectures.filter((l) => !l.done).sort((a, b) => (a.number || 999) - (b.number || 999));
    const learnLeft = todo.reduce((s, l) => s + l.left, 0);
    const base = { id: m.id, short: m.short, exam: m.exam, learnLeft, lecturesDone: m.lectures.filter((l) => l.done).length, lecturesTotal: m.lectures.length };
    if (!m.exam) { modules.push({ ...base, examAt: 0, daysLeft: 0, reviewDays: 0, perDay: 0, phase: 'none', learnEnds: 0 }); continue; }
    const examAt = parseDay(m.exam);
    const daysLeft = daysBetween(today, examAt);
    if (daysLeft <= 0) { modules.push({ ...base, examAt, daysLeft, reviewDays: 0, perDay: 0, phase: 'past', learnEnds: 0 }); continue; }
    const reviewDays = daysLeft > 1 ? reviewDaysFor(daysLeft) : 0;
    const learnDays = Math.max(1, daysLeft - reviewDays);
    const perDay = Math.max(Math.ceil(learnLeft / learnDays), Math.min(MIN_SESSION, Math.ceil(learnLeft)));
    modules.push({ ...base, examAt, daysLeft, reviewDays, perDay, phase: daysLeft <= reviewDays ? 'review' : 'learn', learnEnds: 0 });
    queues.set(m.id, todo.map((lec) => ({ lec, left: lec.left })));
  }

  // day by day until the last exam
  const last = Math.max(0, ...modules.filter((m) => m.examAt).map((m) => m.examAt));
  const days: PlanDay[] = [];
  for (let t = today; t <= last; t += DAY) {
    const tasks: DayTask[] = [];
    for (const m of modules) {
      if (!m.examAt || t > m.examAt) continue;
      if (t === midnight(m.examAt)) { tasks.push({ moduleId: m.id, short: m.short, kind: 'exam', label: `${m.short} exam`, minutes: 0 }); continue; }
      const daysToExam = daysBetween(t, m.examAt);
      const q = queues.get(m.id) ?? [];
      const learning = daysToExam > m.reviewDays || (q.length > 0 && daysToExam > 0);
      if (learning && q.length) {
        // even share of what's left over the learning days left (catching up if the review phase has begun)
        const learnDaysLeft = Math.max(1, daysToExam - m.reviewDays);
        const rest = q.reduce((s, x) => s + x.left, 0);
        let budget = Math.max(Math.ceil(rest / learnDaysLeft), Math.min(MIN_SESSION, Math.ceil(rest)));
        m.learnEnds = t;
        while (budget > 0 && q.length) {
          const head = q[0];
          const take = Math.min(head.left, budget);
          tasks.push({ moduleId: m.id, short: m.short, kind: 'learn', lectureId: head.lec.id, label: `${m.short} L${head.lec.number || '?'} · ${head.lec.title}`, minutes: Math.max(1, Math.round(take)) });
          head.left -= take;
          budget -= take;
          if (head.left <= 0.5) q.shift();
        }
      } else if (daysToExam > m.reviewDays) {
        // lessons done early: keep it fresh until the review days
        tasks.push({ moduleId: m.id, short: m.short, kind: 'review', label: `${m.short} keep-up: recap and weak spots`, minutes: 15 });
      } else {
        tasks.push({ moduleId: m.id, short: m.short, kind: 'review', label: `${m.short} review: weak spots, recap and exam-style questions`, minutes: 40 });
      }
    }
    // merge repeated lecture slices on the same day
    const merged: DayTask[] = [];
    for (const x of tasks) {
      const same = merged.find((y) => y.kind === 'learn' && y.lectureId && y.lectureId === x.lectureId && y.moduleId === x.moduleId);
      if (same) same.minutes += x.minutes; else merged.push(x);
    }
    days.push({ key: dayKey(t), date: t, tasks: merged, minutes: merged.reduce((s, x) => s + x.minutes, 0) });
  }

  // today: its share of lessons, plus recap due and the weakest taught ILOs
  const todayTasks: DayTask[] = [...(days[0]?.tasks ?? [])];
  for (const m of mods) {
    if (m.due > 0) todayTasks.push({ moduleId: m.id, short: m.short, kind: 'review', label: `${m.short} recap: ${m.due} question${m.due === 1 ? '' : 's'} due`, minutes: Math.max(2, Math.round(m.due * 0.7)) });
  }
  const weak = mods
    .flatMap((m) => m.weak.filter((w) => w.mastery < 0.6).map((w) => ({ ...w, moduleId: m.id, short: m.short })))
    .sort((a, b) => a.mastery - b.mastery);
  return {
    modules,
    days,
    today: todayTasks,
    perDay: modules.filter((m) => m.phase === 'learn').reduce((s, m) => s + m.perDay, 0),
    weak,
  };
}
