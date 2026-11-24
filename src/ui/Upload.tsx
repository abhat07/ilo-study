import { useState } from 'preact/hooks';
import { byModule, db, kvGet, kvSet } from '../db';
import { ingestFiles, mapModule, markIlosPending, type IngestResult } from '../ingest/pipeline';
import type { IloCandidate } from '../ingest/ilo';
import { normalise } from '../ingest/text';
import { topUpPool } from '../engine/generate';
import { settings } from '../settings';
import { TopBar, go, useAi, useLive } from './common';
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

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setResults(null);
    setLog([]);
    setAfter('');
    const add = (m: string) => setLog((l) => [...l.slice(-200), m]);
    try {
      const { results, iloCandidates } = await ingestFiles(moduleId, [...list], add);
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
    }
  };

  const needsNotice = !settings.noticeAccepted() && !noticeDismissed;
  const needsSetup = ai && (ai.reason === 'no-key' || ai.reason === 'no-cap');

  return (
    <>
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
        <div class="card">
          <h2>{mod?.name}</h2>
          <p class="muted small">
            Add lecture slides (PDF or PPTX), transcripts (VTT, SRT or TXT), documents (DOCX) and the module's ILO list.
            You can pick several files at once. Re-uploading a changed file updates it and keeps your history.
          </p>
          <label class={'btn primary big' + (busy ? ' disabled' : '')} aria-disabled={busy}>
            {busy ? 'Reading files…' : 'Choose files'}
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
        </div>

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
    </>
  );
}
