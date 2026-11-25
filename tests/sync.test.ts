import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetDbForTests, db } from '../src/db';
import { syncOnce } from '../src/sync/sync';
import { ConflictError, MemoryRemote } from '../src/sync/remote';
import { newCard, review } from '../src/engine/scheduler';
import type { Attempt, Ilo, Item, Module } from '../src/types';

/** Each "device" is its own IndexedDB. */
const devices = new Map<string, IDBFactory>();
function use(name: string) {
  if (!devices.has(name)) devices.set(name, new IDBFactory());
  (globalThis as any).indexedDB = devices.get(name);
  __resetDbForTests();
}

const T0 = new Date('2026-11-20T10:00:00Z').getTime();
const mod: Module = { id: 'LIFE50016', short: 'AMB', name: 'Applied Molecular Biology', createdAt: T0, updatedAt: T0, ilosAt: T0, iloStatus: 'confirmed' };
const ilo = (n: number, text: string): Ilo => ({ id: `AMB-0${n}`, moduleId: mod.id, text, lecture: '', order: n });
function item(id: string, createdAt = T0, cacheKey = 'k-' + id): Item {
  return {
    id, moduleId: mod.id, iloIds: ['AMB-01'], type: 'cloze', level: 1, transfer: false, prompt: 'p ' + id, options: [], correctIndex: 0,
    distractorWhy: [], answer: 'x', acceptedAnswers: [], steps: [], explanation: '', rubric: [], elaborationPrompt: '', elaborationAnswer: '',
    beyondMaterials: '', source: { chunkId: 'c1', fileName: 'L1.pdf', locator: { kind: 'page', page: 1 }, quote: '', chunkHash: 'h' },
    cacheKey, model: 'm', createdAt, status: 'active', card: newCard(new Date(createdAt)), seenCount: 0,
  };
}
/** Answer a question the way the app does: store the attempt and advance the item's schedule. */
async function answer(itemId: string, id: string, at: number, score: number) {
  const d = await db();
  const it = (await d.get('items', itemId))!;
  const a: Attempt = {
    id, itemId, moduleId: mod.id, iloIds: it.iloIds, sessionId: 's-' + id, at, confidence: 3, response: 'r', score,
    firstExposure: it.seenCount === 0, transfer: false, level: 1, durationMs: 1000, mark: { by: 'auto', score },
  };
  await d.put('attempts', a);
  await d.put('items', { ...it, seenCount: it.seenCount + 1, card: review(it.card, score, 3, new Date(at)) });
}
const count = async (store: 'items' | 'attempts' | 'ilos') => (await (await db()).getAll(store)).length;

describe('sync across devices', () => {
  let remote: MemoryRemote;
  beforeEach(() => {
    devices.clear();
    remote = new MemoryRemote();
  });

  it('copies everything to a new device', async () => {
    use('mac');
    const d = await db();
    await d.put('modules', mod);
    await d.put('ilos', ilo(1, 'Describe PCR'));
    await d.put('items', item('q1'));
    await answer('q1', 'a1', T0 + 1000, 1);
    const r1 = await syncOnce(remote, 'mac');
    expect(r1.pushed).toBe(true);

    use('phone');
    const r2 = await syncOnce(remote, 'phone');
    expect(r2.pulled).toBeGreaterThan(0);
    expect(await count('items')).toBe(1);
    expect(await count('attempts')).toBe(1);
    expect((await (await db()).get('items', 'q1'))!.seenCount).toBe(1);
    // a second sync with nothing new changes nothing and pushes nothing
    const r3 = await syncOnce(remote, 'phone');
    expect(r3.pushed).toBe(false);
  });

  it('merges answers given offline on two devices and agrees on the schedule', async () => {
    use('mac');
    await (await db()).put('modules', mod);
    await (await db()).put('items', item('q1'));
    await syncOnce(remote, 'mac');
    use('phone');
    await syncOnce(remote, 'phone');

    // both answer the same question while offline
    use('mac');
    await answer('q1', 'mac-1', T0 + 10_000, 1);
    use('phone');
    await answer('q1', 'phone-1', T0 + 20_000, 0);
    await answer('q1', 'phone-2', T0 + 30_000, 1);

    use('mac');
    await syncOnce(remote, 'mac');
    use('phone');
    await syncOnce(remote, 'phone');
    use('mac');
    await syncOnce(remote, 'mac');

    const macItem = (await (await db()).get('items', 'q1'))!;
    expect(await count('attempts')).toBe(3);
    expect(macItem.seenCount).toBe(3);
    use('phone');
    const phoneItem = (await (await db()).get('items', 'q1'))!;
    expect(await count('attempts')).toBe(3);
    expect(phoneItem.seenCount).toBe(3);
    expect(new Date(phoneItem.card.due).getTime()).toBe(new Date(macItem.card.due).getTime());
  });

  it('propagates an ILO deleted on another device', async () => {
    use('mac');
    await (await db()).put('modules', mod);
    await (await db()).put('ilos', ilo(1, 'Describe PCR'));
    await (await db()).put('ilos', ilo(2, 'Explain Taq'));
    await syncOnce(remote, 'mac');
    use('phone');
    await syncOnce(remote, 'phone');
    // phone re-confirms the list without AMB-02
    const d = await db();
    await d.delete('ilos', 'AMB-02');
    await d.put('modules', { ...mod, updatedAt: T0 + 5000, ilosAt: T0 + 5000 });
    await syncOnce(remote, 'phone');
    use('mac');
    await syncOnce(remote, 'mac');
    expect((await (await db()).getAll('ilos')).map((i) => i.id)).toEqual(['AMB-01']);
  });

  it('retires unanswered duplicate questions generated on both devices', async () => {
    use('mac');
    await (await db()).put('modules', mod);
    await (await db()).put('items', item('mac-q', T0, 'same-key'));
    use('phone');
    await (await db()).put('modules', mod);
    await (await db()).put('items', item('phone-q', T0 + 10 * 60_000, 'same-key'));
    use('mac');
    await syncOnce(remote, 'mac');
    use('phone');
    await syncOnce(remote, 'phone');
    const items = await (await db()).getAll('items');
    expect(items).toHaveLength(2);
    expect(items.filter((i) => i.status === 'active')).toHaveLength(1);
  });

  it('retries when another device pushes at the same moment', async () => {
    use('mac');
    await (await db()).put('modules', mod);
    let first = true;
    const flaky = new MemoryRemote();
    const realPut = flaky.put.bind(flaky);
    flaky.put = async (p: string, b: Uint8Array, s: string | null, m?: string) => {
      if (first && p.endsWith('.gz')) {
        first = false;
        throw new ConflictError('simulated');
      }
      return realPut(p, b, s, m);
    };
    const r = await syncOnce(flaky, 'mac');
    expect(r.pushed).toBe(true);
  });

  it('never deletes local work made after the snapshot was taken', async () => {
    use('mac');
    await (await db()).put('modules', mod);
    await (await db()).put('items', item('q1'));
    await syncOnce(remote, 'mac');
    await answer('q1', 'late', T0 + 50_000, 1); // happens after a sync on this device
    await syncOnce(remote, 'mac');
    expect(await count('attempts')).toBe(1);
    use('phone');
    await syncOnce(remote, 'phone');
    expect(await count('attempts')).toBe(1);
  });
});

