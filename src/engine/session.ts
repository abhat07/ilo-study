/**
 * Session engine. The app decides what comes next; the student only chose the module.
 *  - due reviews first (spaced repetition), then new questions on the weakest ILOs
 *  - interleaved: avoids the same ILO twice in a row and the same lecture back-to-back
 *  - items answered wrong come back once later in the same session
 */
import { byModule, db, notifyChange, uid } from '../db';
import type { Attempt, Confidence, Ilo, Item, MarkDetail, SessionRecord } from '../types';
import { estimateMastery } from './mastery';
import { isDue, retrievability, review } from './scheduler';
import { levelFor } from './generate';
import { normalise } from '../ingest/text';

export const SESSION_TARGET_MS = 15 * 60_000;
export const SESSION_MAX_ITEMS = 24;
const RETRY_GAP = 4;

export interface SessionCtx {
  record: SessionRecord;
  served: string[]; // item ids in order
  retry: { itemId: string; after: number }[];
}

export async function masteryMap(moduleId: string): Promise<Record<string, number>> {
  const [ilos, items, attempts] = await Promise.all([byModule('ilos', moduleId), byModule('items', moduleId), byModule('attempts', moduleId)]);
  const im = new Map(items.map((i) => [i.id, i]));
  const out: Record<string, number> = {};
  for (const ilo of ilos) out[ilo.id] = estimateMastery(attempts.filter((a) => a.iloIds.includes(ilo.id)), im).value;
  return out;
}

export async function startSession(moduleId: string): Promise<SessionCtx> {
  const record: SessionRecord = { id: uid('se_'), moduleId, startedAt: Date.now(), attemptIds: [], masteryBefore: await masteryMap(moduleId) };
  await (await db()).put('sessions', record);
  return { record, served: [], retry: [] };
}

/** Pure selection so it can be unit-tested. */
export function selectNext(
  items: Item[],
  ctx: { served: string[]; retry: { itemId: string; after: number }[] },
  mastery: Record<string, number>,
  fileOf: (it: Item) => string,
  now = new Date(),
): Item | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  const n = ctx.served.length;
  const lastItems = ctx.served.slice(-2).map((id) => byId.get(id)).filter(Boolean) as Item[];
  const recentIlos = new Set(lastItems.flatMap((i) => i.iloIds));
  const lastFile = lastItems.length ? fileOf(lastItems[lastItems.length - 1]) : '';

  const retryReady = ctx.retry.find((r) => r.after <= n && byId.get(r.itemId)?.status === 'active');
  if (retryReady) {
    const it = byId.get(retryReady.itemId)!;
    if (!it.iloIds.some((x) => recentIlos.has(x)) || items.length < 4) return it;
  }

  const served = new Set(ctx.served);
  let best: Item | null = null;
  let bestScore = -Infinity;
  for (const it of items) {
    if (it.status !== 'active' || served.has(it.id)) continue;
    const m = Math.min(...it.iloIds.map((x) => mastery[x] ?? 0));
    let s: number;
    if (it.seenCount > 0) {
      if (!isDue(it.card, now)) s = 0.1; // filler only
      else s = 3 + (1 - retrievability(it.card, now)) * 2;
    } else {
      s = 2 + (1 - m) * 1.5;
      if (it.level !== levelFor(m)) s -= 1;
    }
    if (it.iloIds.some((x) => recentIlos.has(x))) s -= 2;
    if (fileOf(it) === lastFile) s -= 0.75;
    // small deterministic jitter so ties don't always resolve the same way
    s += (hashStr(it.id + n) % 100) / 1000;
    if (s > bestScore) {
      bestScore = s;
      best = it;
    }
  }
  if (best && bestScore <= 0.2 && n >= 6) return null; // only not-due repeats left: end rather than over-drill
  return best;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export async function nextItem(ctx: SessionCtx): Promise<Item | null> {
  const moduleId = ctx.record.moduleId;
  if (ctx.served.length >= SESSION_MAX_ITEMS) return null;
  if (Date.now() - ctx.record.startedAt >= SESSION_TARGET_MS && ctx.served.length > 0) return null;
  const [items, mastery] = await Promise.all([byModule('items', moduleId), masteryMap(moduleId)]);
  const it = selectNext(items, ctx, mastery, (i) => i.source.fileName);
  if (it) {
    ctx.retry = ctx.retry.filter((r) => r.itemId !== it.id);
    ctx.served.push(it.id);
  }
  return it;
}

