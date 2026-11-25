/**
 * Lesson sections: one per ILO in a lecture. Each has a concise explanation built only from that
 * lecture's passages (every point backed by a verbatim quote), a visual, and questions on EVERY point,
 * plus "link" questions that connect it to earlier points (the building blocks of essay answers).
 */
import { byModule, db, notifyChange, uid } from '../db';
import type { Chunk, Ilo, Item, LearnPoint, LearnSection, Lecture, Visual } from '../types';
import { AiUnavailableError, callJSON } from '../ai/client';
import { MODELS } from '../ai/pricing';
import { GEN_SCHEMA, type GenItemOut } from '../ai/prompts';
import { locatorLabel, normalise, quoteInPassage } from '../ingest/text';
import { tokens } from '../ingest/lexical';
import { newCard } from '../engine/scheduler';
import { validateItem } from '../engine/generate';

// ---------------- prompt ----------------

const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const genItem = (GEN_SCHEMA as any).properties.items.items;

export const LEARN_SCHEMA = obj({
  title: str,
  intro: str,
  points: { type: 'array', items: obj({ label: str, text: str, quote: str, passage_id: str, visual_item: { type: 'integer' } }) },
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

interface LearnOut {
  title: string;
  intro: string;
  points: { label?: string; text: string; quote: string; passage_id: string; visual_item?: number }[];
  visual: Visual;
  questions: (GenItemOut & { point_index: number; link_points: string[]; passage_id: string })[];
}

export const LEARN_SYSTEM = `You write one section of a concise, exam-focused lesson for a second-year Biological Sciences undergraduate at Imperial College London. The section covers ONE intended learning outcome (ILO) and uses ONLY the lecture passages given.

EXPLANATION
- title: the topic in 3-8 words.
- intro: 1-2 sentences on what this section covers and why it matters for the ILO.
- points: the lesson is taught as small STEPS, one point at a time, each followed by questions on it. Write 5-14 points in teaching order that together cover everything the passages say that is relevant to this ILO. Break the content down as finely as the material allows: ONE idea per point (e.g. for PCR: what PCR does, then denaturation, then annealing, then extension, then why it repeats), each building on the one before.
  label: 1-4 words naming the step (e.g. "Denaturation", "Why Taq?"). text: 1-3 plain sentences (at most 50 words) explaining that one idea clearly, in the passages' terms.
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
- Item field rules: mcq has 4 options, one correct, plausible distractors, option_explanations for each; cloze replaces one key term with "____"; short has a model answer and rubric; order lists 3-7 steps in correct order. Fill unused fields with "", [], 0 or false. beyond_materials only for short context not in the passages (never graded), else "".
- Use UK spelling and the passages' terminology.`;

function learnUser(ilo: Ilo, lecture: Lecture, passages: { pid: string; where: string; text: string }[], earlier: { id: string; text: string; from: string }[]): string {
  const ps = passages.map((p) => `<passage id="${p.pid}" where="${p.where}">\n${p.text}\n</passage>`).join('\n');
  const ep = earlier.length ? earlier.map((e) => `${e.id}: ${e.text} (${e.from})`).join('\n') : '(none: this is the first section)';
  return `LECTURE ${lecture.number || ''}: ${lecture.title}
ILO ${ilo.id}: ${ilo.text}

PASSAGES:
${ps}

EARLIER POINTS (for link questions):
${ep}`;
}

// ---------------- generation ----------------

const MAX_CHARS = 11_000;

/** Passages of this lecture that teach this ILO (slides first, then transcript), within a size budget. */
function passagesFor(ilo: Ilo, lecture: Lecture, chunks: Chunk[], files: Map<string, { kind: string; name: string }>): Chunk[] {
  const inLecture = chunks.filter((c) => c.status === 'active' && lecture.fileIds.includes(c.fileId) && c.text.length >= 40);
  let picked = inLecture.filter((c) => c.iloIds.includes(ilo.id));
  if (picked.length === 0) {
    const w = new Set(tokens(ilo.text));
    picked = inLecture
      .map((c) => ({ c, s: tokens(c.text).filter((t) => w.has(t)).length }))
      .filter((x) => x.s >= 2)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((x) => x.c);
  }
  const rank = (c: Chunk) => (files.get(c.fileId)?.kind === 'pdf' || files.get(c.fileId)?.kind === 'pptx' ? 0 : 1);
  const loc = (c: Chunk) => (c.locator.kind === 'slide' ? c.locator.slide : c.locator.kind === 'page' ? c.locator.page : c.locator.kind === 'time' ? c.locator.start : c.locator.section);
  picked.sort((a, b) => rank(a) - rank(b) || a.fileName.localeCompare(b.fileName) || loc(a) - loc(b));
  const out: Chunk[] = [];
  let n = 0;
  for (const c of picked) {
    if (n + c.text.length > MAX_CHARS) continue;
    out.push(c);
    n += c.text.length;
  }
  return out;
}

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

export async function generateSection(lecture: Lecture, ilo: Ilo, order: number): Promise<LearnSection> {
  const d = await db();
  const [chunks, files, sections, ilos] = await Promise.all([
    byModule('chunks', lecture.moduleId),
    byModule('files', lecture.moduleId),
    byModule('sections', lecture.moduleId),
    byModule('ilos', lecture.moduleId),
  ]);
  const fileMap = new Map(files.map((f) => [f.id, f]));
  const passages = passagesFor(ilo, lecture, chunks, fileMap);
  const sectionId = `${lecture.id}|${ilo.id}`;
  const now = Date.now();
  const empty: LearnSection = {
    id: sectionId, moduleId: lecture.moduleId, lectureId: lecture.id, iloId: ilo.id, order, title: ilo.text.slice(0, 80),
    intro: 'No slides in this lecture were matched to this outcome yet. Upload the lecture (or its transcript) to get a lesson.',
    points: [], visual: { kind: 'none', title: '', columns: [], items: [] }, chunkIds: [], itemIds: [], updatedAt: now,
  };
  if (passages.length === 0) {
    await d.put('sections', empty);
    notifyChange();
    return empty;
  }

  // earlier points: this lecture's earlier sections, then up to 10 from the previous lecture
  const lectures = await byModule('lectures', lecture.moduleId);
  const prevLecture = lectures.filter((l) => l.number > 0 && l.number < lecture.number).sort((a, b) => b.number - a.number)[0];
  const earlierSecs = [
    ...sections.filter((s) => s.lectureId === lecture.id && s.order < order).sort((a, b) => a.order - b.order),
    ...(prevLecture ? sections.filter((s) => s.lectureId === prevLecture.id) : []),
  ];
  const earlier: { id: string; text: string; from: string; sectionId: string; idx: number }[] = [];
  for (const s of earlierSecs) {
    const from = s.lectureId === lecture.id ? `this lecture: ${s.title}` : `Lecture ${prevLecture!.number}: ${s.title}`;
    s.points.forEach((p, idx) => earlier.push({ id: `E${earlier.length + 1}`, text: p.text, from, sectionId: s.id, idx }));
  }
  const earlierUsed = earlier.slice(0, 30);

  const pmap = new Map(passages.map((c, i) => [`p${i + 1}`, c]));
  const out = await callJSON<LearnOut>({
    purpose: 'lesson section',
    tier: 'BULK',
    system: LEARN_SYSTEM,
    user: learnUser(ilo, lecture, passages.map((c, i) => ({ pid: `p${i + 1}`, where: `${c.fileName}, ${locatorLabel(c.locator)}`, text: c.text })), earlierUsed),
    schema: LEARN_SCHEMA,
    maxTokens: 24_000,
    expectedOutputTokens: 9000,
    effort: 'medium',
  });

  // ---- verify every point against its passage
  const keptIdx = new Map<number, number>(); // model index -> kept index
  const points: LearnPoint[] = [];
  out.points.forEach((p, i) => {
    const c = pmap.get(p.passage_id);
    if (!c || !p.text.trim() || !quoteInPassage(p.quote, c.text)) return;
    keptIdx.set(i, points.length);
    points.push({ text: p.text.trim(), quote: p.quote.trim(), chunkId: c.id, label: p.label?.trim() || undefined, visualItem: typeof p.visual_item === 'number' && p.visual_item >= 0 ? p.visual_item : undefined });
  });
  if (points.length === 0) {
    await d.put('sections', { ...empty, intro: 'The lesson for this outcome could not be checked against the slides, so it was not shown. It will be retried later.' });
    notifyChange();
    return empty;
  }
  const chunkById = new Map(passages.map((c) => [c.id, c]));

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

  const section: LearnSection = {
    id: sectionId, moduleId: lecture.moduleId, lectureId: lecture.id, iloId: ilo.id, order,
    title: out.title?.trim() || ilos.find((i) => i.id === ilo.id)?.text.slice(0, 60) || ilo.id,
    intro: out.intro?.trim() ?? '', points, visual,
    chunkIds: [...new Set(points.map((p) => p.chunkId))], itemIds: items.map((i) => i.id), updatedAt: Date.now(), v: 2,
  };
  // rewriting an unstarted older-format section: retire its unanswered questions
  const old = await d.get('sections', sectionId);
  const tx = d.transaction(['sections', 'items'], 'readwrite');
  for (const id of old?.itemIds ?? []) {
    const it = await tx.objectStore('items').get(id);
    if (it && it.seenCount === 0 && it.status === 'active') await tx.objectStore('items').put({ ...it, status: 'retired', flagReason: 'Lesson rewritten step by step' });
  }
  for (const it of items) await tx.objectStore('items').put(it);
  await tx.objectStore('sections').put(section);
  await tx.done;
  notifyChange();
  return section;
}

export async function sectionsFor(lectureId: string): Promise<LearnSection[]> {
  return (await (await db()).getAllFromIndex('sections', 'byLecture', lectureId)).sort((a, b) => a.order - b.order);
}

const generating = new Map<string, Promise<void>>();

/**
 * Make sure every ILO of the lecture has a section. The first missing one is awaited (so the lesson can
 * start); the rest are written in the background. Stops quietly if AI is unavailable or over the cap.
 */
export async function ensureSections(lecture: Lecture): Promise<{ error?: string }> {
  if (generating.has(lecture.id)) return {};
  const ilos = new Map((await byModule('ilos', lecture.moduleId)).map((i) => [i.id, i]));
  const existing = await sectionsFor(lecture.id);
  // sections written before step-by-step lessons are rewritten if you haven't started them
  const answered = new Set((await byModule('attempts', lecture.moduleId)).map((a) => a.itemId));
  const stale = (s: LearnSection) => (s.v ?? 1) < 2 && s.points.length > 0 && !s.seenAt && !s.readTo && !s.itemIds.some((id) => answered.has(id));
  const have = new Set(existing.filter((s) => (s.points.length || s.intro.startsWith('No slides')) && !stale(s)).map((s) => s.iloId));
  const todo = lecture.iloIds.filter((id) => !have.has(id) && ilos.has(id));
  if (!todo.length) return {};
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
