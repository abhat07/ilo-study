import { byModule, db, notifyChange, sha256, uid } from '../db';
import type { Chunk, Ilo, Item, SourceFile } from '../types';
import { AiUnavailableError, aiStatus, callJSON } from '../ai/client';
import { ILO_SCHEMA, ILO_SYSTEM, MAP_SCHEMA, MAP_SYSTEM, iloUser, mapUser, type IloOut, type MapOut } from '../ai/prompts';
import { extract, fileKind, type Progress } from './extract';
import { detectIlos, looksLikeIloDoc, type IloCandidate } from './ilo';
import { lexicalMap } from './lexical';
import { locatorKey, normalise } from './text';
import { imageCountForFile, removeImagesForFile, saveSlideImages } from './slideImages';

export interface IngestResult {
  fileName: string;
  outcome: 'added' | 'updated' | 'duplicate' | 'unsupported' | 'empty' | 'error';
  detail: string;
}

export interface IngestBatchResult {
  results: IngestResult[];
  iloCandidates: IloCandidate[];
}

/** Upload one or more files into a module. Never deletes learning history. */
export async function ingestFiles(moduleId: string, files: File[], progress: Progress): Promise<IngestBatchResult> {
  const results: IngestResult[] = [];
  const iloCandidates: IloCandidate[] = [];
  for (const f of files) {
    try {
      const r = await ingestOne(moduleId, f, (m) => progress(`${f.name}: ${m}`));
      results.push(r.result);
      iloCandidates.push(...r.ilos);
    } catch (e) {
      console.error(e);
      results.push({ fileName: f.name, outcome: 'error', detail: String((e as Error).message ?? e) });
    }
  }
  notifyChange();
  return { results, iloCandidates };
}

