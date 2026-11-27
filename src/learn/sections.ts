/**
 * Lesson sections: one per ILO in a lecture. Each has a concise explanation built from that lecture's
 * slides AND the lecturer's spoken words (the recording transcript), every point backed by a verbatim
 * quote from one of them, a visual, and questions on EVERY point, plus "link" questions that connect it
 * to earlier points and to the module-wide ILOs (the building blocks of essay answers).
 *
 * The whole lecture's material goes first in the request and is prompt-cached, so writing the 2nd, 3rd…
 * section of a lecture reads it back at a tenth of the price. Writing is split into prepare → call →
 * finish so whole modules can also be written ahead as a half-price Message Batch (learn/batch.ts).
 */
import { byModule, db, notifyChange, uid } from '../db';
import type { Chunk, Ilo, Item, LearnPoint, LearnSection, Lecture, SourceFile, Visual } from '../types';
import { AiUnavailableError, callJSON, type JsonCall } from '../ai/client';
import { MODELS } from '../ai/pricing';
import { GEN_SCHEMA, type GenItemOut } from '../ai/prompts';
import { locatorLabel, normalise, quoteInPassage } from '../ingest/text';
import { tokens } from '../ingest/lexical';
import { newCard } from '../engine/scheduler';
import { validateItem } from '../engine/generate';
import { moduleAims, type Aim } from '../plan/store';

/** Lesson format version: 3 = slides + transcript + module-wide ILOs. Unstarted older sections are rewritten. */
export const SECTION_V = 3;

// ---------------- prompt ----------------

const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const genItem = (GEN_SCHEMA as any).properties.items.items;

export const LEARN_SCHEMA = obj({
  title: str,
  intro: str,
  module_aims: strArr,
  points: { type: 'array', items: obj({ label: str, text: str, quote: str, passage_id: str, visual_item: { type: 'integer' }, stressed: { type: 'boolean' } }) },
  visual: obj({
    kind: { type: 'string', enum: ['process', 'cycle', 'compare', 'parts', 'none'] },
    title: str,
    columns: strArr,
    items: { type: 'array', items: obj({ label: str, detail: str }) },
  }),
  questions: {
    type: 'array',
    items: {
      ...genItem,
      properties: { ...genItem.properties, point_index: { type: 'integer' }, link_points: strArr, passage_id: str },
      required: [...genItem.required, 'point_index', 'link_points', 'passage_id'],
    },
  },
});

export interface LearnOut {
  title: string;
  intro: string;
  module_aims?: string[];
  points: { label?: string; text: string; quote: string; passage_id: string; visual_item?: number; stressed?: boolean }[];
  visual: Visual;
  questions: (GenItemOut & { point_index: number; link_points: string[]; passage_id: string })[];
}

