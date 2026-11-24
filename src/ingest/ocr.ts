/**
 * On-device OCR with Tesseract. Nothing is sent anywhere: the engine and English language
 * data are downloaded once (from jsDelivr) and cached by the service worker.
 */
import type { Worker } from 'tesseract.js';

let workerP: Promise<Worker> | null = null;

async function worker(): Promise<Worker> {
  if (!workerP) {
    workerP = import('tesseract.js').then((t) => t.createWorker('eng'));
  }
  return workerP;
}

export async function ocrImage(img: Blob | HTMLCanvasElement): Promise<string> {
  try {
    const w = await worker();
    const { data } = await w.recognize(img);
    if (data.confidence < 45) return '';
    return data.text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => (l.match(/[A-Za-z]/g) ?? []).length >= 2)
      .join('\n');
  } catch (e) {
    console.warn('OCR failed', e);
    return '';
  }
}

export async function terminateOcr(): Promise<void> {
  if (workerP) {
    const w = await workerP;
    await w.terminate();
    workerP = null;
  }
}
