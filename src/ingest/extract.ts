import JSZip from 'jszip';
import type { SourceFile } from '../types';
import { cuesToChunks, paragraphsToChunks, parseCues, plainTextToChunks, type RawChunk } from './text';
import { ocrImage } from './ocr';

export type Progress = (msg: string) => void;

export function fileKind(name: string): SourceFile['kind'] | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'docx') return 'docx';
  if (ext === 'vtt' || ext === 'srt') return 'transcript';
  if (ext === 'txt' || ext === 'md') return 'text';
  return null;
}

export async function extract(file: File, kind: SourceFile['kind'], progress: Progress): Promise<RawChunk[]> {
  switch (kind) {
    case 'pdf': return extractPdf(await file.arrayBuffer(), progress);
    case 'pptx': return extractPptx(await file.arrayBuffer(), progress);
    case 'docx': return extractDocx(await file.arrayBuffer());
    case 'transcript': return cuesToChunks(parseCues(await file.text()));
    case 'text': return plainTextToChunks(await file.text());
  }
}

// ---------------- PDF ----------------

let pdfjsP: Promise<typeof import('pdfjs-dist')> | null = null;
async function pdfjs() {
  if (!pdfjsP) {
    pdfjsP = (async () => {
      const lib = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    })();
  }
  return pdfjsP;
}

/** Pages with less text than this are treated as diagram-heavy and OCR'd. */
const OCR_THRESHOLD_CHARS = 200;

async function extractPdf(buf: ArrayBuffer, progress: Progress): Promise<RawChunk[]> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(buf) });
  const doc = await task.promise;
  const out: RawChunk[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    progress(`Reading page ${n} of ${doc.numPages}`);
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    let text = '';
    for (const it of tc.items) {
      if ('str' in it) text += it.str + (it.hasEOL ? '\n' : ' ');
    }
    text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    let ocr = false;
    if (text.length < OCR_THRESHOLD_CHARS) {
      progress(`Reading diagram text on page ${n} of ${doc.numPages} (OCR)`);
      const canvas = await renderPdfPage(page, 1600);
      const o = await ocrImage(canvas);
      if (o && !text.includes(o.slice(0, 30))) {
        text = (text ? text + '\n' : '') + '[Diagram text] ' + o;
        ocr = true;
      }
    }
    out.push({ locator: { kind: 'page', page: n }, text, ocr });
  }
  await task.destroy();
  return out;
}

// pdf.js page proxy type kept loose to avoid importing internal types
async function renderPdfPage(page: any, targetWidth: number): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidth / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
  return canvas;
}

/** Render one page of a stored PDF so the student can compare with the original slide. */
export async function renderStoredPdfPage(blob: Blob, pageNo: number, width: number): Promise<HTMLCanvasElement> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const doc = await task.promise;
  const page = await doc.getPage(pageNo);
  const c = await renderPdfPage(page, width);
  await task.destroy();
  return c;
}

// ---------------- PPTX ----------------

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const num = (p: string) => Number(p.match(/(\d+)\.xml$/)?.[1] ?? 0);

function drawingText(doc: Document): string {
  const paras = [...doc.getElementsByTagName('a:p')];
  return paras
    .map((p) => [...p.getElementsByTagName('a:t')].map((t) => t.textContent ?? '').join(''))
    .filter((t) => t.trim())
    .join('\n');
}

async function extractPptx(buf: ArrayBuffer, progress: Progress): Promise<RawChunk[]> {
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => num(a) - num(b));
  // presentation order comes from presentation.xml; fall back to file numbering
  const order = await slideOrder(zip, slides);
  const out: RawChunk[] = [];
  for (let i = 0; i < order.length; i++) {
    const path = order[i];
    progress(`Reading slide ${i + 1} of ${order.length}`);
    const sx = xml(await zip.file(path)!.async('string'));
    let text = drawingText(sx);
    let ocr = false;
    const relsPath = path.replace('slides/', 'slides/_rels/') + '.rels';
    const rels = zip.file(relsPath) ? xml(await zip.file(relsPath)!.async('string')) : null;
    if (rels) {
      for (const r of [...rels.getElementsByTagName('Relationship')]) {
        const type = r.getAttribute('Type') ?? '';
        const target = r.getAttribute('Target') ?? '';
        const resolved = 'ppt/' + target.replace(/^\.\.\//, '');
        if (type.endsWith('/notesSlide') && zip.file(resolved)) {
          const notes = drawingText(xml(await zip.file(resolved)!.async('string')))
            .split('\n')
            .filter((l) => !/^\d+$/.test(l.trim()))
            .join('\n');
          if (notes.trim()) text += '\nSpeaker notes: ' + notes;
        }
        if (type.endsWith('/image') && /\.(png|jpe?g|gif|bmp)$/i.test(resolved) && zip.file(resolved)) {
          const data = await zip.file(resolved)!.async('blob');
          if (data.size > 15_000) {
            progress(`Reading diagram text on slide ${i + 1} (OCR)`);
            const o = await ocrImage(data);
            if (o) {
              text += '\n[Diagram text] ' + o;
              ocr = true;
            }
          }
        }
      }
    }
    out.push({ locator: { kind: 'slide', slide: i + 1 }, text: text.trim(), ocr });
  }
  return out;
}

async function slideOrder(zip: JSZip, fallback: string[]): Promise<string[]> {
  try {
    const pres = xml(await zip.file('ppt/presentation.xml')!.async('string'));
    const rels = xml(await zip.file('ppt/_rels/presentation.xml.rels')!.async('string'));
    const map = new Map<string, string>();
    for (const r of [...rels.getElementsByTagName('Relationship')]) {
      map.set(r.getAttribute('Id') ?? '', 'ppt/' + (r.getAttribute('Target') ?? '').replace(/^\//, '').replace(/^ppt\//, ''));
    }
    const ids = [...pres.getElementsByTagName('p:sldId')].map((e) => e.getAttribute('r:id') ?? '');
    const ordered = ids.map((id) => map.get(id)).filter((p): p is string => !!p && !!zip.file(p));
    return ordered.length ? ordered : fallback;
  } catch {
    return fallback;
  }
}

// ---------------- DOCX ----------------

async function extractDocx(buf: ArrayBuffer): Promise<RawChunk[]> {
  const zip = await JSZip.loadAsync(buf);
  const doc = xml(await zip.file('word/document.xml')!.async('string'));
  const paras = [...doc.getElementsByTagName('w:p')].map((p) => {
    const style = p.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') ?? '';
    const isList = p.getElementsByTagName('w:numPr').length > 0;
    const t = [...p.getElementsByTagName('w:t')].map((x) => x.textContent ?? '').join('');
    return { text: (isList ? '- ' : '') + t, heading: /heading|title/i.test(style) };
  });
  return paragraphsToChunks(paras);
}
