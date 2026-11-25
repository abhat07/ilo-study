/**
 * Group a module's material into lectures, free and on-device:
 *  - files by the lecture number(s) in their name ("Lecture_07_Sequencing.pdf", "Transcript_Lectures_07-08.txt")
 *  - each ILO to the lecture whose passages were matched to it most often
 * Your manual edits (userEdited) are kept when lectures are rebuilt.
 */
import { byModule, db, notifyChange } from '../db';
import type { Chunk, Ilo, Lecture, SourceFile } from '../types';
import { tokens } from '../ingest/lexical';

/** Lecture numbers named in a file name. "Lectures_07-08" → [7, 8]; "ILO_list_Lectures_1-9" → [1..9]. */
export function lectureNumbers(name: string): number[] {
  const base = name.replace(/\.[^.]+$/, '');
  const m = base.match(/(?:lectures?|lect|^L|[\s_-]L)[\s_.-]*0*(\d{1,2})(?:\s*(?:-|–|_|to|and|&)\s*(?:L(?:ecture)?\s*)?0*(\d{1,2}))?(?!\d)/i);
  if (m) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (b >= a && b - a < 20) return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    return [a];
  }
  const lead = base.match(/^0*(\d{1,2})[\s._-]/); // "7. Sequencing_26_Canvas", "08_Mutation…"
  if (lead) return [Number(lead[1])];
  const cbg = base.match(/^[A-Z]{2,5}[._]?0*(\d{1,2})\b/); // "CBG.17 Mendelian Genetics"
  return cbg ? [Number(cbg[1])] : [];
}