export const LEARN_SYSTEM = `You write one section of a concise, exam-focused lesson for a second-year Biological Sciences undergraduate at Imperial College London. The section covers ONE intended learning outcome (ILO) of a lecture and uses ONLY that lecture's material, which is given first.

SOURCES
- type="slide" passages are the lecture slides. type="spoken" passages are the lecturer's own words from the recording transcript (automatic captions, so expect the odd mis-heard word).
- When both exist, build the section from BOTH: slides give the structure, key terms and diagrams; the spoken passages give the lecturer's reasoning, examples, analogies and emphasis. Where the lecturer explains a point more fully than the slide, base the point on (and quote) the spoken passage. A good section usually quotes both kinds.
- Anything the lecturer stresses ("this is important", "you need to know", "this comes up in the exam", repeated points) must be included; set stressed = true on that point.
- Spoken quotes are copied verbatim from the transcript even if a caption word is wrong; write the point text itself with the correct scientific terms.
- Start from the passages listed as matched to this ILO, but use any passage of the lecture that teaches it.

MODULE-WIDE OUTCOMES
- The module also has overarching outcomes (ids like AMB-M1) if listed. module_aims: the ids this ILO feeds into ([] if none are listed or none apply). In the intro, say in one short clause how this ILO serves that module-wide outcome.

EXPLANATION
- title: the topic in 3-8 words.
- intro: 1-2 sentences on what this section covers and why it matters for the ILO.
- points: the lesson is taught as small STEPS, one point at a time, each followed by questions on it. Write 5-14 points in teaching order that together cover everything the material says that is relevant to this ILO. Break the content down as finely as the material allows: ONE idea per point (e.g. for PCR: what PCR does, then denaturation, then annealing, then extension, then why it repeats), each building on the one before.
  label: 1-4 words naming the step (e.g. "Denaturation", "Why Taq?"). text: 1-3 plain sentences (at most 50 words) explaining that one idea clearly, in the lecture's terms.
  Leave out anything not examinable: admin, housekeeping, anecdotes, jokes, history that doesn't explain a mechanism.
- Every point needs quote (copied verbatim from ONE passage, a contiguous span of 8-40 words that supports it) and passage_id (that passage's id).
- visual_item: the 0-based index of the visual item this point corresponds to (it is highlighted while the step is taught), or -1.
- visual: pick the format that best shows the content, or "none":
  process = 3-7 ordered steps; cycle = 3-8 repeating stages; parts = 3-8 components and their roles;
  compare = columns holds 2-3 headings and each item is a row (label = row name, detail = the cells for each column joined with " | ").
  Labels at most 5 words, details at most 14 words, only content from the points.

QUESTIONS
- For EVERY point, write 1-2 questions that test it (point_index = that point's 0-based index; passage_id = the point's passage; link_points = []). Vary types: cloze for key terms, mcq for concepts and common misconceptions, short for mechanisms ("explain why/how"), order when the point describes a sequence. source_quote must be verbatim from that passage.
- For EVERY point after the first, also write 1 LINK-BACK question asked straight after it, connecting it to an earlier step of this section (e.g. after annealing: "Why must denaturation happen before the primers can anneal?"; or "Put the steps so far in order"). point_index = the new point, link_points = ["S" + the earlier point's index], type mcq, short (2-3 point rubric) or order, source_quote from the new point's passage.
- Then write 1-3 END-OF-SECTION LINK questions (point_index = -1, type short) that make the student connect this ILO to the EARLIER POINTS listed (from earlier in this lecture or previous lectures), e.g. "Explain how X relates to Y", "Predict what happens to Y if X fails", "Compare X and Y". Give a 2-4 point rubric drawing on both. link_points lists the earlier point ids used (e.g. "E3"). If no earlier points are given, link between points of this section and use "S" + index. passage_id = the passage of this section most used.
- If module_aims is not empty, one END-OF-SECTION question must be synoptic: the student uses this section in part of an answer to that module-wide outcome, like planning an exam essay paragraph (3-4 point rubric; link_points includes the module-wide id, e.g. "AMB-M2").
- Item field rules: mcq has 4 options, one correct, plausible distractors, option_explanations for each; cloze replaces one key term with "____"; short has a model answer and rubric; order lists 3-7 steps in correct order. Fill unused fields with "", [], 0 or false. beyond_materials only for short context not in the passages (never graded), else "".
- Use UK spelling and the lecture's terminology.`;

// ---------------- lecture material (the cached prefix) ----------------

/** A recording transcript: captions files, or a text/Word file named as a transcript. */
export function isTranscript(f: Pick<SourceFile, 'kind' | 'name'> | undefined, c?: Pick<Chunk, 'locator'>): boolean {
  if (c?.locator.kind === 'time') return true;
  if (!f) return false;
  return f.kind === 'transcript' || /transcript|caption|recording|panopto|subtitles?/i.test(f.name);
}

/** Total size of the lecture material sent with every section (≈ 17k tokens); cached after the first call. */
export const MATERIAL_CHARS = 60_000;

export interface Material {
  passages: Chunk[]; // p1, p2, … in this order
  spoken: Set<string>; // chunk ids that are the lecturer's words
}

const locNum = (c: Chunk) => (c.locator.kind === 'slide' ? c.locator.slide : c.locator.kind === 'page' ? c.locator.page : c.locator.kind === 'time' ? c.locator.start : c.locator.section);

/**
 * Everything the lecture says, slides first then the transcript, in order. If it is too long, the two
 * share the space evenly (either can use what the other doesn't need), keeping passages matched to the
 * lecture's ILOs first; what's kept stays in lecture order.
 */
