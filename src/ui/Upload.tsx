import { useState } from 'preact/hooks';
import { byModule, db, kvGet, kvSet } from '../db';
import { ingestFiles, mapModule, markIlosPending, type IngestResult } from '../ingest/pipeline';
import type { IloCandidate } from '../ingest/ilo';
import { normalise } from '../ingest/text';
import { fileKind } from '../ingest/extract';
import { topUpPool } from '../engine/generate';
import { settings } from '../settings';
import { TopBar, go, useAi, useLive } from './common';
import { Doodles } from './Doodles';
import { DataNotice, KeyAndCap } from './Setup';

export const pendingKey = (moduleId: string) => `pendingIlos:${moduleId}`;

export function Upload({ moduleId }: { moduleId: string }) {
  const mod = useLive(async () => (await db()).get('modules', moduleId), [moduleId]);
  const ai = useAi();
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [results, setResults] = useState<IngestResult[] | null>(null);
  const [newIlos, setNewIlos] = useState(0);
  const [after, setAfter] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const onFiles = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    // Keep only supported files (a folder may contain .apkg, .xlsx, images…) and skip hidden/temp files.
    const all = [...list].filter((f) => !f.name.startsWith('.') && !f.name.startsWith('~$'));
    const usable = all.filter((f) => fileKind(f.name));
    setSkipped(all.filter((f) => !fileKind(f.name)).map((f) => f.name));
    if (usable.length === 0) return;
    // ILO documents first, then lectures in name order
    usable.sort((a, b) => Number(/ilo|outcome/i.test(b.name)) - Number(/ilo|outcome/i.test(a.name)) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    let lock: WakeLockSentinel | null = null;
    try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not supported */ }
    setBusy(true);
    setResults(null);
    setLog([]);
    setAfter('');
    const add = (m: string) => setLog((l) => [...l.slice(-200), m]);
    try {
      add(`Reading ${usable.length} file${usable.length === 1 ? '' : 's'}…`);
      const { results, iloCandidates } = await ingestFiles(moduleId, usable, add);
      setResults(results);
      // Collect ILO candidates that aren't already confirmed or pending
      const confirmed = new Set((await byModule('ilos', moduleId)).map((i) => normalise(i.text)));
      const pending = await kvGet<IloCandidate[]>(pendingKey(moduleId), []);
      const pend = new Set(pending.map((p) => normalise(p.text)));
      const fresh = iloCandidates.filter((c) => !confirmed.has(normalise(c.text)) && !pend.has(normalise(c.text)));
      await kvSet(pendingKey(moduleId), [...pending, ...fresh]);
      setNewIlos(fresh.length + pending.length);
      const modNow = await (await db()).get('modules', moduleId);
      if (modNow?.iloStatus !== 'confirmed') {
        await markIlosPending(moduleId);
        setAfter('ilos');
      } else if (fresh.length + pending.length > 0) {
        setAfter('ilos');
      } else {
        // ILOs already confirmed: map the new passages and make questions in the background
        add('Matching new passages to your ILOs…');
        const r = await mapModule(moduleId, add);
        add(r.by === 'ai' ? `Matched ${r.mapped} passages.` : `Matched ${r.mapped} passages locally (${r.note ?? 'AI unavailable'}).`);
        topUpPool(moduleId);
        setAfter('ready');
      }
    } finally {
      setBusy(false);
      lock?.release().catch(() => {});
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (busy || !e.dataTransfer) return;
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
    const files = entries.length ? (await Promise.all(entries.map(readEntry))).flat() : [...e.dataTransfer.files];
    onFiles(files);
  };

  const needsNotice = !settings.noticeAccepted() && !noticeDismissed;
  const needsSetup = ai && (ai.reason === 'no-key' || ai.reason === 'no-cap');

  return (
    <div class="has-doodles">
      <Doodles set="upload" />
      <TopBar title={`Upload · ${mod?.short ?? ''}`} back="/" />
      <div class="wrap">
        {needsNotice && <DataNotice onAccept={() => setNoticeDismissed(true)} onDecline={() => setNoticeDismissed(true)} />}
        {needsSetup && (
          <div class="card">
            <h2>Set up AI (needed to make questions)</h2>
            <p class="muted small">You can upload now and add these later; files are read on this device either way.</p>
            <KeyAndCap compact />
          </div>
        )}
        <div
          class={'card drop' + (dragOver ? ' over' : '')}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <h2>{mod?.name}</h2>
          <p class="muted small">
            Add lecture slides (PDF or PPTX), transcripts (VTT, SRT or TXT), documents (DOCX) and the module's ILO list.
            Upload a <b>whole folder</b> to add a module's lectures, transcripts and ILOs in one go, or drag them here.
            Re-uploading a changed file updates it and keeps your history.
          </p>
          <label class={'btn primary big' + (busy ? ' disabled' : '')} aria-disabled={busy}>
            {busy ? 'Reading files…' : '📁 Upload a whole folder'}
            <input
              type="file"
              hidden
              disabled={busy}
              {...{ webkitdirectory: '', directory: '' }}
              onChange={(e) => onFiles(e.currentTarget.files)}
            />
          </label>
          <label class={'btn big' + (busy ? ' disabled' : '')} aria-disabled={busy} style={{ marginTop: 8 }}>
            📄 Choose files
            <input
              type="file"
              multiple
              hidden
              disabled={busy}
              accept=".pdf,.pptx,.docx,.txt,.vtt,.srt,.md"
              onChange={(e) => onFiles(e.currentTarget.files)}
            />
          </label>
          {log.length > 0 && <div class="log" style={{ marginTop: 12 }}>{log.slice(-8).join('\n')}</div>}
          {skipped.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary class="small">Skipped {skipped.length} unsupported file{skipped.length === 1 ? '' : 's'}</summary>
              <div class="small muted">{skipped.slice(0, 40).join(', ')}{skipped.length > 40 ? '…' : ''}</div>
            </details>
          )}
        </div>

        {!results && !busy && (
          <div class="card">
            <h2>What happens to your files</h2>
            <ol class="flow">
              <li><b>Read on this device.</b> Slides split into one passage per slide or page; transcripts into 2-minute passages with timestamps; diagram text read with OCR.</li>
              <li><b>ILOs found.</b> Copied from "Learning outcomes" slides or your ILO document. You check and confirm them first.</li>
              <li><b>Passages matched to ILOs.</b> Short excerpts are sent to the model to tag which outcome each slide teaches. ILOs with thin coverage are flagged.</li>
              <li><b>Questions written as you study.</b> Every question quotes its slide word for word and is rejected if it can't be traced.</li>
            </ol>
            <p class="muted small" style={{ marginBottom: 0 }}>Re-uploading a file with the same name updates it and keeps your history. Remove files any time from "What I know".</p>
          </div>
        )}

        {results && (
          <div class="card">
            <h2>Results</h2>
            <ul class="small">
              {results.map((r) => (
                <li key={r.fileName}>
                  <b>{r.fileName}</b> —{' '}
                  <span class={'tag ' + (r.outcome === 'added' || r.outcome === 'updated' ? 'ok' : r.outcome === 'duplicate' ? '' : 'bad')}>
                    {r.outcome}
                  </span>{' '}
                  {r.detail}
                </li>
              ))}
            </ul>
            {after === 'ilos' && (
              <>
                <p class="small">
                  {newIlos > 0
                    ? `Found ${newIlos} possible ILO${newIlos === 1 ? '' : 's'}. Check them before any questions are made.`
                    : 'No ILO list was found automatically. You can find them with AI, or paste them in.'}
                </p>
                <button class="btn primary big" onClick={() => go(`/m/${moduleId}/ilos`)}>Check ILOs</button>
              </>
            )}
            {after === 'ready' && (
              <button class="btn primary big" onClick={() => go(`/m/${moduleId}/study`)}>Start a session</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Recursively read files from a dropped folder. */
async function readEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((res) => (entry as FileSystemFileEntry).file((f) => res([f]), () => res([])));
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const all: FileSystemEntry[] = [];
    // readEntries returns results in batches
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res) => reader.readEntries(res, () => res([])));
      if (!batch.length) break;
      all.push(...batch);
    }
    return (await Promise.all(all.map(readEntry))).flat();
  }
  return [];
}