// ---------------- marking (local, free) ----------------

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export function markCloze(it: Item, response: string): MarkDetail {
  const r = normalise(response).replace(/[^\w\s'-]/g, '');
  const accepted = [it.answer, ...it.acceptedAnswers].map((x) => normalise(x).replace(/[^\w\s'-]/g, '')).filter(Boolean);
  const exact = accepted.includes(r);
  const near = !exact && accepted.some((a) => a.length >= 5 && lev(a, r) <= (a.length >= 10 ? 2 : 1));
  return {
    by: 'auto',
    score: exact || near ? 1 : 0,
    reasoning: exact ? 'Matches the term in the lecture.' : near ? `Accepted as a spelling variant of "${it.answer}".` : `The lecture's term is "${it.answer}".`,
  };
}

/** Fraction of adjacent pairs placed in the right relative order. */
export function markOrder(it: Item, order: string[]): MarkDetail {
  const pos = new Map(it.steps.map((s, i) => [s, i]));
  let good = 0;
  for (let i = 0; i + 1 < order.length; i++) if ((pos.get(order[i]) ?? 0) < (pos.get(order[i + 1]) ?? 0)) good++;
  const allRight = order.every((s, i) => it.steps[i] === s);
  const score = allRight ? 1 : good / Math.max(1, order.length - 1);
  return { by: 'auto', score: allRight ? 1 : Math.round(score * 100) / 100 * 0.8, reasoning: allRight ? 'All steps in the right order.' : `${good} of ${order.length - 1} neighbouring pairs in the right order.` };
}

export function markMcq(it: Item, choice: number): MarkDetail {
  return { by: 'auto', score: choice === it.correctIndex ? 1 : 0, reasoning: it.distractorWhy[choice] ?? '' };
}

// ---------------- recording ----------------

export async function recordAttempt(
  ctx: SessionCtx,
  it: Item,
  response: string,
  confidence: Confidence,
  mark: MarkDetail,
  durationMs: number,
): Promise<Attempt> {
  const d = await db();
  const attempt: Attempt = {
    id: uid('at_'),
    itemId: it.id,
    moduleId: it.moduleId,
    iloIds: it.iloIds,
    sessionId: ctx.record.id,
    at: Date.now(),
    confidence,
    response,
    score: mark.score,
    firstExposure: it.seenCount === 0,
    transfer: it.transfer,
    level: it.level,
    durationMs,
    mark,
  };
  const fresh = (await d.get('items', it.id)) ?? it;
  const updated: Item = { ...fresh, card: review(fresh.card, mark.score, confidence), seenCount: fresh.seenCount + 1 };
  const tx = d.transaction(['attempts', 'items', 'sessions'], 'readwrite');
  await tx.objectStore('attempts').put(attempt);
  await tx.objectStore('items').put(updated);
  ctx.record.attemptIds.push(attempt.id);
  await tx.objectStore('sessions').put(ctx.record);
  await tx.done;
  if (mark.score < 0.7) ctx.retry.push({ itemId: it.id, after: ctx.served.length + RETRY_GAP });
  notifyChange();
  return attempt;
}

/** Replace the mark on an attempt (e.g. AI marking finished after a self-mark fallback). */
export async function updateAttemptMark(attemptId: string, mark: MarkDetail): Promise<void> {
  const d = await db();
  const a = await d.get('attempts', attemptId);
  if (a) await d.put('attempts', { ...a, mark, score: mark.score });
  notifyChange();
}

export async function recordElaboration(ctx: SessionCtx, it: Item, response: string, selfScore: number): Promise<void> {
  const d = await db();
  await d.put('attempts', {
    id: uid('at_'), itemId: it.id, moduleId: it.moduleId, iloIds: it.iloIds, sessionId: ctx.record.id, at: Date.now(),
    confidence: 2, response, score: selfScore, firstExposure: false, transfer: false, level: it.level, durationMs: 0,
    mark: { by: 'self', score: selfScore }, elaboration: true,
  });
}

export async function disputeMark(attempt: Attempt, reason: string): Promise<void> {
  const d = await db();
  await d.put('disputes', {
    id: uid('dp_'), attemptId: attempt.id, itemId: attempt.itemId, moduleId: attempt.moduleId, at: Date.now(),
    reason, originalScore: attempt.score, status: 'open',
  });
  await d.put('attempts', { ...attempt, disputed: true });
  notifyChange();
}

export interface SessionSummary {
  answered: number;
  correct: number;
  minutes: number;
  changes: { ilo: Ilo; before: number; after: number }[];
  overconfident: number;
  underconfident: number;
  nextDue: Date | null;
}

export async function endSession(ctx: SessionCtx): Promise<SessionSummary> {
  const d = await db();
  const moduleId = ctx.record.moduleId;
  const after = await masteryMap(moduleId);
  ctx.record.endedAt = Date.now();
  ctx.record.masteryAfter = after;
  await d.put('sessions', ctx.record);
  const attempts = (await Promise.all(ctx.record.attemptIds.map((id) => d.get('attempts', id)))).filter(Boolean) as Attempt[];
  const ilos = await byModule('ilos', moduleId);
  const changes = ilos
    .map((ilo) => ({ ilo, before: ctx.record.masteryBefore[ilo.id] ?? 0, after: after[ilo.id] ?? 0 }))
    .filter((c) => Math.abs(c.after - c.before) >= 0.01)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  const items = await byModule('items', moduleId);
  const due = items.filter((i) => i.seenCount > 0 && i.status === 'active').map((i) => new Date(i.card.due).getTime());
  return {
    answered: attempts.length,
    correct: attempts.filter((a) => a.score >= 0.7).length,
    minutes: Math.max(1, Math.round((ctx.record.endedAt - ctx.record.startedAt) / 60_000)),
    changes,
    overconfident: attempts.filter((a) => a.confidence >= 3 && a.score < 0.5).length,
    underconfident: attempts.filter((a) => a.confidence <= 2 && a.score >= 0.99).length,
    nextDue: due.length ? new Date(Math.min(...due)) : null,
  };
}