export function lectureMaterial(lecture: Lecture, chunks: Chunk[], files: Map<string, SourceFile>): Material {
  const usable = chunks.filter((c) => c.status === 'active' && lecture.fileIds.includes(c.fileId) && c.text.trim().length >= 20);
  const sort = (a: Chunk, b: Chunk) => a.fileName.localeCompare(b.fileName) || locNum(a) - locNum(b);
  const spokenC = usable.filter((c) => isTranscript(files.get(c.fileId), c)).sort(sort);
  const slideC = usable.filter((c) => !isTranscript(files.get(c.fileId), c)).sort(sort);
  const size = (cs: Chunk[]) => cs.reduce((n, c) => n + c.text.length, 0);
  const lectureIlos = new Set(lecture.iloIds);
  const trim = (cs: Chunk[], budget: number): Chunk[] => {
    if (size(cs) <= budget) return cs;
    const keep = new Set<string>();
    let n = 0;
    const ranked = [...cs].sort((a, b) => Number(b.iloIds.some((i) => lectureIlos.has(i))) - Number(a.iloIds.some((i) => lectureIlos.has(i))));
    for (const c of ranked) if (n + c.text.length <= budget) { keep.add(c.id); n += c.text.length; }
    return cs.filter((c) => keep.has(c.id));
  };
  const half = MATERIAL_CHARS / 2;
  const slides = trim(slideC, MATERIAL_CHARS - Math.min(size(spokenC), half));
  const spoken = trim(spokenC, MATERIAL_CHARS - size(slides));
  return { passages: [...slides, ...spoken], spoken: new Set(spoken.map((c) => c.id)) };
}

export function materialText(lecture: Lecture, moduleName: string, aims: Aim[], m: Material): string {
  const where = (c: Chunk) => (m.spoken.has(c.id) ? `lecture recording ${locatorLabel(c.locator)}` : `${c.fileName}, ${locatorLabel(c.locator)}`);
  const ps = m.passages.map((c, i) => `<passage id="p${i + 1}" type="${m.spoken.has(c.id) ? 'spoken' : 'slide'}" where="${where(c)}">\n${c.text}\n</passage>`).join('\n');
  return `MODULE: ${moduleName}
MODULE-WIDE OUTCOMES:
${aims.length ? aims.map((a) => `${a.id}: ${a.text}`).join('\n') : '(none given)'}

LECTURE ${lecture.number || ''}: ${lecture.title}
MATERIAL (${m.passages.length - m.spoken.size} slide passages, ${m.spoken.size} spoken passages):
${ps}`;
}

/** The passages matched to this ILO (by the mapping step, else by shared words). */
export function focusFor(ilo: Ilo, m: Material): number[] {
  let idx = m.passages.map((c, i) => (c.iloIds.includes(ilo.id) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) {
    const w = new Set(tokens(ilo.text));
    idx = m.passages
      .map((c, i) => ({ i, s: tokens(c.text).filter((t) => w.has(t)).length }))
      .filter((x) => x.s >= 2)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.i)
      .sort((a, b) => a - b);
  }
  return idx;
}

function sectionUser(ilo: Ilo, focus: number[], earlier: { id: string; text: string; from: string }[]): string {
  const ep = earlier.length ? earlier.map((e) => `${e.id}: ${e.text} (${e.from})`).join('\n') : '(none: this is the first section)';
  return `WRITE THE SECTION FOR THIS ILO:
ILO ${ilo.id}: ${ilo.text}

Passages matched to this ILO: ${focus.length ? focus.map((i) => `p${i + 1}`).join(', ') : '(none matched: find what teaches it)'}

EARLIER POINTS (for link questions):
${ep}`;
}

// ---------------- generation ----------------

const STOP = new Set('which their there these those about would could should being between through during because'.split(' '));
/** Free fallback so every point is tested: blank the most specific word of the point's quote. */
function localCloze(point: LearnPoint): { prompt: string; answer: string } | null {
  const words = point.quote.split(/\s+/);
  let best = -1;
  words.forEach((w, i) => {
    const clean = w.replace(/[^\w-]/g, '');
    if (clean.length >= 5 && !STOP.has(clean.toLowerCase()) && (best < 0 || clean.length > words[best].replace(/[^\w-]/g, '').length)) best = i;
  });
  if (best < 0) return null;
  const answer = words[best].replace(/[^\w-]/g, '');
  return { prompt: words.map((w, i) => (i === best ? w.replace(answer, '____') : w)).join(' '), answer };
}

/** A section ready to be written: the request, plus what's needed to check the reply (kept for batches). */
export interface SectionJob {
  lectureId: string;
  moduleId: string;
  iloId: string;
  order: number;
  /** chunk ids in passage order (p1 = first) */
  chunkIds: string[];
  aimIds: string[];
  call: JsonCall;
}

const sectionIdOf = (lectureId: string, iloId: string) => `${lectureId}|${iloId}`;

