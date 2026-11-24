import { useEffect, useRef, useState } from 'preact/hooks';
import { byModule, db } from '../db';
import type { Attempt, Confidence, Ilo, Item, MarkDetail } from '../types';
import { AiUnavailableError, aiStatus } from '../ai/client';
import { topUpPool } from '../engine/generate';
import { explainMore, markShortAI, selfMark } from '../engine/marking';
import { CONF_LABEL } from '../engine/mastery';
import {
  SESSION_TARGET_MS, disputeMark, endSession, markCloze, markMcq, markOrder, nextItem, recordAttempt,
  recordElaboration, startSession, type SessionCtx, type SessionSummary,
} from '../engine/session';
import { Bar, Spinner, TopBar, go } from './common';
import { ClozeInput, McqInput, OrderInput, ShortInput, initialOrder, seededOrder } from './answers';
import { SourceView } from './SourceView';
import { confetti, praise, toast } from './fun';
import { achievements, loadGame, xpForAttempt, type GameState } from '../engine/game';

type Phase = 'loading' | 'answer' | 'marking' | 'selfmark' | 'feedback' | 'empty' | 'summary';

const TYPE_LABEL: Record<Item['type'], string> = {
  mcq: 'Choose one',
  cloze: 'Fill the gap',
  short: 'Explain',
  order: 'Put in order',
};

