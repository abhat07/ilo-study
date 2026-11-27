/**
 * "Write ahead": every lesson section a module still needs, sent as one Message Batch at half price.
 * Batches usually finish within an hour (at most 24 h). The app checks on them whenever it is open, so
 * you can close it; results are fetched and checked exactly like a lesson written on the spot.
 *
 * Kept on this device only (kv `batch:<id>`): the device that sent a batch is the one that collects it.
 * While a batch runs, its estimated cost counts towards your monthly limit.
 */
import { byModule, db, notifyChange } from '../db';
import { apiError, estimateCall, getClient, readReply, requestParams, reserveSpend, AiUnavailableError, callJSON } from '../ai/client';
import { settings } from '../settings';
import { buildLectures } from './lectures';
import { finishSection, prepareSection, SECTION_V, sectionsToWrite, type LearnOut, type SectionJob } from './sections';

export const BATCH_PREFIX = 'batch:';
export const BATCH_DISCOUNT = 0.5;

type StoredJob = Omit<SectionJob, 'call'> & { customId: string; purpose: string };

export interface BatchRec {
  id: string;
  moduleId: string;
  createdAt: number;
  estimate: number;
  jobs: StoredJob[];
  status: 'running' | 'done' | 'failed' | 'cancelled';
  written?: number;
  failed?: number;
  endedAt?: number;
  error?: string;
  /** demo mode: no real batch, results are made up locally */
  mock?: boolean;
}

