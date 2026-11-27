import { useState } from 'preact/hooks';
import { fmtMin } from '../learn/progress';
import { timeText } from './LectureList';
import { DemoCard } from './Demo';
import { byModule, db, ensureModules, notifyChange } from '../db';
import type { Module } from '../types';
import { isDue } from '../engine/scheduler';
import { masteryMap } from '../engine/session';
import { TopBar, go, useAi, useLive } from './common';
import { settings } from '../settings';
import { MasteryRing, greeting, themeFor, themeStyle } from './fun';
import { Doodles } from './Doodles';
import { Ring } from './Visual';
import { QUEST_XP, loadGame, type GameState } from '../engine/game';
import { lectureOverview, nextLecture, type LectureRow } from '../learn/overview';
import { loadReef, type ReefState } from '../reef/state';
import { ReefCard } from './Reef';
import { ExamCard } from './PlanPage';
import { WeekReportHome } from './WeekReport';

interface CardInfo {
  m: Module;
  files: number;
  ilos: number;
  due: number;
  fresh: number;
  mastery: number;
  secure: number;
  pendingIlos: boolean;
  lectures: LectureRow[];
}

async function load(): Promise<{ cards: CardInfo[]; stats: GameState; reef: ReefState }> {
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
      lectures: await lectureOverview(m.id),
    });
  }
  const stats = await loadGame();
  return { cards, stats, reef: await loadReef(stats) };
}

