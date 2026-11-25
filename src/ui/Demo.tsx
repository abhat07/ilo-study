import { useEffect, useState } from 'preact/hooks';
import { deleteDemoDb } from '../db';
import { isDemo, setDemo } from '../mode';
import { seedDemoIfEmpty } from '../demo/seed';
import { Spinner } from './common';

/** Strip shown on every screen while in demo mode. */
export function DemoBanner() {
  if (!isDemo()) return null;
  const reset = async () => {
    if (!confirm('Start the demo again from scratch? Only the demo sandbox is cleared; your real data is not touched.')) return;
    await deleteDemoDb();
    setDemo(true);
  };
  return (
    <div class="demo-banner" role="status">
      <span>🧪 <b>Demo mode</b>: sample lectures, fake AI (free), kept apart from your real data. Nothing syncs.</span>
      <span class="demo-actions">
        <button class="btn sm ghost" onClick={reset}>Reset</button>
        <button class="btn sm" onClick={() => setDemo(false)}>Exit demo</button>
      </span>
    </div>
  );
}

/** Builds the sample module the first time demo mode opens; children render once it's ready. */
export function DemoGate({ children }: { children: preact.ComponentChildren }) {
  const [ready, setReady] = useState(!isDemo());
  const [msg, setMsg] = useState('Getting the demo ready');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!isDemo()) return;
    seedDemoIfEmpty((m) => setMsg(m.replace(/^Demo_/, '')))
      .then(() => setReady(true))
      .catch((e) => setErr(String((e as Error).message ?? e)));
  }, []);
  if (ready) return <>{children}</>;
  return (
    <div class="wrap demo-seed">
      <div class="card">
        <h2>🧪 Building your demo module</h2>
        <p class="small">
          Making three sample lectures (a PDF with its transcript, and two PowerPoints with diagrams) and uploading them
          through the normal pipeline: reading, ILOs, slide matching and lecture grouping. This takes a few seconds.
        </p>
        {err ? <div class="err small">{err}</div> : <><Spinner /><p class="muted small">{msg}…</p></>}
        {err && <button class="btn sm" onClick={() => setDemo(false)}>Exit demo</button>}
      </div>
    </div>
  );
}

/** Settings card / home link to enter demo mode. */
export function DemoCard({ compact = false }: { compact?: boolean }) {
  if (isDemo()) return null;
  if (compact) {
    return (
      <button class="demo-link" onClick={() => setDemo(true)}>
        🧪 <b>Try the demo</b>: three sample lectures with every feature, a free fake AI, and none of your real data touched.
      </button>
    );
  }
  return (
    <div class="card">
      <h2>🧪 Demo mode</h2>
      <p class="small">
        Try every feature on three sample lectures (PCR, restriction cloning, gel electrophoresis): lessons with diagrams
        and slide pictures, every question type, forced repeats, link questions, the progress ring, recap, help chat, marking
        and disputes.
      </p>
      <p class="muted small">
        It runs in a separate sandbox on this device with a fake AI: no API key, no cost. Your real modules, progress and XP
        are not touched and nothing syncs. Exit any time from the banner at the top.
      </p>
      <button class="btn primary" onClick={() => setDemo(true)}>Start the demo</button>
    </div>
  );
}
