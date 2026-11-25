/**
 * Sync across devices through a private GitHub repo.
 *
 *   sync/data.json.gz   everything except original PDFs (gzip-compressed JSON snapshot)
 *   blobs/<sha256>.pdf  original PDFs, uploaded once, downloaded to other devices only when you open a slide
 *
 * Each sync: pull → merge with this device (merge.ts) → apply locally (only ever adds or updates,
 * never wipes) → push if the merged copy differs → retry if another device pushed in between.
 * The token lives only in this browser's storage and is never included in backups or the synced copy.
 */
import { db, notifyChange, onDataChange } from '../db';
import type { SourceFile } from '../types';
import { ConflictError, GitHubRemote, RemoteAuthError, type Remote } from './remote';
import { canonical, emptySnapshot, mergeSnapshots, type Snapshot } from './merge';

const DATA_PATH = 'sync/data.json.gz';
const K = { repo: 'ilo.syncRepo', token: 'ilo.syncToken', last: 'ilo.syncLast', error: 'ilo.syncError', device: 'ilo.deviceName' };

// ---------------- settings ----------------

export const syncSettings = {
  repo: () => localStorage.getItem(K.repo) ?? '',
  token: () => localStorage.getItem(K.token) ?? '',
  configured: () => !!(localStorage.getItem(K.repo) && localStorage.getItem(K.token)),
  save(repo: string, token: string) {
    localStorage.setItem(K.repo, repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''));
    localStorage.setItem(K.token, token.trim());
  },
  disconnect() {
    for (const k of [K.repo, K.token, K.last, K.error]) localStorage.removeItem(k);
    emit({ state: 'off' });
  },
  device(): string {
    let d = localStorage.getItem(K.device);
    if (!d) {
      const ua = navigator.userAgent;
      d = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : 'device';
      localStorage.setItem(K.device, d);
    }
    return d;
  },
};

export function githubRemote(): GitHubRemote | null {
  return syncSettings.configured() ? new GitHubRemote(syncSettings.repo(), syncSettings.token()) : null;
}

// ---------------- status for the UI ----------------

export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'error';
  last?: string;
  error?: string;
  detail?: string;
}
const listeners = new Set<(s: SyncStatus) => void>();
let status: SyncStatus = { state: 'off' };
function emit(s: SyncStatus) {
  status = s;
  for (const l of listeners) l(s);
}
export function syncStatus(): SyncStatus {
  if (!syncSettings.configured()) return { state: 'off' };
  if (status.state === 'off') return { state: localStorage.getItem(K.error) ? 'error' : 'idle', last: localStorage.getItem(K.last) ?? undefined, error: localStorage.getItem(K.error) ?? undefined };
  return status;
}
export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------- snapshot in / out ----------------

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function exportSnapshot(): Promise<Snapshot> {
  const d = await db();
  const s = emptySnapshot();
  s.at = Date.now();
  const [modules, files, chunks, ilos, items, attempts, disputes, sessions, spend, genlog, events, keys, vals, lectures, sections] = await Promise.all([
    d.getAll('modules'), d.getAll('files'), d.getAll('chunks'), d.getAll('ilos'), d.getAll('items'), d.getAll('attempts'),
    d.getAll('disputes'), d.getAll('sessions'), d.getAll('spend'), d.getAll('genlog'), d.getAll('events'), d.getAllKeys('kv'), d.getAll('kv'),
    d.getAll('lectures'), d.getAll('sections'),
  ]);
  s.stores = {
    modules, chunks, ilos, items, attempts, disputes, sessions, spend, genlog, events, lectures, sections,
    files: files.map(({ blob, ...rest }) => (void blob, rest)),
    kv: keys.map((k, i) => ({ key: String(k), value: vals[i] })).filter((k) => k.key.startsWith('explain:')),
  };
  return s;
}

const SEV = { active: 0, flagged: 1, retired: 2 } as const;
const FILE_SEV = { active: 0, superseded: 1, removed: 2 } as const;

/**
 * Write the merged snapshot into this device's database. Runs in one transaction and only replaces a
 * record when the merged version is at least as new, so anything written on this device while the sync
 * was running is kept (it will go up next time).
 */
