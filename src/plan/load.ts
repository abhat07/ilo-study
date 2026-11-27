/** Gather what the planner needs from your data (see plan.ts). */
import { byModule } from '../db';
import { estimateMastery } from '../engine/mastery';
import { lectureOverview } from '../learn/overview';
import { sortedModules } from '../reef/state';
import { computePlan, type Plan, type PlanModuleIn } from './plan';
import { examDate } from './store';

export async function loadPlan(now = Date.now()): Promise<Plan> {
  const mods: PlanModuleIn[] = [];
  for (const m of await sortedModules()) {
    const [rows, ilos, items, attempts] = await Promise.all([
      lectureOverview(m.id), byModule('ilos', m.id), byModule('items', m.id), byModule('attempts', m.id),
    ]);
    const im = new Map(items.map((i) => [i.id, i]));
    const taught = new Set(attempts.flatMap((a) => a.iloIds));
    mods.push({
      id: m.id,
      short: m.short,
      exam: await examDate(m.id),
      lectures: rows.filter((r) => r.lecture.iloIds.length).map((r) => ({
        id: r.lecture.id, number: r.lecture.number, title: r.lecture.title, left: r.mins.left, done: r.st.done,
      })),
      due: rows.reduce((n, r) => n + r.st.due, 0),
      weak: ilos.filter((i) => taught.has(i.id)).map((i) => ({
        id: i.id, text: i.text, mastery: estimateMastery(attempts.filter((a) => a.iloIds.includes(i.id)), im).value,
      })),
    });
  }
  return computePlan(mods, now);
}
