import { useEffect, useRef, useState } from 'preact/hooks';
import { byModule, db } from '../db';
import type { Attempt, Ilo, Item, MarkDetail } from '../types';
import { aiStatus } from '../ai/client';
import { topUpPool } from '../engine/generate';
import { SESSION_TARGET_MS, endSession, nextItem, startSession, type SessionCtx, type SessionSummary } from '../engine/session';
import { Bar, Spinner, TopBar, go, where } from './common';
import { syncNow } from '../sync/sync';
import { Doodles, FootArt } from './Doodles';
import { confetti, toast } from './fun';
import { achievements, loadGame, type GameState } from '../engine/game';
import { QuestionCard } from './QuestionCard';

type Phase = 'loading' | 'question' | 'empty' | 'summary';

export function Session({ moduleId, lectureId }: { moduleId: string; lectureId?: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadingMsg, setLoadingMsg] = useState('');
  const ctxRef = useRef<SessionCtx | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [ilos, setIlos] = useState<Map<string, Ilo>>(new Map());
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [emptyMsg, setEmptyMsg] = useState('');
  const [now, setNow] = useState(Date.now());
  const [combo, setCombo] = useState(0);
  const [correctN, setCorrectN] = useState(0);
  const gameRef = useRef<GameState | null>(null);
  const startXp = useRef(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [title, setTitle] = useState(lectureId ? 'Recap' : 'Session');
  const celebrate = async () => {
    const before = gameRef.current;
    const after = await loadGame();
    gameRef.current = after;
    setSessionXp(after.xp - startXp.current);
    if (!before) return;
    const msgs = achievements(before, after);
    msgs.forEach((m, i) => setTimeout(() => toast(m), i * 700));
    if (msgs.length) confetti(window.innerWidth / 2, 120, 90);
  };

  useEffect(() => {
    if (phase === 'summary') document.body.dataset.stage = 'reward';
  }, [phase]);
  useEffect(() => () => { document.body.dataset.stage = 'home'; }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const mod = await (await db()).get('modules', moduleId);
      if (!mod || mod.iloStatus !== 'confirmed') return go(`/m/${moduleId}/ilos`);
      setIlos(new Map((await byModule('ilos', moduleId)).map((i) => [i.id, i])));
      if (lectureId) {
        const lec = await (await db()).get('lectures', lectureId);
        if (lec) setTitle(`Recap · ${lec.number ? 'L' + lec.number + ' ' : ''}${lec.title}`);
      }
      gameRef.current = await loadGame();
      startXp.current = gameRef.current.xp;
      // recap: only this lecture's questions you have already met
      // recap: only this lecture's questions you have already met; mixed review: skip lesson questions you haven't reached yet
      const ctx = await startSession(moduleId, lectureId ? (i) => i.lectureId === lectureId && i.seenCount > 0 : (i) => !(i.sectionId && i.seenCount === 0));
      ctxRef.current = ctx;
      let it = await nextItem(ctx);
      if (!it && !lectureId) {
        const st = await aiStatus();
        if (st.ready) {
          setLoadingMsg('Writing your first questions from the slides…');
          await topUpPool(moduleId, 2);
          it = await nextItem(ctx);
        }
        if (!it) {
          setEmptyMsg(
            st.ready
              ? 'No questions could be made yet. Check that your ILOs are matched to uploaded passages (see "What I know").'
              : `${st.message} There are no questions on this device yet.`,
          );
          return setPhase('empty');
        }
      }
      if (!it) {
        setEmptyMsg('Nothing to recap in this lecture yet: finish its lesson first.');
        return setPhase('empty');
      }
      setItem(it);
      setPhase('question');
      if (!lectureId) topUpPool(moduleId); // keep the pool stocked in the background
    })();
  }, [moduleId, lectureId]);

  const onAnswered = async (_a: Attempt, m: MarkDetail) => {
    if (m.score >= 0.7) setCorrectN((n) => n + 1);
    if (m.score >= 0.99 && _a.response) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      confetti(window.innerWidth / 2, 180, nextCombo >= 3 ? 70 : 34);
    } else setCombo(0);
    celebrate();
    if (!lectureId) {
      const unseen = (await byModule('items', moduleId)).filter((i) => i.status === 'active' && i.seenCount === 0).length;
      if (unseen < 6) topUpPool(moduleId);
    }
  };

  const finish = async () => {
    const ctx = ctxRef.current!;
    setSummary(await endSession(ctx));
    void syncNow('session finished');
    await celebrate();
    setPhase('summary');
  };

  const next = async () => {
    const ctx = ctxRef.current!;
    setPhase('loading');
    setLoadingMsg('');
    const it = await nextItem(ctx);
    if (it) {
      setItem(it);
      return setPhase('question');
    }
    await finish();
  };

  const stop = async () => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.record.attemptIds.length === 0) return go(lectureId ? `/m/${moduleId}` : '/');
    await finish();
  };

  const elapsed = ctxRef.current ? now - ctxRef.current.record.startedAt : 0;
  const answered = ctxRef.current?.record.attemptIds.length ?? 0;

  if (phase === 'summary' && summary) return <Summary summary={summary} moduleId={moduleId} xp={sessionXp} game={gameRef.current} />;

  return (
    <div class="has-doodles">
      <Doodles set="session" rotate={answered} />
      <TopBar title={title} back={lectureId ? `/m/${moduleId}` : '/'} />
      {item && phase === 'question' && (
        <SessionRail elapsed={elapsed} answered={answered} correct={correctN} xp={sessionXp} combo={combo} item={item} ilos={ilos} />
      )}
      <div class="wrap">
        <div class="session-top small muted">
          <Bar value={elapsed / SESSION_TARGET_MS} thin />
          {combo >= 2 && <span class="combo" key={combo}>🔥 {combo} in a row</span>}
          {sessionXp > 0 && <span class="tag">⚡ {sessionXp} XP</span>}
          <span>{answered} done</span>
          <button class="btn sm" onClick={stop}>End</button>
        </div>

        {phase === 'loading' && <div class="center muted"><Spinner />{loadingMsg}</div>}
        {phase === 'empty' && (
          <div class="card">
            <p>{emptyMsg}</p>
            <button class="btn" onClick={() => go(`/m/${moduleId}`)}>Back to the module</button>
          </div>
        )}

        {item && phase === 'question' && ctxRef.current && (
          <QuestionCard key={item.id} ctx={ctxRef.current} item={item} ilos={ilos} onAnswered={onAnswered} onNext={next} onXp={celebrate} />
        )}
        {item && phase === 'question' && <FootArt rotate={answered} />}
      </div>
    </div>
  );
}

