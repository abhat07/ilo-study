import { useEffect, useState } from 'preact/hooks';
import { byModule, db, kvGet, kvSet } from '../db';
import { aiFindIlos, coverage, mapModule, saveConfirmedIlos, type Coverage } from '../ingest/pipeline';
import type { IloCandidate } from '../ingest/ilo';
import { topUpPool } from '../engine/generate';
import { AiUnavailableError } from '../ai/client';
import { pendingKey } from './Upload';
import { Spinner, TopBar, go, useLive } from './common';
import { Doodles } from './Doodles';

interface Row extends IloCandidate {
  isNew: boolean;
  key: number;
}

let keySeq = 1;

export function IloConfirm({ moduleId }: { moduleId: string }) {
  const mod = useLive(async () => (await db()).get('modules', moduleId), [moduleId]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ cov: Coverage[]; note?: string } | null>(null);

  useEffect(() => {
    (async () => {
      const existing = (await byModule('ilos', moduleId)).sort((a, b) => a.order - b.order);
      const pending = await kvGet<IloCandidate[]>(pendingKey(moduleId), []);
      setRows([
        ...existing.map((i) => ({ text: i.text, lecture: i.lecture, chunkId: i.sourceChunkId, isNew: false, key: keySeq++ })),
        ...pending.map((p) => ({ ...p, isNew: true, key: keySeq++ })),
      ]);
    })();
  }, [moduleId]);

  const update = (key: number, patch: Partial<Row>) => setRows((r) => r!.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const remove = (key: number) => setRows((r) => r!.filter((x) => x.key !== key));
  const move = (key: number, dir: -1 | 1) =>
    setRows((r) => {
      const a = [...r!];
      const i = a.findIndex((x) => x.key === key);
      const j = i + dir;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  const addPasted = () => {
    const lines = paste
      .split('\n')
      .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
      .filter((l) => l.length > 3);
    setRows((r) => [...(r ?? []), ...lines.map((text) => ({ text, lecture: '', isNew: true, key: keySeq++ }))]);
    setPaste('');
  };

  const findWithAi = async () => {
    setErr('');
    setBusy('Looking for ILOs in your files…');
    try {
      const found = await aiFindIlos(moduleId);
      if (!found.length) setErr('No ILOs found in the uploaded text. Paste them in below.');
      setRows((r) => [...(r ?? []), ...found.map((f) => ({ ...f, isNew: true, key: keySeq++ }))]);
    } catch (e) {
      setErr(e instanceof AiUnavailableError ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const confirmAll = async () => {
    const list = (rows ?? []).map((r) => ({ ...r, text: r.text.trim() })).filter((r) => r.text.length > 3);
    if (!list.length) return setErr('Add at least one ILO.');
    setErr('');
    setBusy('Saving ILOs…');
    await saveConfirmedIlos(moduleId, list);
    await kvSet(pendingKey(moduleId), []);
    setBusy('Matching passages to ILOs…');
    const r = await mapModule(moduleId, (m) => setBusy(m));
    setDone({ cov: await coverage(moduleId), note: r.by === 'lexical' ? r.note : undefined });
    setBusy('');
    topUpPool(moduleId, 6); // start making questions in the background
  };

  if (done) {
    const thin = done.cov.filter((c) => c.thin);
    return (
      <div class="has-doodles">
        <Doodles set="module" />
        <TopBar title={`ILOs · ${mod?.short ?? ''}`} back="/" />
        <div class="wrap">
          <div class="card">
            <h2>ILOs confirmed</h2>
            {done.note && <p class="notice small">Matched passages to ILOs with a local keyword method because: {done.note}</p>}
            <p class="small">{done.cov.length} ILOs. {thin.length ? `${thin.length} have thin coverage in the uploaded material:` : 'Every ILO is covered by at least two passages.'}</p>
            {thin.length > 0 && (
              <ul class="small">
                {thin.map((c) => (
                  <li key={c.ilo.id}><b>{c.ilo.id}</b> ({c.chunks} passage{c.chunks === 1 ? '' : 's'}) — {c.ilo.text}</li>
                ))}
              </ul>
            )}
            {thin.length > 0 && <p class="muted small">Upload the lecture or transcript for these to get questions on them.</p>}
            <button class="btn primary big" onClick={() => go(`/m/${moduleId}/study`)}>Start a session</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="has-doodles">
      <Doodles set="module" />
      <TopBar title={`ILOs · ${mod?.short ?? ''}`} back="/" />
      <div class="wrap">
        <div class="card">
          <h2>Check the ILOs</h2>
          <p class="muted small">
            These are the outcomes every question will be built on. Edit, reorder, delete or add — nothing is generated until
            you confirm. ILOs are copied from your files, not written by AI.
          </p>
          {!rows && <Spinner />}
          {rows?.length === 0 && (
            <div class="notice small">
              No ILOs were found automatically.
              <div class="row" style={{ marginTop: 8 }}>
                <button class="btn sm" onClick={findWithAi} disabled={!!busy}>Find ILOs with AI (≈£0.001)</button>
              </div>
            </div>
          )}
          {rows?.map((r, i) => (
            <div class="ilo-row" key={r.key}>
              <div class="row spread small">
                <span class="ilo-id">#{i + 1} {r.isNew && <span class="tag warn">new</span>}</span>
                <span class="row">
                  <button class="btn sm" aria-label="Move up" onClick={() => move(r.key, -1)}>↑</button>
                  <button class="btn sm" aria-label="Move down" onClick={() => move(r.key, 1)}>↓</button>
                  <button class="btn sm danger" onClick={() => remove(r.key)}>Delete</button>
                </span>
              </div>
              <textarea style={{ minHeight: 60, marginTop: 6 }} value={r.text} onInput={(e) => update(r.key, { text: e.currentTarget.value })} />
              <input type="text" class="small" style={{ marginTop: 4 }} placeholder="Lecture (optional)" value={r.lecture} onInput={(e) => update(r.key, { lecture: e.currentTarget.value })} />
            </div>
          ))}
          <details style={{ marginTop: 12 }}>
            <summary>Paste or type ILOs</summary>
            <textarea placeholder="One ILO per line" value={paste} onInput={(e) => setPaste(e.currentTarget.value)} />
            <button class="btn sm" style={{ marginTop: 6 }} onClick={addPasted}>Add these</button>
          </details>
          {err && <div class="err" style={{ marginTop: 10 }}>{err}</div>}
          {busy ? (
            <div class="center muted small"><Spinner />{busy}</div>
          ) : (
            <button class="btn primary big" style={{ marginTop: 14 }} disabled={!rows?.length} onClick={confirmAll}>
              Confirm {rows?.length ?? 0} ILOs
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