async function saveEmpty(lecture: Lecture, ilo: Ilo, order: number, intro: string): Promise<LearnSection> {
  const s: LearnSection = {
    id: sectionIdOf(lecture.id, ilo.id), moduleId: lecture.moduleId, lectureId: lecture.id, iloId: ilo.id, order, title: ilo.text.slice(0, 80),
    intro, points: [], visual: { kind: 'none', title: '', columns: [], items: [] }, chunkIds: [], itemIds: [], updatedAt: Date.now(), v: SECTION_V,
  };
  await (await db()).put('sections', s);
  notifyChange();
  return s;
}

export const NO_MATERIAL = 'No slides or transcript in this lecture were matched to this outcome yet. Upload the lecture (or its transcript) to get a lesson.';

/** Build the request for one section, or save an empty section when the lecture has no material for it. */
export async function prepareSection(lecture: Lecture, ilo: Ilo, order: number): Promise<SectionJob | LearnSection> {
  const d = await db();
  const [chunks, files, sections, lectures, mod, aims] = await Promise.all([
    byModule('chunks', lecture.moduleId),
    byModule('files', lecture.moduleId),
    byModule('sections', lecture.moduleId),
    byModule('lectures', lecture.moduleId),
    d.get('modules', lecture.moduleId),
    moduleAims(lecture.moduleId),
  ]);
  const material = lectureMaterial(lecture, chunks, new Map(files.map((f) => [f.id, f])));
  if (material.passages.length === 0) return saveEmpty(lecture, ilo, order, NO_MATERIAL);

  // earlier points: this lecture's earlier sections, then the previous lecture's
  const prevLecture = lectures.filter((l) => l.number > 0 && l.number < lecture.number).sort((a, b) => b.number - a.number)[0];
  const earlierSecs = [
    ...sections.filter((s) => s.lectureId === lecture.id && s.order < order).sort((a, b) => a.order - b.order),
    ...(prevLecture ? sections.filter((s) => s.lectureId === prevLecture.id) : []),
  ];
  const earlier: { id: string; text: string; from: string }[] = [];
  for (const s of earlierSecs) {
    const from = s.lectureId === lecture.id ? `this lecture: ${s.title}` : `Lecture ${prevLecture!.number}: ${s.title}`;
    s.points.forEach((p) => earlier.push({ id: `E${earlier.length + 1}`, text: p.text, from }));
  }

  return {
    lectureId: lecture.id, moduleId: lecture.moduleId, iloId: ilo.id, order,
    chunkIds: material.passages.map((c) => c.id),
    aimIds: aims.map((a) => a.id),
    call: {
      purpose: 'lesson section',
      tier: 'BULK',
      system: LEARN_SYSTEM,
      prefix: materialText(lecture, mod?.name ?? lecture.moduleId, aims, material),
      user: sectionUser(ilo, focusFor(ilo, material), earlier.slice(0, 30)),
      schema: LEARN_SCHEMA,
      maxTokens: 24_000,
      expectedOutputTokens: 9000,
      effort: 'medium',
    },
  };
}