export function Home() {
  const data = useLive(load);
  const ai = useAi();
  const [adding, setAdding] = useState(false);
  const stats = data?.stats;
  return (
    <>
      <div class="has-doodles">
      <Doodles />
      <TopBar title="ILO Study" />
      <div class="wrap">
        {data && <ReefCard reef={data.reef} />}
        <div class="hero">
          <h2>{greeting()}{settings.getName() ? `, ${settings.getName()}` : ''} 👋</h2>
          <p>
            {!stats ? '…' : stats.studiedToday
              ? 'You have already studied today. Another short round keeps it fresh.'
              : stats.streak > 0
                ? `Keep your ${stats.streak}-day streak alive: one short session is enough.`
                : 'Pick a module and press Start. 10–15 minutes is all it takes.'}
          </p>
          {stats && (
            <div class="lvl">
              <div class="badge-lv" title="Level">{stats.level.level}</div>
              <div class="meta">
                <div class="top"><span>{stats.level.title}</span><span>{stats.xp - stats.level.floor} / {stats.level.next - stats.level.floor} XP</span></div>
                <div class="bar"><span style={{ width: `${stats.level.progress * 100}%` }} /></div>
              </div>
            </div>
          )}
          <div class="stats">
            <div class="stat"><b><span class="flame">🔥</span> {stats?.streak ?? 0}</b><span>day streak{stats && stats.streakInfo.freezes > 0 ? ` · ❄️${stats.streakInfo.freezes}` : ''}</span></div>
            <div class="stat"><b>{stats?.goal.done ?? 0}<small style={{ fontSize: '0.8rem', opacity: 0.8 }}>/{stats?.goal.target ?? 20}</small></b><span>daily goal</span></div>
            <div class="stat"><b>+{stats?.todayXp ?? 0}</b><span>XP today</span></div>
          </div>
        </div>

        <WeekReportHome />

        <ExamCard />

        {ai && !ai.ready && ai.reason !== 'offline' && (
          <div class="notice small">
            {ai.message} {ai.reason !== 'cap-reached' && <a href="#/settings">Open settings</a>}
          </div>
        )}
        {data?.cards.map((c) => <ModuleCard key={c.m.id} c={c} />)}
        {adding ? <AddModule onDone={() => setAdding(false)} /> : (
          <button class="btn ghost" onClick={() => setAdding(true)}>＋ Add a module</button>
        )}
        {stats && <Quests g={stats} />}
        {stats && <BadgeShelf g={stats} />}
        <DemoCard compact />
      </div>
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
    const nl = nextLecture(c.lectures);
    const doneN = c.lectures.filter((r) => r.st.done).length;
    const withIlos = c.lectures.filter((r) => r.lecture.iloIds.length).length;
    const recapDue = c.lectures.reduce((n, r) => n + r.st.due, 0);
    status = (
      <>
        <div class="pill-row">
          <span class="pill">📚 {doneN}/{withIlos} lectures complete</span>
          {recapDue > 0 && <span class="pill hot">⏰ {recapDue} recap due</span>}
          <span class="pill">🎯 {c.secure}/{c.ilos} ILOs secure</span>
        </div>
        {c.lectures.length > 0 && (
          <div class="mini-rings" aria-label="Lecture progress">
            {c.lectures.filter((r) => r.lecture.iloIds.length).map((r) => (
              <button key={r.lecture.id} class={'mr' + (nl?.lecture.id === r.lecture.id ? ' now' : '')} title={`${r.lecture.title}: ${Math.round(r.st.frac * 100)}% · ${timeText(r)}`} onClick={() => go(`/m/${c.m.id}/l/${r.lecture.id}`)}>
                <Ring value={r.st.frac} size={34} stroke={4} label={r.lecture.number ? String(r.lecture.number) : '•'} />
              </button>
            ))}
          </div>
        )}
      </>
    );
    action = nl
      ? { label: `▶  ${nl.st.started ? 'Continue' : 'Start'} L${nl.lecture.number} · ${nl.lecture.title} · ≈${fmtMin(nl.st.started ? nl.mins.left : nl.mins.total)}`, path: `/m/${c.m.id}/l/${nl.lecture.id}` }
      : { label: recapDue ? `🔁 Recap (${recapDue} due)` : '🔀 Mixed review', path: `/m/${c.m.id}/study` };
  }
  return (
    <div class="card module-card" style={themeStyle(theme)}>
      <div class="head">
        <div class="emoji" aria-hidden="true">{theme.emoji}</div>
        <div style={{ minWidth: '0px' }}>
          <div class="code">{c.m.id} · {c.m.short}</div>
          <h2>{c.m.name}</h2>
        </div>
        {ready && <MasteryRing value={c.mastery} theme={theme} />}
      </div>
      <div class="status">{status}</div>
      <button class={'btn primary big' + (ready && c.due > 0 ? ' glow' : '')} onClick={() => go(action.path)}>{action.label}</button>
      {c.files > 0 && (
        <div class="row" style={{ marginTop: '10px' }}>
          <button class="btn sm" onClick={() => go(`/m/${c.m.id}/upload`)}>📤 Upload</button>
          <button class="btn sm" onClick={() => go(`/m/${c.m.id}`)}>📚 Lectures & progress</button>
          {ready && <button class="btn sm" onClick={() => go(`/m/${c.m.id}/study`)}>🔀 Mixed review</button>}
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
    await d.put('modules', { id: code, short: sh, name: name.trim(), createdAt: Date.now(), updatedAt: Date.now(), iloStatus: 'none' });
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
      {err && <div class="err" style={{ marginTop: '8px' }}>{err}</div>}
      <div class="row" style={{ marginTop: '12px' }}>
        <button class="btn primary" onClick={save}>Add</button>
        <button class="btn" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function Quests({ g }: { g: GameState }) {
  const done = g.quests.filter((q) => q.done).length;
  return (
    <div class="card">
      <div class="row spread"><h2>⚔️ Daily quests</h2><span class="tag">{done}/3 · +{QUEST_XP} XP each</span></div>
      {g.quests.map((q) => (
        <div key={q.id} class={'quest' + (q.done ? ' done' : '')}>
          <span class="qe">{q.done ? '✅' : q.emoji}</span>
          <div class="qb">
            <div class="small" style={{ fontWeight: 700 }}>{q.label}</div>
            <div class="bar"><span style={{ width: `${(q.progress / q.target) * 100}%` }} /></div>
          </div>
          <span class="qx">{q.progress}/{q.target}</span>
        </div>
      ))}
      <p class="muted small" style={{ marginBottom: '0px' }}>New quests every day.</p>
    </div>
  );
}

function BadgeShelf({ g }: { g: GameState }) {
  const earned = g.badges.filter((b) => b.earned).length;
  return (
    <div class="card">
      <div class="row spread"><h2>🏅 Badges</h2><span class="tag">{earned}/{g.badges.length}</span></div>
      <div class="badges">
        {g.badges.map((b) => (
          <div key={b.id} class={'bdg ' + (b.earned ? 'earned' : 'locked')} title={b.desc}>
            <div class="be">{b.earned ? b.emoji : '🔒'}</div>
            <div class="bn">{b.name}</div>
          </div>
        ))}
      </div>
      <p class="muted small" style={{ marginBottom: '0px' }}>Hover or long-press a badge to see how to earn it.</p>
    </div>
  );
}
