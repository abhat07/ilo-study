/**
 * Small settings that sync between devices, stored as kv records with one key per change so devices
 * merge cleanly (newest wins), like rest-day choices:
 *   plan:exam:<moduleId>:<at>  {moduleId, date, at}   the module's exam date ('' = none)
 *   plan:aims:<moduleId>:<at>  {moduleId, list, at}   the module-wide (overarching) ILOs
 * These are settings, so "Start again" leaves them alone.
 */
import { db, notifyChange } from '../db';

export const PLAN_PREFIX = 'plan:';

/** Module-wide ("overarching") learning outcome. Ids look like AMB-M1. */
export interface Aim { id: string; text: string }
interface ExamRec { moduleId: string; date: string; at: number }
interface AimsRec { moduleId: string; list: Aim[]; at: number }

/** Exam dates you gave, used until you change them in the app. */
export const DEFAULT_EXAMS: Record<string, string> = {
  LIFE50016: '2027-01-12', // AMB
  LIFE50011: '2027-01-14', // Genetics
};

async function latest<T extends { at: number }>(prefix: string): Promise<T | undefined> {
  const d = await db();
  const keys = (await d.getAllKeys('kv')).map(String).filter((k) => k.startsWith(prefix));
  let best: T | undefined;
  for (const k of keys) {
    const v = (await d.get('kv', k)) as T | undefined;
    if (v && (!best || v.at > best.at)) best = v;
  }
  return best;
}

async function put(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', value, key);
  notifyChange();
}

/** The exam date (YYYY-MM-DD) for a module, or '' if it has none. */
export async function examDate(moduleId: string): Promise<string> {
  const rec = await latest<ExamRec>(`plan:exam:${moduleId}:`);
  return rec ? rec.date : DEFAULT_EXAMS[moduleId] ?? '';
}

export async function setExamDate(moduleId: string, date: string): Promise<void> {
  const at = Date.now();
  await put(`plan:exam:${moduleId}:${at}`, { moduleId, date, at } satisfies ExamRec);
}

export async function moduleAims(moduleId: string): Promise<Aim[]> {
  return (await latest<AimsRec>(`plan:aims:${moduleId}:`))?.list ?? [];
}

/** Save the module-wide ILOs. An aim whose text is unchanged keeps its id, so lessons that cite it still match. */
export async function setModuleAims(moduleId: string, short: string, texts: string[]): Promise<Aim[]> {
  const old = await moduleAims(moduleId);
  const byText = new Map(old.map((a) => [a.text.trim().toLowerCase(), a.id]));
  let next = old.reduce((m, a) => Math.max(m, Number(a.id.split('-M').pop()) || 0), 0) + 1;
  const list = texts
    .map((t) => t.trim())
    .filter((t) => t.length > 3)
    .map((text) => ({ id: byText.get(text.toLowerCase()) ?? `${short}-M${next++}`, text }));
  const at = Date.now();
  await put(`plan:aims:${moduleId}:${at}`, { moduleId, list, at } satisfies AimsRec);
  return list;
}
