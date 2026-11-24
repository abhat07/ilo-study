/**
 * Pure merge of two snapshots of the learning data (this device + the synced copy).
 *
 * Rules, chosen so nothing you did on any device is lost:
 *  - attempts, spend, events, disputes, genlog: append-only → union by id
 *  - sessions: keep the version with more answers (then the one that has ended)
 *  - modules: newest update wins; each module's ILO list is taken as a whole from whichever
 *    device confirmed it most recently (so deleting an ILO on one device propagates)
 *  - files: union; "superseded" wins over "active" (a newer upload replaced it somewhere)
 *  - chunks (passages): newest update wins
 *  - items (questions): union; most severe status wins (retired > flagged > active); the FSRS
 *    schedule and seen-count are rebuilt from the merged answers when neither side has them all;
 *    duplicate questions generated on two devices for the same passage are retired if unanswered
 *  - kv: only cached explanations are synced
 */
import type { Attempt, Chunk, Dispute, GenLog, Ilo, IngestEvent, Item, Module, SessionRecord, SourceFile, SpendRecord } from '../types';
import { replayCard } from '../engine/scheduler';

export type SyncFile = Omit<SourceFile, 'blob'>;

export interface Snapshot {
  app: 'ilo-study';
  v: 1;
  at: number;
  stores: {
    modules: Module[];
    files: SyncFile[];
    chunks: Chunk[];
    ilos: Ilo[];
    items: Item[];
    attempts: Attempt[];
    disputes: Dispute[];
    sessions: SessionRecord[];
    spend: SpendRecord[];
    genlog: GenLog[];
    events: IngestEvent[];
    kv: { key: string; value: unknown }[];
  };
}

export function emptySnapshot(): Snapshot {
  return {
    app: 'ilo-study', v: 1, at: 0,
    stores: { modules: [], files: [], chunks: [], ilos: [], items: [], attempts: [], disputes: [], sessions: [], spend: [], genlog: [], events: [], kv: [] },
  };
}

function unionBy<T>(a: T[], b: T[], key: (x: T) => string, pick: (x: T, y: T) => T = (x) => x): T[] {
  const m = new Map<string, T>();
  for (const x of a) m.set(key(x), x);
  for (const y of b) {
    const k = key(y);
    const x = m.get(k);
    m.set(k, x === undefined ? y : pick(x, y));
  }
  return [...m.values()];
}

const SEVERITY: Record<Item['status'], number> = { active: 0, flagged: 1, retired: 2 };