import { removeFile } from '../src/ingest/pipeline';
import { pickTargets } from '../src/engine/generate';

describe('removing a file', () => {
  it('retires its questions everywhere, keeps answers, and deletes the PDF from the synced copy', async () => {
    devices.clear();
    const remote = new MemoryRemote();
    use('mac');
    const d = await db();
    await d.put('modules', mod);
    await d.put('ilos', ilo(1, 'Describe PCR'));
    await d.put('files', {
      id: 'f-cv', moduleId: mod.id, name: 'My_CV.pdf', kind: 'pdf', size: 3, hash: 'cvhash', uploadedAt: T0, hasIlos: false,
      status: 'active', version: 1, chunkCount: 1, ocrCount: 0, blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }),
    });
    await d.put('chunks', {
      id: 'My_CV.pdf|p1', moduleId: mod.id, fileId: 'f-cv', fileName: 'My_CV.pdf', locator: { kind: 'page', page: 1 }, text: 'cv text',
      hash: 'h1', ocr: false, iloIds: ['AMB-01'], mappedBy: 'ai', status: 'active', updatedAt: T0,
    });
    await d.put('items', { ...item('q-cv'), source: { ...item('q-cv').source, chunkId: 'My_CV.pdf|p1' } });
    await answer('q-cv', 'a-cv', T0 + 1000, 1);
    await syncOnce(remote, 'mac');
    expect(await remote.list('blobs')).toEqual(['cvhash.pdf']);

    use('phone');
    await syncOnce(remote, 'phone');
    expect((await (await db()).get('files', 'f-cv'))!.status).toBe('active');

    use('mac');
    const r = await removeFile('f-cv');
    expect(r.questions).toBe(1);
    await syncOnce(remote, 'mac');
    expect(await remote.list('blobs')).toEqual([]);

    use('phone');
    await syncOnce(remote, 'phone');
    const pd = await db();
    expect((await pd.get('files', 'f-cv'))!.status).toBe('removed');
    expect((await pd.get('chunks', 'My_CV.pdf|p1'))!.status).toBe('removed');
    expect((await pd.get('chunks', 'My_CV.pdf|p1'))!.text).toBe('');
    expect((await pd.get('items', 'q-cv'))!.status).toBe('retired');
    expect(await count('attempts')).toBe(1); // answers kept
  });

  it('lets a re-uploaded passage get new questions after its old ones were retired', async () => {
    devices.clear();
    use('mac');
    const d = await db();
    await d.put('modules', mod);
    await d.put('ilos', ilo(1, 'Describe PCR'));
    const chunk = {
      id: 'L1.pdf|p1', moduleId: mod.id, fileId: 'f1', fileName: 'L1.pdf', locator: { kind: 'page' as const, page: 1 },
      text: 'Denaturation at 95 C separates the two strands of the template DNA during each PCR cycle.', hash: 'abc', ocr: false,
      iloIds: ['AMB-01'], mappedBy: 'ai' as const, status: 'active' as const, updatedAt: T0,
    };
    await d.put('chunks', chunk);
    const key = 'abc|AMB-01|L1';
    await d.put('genlog', { cacheKey: key, moduleId: mod.id, at: T0, accepted: 1, rejected: 0, rejectReasons: [] });
    await d.put('items', { ...item('old', T0, key), status: 'retired' });
    const targets = await pickTargets(mod.id, 5);
    expect(targets.map((t) => t.chunk.id)).toContain('L1.pdf|p1');
  });
});

