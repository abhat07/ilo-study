/**
 * "Start again": clear all study progress but keep every upload, ILO, lecture, question and lesson.
 *
 * The reset is a timestamp stored in kv['progressResetAt'] and synced. Every device, and every merge,
 * drops answers, sessions and disputes from before it, clears lesson reading progress recorded before it,
 * and rebuilds each question's schedule from the answers that remain (none), so old answers on a device that
 * hasn't synced yet can't bring the progress back. XP, level, streak, badges and mastery are all computed
 * from answers, so they reset too. The spend log is kept (it is real money).
 */
import { db, kvGet, notifyChange } from '../db';
import type { Attempt } from '../types';
import { replayCard } from '../engine/scheduler';

export const RESET_KEY = 'progressResetAt';

/** kv records the game keeps that sync between devices: reef picks and lectures, rest-day choices */
export const isSyncedGameKey = (k: string) => k.startsWith('reef:') || k.startsWith('streak:');

export async function progressResetAt(): Promise<number> {
  return kvGet<number>(RESET_KEY, 0);
}

/** Apply a reset at time `at` to this device's data. Safe to run repeatedly. Returns how many answers were removed. */
export async function enforceReset(at: number): Promise<number> {
  if (!at) return 0;
  const d = await db();
  const tx = d.transaction(['attempts', 'sessions', 'disputes', 'items', 'sections', 'kv'], 'readwrite');
  let removed = 0, changed = 0;
  const kept = new Map<string, Attempt[]>();
  for (const a of await tx.objectStore('attempts').getAll()) {
    if (a.at < at) {
      await tx.objectStore('attempts').delete(a.id);
      removed++;
    } else if (!a.elaboration) {
      kept.set(a.itemId, [...(kept.get(a.itemId) ?? []), a]);
    }
  }
  for (const s of await tx.objectStore('sessions').getAll()) if (s.startedAt < at) { await tx.objectStore('sessions').delete(s.id); changed++; }
  for (const x of await tx.objectStore('disputes').getAll()) if (x.at < at) { await tx.objectStore('disputes').delete(x.id); changed++; }
  for (const it of await tx.objectStore('items').getAll()) {
    const hist = (kept.get(it.id) ?? []).sort((p, q) => p.at - q.at);
    if (it.seenCount !== hist.length) {
      await tx.objectStore('items').put({ ...it, seenCount: hist.length, card: replayCard(hist, it.createdAt) });
      changed++;
    }
  }
  for (const s of await tx.objectStore('sections').getAll()) {
    if ((s.seenAt || s.readTo) && s.updatedAt < at) {
      const { seenAt, readTo, ...rest } = s;
      void seenAt;
      void readTo;
      await tx.objectStore('sections').put(rest);
      changed++;
    }
  }
  // reef picks and finished-lecture records from before the reset
  for (const k of await tx.objectStore('kv').getAllKeys()) {
    if (!String(k).startsWith('reef:')) continue;
    const v = (await tx.objectStore('kv').get(k)) as { at?: number } | undefined;
    if (Number(v?.at ?? 0) < at) { await tx.objectStore('kv').delete(k); changed++; }
  }
  const cur = ((await tx.objectStore('kv').get(RESET_KEY)) as number | undefined) ?? 0;
  if (at > cur) await tx.objectStore('kv').put(at, RESET_KEY);
  await tx.done;
  if (removed || changed) notifyChange();
  return removed;
}

/** The "Start again" button: reset now on this device; the next sync carries it to the others. */
export async function resetProgress(): Promise<number> {
  return enforceReset(Date.now());
}
