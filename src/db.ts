import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  Attempt, Chunk, Dispute, GenLog, Ilo, IngestEvent, Item, LearnSection, Lecture, Module, SessionRecord, SlideImage, SourceFile, SpendRecord,
} from './types';

interface StudyDB extends DBSchema {
  modules: { key: string; value: Module };
  files: { key: string; value: SourceFile; indexes: { byModule: string } };
  chunks: { key: string; value: Chunk; indexes: { byModule: string; byFile: string } };
  ilos: { key: string; value: Ilo; indexes: { byModule: string } };
  items: { key: string; value: Item; indexes: { byModule: string; byCacheKey: string } };
  attempts: { key: string; value: Attempt; indexes: { byModule: string; byItem: string } };
  disputes: { key: string; value: Dispute; indexes: { byModule: string } };
  sessions: { key: string; value: SessionRecord; indexes: { byModule: string } };
  spend: { key: string; value: SpendRecord; indexes: { byMonth: string } };
  genlog: { key: string; value: GenLog; indexes: { byModule: string } };
  events: { key: string; value: IngestEvent; indexes: { byModule: string } };
  lectures: { key: string; value: Lecture; indexes: { byModule: string } };
  sections: { key: string; value: LearnSection; indexes: { byModule: string; byLecture: string } };
  images: { key: string; value: SlideImage; indexes: { byModule: string; byChunk: string; byFile: string } };
  kv: { key: string; value: unknown };
}

export type StoreName =
  | 'modules' | 'files' | 'chunks' | 'ilos' | 'items' | 'attempts' | 'disputes'
  | 'sessions' | 'spend' | 'genlog' | 'events' | 'kv' | 'lectures' | 'sections' | 'images';

export const ALL_STORES: StoreName[] = [
  'modules', 'files', 'chunks', 'ilos', 'items', 'attempts', 'disputes', 'sessions', 'spend', 'genlog', 'events', 'kv', 'lectures', 'sections', 'images',
];

let dbp: Promise<IDBPDatabase<StudyDB>> | null = null;

export function db(): Promise<IDBPDatabase<StudyDB>> {
  if (!dbp) {
    dbp = openDB<StudyDB>('ilo-study', 3, {
      // another window still has the old version open: reload it so the upgrade can proceed
      blocking() {
        if (typeof location !== 'undefined') location.reload();
      },
      upgrade(d, oldVersion) {
        if (oldVersion < 3) {
          const img = d.createObjectStore('images', { keyPath: 'id' });
          img.createIndex('byModule', 'moduleId');
          img.createIndex('byChunk', 'chunkId');
          img.createIndex('byFile', 'fileId');
        }
        if (oldVersion < 2) {
          const lec = d.createObjectStore('lectures', { keyPath: 'id' });
          lec.createIndex('byModule', 'moduleId');
          const sec = d.createObjectStore('sections', { keyPath: 'id' });
          sec.createIndex('byModule', 'moduleId');
          sec.createIndex('byLecture', 'lectureId');
        }
        if (oldVersion >= 1) return;
        d.createObjectStore('modules', { keyPath: 'id' });
        const files = d.createObjectStore('files', { keyPath: 'id' });
        files.createIndex('byModule', 'moduleId');
        const chunks = d.createObjectStore('chunks', { keyPath: 'id' });
        chunks.createIndex('byModule', 'moduleId');
        chunks.createIndex('byFile', 'fileId');
        const ilos = d.createObjectStore('ilos', { keyPath: 'id' });
        ilos.createIndex('byModule', 'moduleId');
        const items = d.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('byModule', 'moduleId');
        items.createIndex('byCacheKey', 'cacheKey');
        const attempts = d.createObjectStore('attempts', { keyPath: 'id' });
        attempts.createIndex('byModule', 'moduleId');
        attempts.createIndex('byItem', 'itemId');
        const disputes = d.createObjectStore('disputes', { keyPath: 'id' });
        disputes.createIndex('byModule', 'moduleId');
        const sessions = d.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('byModule', 'moduleId');
        const spend = d.createObjectStore('spend', { keyPath: 'id' });
        spend.createIndex('byMonth', 'month');
        const genlog = d.createObjectStore('genlog', { keyPath: 'cacheKey' });
        genlog.createIndex('byModule', 'moduleId');
        const events = d.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('byModule', 'moduleId');
        d.createObjectStore('kv');
      },
    });
  }
  return dbp;
}

export async function byModule<S extends Exclude<StoreName, 'modules' | 'spend' | 'kv'>>(
  store: S,
  moduleId: string,
): Promise<StudyDB[S]['value'][]> {
  const d = await db();
  // every store in S has a byModule index
  return (d as any).getAllFromIndex(store, 'byModule', moduleId);
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const v = await (await db()).get('kv', key);
  return (v as T) ?? fallback;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', value, key);
}

export function uid(prefix = ''): string {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export async function sha256(data: ArrayBuffer | string): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Default modules. More can be added from the home screen. */
export const DEFAULT_MODULES: Omit<Module, 'createdAt' | 'iloStatus'>[] = [
  { id: 'LIFE50016', short: 'AMB', name: 'Applied Molecular Biology' },
  { id: 'LIFE50011', short: 'GEN', name: 'Genetics' },
];

export async function ensureModules(): Promise<Module[]> {
  const d = await db();
  const existing = await d.getAll('modules');
  if (existing.length === 0) {
    const t = Date.now();
    for (const [i, m] of DEFAULT_MODULES.entries()) {
      await d.put('modules', { ...m, createdAt: t + i, updatedAt: t + i, iloStatus: 'none' });
    }
    queueMicrotask(notifyChange);
    return d.getAll('modules');
  }
  return existing;
}

/** Simple change notification so screens can refresh after background work. */
const listeners = new Set<() => void>();
export function onDataChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notifyChange(): void {
  for (const fn of listeners) fn();
}

/** Tests only: forget the open connection so a fresh IndexedDB (another "device") can be used. */
export function __resetDbForTests(): void {
  dbp = null;
}