async function ingestOne(moduleId: string, f: File, progress: Progress): Promise<{ result: IngestResult; ilos: IloCandidate[] }> {
  const kind = fileKind(f.name);
  if (!kind) return { result: { fileName: f.name, outcome: 'unsupported', detail: 'Use PDF, PPTX, DOCX, TXT, VTT or SRT.' }, ilos: [] };
  const buf = await f.arrayBuffer();
  const hash = await sha256(buf);
  const d = await db();
  const moduleFiles = await byModule('files', moduleId);
  const same = moduleFiles.find((x) => x.hash === hash && x.status === 'active');
  if (same) {
    // A PowerPoint uploaded before slide pictures existed: add just its pictures.
    if (kind === 'pptx' && (await imageCountForFile(same.id)) === 0) {
      const n = await saveSlideImages(moduleId, same.id, buf, progress);
      if (n) return { result: { fileName: f.name, outcome: 'updated', detail: `slide pictures added (${n})` }, ilos: [] };
    }
    return { result: { fileName: f.name, outcome: 'duplicate', detail: 'Already uploaded (identical file).' }, ilos: [] };
  }

  const raw = (await extract(f, kind, progress)).filter((c) => c.text.trim().length > 0);
  if (raw.length === 0) return { result: { fileName: f.name, outcome: 'empty', detail: 'No readable text found.' }, ilos: [] };

  const prev = moduleFiles.find((x) => x.name === f.name && x.status === 'active');
  const fileId = uid('f_');
  const now = Date.now();
  const newChunks: Chunk[] = [];
  const hashes = await Promise.all(raw.map((r) => sha256(normalise(r.text))));

  let summary = '';
  const flagged: { chunkId: string; reason: string }[] = [];
  if (!prev) {
    raw.forEach((r, i) => {
      newChunks.push({
        id: `${f.name}|${locatorKey(r.locator)}`,
        moduleId, fileId, fileName: f.name, locator: r.locator, text: r.text, hash: hashes[i], ocr: r.ocr,
        iloIds: [], mappedBy: 'none', status: 'active', updatedAt: now,
      });
    });
    summary = `${newChunks.length} passages added`;
  } else {
    // ---- Re-ingestion diff against the previous version of the same file ----
    const old = (await d.getAllFromIndex('chunks', 'byFile', prev.id)).filter((c) => c.status !== 'removed');
    const unmatched = new Map(old.map((c) => [c.id, c]));
    const byHash = new Map<string, Chunk>();
    for (const c of old) if (!byHash.has(c.hash)) byHash.set(c.hash, c);
    const byLoc = new Map(old.map((c) => [locatorKey(c.locator), c]));
    let same = 0, moved = 0, changed = 0, added = 0;
    raw.forEach((r, i) => {
      const h = hashes[i];
      const exact = byHash.get(h);
      if (exact && unmatched.has(exact.id)) {
        unmatched.delete(exact.id);
        const isMoved = locatorKey(exact.locator) !== locatorKey(r.locator);
        isMoved ? moved++ : same++;
        newChunks.push({ ...exact, fileId, locator: r.locator, updatedAt: now });
        return;
      }
      const atLoc = byLoc.get(locatorKey(r.locator));
      if (atLoc && unmatched.has(atLoc.id)) {
        unmatched.delete(atLoc.id);
        changed++;
        newChunks.push({ ...atLoc, fileId, locator: r.locator, text: r.text, hash: h, ocr: r.ocr, mappedBy: 'none', status: 'active', updatedAt: now });
        flagged.push({ chunkId: atLoc.id, reason: `Source changed in new upload of ${f.name}` });
        return;
      }
      added++;
      newChunks.push({
        id: `${f.name}|${locatorKey(r.locator)}|${h.slice(0, 8)}`,
        moduleId, fileId, fileName: f.name, locator: r.locator, text: r.text, hash: h, ocr: r.ocr,
        iloIds: [], mappedBy: 'none', status: 'active', updatedAt: now,
      });
    });
    for (const c of unmatched.values()) {
      await d.put('chunks', { ...c, status: 'removed', updatedAt: now });
      flagged.push({ chunkId: c.id, reason: `Passage no longer in latest upload of ${f.name}` });
    }
    await d.put('files', { ...prev, status: 'superseded', blob: undefined });
    await removeImagesForFile(prev.id);
    summary = `new version: ${added} new, ${changed} changed, ${unmatched.size} removed, ${moved} moved, ${same} unchanged`;
  }

  const fullText = raw.map((r) => r.text).join('\n');
  const isIloDoc = looksLikeIloDoc(f.name, fullText);
  const lecture = f.name.replace(/\.[^.]+$/, '');
  const ilos = detectIlos(newChunks.map((c) => ({ id: c.id, text: c.text })), lecture, isIloDoc);

  const file: SourceFile = {
    id: fileId, moduleId, name: f.name, kind, size: f.size, hash, uploadedAt: now,
    hasIlos: ilos.length > 0, status: 'active', version: (prev?.version ?? 0) + 1,
    chunkCount: newChunks.length, ocrCount: newChunks.filter((c) => c.ocr).length,
    blob: kind === 'pdf' ? new Blob([buf], { type: 'application/pdf' }) : undefined,
  };
  const tx = d.transaction(['files', 'chunks', 'events'], 'readwrite');
  await tx.objectStore('files').put(file);
  for (const c of newChunks) await tx.objectStore('chunks').put(c);
  await tx.objectStore('events').put({ id: uid('ev_'), moduleId, at: now, fileName: f.name, summary });
  await tx.done;

  // Flag (never delete) items whose source changed; their attempts stay in history.
  if (flagged.length) await flagItemsForChunks(moduleId, flagged);

  let pics = 0;
  if (kind === 'pptx') {
    try {
      pics = await saveSlideImages(moduleId, fileId, buf, progress);
    } catch (e) {
      console.warn('slide pictures skipped', e); // text is what matters; pictures are a bonus
    }
  }
  const ocrNote = (file.ocrCount ? `, OCR on ${file.ocrCount}` : '') + (pics ? `, ${pics} slide pictures` : '');
  return {
    result: { fileName: f.name, outcome: prev ? 'updated' : 'added', detail: summary + ocrNote },
    ilos,
  };
}

async function flagItemsForChunks(moduleId: string, flagged: { chunkId: string; reason: string }[]): Promise<void> {
  const d = await db();
  const reasons = new Map(flagged.map((f) => [f.chunkId, f.reason]));
  const items = await byModule('items', moduleId);
  for (const it of items) {
    const r = reasons.get(it.source.chunkId);
    if (r && it.status === 'active') await d.put('items', { ...it, status: 'flagged', flagReason: r });
  }
}