export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  const A = a.stores, B = b.stores;

  const modules = unionBy(A.modules, B.modules, (m) => m.id, (x, y) => ((y.updatedAt ?? y.createdAt) > (x.updatedAt ?? x.createdAt) ? y : x));

  // ILO lists: per module, whole list from the side that confirmed most recently
  const ilosAtA = new Map(A.modules.map((m) => [m.id, m.ilosAt ?? 0]));
  const ilosAtB = new Map(B.modules.map((m) => [m.id, m.ilosAt ?? 0]));
  const moduleIds = new Set([...A.ilos, ...B.ilos].map((i) => i.moduleId));
  const ilos: Ilo[] = [];
  for (const mid of moduleIds) {
    const ta = ilosAtA.get(mid) ?? 0, tb = ilosAtB.get(mid) ?? 0;
    const la = A.ilos.filter((i) => i.moduleId === mid), lb = B.ilos.filter((i) => i.moduleId === mid);
    if (ta > tb) ilos.push(...la);
    else if (tb > ta) ilos.push(...lb);
    else ilos.push(...unionBy(la, lb, (i) => i.id));
  }

  const files = unionBy(A.files, B.files, (f) => f.id, (x, y) => (x.status === 'superseded' ? x : y.status === 'superseded' ? y : x));
  const chunks = unionBy(A.chunks, B.chunks, (c) => c.id, (x, y) => (y.updatedAt > x.updatedAt ? y : x));
  const attempts = unionBy(A.attempts, B.attempts, (t) => t.id, (x, y) => (y.disputed && !x.disputed ? y : x));
  const disputes = unionBy(A.disputes, B.disputes, (d) => d.id, (x, y) => (y.status === 'accepted' ? y : x));
  const sessions = unionBy(A.sessions, B.sessions, (s) => s.id, (x, y) =>
    y.attemptIds.length > x.attemptIds.length || (y.attemptIds.length === x.attemptIds.length && !!y.endedAt && !x.endedAt) ? y : x,
  );
  const spend = unionBy(A.spend, B.spend, (s) => s.id);
  const genlog = unionBy(A.genlog, B.genlog, (g) => g.cacheKey, (x, y) => (y.accepted > x.accepted ? y : x));
  const events = unionBy(A.events, B.events, (e) => e.id);
  const kv = unionBy(
    A.kv.filter((k) => k.key.startsWith('explain:')),
    B.kv.filter((k) => k.key.startsWith('explain:')),
    (k) => k.key,
  );

  // Items: union, strictest status, then make the schedule consistent with the merged answers.
  const answersByItem = new Map<string, Attempt[]>();
  for (const t of attempts) {
    if (t.elaboration) continue;
    if (!answersByItem.has(t.itemId)) answersByItem.set(t.itemId, []);
    answersByItem.get(t.itemId)!.push(t);
  }
  let items = unionBy(A.items, B.items, (i) => i.id, (x, y) => {
    const base = y.seenCount > x.seenCount ? y : x;
    const status = SEVERITY[y.status] > SEVERITY[x.status] ? y : x;
    return { ...base, status: status.status, flagReason: status.flagReason ?? base.flagReason };
  });
  items = items.map((it) => {
    const hist = answersByItem.get(it.id) ?? [];
    if (hist.length === it.seenCount) return it; // one side already had every answer
    return { ...it, seenCount: hist.length, card: replayCard(hist, it.createdAt) };
  });

  // Same passage + ILO + level generated on two devices: retire the unanswered duplicates.
  const byKey = new Map<string, Item[]>();
  for (const it of items) {
    if (!byKey.has(it.cacheKey)) byKey.set(it.cacheKey, []);
    byKey.get(it.cacheKey)!.push(it);
  }
  const retire = new Set<string>();
  for (const group of byKey.values()) {
    const batches = new Map<number, Item[]>();
    for (const it of group) {
      const k = Math.round(it.createdAt / 60_000); // items from one generation call share a timestamp
      if (!batches.has(k)) batches.set(k, []);
      batches.get(k)!.push(it);
    }
    if (batches.size < 2) continue;
    const ranked = [...batches.values()].sort(
      (p, q) => q.reduce((s, i) => s + i.seenCount, 0) - p.reduce((s, i) => s + i.seenCount, 0) || p[0].createdAt - q[0].createdAt,
    );
    for (const batch of ranked.slice(1)) for (const it of batch) if (it.seenCount === 0 && it.status === 'active') retire.add(it.id);
  }
  items = items.map((it) => (retire.has(it.id) ? { ...it, status: 'retired' as const, flagReason: 'Duplicate generated on another device' } : it));

  return {
    app: 'ilo-study', v: 1, at: Math.max(a.at, b.at),
    stores: { modules, files, chunks, ilos, items, attempts, disputes, sessions, spend, genlog, events, kv },
  };
}

/** Stable string for change detection (sorted records, sorted keys). */
export function canonical(s: Snapshot): string {
  const sortKey = (x: any) => x.id ?? x.cacheKey ?? x.key ?? '';
  const norm = (v: any): any => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]));
    return v;
  };
  const stores: Record<string, unknown> = {};
  for (const [k, rows] of Object.entries(s.stores)) {
    stores[k] = norm([...(rows as any[])].sort((x, y) => String(sortKey(x)).localeCompare(String(sortKey(y)))));
  }
  return JSON.stringify(stores);
}