describe('slide pictures sync', () => {
  let remote: MemoryRemote;
  beforeEach(() => {
    devices.clear();
    remote = new MemoryRemote();
  });
  const pic = (id: string, hash: string) => ({
    id, moduleId: mod.id, fileId: 'f1', chunkId: 'c1', slide: 1, hash, w: 800, h: 600, status: 'active' as const, updatedAt: T0,
    blob: new Blob([new Uint8Array([1, 2, 3, hash.length])], { type: 'image/jpeg' }),
  });

  it('uploads each picture once, other devices get metadata, removal prunes it', async () => {
    use('mac');
    let d = await db();
    await d.put('modules', mod);
    await d.put('images', pic('f1|s1|0', 'aaa'));
    await d.put('images', pic('f1|s2|0', 'aaa')); // same bytes on two slides: one upload
    await d.put('images', pic('f1|s3|0', 'bbb'));
    const r1 = await syncOnce(remote, 'mac');
    expect(r1.imagesUp).toBe(2);
    expect([...remote.files.keys()].filter((k) => k.startsWith('img/')).sort()).toEqual(['img/aaa.jpg', 'img/bbb.jpg']);
    await syncOnce(remote, 'mac'); // pushes the uploaded flags

    use('phone');
    const r2 = await syncOnce(remote, 'phone');
    expect(r2.imagesUp).toBe(0);
    d = await db();
    const got = await d.getAll('images');
    expect(got).toHaveLength(3);
    expect(got.every((i) => i.uploaded && !i.blob)).toBe(true);

    // the phone removes the file; the mac prunes nothing it shouldn't
    for (const im of got) await d.put('images', { ...im, status: 'removed', updatedAt: T0 + 5 });
    await syncOnce(remote, 'phone');
    expect([...remote.files.keys()].filter((k) => k.startsWith('img/'))).toEqual([]);
    use('mac');
    await syncOnce(remote, 'mac');
    d = await db();
    const mac = await d.getAll('images');
    expect(mac.every((i) => i.status === 'removed' && !i.blob)).toBe(true);
  });
});

import { enforceReset, resetProgress } from '../src/sync/reset';

describe('starting again (progress reset)', () => {
  let remote: MemoryRemote;
  beforeEach(() => {
    devices.clear();
    remote = new MemoryRemote();
  });

  it('clears answers on every device but keeps uploads and questions, and later answers survive', async () => {
    use('mac');
    let d = await db();
    await d.put('modules', mod);
    await d.put('ilos', ilo(1, 'Describe PCR'));
    await d.put('items', item('q1'));
    await d.put('items', item('q2'));
    await d.put('sections', { id: 'S1', moduleId: mod.id, lectureId: 'L1', iloId: 'AMB-01', order: 0, title: 't', intro: '', points: [], visual: { kind: 'none', title: '', columns: [], items: [] }, chunkIds: [], itemIds: ['q1'], seenAt: T0, readTo: 3, updatedAt: T0 });
    await answer('q1', 'a1', T0 + 1000, 1);
    await answer('q2', 'a2', T0 + 2000, 0);
    await syncOnce(remote, 'mac');

    use('phone');
    await syncOnce(remote, 'phone');
    await answer('q1', 'a3', T0 + 3000, 1); // answered on the phone, not synced yet
    expect(await count('attempts')).toBe(3);

    use('mac');
    await resetProgress();
    d = await db();
    expect(await count('attempts')).toBe(0);
    expect((await d.get('items', 'q1'))!.seenCount).toBe(0);
    expect((await d.get('sections', 'S1'))!.readTo).toBeUndefined();
    expect(await count('items')).toBe(2);
    expect(await count('ilos')).toBe(1);
    await syncOnce(remote, 'mac');

    // the phone's old answers (including the unsynced one) don't come back
    use('phone');
    await syncOnce(remote, 'phone');
    d = await db();
    expect(await count('attempts')).toBe(0);
    expect((await d.get('items', 'q1'))!.seenCount).toBe(0);
    expect((await d.get('sections', 'S1'))!.seenAt).toBeUndefined();
    expect(await count('items')).toBe(2);

    // new answers after the reset sync normally
    await answer('q2', 'a4', Date.now() + 1000, 1);
    await syncOnce(remote, 'phone');
    use('mac');
    await syncOnce(remote, 'mac');
    expect(await count('attempts')).toBe(1);
    expect((await (await db()).get('items', 'q2'))!.seenCount).toBe(1);
    expect(await enforceReset(0)).toBe(0);
  });
});