function Summary({ summary, moduleId, xp, game }: { summary: SessionSummary; moduleId: string; xp: number; game: GameState | null }) {
  const pct = summary.answered ? Math.round((summary.correct / summary.answered) * 100) : 0;
  useEffect(() => {
    if (summary.answered > 0) {
      confetti(window.innerWidth / 2, 140, 80);
      setTimeout(() => confetti(window.innerWidth * 0.25, 220, 40), 250);
      setTimeout(() => confetti(window.innerWidth * 0.75, 220, 40), 450);
    }
  }, []);
  const headline = pct >= 80 ? 'Outstanding session!' : pct >= 50 ? 'Solid work!' : summary.answered ? "Every mistake here is one you won't make in the exam." : 'Session ended';
  return (
    <div class="has-doodles">
      <Doodles set="home" />
      <TopBar title="Session complete" back="/" />
      <div class="wrap">
        <div class="card">
          <div class="trophy" aria-hidden="true">{pct >= 80 ? '🏆' : pct >= 50 ? '🌟' : '💪'}</div>
          <h2 class="center">{headline}</h2>
          {game && (
            <div class="center" style={{ marginTop: '6px' }}>
              <span class="xp-chip" style={{ marginLeft: '0px' }}>+{xp} XP</span>
              <div class="small muted" style={{ marginTop: '6px' }}>Level {game.level.level} · {game.level.title} · {game.level.next - game.xp} XP to next level · 🔥 {game.streak}-day streak</div>
            </div>
          )}
          <div class="grid3" style={{ margin: '14px 0' }}>
            <div class="stat-tile"><div class="big-num">{summary.answered}</div><div class="small muted">answered</div></div>
            <div class="stat-tile"><div class="big-num">{pct}%</div><div class="small muted">correct</div></div>
            <div class="stat-tile"><div class="big-num">{summary.minutes}</div><div class="small muted">minutes</div></div>
          </div>
          {summary.overconfident > 0 && (
            <p class="small">You were confident but wrong {summary.overconfident} time{summary.overconfident === 1 ? '' : 's'}. Those questions come back first next time.</p>
          )}
          {summary.underconfident > 0 && (
            <p class="small">You knew {summary.underconfident} answer{summary.underconfident === 1 ? '' : 's'} you weren't sure about.</p>
          )}
          <h3>📈 What changed</h3>
          {summary.changes.length === 0 && <p class="small muted">No change in mastery estimates this time (repeats of seen questions count only a little).</p>}
          {summary.changes.slice(0, 8).map((c) => (
            <div key={c.ilo.id} class="ilo-row">
              <div class="small"><span class="ilo-id">{c.ilo.id}</span> {c.ilo.text}</div>
              <div class="row small">
                <div style={{ flex: 1 }}><Bar value={c.after} /></div>
                <span>{c.before === 0 ? `first estimate: ${Math.round(c.after * 100)}` : `${Math.round(c.before * 100)} → ${Math.round(c.after * 100)}`}</span>
              </div>
            </div>
          ))}
          {summary.nextDue && (
            <p class="small muted" style={{ marginTop: '12px' }}>
              Next review due {summary.nextDue.getTime() <= Date.now() + 3600_000 ? 'within the hour' : summary.nextDue.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}
          <button class="btn primary big" onClick={() => go('/')}>Finish</button>
          <button class="btn ghost" style={{ marginTop: '6px', width: '100%' }} onClick={() => go(`/m/${moduleId}`)}>See what I know</button>
        </div>
      </div>
    </div>
  );
}

const TYPE_TIP: Record<Item['type'], string> = {
  mcq: 'Try to answer before reading the options, then pick the one that matches.',
  cloze: 'One key term from the lecture. Spelling slips are accepted.',
  short: 'Say why, not just what: the marker looks for each rubric point.',
  order: 'Picture the process running, then drag the steps into place.',
};

/** Wide screens: a quiet side panel with session progress and what is being tested. */
function SessionRail(props: { elapsed: number; answered: number; correct: number; xp: number; combo: number; item: Item; ilos: Map<string, Ilo> }) {
  const pct = Math.min(1, props.elapsed / SESSION_TARGET_MS);
  const r = 30, c = 2 * Math.PI * r;
  const mins = Math.max(0, Math.ceil((SESSION_TARGET_MS - props.elapsed) / 60_000));
  const ilo = props.ilos.get(props.item.iloIds[0]);
  return (
    <aside class="rail" aria-label="Session progress">
      <div class="rail-card">
        <div class="rail-ring">
          <svg width={74} height={74} viewBox="0 0 74 74">
            <circle cx={37} cy={37} r={r} class="track" />
            <circle cx={37} cy={37} r={r} class="val" stroke-dasharray={c} stroke-dashoffset={c * (1 - pct)} />
          </svg>
          <div><b>{mins}</b><span>min left</span></div>
        </div>
        <div class="rail-stats">
          <div><b>{props.answered}</b><span>answered</span></div>
          <div><b>{props.answered ? Math.round((props.correct / props.answered) * 100) : 0}%</b><span>correct</span></div>
          <div><b>{props.xp}</b><span>XP</span></div>
          <div><b>{props.combo}</b><span>streak</span></div>
        </div>
      </div>
      <div class="rail-card">
        <div class="rail-h">Now testing</div>
        <div class="small"><b class="ilo-id">{props.item.iloIds[0]}</b> {ilo?.text}</div>
        <div class="small muted" style={{ marginTop: '6px' }}>From {where(props.item.source.fileName, props.item.source.locator)}</div>
        <div class="small muted">Level {props.item.level} · {['', 'recall', 'explain', 'apply'][props.item.level]}{props.item.seenCount ? ' · review' : ' · new'}</div>
      </div>
      <div class="rail-card">
        <div class="rail-h">Tip</div>
        <div class="small">{TYPE_TIP[props.item.type]}</div>
      </div>
    </aside>
  );
}
