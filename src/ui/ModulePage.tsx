import { byModule, db } from '../db';
import { coverage, removeFile } from '../ingest/pipeline';
import { syncNow, syncSettings } from '../sync/sync';
import { toast } from './fun';
import type { SourceFile } from '../types';
import { calibration, estimateMastery, type MasteryEstimate } from '../engine/mastery';
import { isGenerating } from '../engine/generate';
import type { Ilo } from '../types';
import { Bar, TopBar, go, masteryColor, useLive } from './common';
import { Doodles } from './Doodles';
import { LectureList } from './LectureList';

async function load(moduleId: string) {
  const d = await db();
  const mod = await d.get('modules', moduleId);
  const [files, items, attempts, disputes, events, cov, ilos] = await Promise.all([
    byModule('files', moduleId),
    byModule('items', moduleId),
    byModule('attempts', moduleId),
    byModule('disputes', moduleId),
    byModule('events', moduleId),
    coverage(moduleId),
    byModule('ilos', moduleId),
  ]);
  const im = new Map(items.map((i) => [i.id, i]));
  const rows = ilos
    .sort((a, b) => a.order - b.order)
    .map((ilo) => ({
      ilo,
      m: estimateMastery(attempts.filter((a) => a.iloIds.includes(ilo.id)), im),
      cov: cov.find((c) => c.ilo.id === ilo.id),
      items: items.filter((i) => i.iloIds.includes(ilo.id) && i.status === 'active').length,
    }));
  return { mod, files, items, attempts, disputes, events, rows, cal: calibration(attempts) };
}

function headline(rows: { m: MasteryEstimate }[]): string {
  const counted = rows.filter((r) => r.m.label !== 'No evidence');
  if (!counted.length) return "No answers yet, so the app doesn't know what you know. Start a session.";
  const secure = rows.filter((r) => r.m.label === 'Secure').length;
  const weak = rows.filter((r) => r.m.label === 'Not yet' || r.m.label === 'Shaky').length;
  return `Secure on ${secure} of ${rows.length} outcomes, shaky or not yet on ${weak}, no evidence on ${rows.length - counted.length}.`;
}

