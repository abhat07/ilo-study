/** API key, spending cap and the one-time data notice. Used in Settings and inline on first upload. */
import { useState } from 'preact/hooks';
import { notifyChange } from '../db';
import { maskKey, settings } from '../settings';

export function DataNotice({ onAccept, onDecline }: { onAccept: () => void; onDecline?: () => void }) {
  return (
    <div class="notice">
      <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Before anything is sent</h2>
      <p class="small">
        Your files are read <b>on this device</b> (text extraction and OCR happen locally). To build and mark questions,
        the app sends <b>the text of the relevant passages</b> — one slide or transcript section at a time, never whole
        modules — plus your typed answers to <b>Anthropic</b>, the model provider, using your own API key.
      </p>
      <p class="small">
        Anthropic's API terms apply to that text. Do not upload anything you are not allowed to share with a third-party
        service. Nothing else leaves the device: your learning history stays in this browser.
      </p>
      <div class="row">
        <button class="btn primary" onClick={() => { settings.acceptNotice(); notifyChange(); onAccept(); }}>
          I understand — allow sending
        </button>
        {onDecline && <button class="btn" onClick={onDecline}>Not now</button>}
      </div>
    </div>
  );
}

export function KeyAndCap({ compact }: { compact?: boolean }) {
  const [key, setKey] = useState('');
  const [stored, setStored] = useState(settings.getApiKey());
  const [cap, setCap] = useState(settings.getCap()?.toString() ?? '');
  const [saved, setSaved] = useState('');
  const saveKey = () => {
    if (!key.trim().startsWith('sk-')) return setSaved('That does not look like an Anthropic API key (it should start with "sk-").');
    settings.setApiKey(key);
    setStored(settings.getApiKey());
    setKey('');
    setSaved('Key saved on this device.');
    notifyChange();
  };
  const removeKey = () => {
    settings.removeApiKey();
    setStored('');
    setSaved('Key removed from this device.');
    notifyChange();
  };
  const saveCap = () => {
    const v = Number(cap);
    if (!Number.isFinite(v) || v < 0) return setSaved('Enter a number of pounds, e.g. 5.');
    settings.setCap(v);
    setSaved(`Monthly limit set to £${v.toFixed(2)}.`);
    notifyChange();
  };
  return (
    <div class={compact ? '' : 'card'}>
      {!compact && <h2>AI access</h2>}
      <label class="field">Anthropic API key</label>
      {stored ? (
        <div class="row">
          <code>{maskKey(stored)}</code>
          <button class="btn sm danger" onClick={removeKey}>Remove key</button>
        </div>
      ) : (
        <div class="row" style={{ flexWrap: 'nowrap' }}>
          <input type="password" autocomplete="off" placeholder="sk-ant-…" value={key} onInput={(e) => setKey(e.currentTarget.value)} />
          <button class="btn primary" onClick={saveKey}>Save</button>
        </div>
      )}
      <p class="muted small">Stored only in this browser. It is never put in a backup file or sent anywhere except to Anthropic.</p>
      <label class="field">Monthly spending limit (£)</label>
      <div class="row" style={{ flexWrap: 'nowrap' }}>
        <input type="number" min="0" step="0.5" inputMode="decimal" placeholder="5" value={cap} onInput={(e) => setCap(e.currentTarget.value)} />
        <button class="btn primary" onClick={saveCap}>Set</button>
      </div>
      <p class="muted small">When the estimate reaches this, the app stops calling the API and keeps serving questions it already has.</p>
      {saved && <div class="okbox small">{saved}</div>}
    </div>
  );
}