/** If the local parser found nothing, ask the cheap model, sending only likely ILO passages. */
export async function aiFindIlos(moduleId: string): Promise<IloCandidate[]> {
  const chunks = (await byModule('chunks', moduleId)).filter((c) => c.status === 'active');
  const likely = chunks.filter((c) => /outcome|objective|ILO|able to|aims?\b/i.test(c.text)).slice(0, 30);
  if (likely.length === 0) return [];
  const text = likely.map((c) => `[${c.fileName} ${locatorKey(c.locator)}]\n${c.text}`).join('\n\n').slice(0, 40_000);
  const out = await callJSON<IloOut>({
    purpose: 'ilo-parse', tier: 'BULK', system: ILO_SYSTEM, user: iloUser(text), schema: ILO_SCHEMA,
    maxTokens: 8000, expectedOutputTokens: 2000, effort: 'low',
  });
  return out.ilos.map((i) => ({ text: i.text, lecture: i.lecture }));
}

/** Save the student-confirmed ILO list. Existing ids are kept for unchanged ILOs. */
export async function saveConfirmedIlos(moduleId: string, list: { text: string; lecture: string; chunkId?: string }[]): Promise<void> {
  const d = await db();
  const mod = (await d.get('modules', moduleId))!;
  const existing = await byModule('ilos', moduleId);
  const byText = new Map(existing.map((i) => [normalise(i.text), i]));
  let next = existing.reduce((m, i) => Math.max(m, Number(i.id.split('-').pop()) || 0), 0) + 1;
  const keep = new Set<string>();
  const tx = d.transaction(['ilos', 'modules'], 'readwrite');
  for (let order = 0; order < list.length; order++) {
    const c = list[order];
    const hit = byText.get(normalise(c.text));
    const id = hit?.id ?? `${mod.short}-${String(next++).padStart(2, '0')}`;
    keep.add(id);
    const ilo: Ilo = { id, moduleId, text: c.text.trim(), lecture: c.lecture, order, sourceChunkId: c.chunkId ?? hit?.sourceChunkId };
    await tx.objectStore('ilos').put(ilo);
  }
  for (const i of existing) if (!keep.has(i.id)) await tx.objectStore('ilos').delete(i.id);
  const at = Date.now();
  await tx.objectStore('modules').put({ ...mod, iloStatus: 'confirmed', updatedAt: at, ilosAt: at });
  await tx.done;

  // Items whose ILOs were all removed are retired (history kept).
  const items = await byModule('items', moduleId);
  for (const it of items) {
    const live = it.iloIds.filter((x) => keep.has(x));
    if (live.length === 0 && it.status !== 'retired') await d.put('items', { ...it, status: 'retired', flagReason: 'ILO removed' });
  }
  // Remap everything when the ILO list changes.
  const chunks = await byModule('chunks', moduleId);
  for (const c of chunks) if (c.mappedBy !== 'none') await d.put('chunks', { ...c, mappedBy: 'none', updatedAt: Date.now() });
  notifyChange();
}

/**
 * Remove an uploaded file: its passages stop being used, questions built on them are retired, and the
 * original PDF is dropped from this device (and from the synced copy on next sync). Your answers are kept,
 * so mastery evidence already earned is not lost.
 */
export async function removeFile(fileId: string): Promise<{ passages: number; questions: number }> {
  const d = await db();
  const file = await d.get('files', fileId);
  if (!file) return { passages: 0, questions: 0 };
  const now = Date.now();
  const chunks = await d.getAllFromIndex('chunks', 'byFile', fileId);
  const ids = new Set(chunks.map((c) => c.id));
  const items = (await byModule('items', file.moduleId)).filter((i) => ids.has(i.source.chunkId) && i.status !== 'retired');
  const tx = d.transaction(['files', 'chunks', 'items', 'events'], 'readwrite');
  await tx.objectStore('files').put({ ...file, status: 'removed', removedAt: now, blob: undefined });
  // erase the text too, so a removed file's content is gone from this device and from the synced copy
  for (const c of chunks) if (c.status !== 'removed' || c.text) await tx.objectStore('chunks').put({ ...c, status: 'removed', text: '', updatedAt: now });
  for (const it of items) await tx.objectStore('items').put({ ...it, status: 'retired', flagReason: `File removed: ${file.name}` });
  await tx.objectStore('events').put({ id: uid('ev_'), moduleId: file.moduleId, at: now, fileName: file.name, summary: `removed: ${chunks.length} passages and ${items.length} questions retired` });
  await tx.done;
  await removeImagesForFile(fileId);
  notifyChange();
  return { passages: chunks.length, questions: items.length };
}

export async function markIlosPending(moduleId: string): Promise<void> {
  const d = await db();
  const mod = (await d.get('modules', moduleId))!;
  if (mod.iloStatus !== 'confirmed') await d.put('modules', { ...mod, iloStatus: 'pending', updatedAt: Date.now() });
}