export async function applySnapshot(m: Snapshot): Promise<number> {
  const d = await db();
  const stores = ['modules', 'files', 'chunks', 'ilos', 'items', 'attempts', 'disputes', 'sessions', 'spend', 'genlog', 'events', 'kv', 'lectures', 'sections'] as const;
  const tx = d.transaction(stores as unknown as typeof stores[number][], 'readwrite');
  let changed = 0;
  const S = m.stores;
  const put = async (store: string, value: unknown, key?: string) => {
    changed++;
    await (tx.objectStore(store as any) as any).put(value, key);
  };

  for (const mod of S.modules) {
    const cur = await tx.objectStore('modules').get(mod.id);
    if (!cur || (mod.updatedAt ?? mod.createdAt) > (cur.updatedAt ?? cur.createdAt) || (mod.ilosAt ?? 0) > (cur.ilosAt ?? 0)) await put('modules', mod);
  }
  // ILO lists: replace a module's list when the merged one is from a newer confirmation
  const byMod = new Map<string, typeof S.ilos>();
  for (const i of S.ilos) byMod.set(i.moduleId, [...(byMod.get(i.moduleId) ?? []), i]);
  for (const [mid, list] of byMod) {
    const local = await tx.objectStore('ilos').index('byModule').getAll(mid);
    const keep = new Set(list.map((i) => i.id));
    const same = local.length === list.length && local.every((l) => keep.has(l.id) && list.find((x) => x.id === l.id)!.text === l.text && list.find((x) => x.id === l.id)!.order === l.order);
    if (same) continue;
    for (const l of local) if (!keep.has(l.id)) { await tx.objectStore('ilos').delete(l.id); changed++; }
    for (const i of list) await put('ilos', i);
  }
  for (const f of S.files) {
    const cur = await tx.objectStore('files').get(f.id);
    if (!cur) await put('files', f);
    else if (FILE_SEV[f.status] > FILE_SEV[cur.status]) await put('files', { ...cur, status: f.status, removedAt: f.removedAt, blob: undefined });
  }
  for (const c of S.chunks) {
    const cur = await tx.objectStore('chunks').get(c.id);
    if (!cur || c.updatedAt > cur.updatedAt) await put('chunks', c);
  }
  for (const it of S.items) {
    const cur = await tx.objectStore('items').get(it.id);
    if (!cur) await put('items', it);
    else if (it.seenCount > cur.seenCount) await put('items', { ...it, status: SEV[cur.status] > SEV[it.status] ? cur.status : it.status });
    else if (SEV[it.status] > SEV[cur.status]) await put('items', { ...cur, status: it.status, flagReason: it.flagReason });
  }
  for (const a of S.attempts) {
    const cur = await tx.objectStore('attempts').get(a.id);
    if (!cur || (a.disputed && !cur.disputed)) await put('attempts', a);
  }
  for (const s of S.sessions) {
    const cur = await tx.objectStore('sessions').get(s.id);
    if (!cur || s.attemptIds.length > cur.attemptIds.length || (!!s.endedAt && !cur.endedAt && s.attemptIds.length >= cur.attemptIds.length)) await put('sessions', s);
  }
  for (const x of S.disputes) if (!(await tx.objectStore('disputes').get(x.id))) await put('disputes', x);
  for (const x of S.spend) if (!(await tx.objectStore('spend').get(x.id))) await put('spend', x);
  for (const x of S.genlog) if (!(await tx.objectStore('genlog').get(x.cacheKey))) await put('genlog', x);
  for (const x of S.events) if (!(await tx.objectStore('events').get(x.id))) await put('events', x);
  for (const x of S.kv) if ((await tx.objectStore('kv').get(x.key)) === undefined) await put('kv', x.value, x.key);
  for (const l of S.lectures ?? []) {
    const cur = await tx.objectStore('lectures').get(l.id);
    if (!cur || l.updatedAt > cur.updatedAt) await put('lectures', l);
  }
  for (const s of S.sections ?? []) {
    const cur = await tx.objectStore('sections').get(s.id);
    if (!cur || s.updatedAt > cur.updatedAt) await put('sections', { ...s, seenAt: s.seenAt ?? cur?.seenAt });
    else if (s.seenAt && !cur.seenAt) await put('sections', { ...cur, seenAt: s.seenAt });
  }
  await tx.done;
  if (changed) notifyChange();
  return changed;
}

// ---------------- one sync ----------------

export interface SyncResult {
  pulled: number; // local records added/updated from other devices
  pushed: boolean;
  blobsUp: number;
}