/** A readable title from a file name: "Lecture_05_Genomic_libraries.pptx" → "Genomic libraries". */
export function titleFromFile(name: string): string {
  let t = name.replace(/\.[^.]+$/, '');
  t = t
    .replace(/[_]+/g, ' ')
    .replace(/\(\d{4}\)(-\d+)?/g, '')
    .replace(/\b20\d\d[- ]\d\d[- ]\d\d\b/g, '')
    .replace(/\b(transcript|captions?|english|united kingdom|canvas|final|slides?|v\d+)\b/gi, '')
    .replace(/(?:lectures?|lect)[\s.-]*\d{1,2}(\s*[-–]\s*\d{1,2})?/gi, '')
    .replace(/^\s*L\d{1,2}\b/i, '')
    .replace(/^\s*[A-Z]{2,5}[.]?\d{1,2}\b/, '')
    .replace(/^\s*\d{1,2}[\s.-]+/, '')
    .replace(/\b\d{2}\b/g, '')
    .replace(/^[\s\-–.:]+|[\s\-–.:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

const isModuleWide = (f: SourceFile) => lectureNumbers(f.name).length > 3; // e.g. an ILO list for lectures 1-9

export async function buildLectures(moduleId: string): Promise<Lecture[]> {
  const d = await db();
  const [files, chunks, ilos, existing] = await Promise.all([
    byModule('files', moduleId),
    byModule('chunks', moduleId),
    byModule('ilos', moduleId),
    byModule('lectures', moduleId),
  ]);
  const active = files.filter((f) => f.status === 'active');
  const now = Date.now();
  const byId = new Map(existing.map((l) => [l.id, l]));
  const lect = new Map<number, Lecture>();
  const get = (n: number): Lecture => {
    if (!lect.has(n)) {
      const id = `${moduleId}-L${n}`;
      const prev = byId.get(id);
      lect.set(n, prev ? { ...prev, fileIds: prev.userEdited ? [...prev.fileIds] : [], iloIds: prev.userEdited ? [...prev.iloIds] : [] } : {
        id, moduleId, number: n, title: n === 0 ? 'Other material' : '', fileIds: [], iloIds: [], updatedAt: now,
      });
    }
    return lect.get(n)!;
  };
  for (const l of existing) if (l.userEdited) get(l.number);

  // files → lectures (a file already placed by you stays put)
  const placed = new Set(existing.filter((l) => l.userEdited).flatMap((l) => l.fileIds));
  for (const f of active) {
    if (placed.has(f.id) || isModuleWide(f)) continue;
    const nums = lectureNumbers(f.name);
    for (const n of nums.length ? nums : [0]) {
      const L = get(n);
      if (!L.fileIds.includes(f.id)) L.fileIds.push(f.id);
    }
  }
  const fileById = new Map(active.map((f) => [f.id, f]));
  for (const L of lect.values()) {
    L.fileIds = L.fileIds.filter((id) => fileById.has(id));
    if (!L.title) {
      const slides = L.fileIds.map((id) => fileById.get(id)!).filter((f) => f.kind === 'pdf' || f.kind === 'pptx');
      const pick = slides[0] ?? fileById.get(L.fileIds[0]);
      L.title = (pick && titleFromFile(pick.name)) || `Lecture ${L.number}`;
    }
  }

  // ILOs → lectures by where their passages are
  const chunkFileLectures = new Map<string, number[]>();
  for (const L of lect.values()) for (const fid of L.fileIds) chunkFileLectures.set(fid, [...(chunkFileLectures.get(fid) ?? []), L.number]);
  const assignedByYou = new Set(existing.filter((l) => l.userEdited).flatMap((l) => l.iloIds));
  for (const ilo of ilos.sort((a, b) => a.order - b.order)) {
    if (assignedByYou.has(ilo.id)) continue;
    const n = pickLecture(ilo, chunks, chunkFileLectures, lect);
    const L = get(n);
    if (!L.iloIds.includes(ilo.id)) L.iloIds.push(ilo.id);
  }
  // keep ILO order within each lecture
  const iloOrder = new Map(ilos.map((i) => [i.id, i.order]));
  const out = [...lect.values()]
    .filter((L) => L.fileIds.length || L.iloIds.length || L.userEdited)
    .map((L) => ({ ...L, iloIds: L.iloIds.filter((id) => iloOrder.has(id)).sort((a, b) => iloOrder.get(a)! - iloOrder.get(b)!), updatedAt: now }))
    .sort((a, b) => (a.number || 999) - (b.number || 999));

  const changed = out.filter((L) => {
    const prev = byId.get(L.id);
    return !prev || JSON.stringify({ ...prev, updatedAt: 0 }) !== JSON.stringify({ ...L, updatedAt: 0 });
  });
  if (changed.length) {
    const tx = d.transaction('lectures', 'readwrite');
    for (const L of changed) await tx.store.put(L);
    await tx.done;
    notifyChange(); // only when something changed, so screens that rebuild on load don't loop
  }
  return out.map((L) => (changed.includes(L) ? L : byId.get(L.id)!));
}

function pickLecture(ilo: Ilo, chunks: Chunk[], fileLectures: Map<string, number[]>, lect: Map<number, Lecture>): number {
  // 1. an explicit "Lecture N" label
  const label = lectureNumbers(ilo.lecture || '');
  if (label.length === 1 && lect.has(label[0])) return label[0];
  // 2. where its matched passages live (transcripts shared by two lectures count half each)
  const score = new Map<number, number>();
  for (const c of chunks) {
    if (c.status !== 'active' || !c.iloIds.includes(ilo.id)) continue;
    const ls = fileLectures.get(c.fileId) ?? [];
    for (const n of ls) score.set(n, (score.get(n) ?? 0) + 1 / ls.length);
  }
  const best = [...score].filter(([n]) => n !== 0).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  // 3. word overlap with each lecture's title
  const w = new Set(tokens(ilo.text));
  let top = 0, topN = 0;
  for (const L of lect.values()) {
    const s = tokens(L.title).filter((t) => w.has(t)).length;
    if (s > top) { top = s; topN = L.number; }
  }
  return topN;
}

export async function lecturesFor(moduleId: string): Promise<Lecture[]> {
  return (await byModule('lectures', moduleId)).sort((a, b) => (a.number || 999) - (b.number || 999));
}

/** Save your manual changes to a lecture (title, files, ILOs). */
export async function saveLecture(l: Lecture): Promise<void> {
  await (await db()).put('lectures', { ...l, userEdited: true, updatedAt: Date.now() });
  notifyChange();
}