export function Session({ moduleId }: { moduleId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadingMsg, setLoadingMsg] = useState('');
  const ctxRef = useRef<SessionCtx | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [ilos, setIlos] = useState<Map<string, Ilo>>(new Map());
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [order, setOrder] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<Confidence>(2);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [mark, setMark] = useState<MarkDetail | null>(null);
  const [markNote, setMarkNote] = useState('');
  const [ticks, setTicks] = useState<boolean[]>([]);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [emptyMsg, setEmptyMsg] = useState('');
  const [now, setNow] = useState(Date.now());
  const [combo, setCombo] = useState(0);
  const gameRef = useRef<GameState | null>(null);
  const startXp = useRef(0);
  const [sessionXp, setSessionXp] = useState(0);
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
  const shownAt = useRef(Date.now());

  // Colour by learning stage (see styles.css and README): calm while retrieving, outcome-coloured feedback, gold reward.
  useEffect(() => {
    const stage =
      phase === 'summary' ? 'reward'
      : phase === 'feedback' && mark ? (mark.score >= 0.99 ? 'correct' : mark.score >= 0.5 ? 'partial' : 'miss')
      : 'retrieve';
    document.body.dataset.stage = stage;
  }, [phase, mark]);
  useEffect(() => () => { document.body.dataset.stage = 'home'; }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const show = (it: Item) => {
    setItem(it);
    setChoice(null);
    setText('');
    setOrder(it.type === 'order' ? initialOrder(it) : []);
    setAttempt(null);
    setMark(null);
    setMarkNote('');
    setTicks(it.rubric.map(() => false));
    shownAt.current = Date.now();
    setPhase('answer');
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    (async () => {
      const mod = await (await db()).get('modules', moduleId);
      if (!mod || mod.iloStatus !== 'confirmed') return go(`/m/${moduleId}/ilos`);
      setIlos(new Map((await byModule('ilos', moduleId)).map((i) => [i.id, i])));
      gameRef.current = await loadGame();
      startXp.current = gameRef.current.xp;
      const ctx = await startSession(moduleId);
      ctxRef.current = ctx;
      let it = await nextItem(ctx);
      if (!it) {
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
      show(it);
      topUpPool(moduleId); // keep the pool stocked in the background
    })();
  }, [moduleId]);

  const responseString = (): string | null => {
    if (!item) return null;
    if (item.type === 'mcq') return choice === null ? null : String(choice);
    if (item.type === 'order') return JSON.stringify(order);
    return text.trim() ? text.trim() : null;
  };

  const finishAttempt = async (resp: string, conf: Confidence, m: MarkDetail) => {
    const ctx = ctxRef.current!;
    const a = await recordAttempt(ctx, item!, resp, conf, m, Date.now() - shownAt.current);
    setAttempt(a);
    setMark(m);
    setPhase('feedback');
    if (m.score >= 0.99 && resp) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      confetti(window.innerWidth / 2, 180, nextCombo >= 3 ? 70 : 34);
    } else setCombo(0);
    celebrate();
    const unseen = (await byModule('items', moduleId)).filter((i) => i.status === 'active' && i.seenCount === 0).length;
    if (unseen < 6) topUpPool(moduleId);
  };

  const submit = async (conf: Confidence, skipped = false) => {
    if (!item) return;
    setConfidence(conf);
    const resp = skipped ? '' : responseString();
    if (resp === null) return;
    if (skipped) return finishAttempt('', 1, { by: 'auto', score: 0, reasoning: "You chose \"I don't know\" — trying first still helps you learn the answer." });
    if (item.type === 'mcq') return finishAttempt(item.options[Number(resp)], conf, markMcq(item, Number(resp)));
    if (item.type === 'cloze') return finishAttempt(resp, conf, markCloze(item, resp));
    if (item.type === 'order') return finishAttempt(resp, conf, markOrder(item, order));
    // short answer: AI marking, falling back to self-marking
    setPhase('marking');
    try {
      const m = await markShortAI(item, resp);
      await finishAttempt(resp, conf, m);
    } catch (e) {
      setMarkNote(e instanceof AiUnavailableError ? `AI marking unavailable (${e.message}) — mark yourself against the rubric.` : 'AI marking failed — mark yourself against the rubric.');
      setPhase('selfmark');
    }
  };

  const next = async () => {
    const ctx = ctxRef.current!;
    setPhase('loading');
    setLoadingMsg('');
    const it = await nextItem(ctx);
    if (it) return show(it);
    setSummary(await endSession(ctx));
    await celebrate();
    setPhase('summary');
  };

  const stop = async () => {
    const ctx = ctxRef.current;
    if (!ctx || ctx.record.attemptIds.length === 0) return go('/');
    setSummary(await endSession(ctx));
    await celebrate();
    setPhase('summary');
  };

  const elapsed = ctxRef.current ? now - ctxRef.current.record.startedAt : 0;
  const answered = ctxRef.current?.record.attemptIds.length ?? 0;

  if (phase === 'summary' && summary) return <Summary summary={summary} moduleId={moduleId} xp={sessionXp} game={gameRef.current} />;

  return (
    <>
      <TopBar title="Session" back="/" />
      <div class="wrap">
        <div class="session-top small muted">
          <Bar value={elapsed / SESSION_TARGET_MS} thin />
          {combo >= 2 && <span class="combo" key={combo}>🔥 {combo} in a row</span>}
          {sessionXp > 0 && <span class="tag">⚡ {sessionXp} XP</span>}
          <span>{answered} done</span>
          <button class="btn sm" onClick={stop}>End</button>
        </div>

        {phase === 'loading' && (
          <div class="center muted"><Spinner />{loadingMsg}</div>
        )}
        {phase === 'empty' && (
          <div class="card">
            <p>{emptyMsg}</p>
            <button class="btn" onClick={() => go(`/m/${moduleId}`)}>What I know</button>
          </div>
        )}

        {item && phase !== 'loading' && phase !== 'empty' && (
          <div class="card q-card paper" key={item.id}>
            <div class="row small">
              <span class="tag">{TYPE_LABEL[item.type]}</span>
              {item.transfer && <span class="tag warn">new scenario</span>}
              {item.seenCount === 0 && phase === 'answer' && <span class="tag ok">new</span>}
            </div>
            <div class="ilo-line">
              {item.iloIds.map((id) => <span key={id}>🎯 <b>{id}</b> {ilos.get(id)?.text}</span>)}
            </div>
            <div class="prompt">{item.prompt}</div>

            {phase === 'answer' && (
              <>
                {item.type === 'mcq' && <McqInput item={item} value={choice} onChange={setChoice} />}
                {item.type === 'cloze' && <ClozeInput value={text} onChange={setText} onEnter={() => {}} />}
                {item.type === 'short' && <ShortInput value={text} onChange={setText} />}
                {item.type === 'order' && <OrderInput order={order} onChange={setOrder} />}
                <div class="conf-label">How sure are you? Tap to submit.</div>
                <div class="conf">
                  {([1, 2, 3, 4] as Confidence[]).map((c) => (
                    <button key={c} class={`btn primary c${c}`} disabled={responseString() === null} onClick={() => submit(c)}>
                      <span class="e">{['🎲', '🤔', '🙂', '💪'][c - 1]}</span>
                      {CONF_LABEL[c]}
                      <small>{['~25%', '~50%', '~75%', '~95%'][c - 1]}</small>
                    </button>
                  ))}
                </div>
                <button class="btn ghost sm" style={{ marginTop: 6 }} onClick={() => submit(1, true)}>🙈 I don't know — show me</button>
              </>
            )}

            {phase === 'marking' && <div class="center muted small"><Spinner />Marking against the rubric…</div>}

            {phase === 'selfmark' && (
              <SelfMark item={item} answer={text} note={markNote} ticks={ticks} setTicks={setTicks}
                onDone={() => finishAttempt(text.trim(), confidence, selfMark(item, ticks))} />
            )}

            {phase === 'feedback' && mark && attempt && (
              <Feedback item={item} mark={mark} attempt={attempt} order={order} choice={choice} ctx={ctxRef.current!} onNext={next} onXp={celebrate} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

function SelfMark(props: { item: Item; answer: string; note: string; ticks: boolean[]; setTicks: (t: boolean[]) => void; onDone: () => void }) {
  const { item } = props;
  return (
    <div class="stack">
      <div class="notice small">{props.note}</div>
      <div class="small"><b>Your answer:</b> {props.answer}</div>
      <div class="small"><b>Model answer:</b> {item.answer}</div>
      <div class="small"><b>Tick each point your answer made:</b></div>
      {item.rubric.map((r, i) => (
        <label class="row small" key={i}>
          <input type="checkbox" checked={props.ticks[i]} onChange={(e) => {
            const t = [...props.ticks];
            t[i] = e.currentTarget.checked;
            props.setTicks(t);
          }} />
          {r.point}
        </label>
      ))}
      <button class="btn primary" onClick={props.onDone}>Save self-mark</button>
    </div>
  );
}

function verdict(score: number, seed: number) {
  if (score >= 0.99) return { cls: 'ok', txt: praise(seed), emoji: '🎉' };
  if (score >= 0.5) return { cls: 'part', txt: `Partly right (${Math.round(score * 100)}%)`, emoji: '🌗' };
  return { cls: 'bad', txt: score > 0 ? `Not quite (${Math.round(score * 100)}%)` : 'Not this time', emoji: '🧩' };
}

function Feedback(props: { item: Item; mark: MarkDetail; attempt: Attempt; order: string[]; choice: number | null; ctx: SessionCtx; onNext: () => void; onXp: () => void }) {
  const { item, mark, attempt } = props;
  const v = verdict(mark.score, attempt.at);
  const xp = xpForAttempt(attempt);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const [disputed, setDisputed] = useState(false);
  const [more, setMore] = useState<{ explanation: string; beyond_materials: string } | null>(null);
  const [moreErr, setMoreErr] = useState('');
  const [moreBusy, setMoreBusy] = useState(false);
  const [elab, setElab] = useState('');
  const [elabShown, setElabShown] = useState(false);
  const [elabDone, setElabDone] = useState(false);
  const showElab = !!item.elaborationPrompt && (item.level >= 2 || (props.ctx?.served.length ?? 0) % 3 === 0);

  const correctText =
    item.type === 'mcq' ? item.options[item.correctIndex] : item.type === 'order' ? item.steps.join(' → ') : item.answer;

  const askMore = async () => {
    setMoreBusy(true);
    setMoreErr('');
    try {
      setMore(await explainMore(item, attempt.response, correctText));
    } catch (e) {
      setMoreErr(e instanceof AiUnavailableError ? e.message : 'Could not get an explanation.');
    } finally {
      setMoreBusy(false);
    }
  };

  return (
    <div class="stack">
      <div class={'verdict ' + v.cls}><span class="big-emoji">{v.emoji}</span>{v.txt}<span class="xp-chip">+{xp.total} XP</span></div>
      <div class="xp-parts">{xp.parts.map((p) => `${p.label} +${p.xp}`).join(' · ')}</div>

      {attempt.confidence >= 3 && mark.score < 0.5 && (
        <div class="small notice">You said “{CONF_LABEL[attempt.confidence]}” but this was wrong. Confident errors are the most useful ones to fix — this will come back soon.</div>
      )}
      {attempt.confidence <= 2 && mark.score >= 0.99 && attempt.response && (
        <div class="small muted">Right, though you weren't sure. Spaced reviews will firm this up.</div>
      )}

      {item.type === 'mcq' && (
        <div>
          {seededOrder(item.options.length, item.id).map((oi, k) => (
            <div key={oi} class={'opt' + (oi === item.correctIndex ? ' right' : oi === props.choice ? ' wrong' : '')}>
              <span class="letter">{String.fromCharCode(65 + k)}</span>{item.options[oi]}
              <span class="why">{item.distractorWhy[oi]}</span>
            </div>
          ))}
        </div>
      )}
      {item.type === 'cloze' && (
        <div class="small">You wrote: <b>{attempt.response || '—'}</b> · Lecture term: <b>{item.answer}</b>{mark.reasoning && <div class="muted">{mark.reasoning}</div>}</div>
      )}
      {item.type === 'order' && (
        <div>
          <div class="small muted">Your order (green = in the right place):</div>
          <OrderInput order={props.order} onChange={() => {}} result={item.steps} />
          <div class="small" style={{ marginTop: 6 }}><b>Correct order:</b></div>
          <ol class="small">{item.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      )}
      {item.type === 'short' && (
        <div class="small stack">
          <div><b>Your answer:</b> {attempt.response || '—'}</div>
          <div><b>Rubric</b> {mark.by === 'ai' && <span class="tag">AI-marked · confidence {mark.confidence}</span>}{mark.by === 'self' && <span class="tag warn">self-marked</span>}</div>
          <ul class="rubric">
            {(mark.points ?? item.rubric.map((r) => ({ point: r.point, awarded: false, reasoning: '' }))).map((p, i) => (
              <li key={i}>
                <span class={p.awarded ? 'yes' : 'no'}>{p.awarded ? '✓' : '✗'}</span> {p.point}
                {p.reasoning && mark.by === 'ai' && <div class="muted">{p.reasoning}</div>}
              </li>
            ))}
          </ul>
          {mark.reasoning && mark.by === 'ai' && <div class="muted"><b>Marker's reasoning:</b> {mark.reasoning}</div>}
          {mark.feedback && <div>{mark.feedback}</div>}
          <div><b>Model answer:</b> {item.answer}</div>
        </div>
      )}

      <div><b>Why:</b> {item.explanation}</div>
      <SourceView item={item} />

      {item.beyondMaterials && (
        <div class="beyond"><b>Beyond course materials:</b> {item.beyondMaterials}</div>
      )}

      {more ? (
        <div class="small">
          <div>{more.explanation}</div>
          {more.beyond_materials && <div class="beyond" style={{ marginTop: 6 }}><b>Beyond course materials:</b> {more.beyond_materials}</div>}
        </div>
      ) : (
        <div>
          <button class="btn sm" onClick={askMore} disabled={moreBusy}>{moreBusy ? 'Thinking…' : 'Explain this more (≈1p)'}</button>
          {moreErr && <div class="err small" style={{ marginTop: 6 }}>{moreErr}</div>}
        </div>
      )}

      {showElab && !elabDone && (
        <div class="think">
          <div class="small"><b>💭 Think it through</b> (optional, not marked)</div>
          <div style={{ margin: '6px 0' }}>{item.elaborationPrompt}</div>
          {!elabShown ? (
            <>
              <textarea style={{ minHeight: 70 }} placeholder="Explain in a sentence or two…" value={elab} onInput={(e) => setElab(e.currentTarget.value)} />
              <button class="btn sm" style={{ marginTop: 6 }} onClick={() => setElabShown(true)}>Compare with the lecture</button>
            </>
          ) : (
            <>
              <div class="source small">{item.elaborationAnswer}</div>
              <div class="small" style={{ marginTop: 6 }}>How close were you?</div>
              <div class="row">
                {[['Missed it', 0], ['Partly', 0.5], ['Got it', 1]].map(([l, s]) => (
                  <button key={l as string} class="btn sm" onClick={async () => { await recordElaboration(props.ctx, item, elab, s as number); setElabDone(true); if (elab.trim()) toast('💭 Thought it through <b>+5 XP</b>', 1600); props.onXp(); }}>{l}</button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div class="row spread">
        {!disputed ? (
          <button class="btn ghost sm" onClick={() => setDisputing(!disputing)}>Dispute this mark</button>
        ) : (
          <span class="small muted">Dispute logged — this answer no longer counts towards your mastery estimate.</span>
        )}
      </div>
      {disputing && !disputed && (
        <div class="stack">
          <textarea style={{ minHeight: 60 }} placeholder="Why is the mark wrong? (e.g. my answer says the same thing in other words)" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
          <button class="btn sm" disabled={!reason.trim()} onClick={async () => { await disputeMark(attempt, reason.trim()); setDisputed(true); setDisputing(false); }}>Log dispute</button>
        </div>
      )}

      <button class="btn primary big" onClick={props.onNext}>Next  →</button>
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
    <>
      <TopBar title="Session complete" back="/" />
      <div class="wrap">
        <div class="card">
          <div class="trophy" aria-hidden="true">{pct >= 80 ? '🏆' : pct >= 50 ? '🌟' : '💪'}</div>
          <h2 class="center">{headline}</h2>
          {game && (
            <div class="center" style={{ marginTop: 6 }}>
              <span class="xp-chip" style={{ marginLeft: 0 }}>+{xp} XP</span>
              <div class="small muted" style={{ marginTop: 6 }}>Level {game.level.level} · {game.level.title} · {game.level.next - game.xp} XP to next level · 🔥 {game.streak}-day streak</div>
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
            <p class="small muted" style={{ marginTop: 12 }}>
              Next review due {summary.nextDue.getTime() <= Date.now() + 3600_000 ? 'within the hour' : summary.nextDue.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}
          <button class="btn primary big" onClick={() => go('/')}>Finish</button>
          <button class="btn ghost" style={{ marginTop: 6, width: '100%' }} onClick={() => go(`/m/${moduleId}`)}>See what I know</button>
        </div>
      </div>
    </>
  );
}