const MAP_BATCH = 25;
const MIN_CHARS = 60;

/** Map unmapped passages to ILOs. Uses the cheap model if available, else a local lexical match. */
export async function mapModule(moduleId: string, progress: Progress): Promise<{ by: 'ai' | 'lexical'; mapped: number; note?: string }> {
  const d = await db();
  const ilos = (await byModule('ilos', moduleId)).sort((a, b) => a.order - b.order);
  if (ilos.length === 0) return { by: 'lexical', mapped: 0 };
  const status = await aiStatus();
  const active = (await byModule('chunks', moduleId)).filter((c) => c.status === 'active');
  const todo = active.filter((c) => c.mappedBy === 'none');
  for (const c of todo.filter((c) => c.text.length < MIN_CHARS)) await d.put('chunks', { ...c, iloIds: [], mappedBy: 'lexical', updatedAt: Date.now() });
  // When AI is available, also upgrade passages that were matched offline earlier (e.g. uploaded before the key was added).
  const usable = active.filter(
    (c) => c.text.length >= MIN_CHARS && (c.mappedBy === 'none' || (status.ready && c.mappedBy === 'lexical')),
  );
  let by: 'ai' | 'lexical' = status.ready ? 'ai' : 'lexical';
  let note = status.ready ? undefined : status.message;
  let mapped = 0;
  const validIds = new Set(ilos.map((i) => i.id));
  if (by === 'ai') {
    for (let i = 0; i < usable.length; i += MAP_BATCH) {
      const batch = usable.slice(i, i + MAP_BATCH);
      progress(`Matching passages to ILOs (${Math.min(i + MAP_BATCH, usable.length)} of ${usable.length})`);
      try {
        const out = await callJSON<MapOut>({
          purpose: 'map-ilos', tier: 'BULK', system: MAP_SYSTEM,
          user: mapUser(ilos, batch.map((c) => ({ id: c.id, text: c.text.slice(0, 900) }))),
          schema: MAP_SCHEMA, maxTokens: 6000, expectedOutputTokens: 1200, effort: 'low',
        });
        const m = new Map(out.mappings.map((x) => [x.chunk_id, x.ilo_ids.filter((id) => validIds.has(id))]));
        for (const c of batch) {
          await d.put('chunks', { ...c, iloIds: m.get(c.id) ?? [], mappedBy: 'ai', updatedAt: Date.now() });
          mapped++;
        }
      } catch (e) {
        if (e instanceof AiUnavailableError) {
          by = 'lexical';
          note = e.message;
          break;
        }
        throw e;
      }
    }
  }
  if (by === 'lexical') {
    const rest = (await byModule('chunks', moduleId)).filter((c) => c.status === 'active' && c.mappedBy === 'none');
    const m = lexicalMap(ilos, rest);
    for (const c of rest) {
      await d.put('chunks', { ...c, iloIds: m.get(c.id) ?? [], mappedBy: 'lexical', updatedAt: Date.now() });
      mapped++;
    }
  }
  notifyChange();
  return { by, mapped, note };
}

export interface Coverage {
  ilo: Ilo;
  chunks: number;
  thin: boolean;
}

export async function coverage(moduleId: string): Promise<Coverage[]> {
  const ilos = (await byModule('ilos', moduleId)).sort((a, b) => a.order - b.order);
  const chunks = (await byModule('chunks', moduleId)).filter((c) => c.status === 'active');
  return ilos.map((ilo) => {
    const n = chunks.filter((c) => c.iloIds.includes(ilo.id)).length;
    return { ilo, chunks: n, thin: n < 2 };
  });
}

export type { Item };

/** One-time clean-up: erase passage text left behind by files removed before text-erasing existed. */
export async function scrubRemovedFiles(): Promise<number> {
  const d = await db();
  const removed = new Set((await d.getAll('files')).filter((f) => f.status === 'removed').map((f) => f.id));
  if (!removed.size) return 0;
  const now = Date.now();
  let n = 0;
  for (const c of await d.getAll('chunks')) {
    if (removed.has(c.fileId) && c.text) {
      await d.put('chunks', { ...c, status: 'removed', text: '', updatedAt: now });
      n++;
    }
  }
  for (const id of removed) await removeImagesForFile(id);
  if (n) notifyChange();
  return n;
}