/** Check a written section against its passages and save it with its questions. */
export async function finishSection(job: Omit<SectionJob, 'call'>, out: LearnOut): Promise<LearnSection> {
  const d = await db();
  const lecture = (await d.get('lectures', job.lectureId))!;
  const ilo = (await d.get('ilos', job.iloId))!;
  const chunkList = await Promise.all(job.chunkIds.map((id) => d.get('chunks', id)));
  const pmap = new Map<string, Chunk>();
  chunkList.forEach((c, i) => { if (c && c.status === 'active') pmap.set(`p${i + 1}`, c); });
  const sectionId = sectionIdOf(lecture.id, ilo.id);
  const now = Date.now();

  // ---- verify every point against its passage
  const keptIdx = new Map<number, number>(); // model index -> kept index
  const points: LearnPoint[] = [];
  out.points.forEach((p, i) => {
    const c = pmap.get(p.passage_id);
    if (!c || !p.text.trim() || !quoteInPassage(p.quote, c.text)) return;
    keptIdx.set(i, points.length);
    points.push({
      text: p.text.trim(), quote: p.quote.trim(), chunkId: c.id, label: p.label?.trim() || undefined,
      visualItem: typeof p.visual_item === 'number' && p.visual_item >= 0 ? p.visual_item : undefined,
      stressed: p.stressed || undefined,
    });
  });
  if (points.length === 0) {
    return saveEmpty(lecture, ilo, job.order, 'The lesson for this outcome could not be checked against the slides and transcript, so it was not shown. It will be retried later.');
  }
  const chunkById = new Map([...pmap.values()].map((c) => [c.id, c]));

  // ---- questions
  const items: Item[] = [];
  const seen = new Set<string>();
  const tested = new Set<number>();
  const make = (g: GenItemOut, c: Chunk, extra: Partial<Item>, quote: string): Item => ({
    id: uid('it_'), moduleId: lecture.moduleId, iloIds: [ilo.id], type: g.type,
    level: extra.kind === 'link' ? 3 : g.type === 'short' || g.type === 'order' ? 2 : 1,
    transfer: false, prompt: g.prompt.trim(),
    options: g.type === 'mcq' ? g.options : [], correctIndex: g.type === 'mcq' ? g.correct_index : 0,
    distractorWhy: g.type === 'mcq' ? g.option_explanations : [], answer: g.answer, acceptedAnswers: g.accepted_answers ?? [],
    steps: g.type === 'order' ? g.steps : [], explanation: g.explanation, rubric: g.type === 'short' ? g.rubric : [],
    elaborationPrompt: g.elaboration_prompt, elaborationAnswer: g.elaboration_answer, beyondMaterials: g.beyond_materials ?? '',
    source: { chunkId: c.id, fileName: c.fileName, locator: c.locator, quote, chunkHash: c.hash },
    cacheKey: `learn|${sectionId}|${items.length}`, model: MODELS.BULK, createdAt: now, status: 'active', card: newCard(), seenCount: 0,
    lectureId: lecture.id, sectionId, ...extra,
  });
  for (const g of out.questions) {
    if (seen.has(normalise(g.prompt))) continue;
    if (g.point_index >= 0) {
      const k = keptIdx.get(g.point_index);
      if (k === undefined) continue;
      const pt = points[k];
      const c = chunkById.get(pt.chunkId)!;
      if (validateItem(g, c.text)) continue;
      seen.add(normalise(g.prompt));
      // a link-back question (connects this step to an earlier one) is asked right after the step's own questions
      const linkBack = k > 0 && (g.link_points ?? []).some((x) => /^S\d+$/.test(x));
      if (!linkBack) tested.add(k);
      items.push(make(g, c, { kind: linkBack ? 'link' : 'point', pointIndex: k }, g.source_quote));
    } else {
      const okType = g.type === 'short' ? g.rubric.length >= 2 && !!g.answer.trim() : g.type === 'mcq' ? g.options.length === 4 : false;
      if (!okType || !g.prompt.trim()) continue;
      const c = chunkById.get(points[0].chunkId)!;
      seen.add(normalise(g.prompt));
      items.push(make(g, c, { kind: 'link', pointIndex: -1 }, points[0].quote));
    }
  }
  // every point must be questioned: add a local fill-the-gap where the model missed one
  points.forEach((pt, k) => {
    if (tested.has(k)) return;
    const cz = localCloze(pt);
    if (!cz) return;
    const c = chunkById.get(pt.chunkId)!;
    items.push(make({
      type: 'cloze', transfer: false, prompt: cz.prompt, options: [], correct_index: 0, option_explanations: [], answer: cz.answer,
      accepted_answers: [], steps: [], explanation: pt.text, rubric: [], elaboration_prompt: '', elaboration_answer: '',
      source_quote: pt.quote, beyond_materials: '',
    }, c, { kind: 'point', pointIndex: k }, pt.quote));
  });

  const visual: Visual = out.visual?.kind && out.visual.kind !== 'none' && out.visual.items?.length >= 2
    ? { kind: out.visual.kind, title: out.visual.title, columns: out.visual.columns ?? [], items: out.visual.items.slice(0, 8) }
    : { kind: 'none', title: '', columns: [], items: [] };

  const aimIds = new Set(job.aimIds);
  const section: LearnSection = {
    id: sectionId, moduleId: lecture.moduleId, lectureId: lecture.id, iloId: ilo.id, order: job.order,
    title: out.title?.trim() || ilo.text.slice(0, 60) || ilo.id,
    intro: out.intro?.trim() ?? '', points, visual,
    aims: (out.module_aims ?? []).filter((a) => aimIds.has(a)),
    chunkIds: [...new Set(points.map((p) => p.chunkId))], itemIds: items.map((i) => i.id), updatedAt: Date.now(), v: SECTION_V,
  };
  // rewriting an unstarted older-format section: retire its unanswered questions
  const old = await d.get('sections', sectionId);
  const tx = d.transaction(['sections', 'items'], 'readwrite');
  for (const id of old?.itemIds ?? []) {
    const it = await tx.objectStore('items').get(id);
    if (it && it.seenCount === 0 && it.status === 'active') await tx.objectStore('items').put({ ...it, status: 'retired', flagReason: 'Lesson rewritten' });
  }
  for (const it of items) await tx.objectStore('items').put(it);
  await tx.objectStore('sections').put(section);
  await tx.done;
  notifyChange();
  return section;
}