export function ModulePage({ moduleId }: { moduleId: string }) {
  const data = useLive(() => load(moduleId), [moduleId]);
  if (!data) return <TopBar title="…" back="/" />;
  const { mod, files, items, disputes, events, rows, cal } = data;
  const flagged = items.filter((i) => i.status === 'flagged');
  const active = files.filter((f) => f.status === 'active');
  return (
    <div class="has-doodles">
      <Doodles set="module" />
      <TopBar title={`What I know · ${mod?.short ?? ''}`} back="/" />
      <div class="wrap">
        <div class="card">
          <h2>{mod?.name}</h2>
          <p class="small">{headline(rows)}</p>
          {cal.n >= 5 && (
            <p class="small muted">
              Calibration: on average you feel {Math.round(cal.meanConf * 100)}% sure and are right {Math.round(cal.accuracy * 100)}% of the time
              {cal.meanConf - cal.accuracy > 0.1 ? ' — you tend to be overconfident.' : cal.accuracy - cal.meanConf > 0.1 ? ' — you know more than you think.' : ' — well calibrated.'}
            </p>
          )}
          <p class="muted small">
            How this is judged: mostly first attempts at questions you have never seen (repeats count only a little), how long since you last got it right, whether your confidence matched your answers, and whether you can apply it to a new scenario.
          </p>
          <div class="row">
            <button class="btn primary" onClick={() => go(`/m/${moduleId}/study`)}>Start a session</button>
            <button class="btn" onClick={() => go(`/m/${moduleId}/upload`)}>Upload</button>
            <button class="btn" onClick={() => go(`/m/${moduleId}/ilos`)}>Edit ILOs</button>
          </div>
          {isGenerating(moduleId) && <p class="small muted">Writing new questions in the background…</p>}
        </div>

        <LectureList moduleId={moduleId} />

        <MasteryOverview rows={rows} />

        <div class="card">
          <h2>Outcomes</h2>
          {rows.length === 0 && <p class="small muted">No confirmed ILOs yet.</p>}
          {rows.map((r) => <IloRow key={r.ilo.id} {...r} />)}
        </div>

        {flagged.length > 0 && (
          <div class="card">
            <h2>Held back ({flagged.length})</h2>
            <p class="small muted">These questions are paused because their source changed. Your past answers are kept; new questions are made from the new version.</p>
            <ul class="small">{flagged.slice(0, 20).map((i) => <li key={i.id}>{i.prompt.slice(0, 90)} — <i>{i.flagReason}</i></li>)}</ul>
          </div>
        )}

        <div class="card">
          <h2>Material ({active.length} files)</h2>
          <ul class="small">
            {active.map((f) => (
              <li key={f.id} class="file-row">
                <span>
                  <b>{f.name}</b> — {f.chunkCount} passages{f.ocrCount ? `, ${f.ocrCount} with OCR text` : ''}{f.version > 1 ? `, version ${f.version}` : ''}
                  {f.hasIlos && <span class="tag ok"> ILOs</span>}
                </span>
                <button class="btn sm danger" onClick={() => confirmRemove(f)} aria-label={`Remove ${f.name}`}>Remove</button>
              </li>
            ))}
          </ul>
          {events.length > 0 && (
            <details>
              <summary>Upload history</summary>
              <ul class="small">
                {events.sort((a, b) => b.at - a.at).map((e) => (
                  <li key={e.id}>{new Date(e.at).toLocaleDateString('en-GB')} · {e.fileName}: {e.summary}</li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {disputes.length > 0 && (
          <div class="card">
            <h2>Disputed marks ({disputes.length})</h2>
            <ul class="small">
              {disputes.map((d) => <li key={d.id}>{new Date(d.at).toLocaleDateString('en-GB')}: “{d.reason}” (was {Math.round(d.originalScore * 100)}%)</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function IloRow({ ilo, m, cov, items }: { ilo: Ilo; m: MasteryEstimate; cov?: { chunks: number; thin: boolean }; items: number }) {
  return (
    <div class="ilo-row">
      <div class="row spread">
        <span class="ilo-id">{ilo.id}{ilo.lecture ? ` · ${ilo.lecture}` : ''}</span>
        <span class={'tag ' + (m.label === 'Secure' ? 'ok' : m.label === 'Not yet' ? 'bad' : m.label === 'No evidence' ? '' : 'warn')}>{m.label}</span>
      </div>
      <div class="small" style={{ margin: '4px 0' }}>{ilo.text}</div>
      <Bar value={m.value} color={masteryColor(m.value)} />
      <details style={{ marginTop: '4px' }}>
        <summary class="small">Evidence ({m.evidence})</summary>
        <ul class="small">{m.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
        <div class="small muted">
          {cov?.chunks ?? 0} passages in your material · {items} questions available
          {cov?.thin && <span class="tag warn"> thin coverage</span>}
        </div>
      </details>
    </div>
  );
}

async function confirmRemove(f: SourceFile) {
  const synced = syncSettings.configured();
  const ok = confirm(
    `Remove “${f.name}”?\n\nIts ${f.chunkCount} passages and any questions built on them will stop being used. Your past answers are kept.` +
      (synced ? '\n\nIt will also be removed on your other devices, and its PDF deleted from your sync repository.' : '') +
      '\n\nYou can upload it again later.',
  );
  if (!ok) return;
  const r = await removeFile(f.id);
  toast(`🗑 Removed ${f.name}: ${r.questions} question${r.questions === 1 ? '' : 's'} retired`);
  if (synced) void syncNow('file removed');
}

const LABELS = ['Secure', 'Getting there', 'Shaky', 'Not yet', 'No evidence'] as const;

/** At-a-glance chart: how many ILOs sit at each mastery level, and which lectures need work. */
function MasteryOverview({ rows }: { rows: { ilo: Ilo; m: MasteryEstimate; cov?: { chunks: number; thin: boolean } }[] }) {
  if (!rows.length) return null;
  const counts = LABELS.map((l) => rows.filter((r) => r.m.label === l).length);
  const colours = ['#4ade80', 'var(--brand-3)', 'var(--brand)', 'var(--miss)', 'var(--line)'];
  const byLecture = new Map<string, number[]>();
  for (const r of rows) {
    const k = r.ilo.lecture || 'Other';
    byLecture.set(k, [...(byLecture.get(k) ?? []), r.m.value]);
  }
  const lectures = [...byLecture].map(([k, v]) => ({ k, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length }));
  lectures.sort((a, b) => a.k.localeCompare(b.k, undefined, { numeric: true }));
  return (
    <div class="card">
      <h2>📊 Overview</h2>
      <div class="stack-bar" role="img" aria-label={LABELS.map((l, i) => `${counts[i]} ${l}`).join(', ')}>
        {counts.map((c, i) => (c ? <span style={{ flex: c, background: colours[i] }} title={`${c} ${LABELS[i]}`} /> : null))}
      </div>
      <div class="legend small">
        {LABELS.map((l, i) => <span key={l}><i style={{ background: colours[i] }} />{l} <b>{counts[i]}</b></span>)}
      </div>
      {lectures.length > 1 && (
        <div class="lecture-bars">
          {lectures.map((x) => (
            <div key={x.k} class="lb">
              <span class="small" title={x.k}>{x.k.replace(/_/g, ' ')}</span>
              <Bar value={x.avg} thin color={masteryColor(x.avg)} />
              <span class="small muted">{Math.round(x.avg * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
