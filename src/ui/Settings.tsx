import { useState } from 'preact/hooks';
import { db, notifyChange } from '../db';
import { monthKey } from '../ai/client';
import { MODELS, USD_TO_GBP } from '../ai/pricing';
import { exportBackup, importBackup } from '../backup';
import { settings } from '../settings';
import { TopBar, useAi, useLive } from './common';
import { DataNotice, KeyAndCap } from './Setup';

function NameCard() {
  const [name, setName] = useState(settings.getName());
  const [saved, setSaved] = useState(false);
  return (
    <div class="card">
      <h2>👋 Your name</h2>
      <p class="muted small">Optional. Used in the greeting on the home screen and kept only on this device.</p>
      <div class="row" style={{ flexWrap: 'nowrap' }}>
        <input type="text" placeholder="First name" value={name} onInput={(e) => { setName(e.currentTarget.value); setSaved(false); }} />
        <button class="btn primary" onClick={() => { settings.setName(name); setSaved(true); notifyChange(); }}>Save</button>
      </div>
      {saved && <div class="okbox small" style={{ marginTop: 8 }}>Saved.</div>}
    </div>
  );
}

export function Settings() {
  const ai = useAi();
  const spend = useLive(async () => (await (await db()).getAllFromIndex('spend', 'byMonth', monthKey())).sort((a, b) => b.at - a.at));
  const [msg, setMsg] = useState('');
  const [showNotice, setShowNotice] = useState(false);

  const doExport = async () => {
    const blob = await exportBackup();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ilo-study-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setMsg('Backup downloaded. It contains everything except your API key.');
  };
  const doImport = async (f: File | undefined) => {
    if (!f) return;
    if (!confirm('Restoring replaces ALL data on this device with the backup. Continue?')) return;
    try {
      const r = await importBackup(f);
      setMsg(`Restored: ${r.counts.items ?? 0} questions, ${r.counts.attempts ?? 0} answers, ${r.counts.files ?? 0} files.`);
    } catch (e) {
      setMsg('Restore failed: ' + (e as Error).message);
    }
  };

  const byPurpose = new Map<string, number>();
  for (const s of spend ?? []) byPurpose.set(s.purpose.split(' ')[0], (byPurpose.get(s.purpose.split(' ')[0]) ?? 0) + s.costGBP);

  return (
    <>
      <TopBar title="Settings" back="/" />
      <div class="wrap">
        <NameCard />
        <KeyAndCap />

        <div class="card">
          <h2>Spend this month</h2>
          {ai && (
            <p class="big-num">
              £{ai.spent.toFixed(2)} <span class="muted small">of £{(ai.cap ?? 0).toFixed(2)}</span>
            </p>
          )}
          <p class="muted small">
            Estimated from token counts at Anthropic list prices, converted at {USD_TO_GBP} GBP per USD (rounded up on
            purpose). Your Anthropic Console shows the exact bill.
          </p>
          {byPurpose.size > 0 && (
            <p class="small">{[...byPurpose].map(([p, v]) => `${p}: £${v.toFixed(3)}`).join(' · ')}</p>
          )}
          <details>
            <summary>Recent calls ({spend?.length ?? 0})</summary>
            <table class="spend">
              <thead><tr><th>When</th><th>Purpose</th><th>Model</th><th>Tokens in/out</th><th>£</th></tr></thead>
              <tbody>
                {spend?.slice(0, 60).map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{s.purpose}</td>
                    <td>{s.model.replace('claude-', '')}</td>
                    <td>{s.inputTokens}/{s.outputTokens}</td>
                    <td>{s.costGBP.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p class="muted small">
            Models: {MODELS.BULK} for reading ILOs, matching passages and writing questions; {MODELS.PRECISE} for marking
            written answers and deeper explanations.
          </p>
        </div>

        <div class="card">
          <h2>Data notice</h2>
          <p class="small">
            {settings.noticeAccepted()
              ? `Accepted on ${new Date(localStorage.getItem('ilo.dataNoticeAcceptedAt')!).toLocaleDateString('en-GB')}.`
              : 'Not accepted yet — nothing has been sent to the model provider.'}
          </p>
          {showNotice ? <DataNotice onAccept={() => setShowNotice(false)} onDecline={() => setShowNotice(false)} /> : (
            <button class="btn sm" onClick={() => setShowNotice(true)}>Read the notice</button>
          )}
        </div>

        <div class="card">
          <h2>Backup</h2>
          <p class="muted small">All learning data lives only in this browser. Export a backup regularly, and to move to another device.</p>
          <div class="row">
            <button class="btn" onClick={doExport}>Export backup (.zip)</button>
            <label class="btn">
              Restore from backup
              <input type="file" accept=".zip" hidden onChange={(e) => doImport(e.currentTarget.files?.[0])} />
            </label>
          </div>
          {msg && <div class="okbox small" style={{ marginTop: 8 }}>{msg}</div>}
        </div>

        {import.meta.env.DEV && (
          <div class="card">
            <h2>Developer</h2>
            <label class="row small">
              <input
                type="checkbox"
                checked={localStorage.getItem('ilo.mock') === '1'}
                onChange={(e) => {
                  localStorage.setItem('ilo.mock', e.currentTarget.checked ? '1' : '0');
                  location.reload();
                }}
              />
              Use the fake model (no API calls) — dev builds only
            </label>
          </div>
        )}
      </div>
    </>
  );
}