export async function generateSection(lecture: Lecture, ilo: Ilo, order: number): Promise<LearnSection> {
  const job = await prepareSection(lecture, ilo, order);
  if (!('call' in job)) return job;
  return finishSection(job, await callJSON<LearnOut>(job.call));
}

export async function sectionsFor(lectureId: string): Promise<LearnSection[]> {
  return (await (await db()).getAllFromIndex('sections', 'byLecture', lectureId)).sort((a, b) => a.order - b.order);
}

/**
 * The ILOs of a lecture that still need a section written: missing ones, and ones written in an older
 * format (or before the lecture had material) that you haven't started, which are rewritten.
 */
export async function sectionsToWrite(lecture: Lecture, pendingInBatch: Set<string> = new Set()): Promise<string[]> {
  const ilos = new Set((await byModule('ilos', lecture.moduleId)).map((i) => i.id));
  const existing = await sectionsFor(lecture.id);
  const answered = new Set((await byModule('attempts', lecture.moduleId)).map((a) => a.itemId));
  const started = (s: LearnSection) => !!s.seenAt || !!s.readTo || s.itemIds.some((id) => answered.has(id));
  const fresh = (s: LearnSection) => (s.v ?? 1) >= SECTION_V || started(s);
  const have = new Set(existing.filter(fresh).map((s) => s.iloId));
  return lecture.iloIds.filter((id) => ilos.has(id) && !have.has(id) && !pendingInBatch.has(`${lecture.id}|${id}`));
}

const generating = new Map<string, Promise<void>>();

/**
 * Make sure every ILO of the lecture has a section. The first missing one is awaited (so the lesson can
 * start); the rest are written in the background. Stops quietly if AI is unavailable or over the cap.
 * Sections already queued in a half-price batch are left to it.
 */
export async function ensureSections(lecture: Lecture): Promise<{ error?: string }> {
  if (generating.has(lecture.id)) return {};
  const { pendingSectionIds } = await import('./batch');
  const all = await sectionsToWrite(lecture);
  if (!all.length) return {};
  // the section you're about to read is written now even if it's queued in a batch (the batch then skips it)
  const queued = await pendingSectionIds();
  const todo = [all[0], ...all.slice(1).filter((id) => !queued.has(`${lecture.id}|${id}`))];
  const ilos = new Map((await byModule('ilos', lecture.moduleId)).map((i) => [i.id, i]));
  let resolveFirst!: (e?: string) => void;
  const first = new Promise<string | undefined>((r) => (resolveFirst = r));
  const job = (async () => {
    for (const [k, id] of todo.entries()) {
      try {
        await generateSection(lecture, ilos.get(id)!, lecture.iloIds.indexOf(id));
        if (k === 0) resolveFirst();
      } catch (e) {
        const msg = e instanceof AiUnavailableError ? e.message : `Could not write this lesson: ${(e as Error).message}`;
        if (k === 0) resolveFirst(msg);
        break;
      }
    }
  })().finally(() => generating.delete(lecture.id));
  generating.set(lecture.id, job);
  const error = await first;
  return error ? { error } : {};
}

export function isGeneratingLecture(lectureId: string): boolean {
  return generating.has(lectureId);
}

/** Lessons you haven't started are rewritten next time (e.g. after the module-wide ILOs change). */
export async function redoUnstartedSections(moduleId: string, lectureId?: string): Promise<number> {
  const d = await db();
  let n = 0;
  for (const s of await byModule('sections', moduleId)) {
    if (lectureId && s.lectureId !== lectureId) continue;
    if ((s.v ?? 1) >= SECTION_V && !s.seenAt && !s.readTo) { await d.put('sections', { ...s, v: 2 }); n++; }
  }
  if (n) notifyChange();
  return n;
}
