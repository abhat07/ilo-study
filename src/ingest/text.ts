/** Pure text helpers (no DOM), shared by ingestion and tests. */
import type { Locator } from '../types';

export interface RawChunk {
  locator: Locator;
  text: string;
  ocr: boolean;
}

export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function locatorKey(l: Locator): string {
  switch (l.kind) {
    case 'slide': return `s${l.slide}`;
    case 'page': return `p${l.page}`;
    case 'section': return `x${l.section}`;
    case 'time': return `t${Math.round(l.start)}`;
  }
}

export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`;
}

export function locatorLabel(l: Locator): string {
  switch (l.kind) {
    case 'slide': return `slide ${l.slide}`;
    case 'page': return `page ${l.page}`;
    case 'section': return `section ${l.section}`;
    case 'time': return `${fmtTime(l.start)}–${fmtTime(l.end)}`;
  }
}

function parseTs(t: string): number {
  const p = t.trim().replace(',', '.').split(':').map(Number);
  return p.reduce((acc, v) => acc * 60 + v, 0);
}

interface Cue {
  start: number;
  end: number;
  text: string;
}

/** WebVTT and SRT. */
export function parseCues(src: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = src.replace(/\r/g, '').split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, z] = lines[ti].split('-->');
    const text = lines
      .slice(ti + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!text) continue;
    cues.push({ start: parseTs(a), end: parseTs(z.trim().split(/\s+/)[0]), text });
  }
  return cues;
}

/** Plain-text transcripts with inline timestamps such as "00:01:23" or "[1:23]" at line starts. */
export function parseTimestampedText(src: string): Cue[] | null {
  const lines = src.replace(/\r/g, '').split('\n');
  const re = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2})(?:[.,]\d+)?\]?\s*[-–:]?\s*(.*)$/;
  const hits = lines.filter((l) => re.test(l)).length;
  if (hits < 3 || hits < lines.filter((l) => l.trim()).length * 0.2) return null;
  const cues: Cue[] = [];
  let cur: Cue | null = null;
  for (const l of lines) {
    const m = l.match(re);
    if (m) {
      if (cur) cues.push(cur);
      const t = parseTs(m[1]);
      cur = { start: t, end: t, text: m[2].trim() };
    } else if (cur && l.trim()) {
      cur.text += ' ' + l.trim();
    }
  }
  if (cur) cues.push(cur);
  for (let i = 0; i < cues.length; i++) cues[i].end = cues[i + 1]?.start ?? cues[i].start + 30;
  return cues.filter((c) => c.text);
}

/** Group cues into ~150-word / ~2-minute passages, keeping timestamps. */
export function cuesToChunks(cues: Cue[], maxWords = 150, maxSec = 120): RawChunk[] {
  const out: RawChunk[] = [];
  let buf: Cue[] = [];
  let wc = 0;
  const flush = () => {
    if (!buf.length) return;
    out.push({
      locator: { kind: 'time', start: buf[0].start, end: buf[buf.length - 1].end },
      text: buf.map((c) => c.text).join(' '),
      ocr: false,
    });
    buf = [];
    wc = 0;
  };
  for (const c of cues) {
    buf.push(c);
    wc += c.text.split(/\s+/).length;
    const span = c.end - buf[0].start;
    if (wc >= maxWords || span >= maxSec) flush();
  }
  flush();
  return out;
}

/** Group paragraphs into sections of ~100-250 words, breaking at headings. */
export function paragraphsToChunks(paras: { text: string; heading?: boolean }[], maxWords = 220): RawChunk[] {
  const out: RawChunk[] = [];
  let buf: string[] = [];
  let wc = 0;
  const flush = () => {
    if (!buf.length) return;
    out.push({ locator: { kind: 'section', section: out.length + 1 }, text: buf.join('\n'), ocr: false });
    buf = [];
    wc = 0;
  };
  for (const p of paras) {
    const t = p.text.trim();
    if (!t) continue;
    if (p.heading && wc > 40) flush();
    buf.push(t);
    wc += t.split(/\s+/).length;
    if (wc >= maxWords) flush();
  }
  flush();
  return out;
}

export function plainTextToChunks(src: string): RawChunk[] {
  const cues = parseTimestampedText(src);
  if (cues) return cuesToChunks(cues);
  const paras = src
    .replace(/\r/g, '')
    .split(/\n\s*\n|\n(?=\s*(?:\d+[.)]|[-•*])\s)/)
    .map((t) => ({ text: t.replace(/\n/g, ' '), heading: /^[A-Z][^.!?]{0,80}$/.test(t.trim()) }));
  return paragraphsToChunks(paras);
}

/**
 * Traceability check: the quote must appear in the passage. Exact match after
 * normalisation, or (to tolerate small punctuation differences) at least 90% of the
 * quote's word 4-grams present in the passage.
 */
export function quoteInPassage(quote: string, passage: string): boolean {
  const q = normalise(quote).replace(/[^\w\s'-]/g, '');
  const p = normalise(passage).replace(/[^\w\s'-]/g, '');
  if (q.split(' ').length < 5) return false;
  if (p.includes(q)) return true;
  const qw = q.split(' ');
  const grams = new Set<string>();
  const pw = p.split(' ');
  for (let i = 0; i + 4 <= pw.length; i++) grams.add(pw.slice(i, i + 4).join(' '));
  let hit = 0;
  let total = 0;
  for (let i = 0; i + 4 <= qw.length; i++) {
    total++;
    if (grams.has(qw.slice(i, i + 4).join(' '))) hit++;
  }
  return total > 0 && hit / total >= 0.9;
}
