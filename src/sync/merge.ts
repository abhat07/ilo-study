/**
 * Pure merge of two snapshots of the learning data (this device + the synced copy).
 *
 * Rules, chosen so nothing you did on any device is lost:
 *  - attempts, spend, events, disputes, genlog: append-only → union by id
 *  - sessions: keep the version with more answers (then the one that has ended)
 *  - modules: newest update wins; each module's ILO list is taken as a whole from whichever
 *    device confirmed it most recently (so deleting an ILO on one device propagates)
 *  - files: union; removed > superseded > active (a removal or newer upload on any device wins)
 *  - chunks (passages): newest update wins
 *  - items (questions): union; most severe status wins (retired > flagged > active); the FSRS
 *    schedule and seen-count are rebuilt from the merged answers when neither side has them all;
 *    duplicate questions generated on two devices for the same passage are retired if unanswered
 *  - kv: only cached explanations, the progress-reset time, reef records and rest-day choices are synced
 *  - progress reset ("Start again"): the latest reset time wins; answers, sessions and disputes from before
 *    it are dropped and lesson reading progress recorded before it is cleared, on both sides, before merging
 *  - images (slide pictures, metadata only): union; removed wins; uploaded/pruned flags are kept once set
 */
import type { Attempt, Chunk, Dispute, GenLog, Ilo, IngestEvent, Item, LearnSection, Lecture, Module, SessionRecord, SlideImage, SourceFile, SpendRecord } from '../types';
import { replayCard } from '../engine/scheduler';

export type SyncFile = Omit<SourceFile, 'blob'>;
export type SyncImage = Omit<SlideImage, 'blob'>;

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
    lectures: Lecture[];
    sections: LearnSection[];
    images: SyncImage[];
  };
}

export function emptySnapshot(): Snapshot {
  return {
    app: 'ilo-study', v: 1, at: 0,
    stores: { modules: [], files: [], chunks: [], ilos: [], items: [], attempts: [], disputes: [], sessions: [], spend: [], genlog: [], events: [], kv: [], lectures: [], sections: [], images: [] },
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

const RESET_KEY = 'progressResetAt';
const resetOf = (s: Snapshot['stores']) => Number(s.kv.find((k) => k.key === RESET_KEY)?.value ?? 0);

/** Remove progress from before a reset (see sync/reset.ts). */
function scrub(s: Snapshot['stores'], R: number): Snapshot['stores'] {
  if (!R) return s;
  return {
    ...s,
    attempts: s.attempts.filter((t) => t.at >= R),
    sessions: s.sessions.filter((x) => x.startedAt >= R),
    disputes: s.disputes.filter((x) => x.at >= R),
    // reef records come from answering, so they go too (rest-day choices are settings and stay)
    kv: s.kv.filter((k) => !k.key.startsWith('reef:') || Number((k.value as { at?: number } | null)?.at ?? 0) >= R),
    sections: s.sections.map((x) => {
      if (x.updatedAt >= R || (!x.seenAt && !x.readTo)) return x;
      const { seenAt, readTo, ...rest } = x;
      void seenAt;
      void readTo;
      return rest;
    }),
  };
}

export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  // snapshots written before lectures existed lack these stores
  const A0 = { ...emptySnapshot().stores, ...a.stores }, B0 = { ...emptySnapshot().stores, ...b.stores };
  const R = Math.max(resetOf(A0), resetOf(B0));
  const A = scrub(A0, R), B = scrub(B0, R);

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

  const FILE_SEV = { active: 0, superseded: 1, removed: 2 } as const;
  const files = unionBy(A.files, B.files, (f) => f.id, (x, y) => (FILE_SEV[y.status] > FILE_SEV[x.status] ? y : x));
  const chunks = unionBy(A.chunks, B.chunks, (c) => c.id, (x, y) => (y.updatedAt > x.updatedAt ? y : x));
  const attempts = unionBy(A.attempts, B.attempts, (t) => t.id, (x, y) => (y.disputed && !x.disputed ? y : x));
  const disputes = unionBy(A.disputes, B.disputes, (d) => d.id, (x, y) => (y.status === 'accepted' ? y : x));
  const sessions = unionBy(A.sessions, B.sessions, (s) => s.id, (x, y) =>
    y.attemptIds.length > x.attemptIds.length || (y.attemptIds.length === x.attemptIds.length && !!y.endedAt && !x.endedAt) ? y : x,
  );
  const spend = unionBy(A.spend, B.spend, (s) => s.id);
  const genlog = unionBy(A.genlog, B.genlog, (g) => g.cacheKey, (x, y) => (y.accepted > x.accepted ? y : x));
  const events = unionBy(A.events, B.events, (e) => e.id);
  const synced = (k: { key: string }) => k.key.startsWith('explain:') || k.key.startsWith('reef:') || k.key.startsWith('streak:');
  const kv = unionBy(A.kv.filter(synced), B.kv.filter(synced), (k) => k.key);
  if (R) kv.push({ key: RESET_KEY, value: R });

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
    stores: {
      modules, files, chunks, ilos, items, attempts, disputes, sessions, spend, genlog, events, kv,
      lectures: unionBy(A.lectures, B.lectures, (l) => l.id, (x, y) => (y.updatedAt > x.updatedAt ? y : x)),
      images: unionBy(A.images, B.images, (i) => i.id, (x, y) => ({
        ...(y.updatedAt > x.updatedAt ? y : x),
        status: x.status === 'removed' || y.status === 'removed' ? 'removed' : 'active',
        uploaded: !!(x.uploaded || y.uploaded) || undefined,
        pruned: !!(x.pruned || y.pruned) || undefined,
      })),
      sections: unionBy(A.sections, B.sections, (s) => s.id, (x, y) => {
        const base = y.updatedAt > x.updatedAt || (!!y.seenAt && !x.seenAt) ? y : x;
        const readTo = Math.max(x.readTo ?? 0, y.readTo ?? 0);
        return { ...base, seenAt: x.seenAt ?? y.seenAt, ...(readTo ? { readTo } : {}) };
      }),
    },
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
