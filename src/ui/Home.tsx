import { useState } from 'preact/hooks';
import { byModule, db, ensureModules, notifyChange } from '../db';
import type { Module } from '../types';
import { isDue } from '../engine/scheduler';
import { masteryMap } from '../engine/session';
import { TopBar, go, useAi, useLive } from './common';
import { settings } from '../settings';
import { MasteryRing, allSessions, computeStats, greeting, themeFor, themeStyle, type StudyStats } from './fun';

interface CardInfo {
  m: Module;
  files: number;
  ilos: number;
  due: number;
  fresh: number;
  mastery: number;
  secure: number;
  pendingIlos: boolean;
}

async function load(): Promise<{ cards: CardInfo[]; stats: StudyStats }> {
  const mods = await ensureModules();
  const cards: CardInfo[] = [];
  for (const m of mods.sort((a, b) => a.createdAt - b.createdAt)) {
    const [files, ilos, items] = await Promise.all([byModule('files', m.id), byModule('ilos', m.id), byModule('items', m.id)]);
    const active = items.filter((i) => i.status === 'active');
    const vals = Object.values(await masteryMap(m.id));
    cards.push({
      m,
      files: files.filter((f) => f.status === 'active').length,
      ilos: ilos.length,
      due: active.filter((i) => isDue(i.card)).length,
      fresh: active.filter((i) => i.seenCount === 0).length,
      mastery: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
      secure: vals.filter((v) => v >= 0.8).length,
      pendingIlos: m.iloStatus !== 'confirmed',
    });
  }
  const stats = computeStats(await allSessions(mods.map((m) => m.id)));
  return { cards, stats };
}

export function Home() {
  const data = useLive(load);
  const ai = useAi();
  const [adding, setAdding] = useState(false);
  const stats = data?.stats;
  return (
    <>
      <TopBar title="ILO Study" />
      <div class="wrap">
        <div class="hero">
          <h2>{greeting()}{settings.getName() ? `, ${settings.getName()}` : ''} 👋</h2>
          <p>
            {!stats ? '…' : stats.studiedToday
              ? 'You have already studied today. Another short round keeps it fresh.'
              : stats.streak > 0
                ? `Keep your ${stats.streak}-day streak alive: one short session is enough.`
                : 'Pick a module and press Start. 10–15 minutes is all it takes.'}
          </p>
          <div class="stats">
            <div class="stat"><b><span class="flame">🔥</span> {stats?.streak ?? 0}</b><span>day streak</span></div>
            <div class="stat"><b>{stats?.answeredToday ?? 0}</b><span>answered today</span></div>
            <div class="stat"><b>{stats?.answeredWeek ?? 0}</b><span>this week</span></div>
          </div>
        </div>

        {ai && !ai.ready && ai.reason !== 'offline' && (
          <div class="notice small">
            {ai.message} {ai.reason !== 'cap-reached' && <a href="#/settings">Open settings</a>}
          </div>
        )}
        {data?.cards.map((c) => <ModuleCard key={c.m.id} c={c} />)}
        {adding ? <AddModule onDone={() => setAdding(false)} /> : (
          <button class="btn ghost" onClick={() => setAdding(true)}>＋ Add a module</button>
        )}
      </div>
    </>
  );
}

function ModuleCard({ c }: { c: CardInfo }) {
  const theme = themeFor(c.m);
  const ready = !c.pendingIlos && c.ilos > 0;
  let status: preact.ComponentChildren;
  let action: { label: string; path: string };
  if (c.files === 0) {
    status = <span class="muted">No material yet. Upload slides, transcripts and the ILO list.</span>;
    action = { label: '📤 Upload material', path: `/m/${c.m.id}/upload` };
  } else if (!ready) {
    status = <span class="muted">Check and confirm the ILOs so questions can be made.</span>;
    action = { label: '✅ Confirm ILOs', path: `/m/${c.m.id}/ilos` };
  } else {
    status = (
      <div class="pill-row">
        {c.due > 0 && <span class="pill hot">⏰ {c.due} due</span>}
        {c.fresh > 0 && <span class="pill">✨ {c.fresh} new ready</span>}
        <span class="pill">🎯 {c.secure}/{c.ilos} ILOs secure</span>
      </div>
    );
    action = { label: '▶  Start', path: `/m/${c.m.id}/study` };
  }
  return (
    <div class="card module-card" style={themeStyle(theme)}>
      <div class="head">
        <div class="emoji" aria-hidden="true">{theme.emoji}</div>
        <div style={{ minWidth: 0 }}>
          <div class="code">{c.m.id} · {c.m.short}</div>
          <h2>{c.m.name}</h2>
        </div>
        {ready && <MasteryRing value={c.mastery} theme={theme} />}
      </div>
      <div class="status">{status}</div>
      <button class={'btn primary big' + (ready && c.due > 0 ? ' glow' : '')} onClick={() => go(action.path)}>{action.label}</button>
      {c.files > 0 && (
        <div class="row" style={{ marginTop: 10 }}>
          <button class="btn sm" onClick={() => go(`/m/${c.m.id}/upload`)}>📤 Upload</button>
          <button class="btn sm" onClick={() => go(`/m/${c.m.id}`)}>📊 What I know</button>
        </div>
      )}
    </div>
  );
}

function AddModule({ onDone }: { onDone: () => void }) {
  const [id, setId] = useState('');
  const [short, setShort] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    const code = id.trim().toUpperCase();
    const sh = short.trim().toUpperCase();
    if (!code || !sh || !name.trim()) return setErr('Fill in all three fields.');
    if (!/^[A-Z0-9]{2,8}$/.test(sh)) return setErr('Short name: 2–8 letters or digits, e.g. BIP.');
    const d = await db();
    if (await d.get('modules', code)) return setErr('That module code already exists.');
    await d.put('modules', { id: code, short: sh, name: name.trim(), createdAt: Date.now(), iloStatus: 'none' });
    notifyChange();
    onDone();
  };
  return (
    <div class="card">
      <h2>Add a module</h2>
      <label class="field">Module code</label>
      <input type="text" placeholder="LIFE50025" value={id} onInput={(e) => setId(e.currentTarget.value)} />
      <label class="field">Short name (used in ILO ids)</label>
      <input type="text" placeholder="BIP" value={short} onInput={(e) => setShort(e.currentTarget.value)} />
      <label class="field">Full name</label>
      <input type="text" placeholder="Bioinformatics & Programming" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      {err && <div class="err" style={{ marginTop: 8 }}>{err}</div>}
      <div class="row" style={{ marginTop: 12 }}>
        <button class="btn primary" onClick={save}>Add</button>
        <button class="btn" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
