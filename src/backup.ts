/**
 * Full backup as a .zip: data.json (every store) + files/<id>.pdf (original PDFs).
 * The API key is never included.
 */
import JSZip from 'jszip';
import { ALL_STORES, db, notifyChange } from './db';
import { settings } from './settings';

export const BACKUP_VERSION = 1;

export async function exportBackup(): Promise<Blob> {
  const d = await db();
  const zip = new JSZip();
  const stores: Record<string, unknown[]> = {};
  for (const s of ALL_STORES) {
    if (s === 'kv') {
      const keys = await d.getAllKeys('kv');
      const vals = await d.getAll('kv');
      stores.kv = keys.map((k, i) => ({ key: k, value: vals[i] }));
      continue;
    }
    const rows = (await d.getAll(s as any)) as any[];
    if (s === 'files') {
      stores.files = rows.map((f) => {
        if (f.blob) zip.file(`files/${f.id}.pdf`, f.blob);
        const { blob, ...rest } = f;
        void blob;
        return { ...rest, hasBlob: !!f.blob };
      });
    } else stores[s] = rows;
  }
  zip.file(
    'data.json',
    JSON.stringify({ app: 'ilo-study', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), settings: settings.exportable(), stores }),
  );
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Restores a backup, replacing everything currently stored on this device. */
export async function importBackup(file: File): Promise<{ counts: Record<string, number> }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const raw = await zip.file('data.json')?.async('string');
  if (!raw) throw new Error('Not a backup file (data.json missing).');
  const data = JSON.parse(raw);
  if (data.app !== 'ilo-study') throw new Error('This file is not an ILO Study backup.');
  // Read every PDF out of the zip first: awaiting anything else inside an IndexedDB transaction closes it.
  const blobs = new Map<string, Blob>();
  for (const f of (data.stores.files ?? []) as any[]) {
    const b = f.hasBlob ? await zip.file(`files/${f.id}.pdf`)?.async('blob') : undefined;
    if (b) blobs.set(f.id, new Blob([b], { type: 'application/pdf' }));
  }
  const d = await db();
  const counts: Record<string, number> = {};
  const tx = d.transaction(ALL_STORES as any, 'readwrite');
  for (const s of ALL_STORES) await tx.objectStore(s as any).clear();
  for (const s of ALL_STORES) {
    const rows: any[] = data.stores[s] ?? [];
    counts[s] = rows.length;
    for (const r of rows) {
      if (s === 'kv') await tx.objectStore('kv').put(r.value, r.key);
      else if (s === 'files') {
        const { hasBlob, ...rest } = r;
        void hasBlob;
        await tx.objectStore('files').put({ ...rest, blob: blobs.get(r.id) });
      } else await tx.objectStore(s as any).put(r);
    }
  }
  await tx.done;
  if (data.settings) settings.importExportable(data.settings);
  notifyChange();
  return { counts };
}
