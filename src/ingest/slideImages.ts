/**
 * Slide pictures from PowerPoint files: kept so lessons and feedback can show the lecture's own diagrams.
 * Pictures repeated across many slides (logos, template backgrounds) are skipped; the rest are shrunk to
 * JPEG (max 1100 px wide) to stay light on a phone.
 */
import { byModule, db, notifyChange, sha256 } from '../db';
import type { SlideImage } from '../types';
import { pptxSlideImages } from './extract';

const MAX_W = 1100;

/** Is this the same picture on lots of slides (a logo or template background)? */
export function repeatedHashes(bySlideHashes: Map<number, string[]>): Set<string> {
  const count = new Map<string, number>();
  for (const hs of bySlideHashes.values()) for (const h of new Set(hs)) count.set(h, (count.get(h) ?? 0) + 1);
  const slides = bySlideHashes.size;
  const out = new Set<string>();
  for (const [h, n] of count) if (n >= 3 && n / Math.max(slides, 1) >= 0.25) out.add(h);
  return out;
}

async function shrink(blob: Blob): Promise<{ blob: Blob; w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    if (bmp.width < 140 || bmp.height < 90) return null;
    const scale = Math.min(1, MAX_W / bmp.width);
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff'; // transparent PNGs on white, as on the slide
    g.fillRect(0, 0, w, h);
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
    return out ? { blob: out, w, h } : null;
  } catch {
    return null; // formats the browser can't decode
  }
}

/** Extract and store a PPTX's slide pictures, linked to that file's slide passages. Returns how many were kept. */
export async function saveSlideImages(moduleId: string, fileId: string, buf: ArrayBuffer, progress: (m: string) => void): Promise<number> {
  const d = await db();
  const bySlide = await pptxSlideImages(buf);
  if (!bySlide.size) return 0;
  const chunks = (await d.getAllFromIndex('chunks', 'byFile', fileId)).filter((c) => c.locator.kind === 'slide');
  const chunkBySlide = new Map(chunks.map((c) => [(c.locator as { slide: number }).slide, c.id]));
  // raw hashes to spot logos/backgrounds
  const raw = new Map<number, string[]>();
  for (const [s, blobs] of bySlide) raw.set(s, await Promise.all(blobs.map(async (b) => sha256(await b.arrayBuffer()))));
  const skip = repeatedHashes(raw);
  const existing = new Set((await d.getAllFromIndex('images', 'byFile', fileId)).map((i) => i.id));
  const now = Date.now();
  let kept = 0, done = 0;
  const total = [...bySlide.values()].reduce((n, b) => n + b.length, 0);
  for (const [slide, blobs] of bySlide) {
    const chunkId = chunkBySlide.get(slide);
    if (!chunkId) continue;
    for (let k = 0; k < blobs.length; k++) {
      done++;
      if (skip.has(raw.get(slide)![k])) continue;
      const id = `${fileId}|s${slide}|${k}`;
      if (existing.has(id)) continue;
      progress(`Saving slide pictures (${done} of ${total})`);
      const small = await shrink(blobs[k]);
      if (!small) continue;
      const img: SlideImage = {
        id, moduleId, fileId, chunkId, slide, hash: await sha256(await small.blob.arrayBuffer()), w: small.w, h: small.h,
        status: 'active', updatedAt: now, blob: small.blob,
      };
      await d.put('images', img);
      kept++;
    }
  }
  if (kept) notifyChange();
  return kept;
}

/** Pictures to show for a passage (blobs may still need fetching on this device). */
export async function imagesForChunk(chunkId: string): Promise<SlideImage[]> {
  return (await (await db()).getAllFromIndex('images', 'byChunk', chunkId)).filter((i) => i.status === 'active').sort((a, b) => a.id.localeCompare(b.id));
}

export async function imageCountForFile(fileId: string): Promise<number> {
  return (await (await db()).getAllFromIndex('images', 'byFile', fileId)).length;
}

export async function removeImagesForFile(fileId: string): Promise<void> {
  const d = await db();
  for (const i of await d.getAllFromIndex('images', 'byFile', fileId)) {
    if (i.status !== 'removed') await d.put('images', { ...i, status: 'removed', blob: undefined, updatedAt: Date.now() });
  }
}

export async function moduleImages(moduleId: string): Promise<SlideImage[]> {
  return byModule('images', moduleId);
}