export async function batches(): Promise<BatchRec[]> {
  const d = await db();
  const keys = (await d.getAllKeys('kv')).map(String).filter((k) => k.startsWith(BATCH_PREFIX));
  return ((await Promise.all(keys.map((k) => d.get('kv', k)))) as BatchRec[]).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

async function save(rec: BatchRec): Promise<void> {
  await (await db()).put('kv', rec, BATCH_PREFIX + rec.id);
  notifyChange();
}

/** Section ids (`lectureId|iloId`) queued in a batch that hasn't finished. */
export async function pendingSectionIds(): Promise<Set<string>> {
  const out = new Set<string>();
  for (const b of await batches()) if (b.status === 'running') for (const j of b.jobs) out.add(`${j.lectureId}|${j.iloId}`);
  return out;
}

/** Everything a module still needs written, ready to send. */
export async function planWriteAhead(moduleId: string): Promise<{ jobs: SectionJob[]; estimate: number; lectures: number }> {
  const lectures = (await buildLectures(moduleId)).filter((l) => l.iloIds.length);
  const ilos = new Map((await byModule('ilos', moduleId)).map((i) => [i.id, i]));
  const queued = await pendingSectionIds();
  const jobs: SectionJob[] = [];
  const touched = new Set<string>();
  for (const L of lectures) {
    for (const id of await sectionsToWrite(L, queued)) {
      const ilo = ilos.get(id);
      if (!ilo) continue;
      const job = await prepareSection(L, ilo, L.iloIds.indexOf(id));
      if ('call' in job) { jobs.push(job); touched.add(L.id); }
    }
  }
  return { jobs, estimate: jobs.reduce((s, j) => s + estimateCall(j.call, BATCH_DISCOUNT), 0), lectures: touched.size };
}

/** Send the module's unwritten lessons as one half-price batch. */
export async function writeAhead(moduleId: string): Promise<BatchRec | null> {
  const { jobs, estimate } = await planWriteAhead(moduleId);
  if (!jobs.length) return null;
  const release = await reserveSpend(estimate); // checks the monthly limit now; the batch record holds it afterwards
  try {
    const stored: StoredJob[] = jobs.map(({ call, ...j }, i) => ({ ...j, customId: `s${i}`, purpose: call.purpose }));
    let id: string;
    if (settings.mock()) {
      id = 'mock_' + Date.now();
    } else {
      const { client, Anthropic } = await getClient();
      try {
        const b = await client.beta.messages.batches.create({
          requests: jobs.map((j, i) => ({ custom_id: `s${i}`, params: requestParams(j.call, { batch: true }) })),
        });
        id = b.id;
      } catch (e) {
        throw apiError(Anthropic, e);
      }
    }
    const rec: BatchRec = { id, moduleId, createdAt: Date.now(), estimate, jobs: stored, status: 'running', mock: settings.mock() || undefined };
    await save(rec);
    return rec;
  } finally {
    release();
  }
}

export async function cancelBatch(rec: BatchRec): Promise<void> {
  if (!rec.mock) {
    const { client, Anthropic } = await getClient();
    try { await client.beta.messages.batches.cancel(rec.id); } catch (e) { throw apiError(Anthropic, e); }
  }
  // results that already finished are still collected on the next check
  await save({ ...rec, status: rec.mock ? 'cancelled' : rec.status, error: rec.mock ? undefined : 'Cancelling…' });
}

/** A section you've started (or one already written since) is never overwritten by a batch result. */
async function stillWanted(job: StoredJob): Promise<boolean> {
  const s = await (await db()).get('sections', `${job.lectureId}|${job.iloId}`);
  return !s || ((s.v ?? 1) < SECTION_V && !s.seenAt && !s.readTo);
}

let checking: Promise<string[]> | null = null;

/** Collect finished batches. Returns messages to show (one per finished batch). */
export function checkBatches(): Promise<string[]> {
  checking ??= (async () => {
    const news: string[] = [];
    for (const rec of await batches()) {
      if (rec.status !== 'running') continue;
      try {
        const msg = rec.mock ? await collectMock(rec) : await collect(rec);
        if (msg) news.push(msg);
      } catch (e) {
        if (e instanceof AiUnavailableError && (e.reason === 'offline' || e.reason === 'no-key')) continue;
        console.warn('batch check failed', e);
      }
    }
    return news;
  })().finally(() => { checking = null; });
  return checking;
}

async function collect(rec: BatchRec): Promise<string | null> {
  if (!settings.getApiKey()) return null;
  const { client, Anthropic } = await getClient();
  let status;
  try { status = await client.beta.messages.batches.retrieve(rec.id); } catch (e) { throw apiError(Anthropic, e); }
  if (status.processing_status !== 'ended') return null;
  const byId = new Map(rec.jobs.map((j) => [j.customId, j]));
  let written = 0, failed = 0;
  try {
    for await (const r of await client.beta.messages.batches.results(rec.id)) {
      const job = byId.get(r.custom_id);
      if (!job) continue;
      if (r.result.type !== 'succeeded') { failed++; continue; }
      try {
        // the reply is recorded at half price even if the section is no longer needed: it was paid for
        const out = await readReply<LearnOut>({ purpose: job.purpose + ' (batch)', tier: 'BULK' } as never, r.result.message, BATCH_DISCOUNT);
        if (await stillWanted(job)) { await finishSection(job, out); written++; }
      } catch (e) {
        console.warn('batch result unusable', e);
        failed++;
      }
    }
  } catch (e) {
    throw apiError(Anthropic, e);
  }
  await save({ ...rec, status: 'done', written, failed, endedAt: Date.now(), error: undefined });
  return doneMessage(written, failed);
}

/** Demo mode: pretend the batch takes 20 seconds, then write the sections with the demo writer. */
async function collectMock(rec: BatchRec): Promise<string | null> {
  if (Date.now() - rec.createdAt < 20_000) return null;
  let written = 0, failed = 0;
  const d = await db();
  for (const job of rec.jobs) {
    if (!(await stillWanted(job))) continue;
    const lecture = await d.get('lectures', job.lectureId);
    const ilo = await d.get('ilos', job.iloId);
    if (!lecture || !ilo) { failed++; continue; }
    const fresh = await prepareSection(lecture, ilo, job.order);
    if (!('call' in fresh)) continue;
    try { await finishSection(fresh, await callJSON<LearnOut>({ ...fresh.call, purpose: 'lesson section (batch)' })); written++; } catch { failed++; }
  }
  await save({ ...rec, status: 'done', written, failed, endedAt: Date.now() });
  return doneMessage(written, failed);
}

const doneMessage = (written: number, failed: number) =>
  `✍️ ${written} lesson${written === 1 ? '' : 's'} written ahead at half price${failed ? ` (${failed} couldn't be used and will be written when you open them)` : ''}`;
