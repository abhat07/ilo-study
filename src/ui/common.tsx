import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { onDataChange } from '../db';
import { aiStatus, type AiStatus } from '../ai/client';
import { onSyncStatus, syncStatus, type SyncStatus } from '../sync/sync';
import { locatorLabel } from '../ingest/text';
import type { Locator } from '../types';

export function go(path: string): void {
  location.hash = '#' + path;
}

/** Runs an async loader on mount, when deps change, and whenever stored data changes. */
export function useLive<T>(load: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [v, setV] = useState<T>();
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const run = () => loadRef.current().then((x) => alive && setV(() => x));
    run();
    const off = onDataChange(() => {
      clearTimeout(timer);
      timer = window.setTimeout(run, 150);
    });
    return () => {
      alive = false;
      off();
      clearTimeout(timer);
    };
  }, deps);
  return v;
}

export function useAi(): AiStatus | undefined {
  return useLive(aiStatus);
}

export function useSync(): SyncStatus {
  const [s, setS] = useState<SyncStatus>(syncStatus());
  useEffect(() => onSyncStatus(setS), []);
  return s;
}

export function TopBar(props: { title: string; back?: string; children?: ComponentChildren }) {
  const ai = useAi();
  const sync = useSync();
  return (
    <div class="topbar">
      {props.back !== undefined && (
        <button class="back" aria-label="Back" onClick={() => go(props.back!)}>
          ‹
        </button>
      )}
      <h1>{props.back === undefined && <span class="logo" aria-hidden="true">🧠</span>}{props.title}</h1>
      {props.children}
      {sync.state !== 'off' && (
        <button
          class={'chip' + (sync.state === 'error' ? ' warn' : '')}
          onClick={() => go('/settings')}
          title={sync.state === 'error' ? sync.error : sync.state === 'syncing' ? 'Syncing…' : `Synced${sync.last ? ' ' + new Date(sync.last).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}`}
          aria-label="Sync status"
        >
          {sync.state === 'syncing' ? <span class="spin-i">⟳</span> : sync.state === 'error' ? '⚠' : '☁✓'}
        </button>
      )}
      {ai && (
        <button
          class={'chip' + (ai.cap !== null && ai.spent >= ai.cap * 0.9 ? ' warn' : '')}
          onClick={() => go('/settings')}
          title="Spend this month (estimated) — open settings"
        >
          {ai.cap === null ? 'Set up AI' : `£${ai.spent.toFixed(2)} / £${ai.cap.toFixed(2)}`}
        </button>
      )}
      <button class="chip" aria-label="Settings" onClick={() => go('/settings')}>
        ⚙
      </button>
    </div>
  );
}

export function Bar(props: { value: number; thin?: boolean; color?: string }) {
  return (
    <div class={'bar' + (props.thin ? ' thin' : '')} role="progressbar" aria-valuenow={Math.round(props.value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(1, props.value)) * 100}%`, background: props.color }} />
    </div>
  );
}

export function masteryColor(v: number): string {
  return v < 0.3 ? '#c0392b' : v < 0.6 ? '#d68910' : v < 0.8 ? '#2e86c1' : '#1e7f4f';
}

export function where(fileName: string, loc: Locator): string {
  return `${fileName.replace(/\.[^.]+$/, '')} · ${locatorLabel(loc)}`;
}

export function Spinner() {
  return <div class="spinner" aria-label="Loading" />;
}