export async function syncOnce(remote: Remote, device = 'device'): Promise<SyncResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const file = await remote.get(DATA_PATH);
    let theirs = emptySnapshot();
    if (file) {
      const parsed = JSON.parse(await gunzip(file.bytes));
      if (parsed.app !== 'ilo-study') throw new Error('The sync repository contains something that is not ILO Study data.');
      theirs = parsed;
    }
    const mine = await exportSnapshot();
    const merged = mergeSnapshots(mine, theirs);
    const pulled = await applySnapshot(merged);
    let pushed = false;
    if (!file || canonical(merged) !== canonical(theirs)) {
      merged.at = Date.now();
      try {
        await remote.put(DATA_PATH, await gzip(JSON.stringify(merged)), file?.sha ?? null, `sync from ${device}`);
        pushed = true;
      } catch (e) {
        if (e instanceof ConflictError) continue; // another device pushed first: merge again
        throw e;
      }
    }
    const blobsUp = await pushBlobs(remote, device);
    await pruneBlobs(remote, device);
    return { pulled, pushed, blobsUp };
  }
  throw new Error('Could not sync: the synced copy kept changing. Try again in a moment.');
}

/** Upload original PDFs the synced copy doesn't have yet. */
async function pushBlobs(remote: Remote, device: string): Promise<number> {
  const files = (await (await db()).getAll('files')).filter((f) => f.blob && f.status === 'active');
  if (!files.length) return 0;
  const have = new Set(await remote.list('blobs'));
  let n = 0;
  for (const f of files) {
    const name = `${f.hash}.pdf`;
    if (have.has(name) || f.blob!.size > 45 * 1024 * 1024) continue;
    try {
      await remote.put(`blobs/${name}`, new Uint8Array(await f.blob!.arrayBuffer()), null, `add ${f.name} from ${device}`);
      have.add(name);
      n++;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e; // already uploaded by another device
    }
  }
  return n;
}

/** Delete PDFs of removed files from the synced copy (unless another live file has identical bytes). */
async function pruneBlobs(remote: Remote, device: string): Promise<void> {
  const files = await (await db()).getAll('files');
  const live = new Set(files.filter((f) => f.status !== 'removed').map((f) => f.hash));
  const gone = new Set(files.filter((f) => f.status === 'removed' && !live.has(f.hash)).map((f) => `${f.hash}.pdf`));
  if (!gone.size) return;
  for (const name of await remote.list('blobs')) {
    if (gone.has(name)) await remote.remove(`blobs/${name}`, `remove a deleted file from ${device}`).catch(() => {});
  }
}

/** Original PDF for a file: from this device, or downloaded once from the synced copy. */
export async function ensureBlob(file: SourceFile): Promise<Blob | null> {
  if (file.blob) return file.blob;
  const remote = githubRemote();
  if (!remote || file.kind !== 'pdf') return null;
  const r = await remote.get(`blobs/${file.hash}.pdf`);
  if (!r) return null;
  const blob = new Blob([r.bytes as BlobPart], { type: 'application/pdf' });
  const d = await db();
  const cur = await d.get('files', file.id);
  if (cur) await d.put('files', { ...cur, blob });
  return blob;
}

// ---------------- automatic syncing ----------------

let running: Promise<void> | null = null;
let lastRun = 0;

export function syncNow(reason = 'manual'): Promise<void> {
  const remote = githubRemote();
  if (!remote) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    emit({ state: 'syncing', last: localStorage.getItem(K.last) ?? undefined, detail: reason });
    try {
      const r = await syncOnce(remote, syncSettings.device());
      const now = new Date().toISOString();
      localStorage.setItem(K.last, now);
      localStorage.removeItem(K.error);
      emit({ state: 'idle', last: now, detail: `${r.pulled ? `${r.pulled} updates from other devices` : 'up to date'}${r.pushed ? ', uploaded changes' : ''}${r.blobsUp ? `, ${r.blobsUp} PDF${r.blobsUp > 1 ? 's' : ''}` : ''}` });
    } catch (e) {
      const msg = e instanceof RemoteAuthError ? e.message : !navigator.onLine ? 'Offline: will sync when you are back online.' : `Sync failed: ${(e as Error).message}`;
      localStorage.setItem(K.error, msg);
      emit({ state: 'error', last: localStorage.getItem(K.last) ?? undefined, error: msg });
    } finally {
      lastRun = Date.now();
      running = null;
    }
  })();
  return running;
}

/** Sync on open, when the app comes back to the foreground, after changes (debounced), and every 5 minutes. */
export function startAutoSync(): void {
  const maybe = (reason: string) => {
    if (!syncSettings.configured() || !navigator.onLine) return;
    if (Date.now() - lastRun < 15_000) return;
    void syncNow(reason);
  };
  setTimeout(() => maybe('app opened'), 1500);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && maybe('app reopened'));
  addEventListener('online', () => maybe('back online'));
  setInterval(() => maybe('every 5 minutes'), 5 * 60_000);
  let t: number | undefined;
  onDataChange(() => {
    if (running) return; // changes made by the sync itself
    clearTimeout(t);
    t = window.setTimeout(() => maybe('after changes'), 20_000);
  });
}
