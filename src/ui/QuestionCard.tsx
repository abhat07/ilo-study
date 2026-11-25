/**
 * One question, start to finish: answer → confidence → marking → feedback (+ help chat).
 * Shared by mixed sessions, lecture lessons and recaps. Remount with key={item.id} for each question.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Attempt, Confidence, Ilo, Item, MarkDetail } from '../types';
import { AiUnavailableError } from '../ai/client';
import { explainMore, markShortAI, selfMark } from '../engine/marking';
import { CONF_LABEL } from '../engine/mastery';
import { disputeMark, markCloze, markMcq, markOrder, recordAttempt, recordElaboration, type SessionCtx } from '../engine/session';
import { Spinner } from './common';
import { ClozeInput, McqInput, OrderInput, ShortInput, initialOrder, seededOrder } from './answers';
import { SourceView } from './SourceView';
import { HelpChat } from './HelpChat';
import { praise, toast } from './fun';
import { xpForAttempt } from '../engine/game';

export const TYPE_LABEL: Record<Item['type'], string> = {
  mcq: 'Choose one',
  cloze: 'Fill the gap',
  short: 'Explain',
  order: 'Put in order',
};

type QPhase = 'answer' | 'marking' | 'selfmark' | 'feedback';

export function QuestionCard(props: {
  ctx: SessionCtx;
  item: Item;
  ilos: Map<string, Ilo>;
  /** extra tags shown above the question, e.g. "review" or "links topics" */
  tags?: { text: string; cls?: string }[];
  onAnswered: (a: Attempt, m: MarkDetail) => void;
  onNext: () => void;
  onXp: () => void;
}) {
  const { item, ilos } = props;
  const [phase, setPhase] = useState<QPhase>('answer');
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [order, setOrder] = useState<string[]>(item.type === 'order' ? initialOrder(item) : []);
  const [confidence, setConfidence] = useState<Confidence>(2);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [mark, setMark] = useState<MarkDetail | null>(null);
  const [markNote, setMarkNote] = useState('');
  const [ticks, setTicks] = useState<boolean[]>(item.rubric.map(() => false));
  const shownAt = useRef(Date.now());
  const hintedRef = useRef(false);

  // Colour by learning stage: calm while retrieving, outcome-coloured feedback.
  useEffect(() => {
    document.body.dataset.stage =
      phase === 'feedback' && mark ? (mark.score >= 0.99 ? 'correct' : mark.score >= 0.5 ? 'partial' : 'miss') : 'retrieve';
  }, [phase, mark]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const responseString = (): string | null => {
    if (item.type === 'mcq') return choice === null ? null : String(choice);
    if (item.type === 'order') return JSON.stringify(order);
    return text.trim() ? text.trim() : null;
  };

  const finishAttempt = async (resp: string, conf: Confidence, m: MarkDetail) => {
    const a = await recordAttempt(props.ctx, item, resp, conf, m, Date.now() - shownAt.current, hintedRef.current);
    setAttempt(a);
    setMark(m);
    setPhase('feedback');
    props.onAnswered(a, m);
  };

  const submit = async (conf: Confidence, skipped = false) => {
    setConfidence(conf);
    const resp = skipped ? '' : responseString();
    if (resp === null) return;
    if (skipped) return finishAttempt('', 1, { by: 'auto', score: 0, reasoning: "You chose \"I don't know\" — trying first still helps you learn the answer." });
    if (item.type === 'mcq') return finishAttempt(item.options[Number(resp)], conf, markMcq(item, Number(resp)));
    if (item.type === 'cloze') return finishAttempt(resp, conf, markCloze(item, resp));
    if (item.type === 'order') return finishAttempt(resp, conf, markOrder(item, order));
    setPhase('marking');
    try {
      await finishAttempt(resp, conf, await markShortAI(item, resp));
    } catch (e) {
      setMarkNote(e instanceof AiUnavailableError ? `AI marking unavailable (${e.message}) — mark yourself against the rubric.` : 'AI marking failed — mark yourself against the rubric.');
      setPhase('selfmark');
    }
  };

  return (
    <>
      <div class="card q-card paper">
        <div class="row small">
          <span class="tag">{TYPE_LABEL[item.type]}</span>
          {props.tags?.map((t) => <span key={t.text} class={'tag ' + (t.cls ?? '')}>{t.text}</span>)}
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
            <button class="btn ghost sm" style={{ marginTop: '6px' }} onClick={() => submit(1, true)}>🙈 I don't know — show me</button>
          </>
        )}

        {phase === 'marking' && <div class="center muted small"><Spinner />Marking against the rubric…</div>}

        {phase === 'selfmark' && (
          <SelfMark item={item} answer={text} note={markNote} ticks={ticks} setTicks={setTicks}
            onDone={() => finishAttempt(text.trim(), confidence, selfMark(item, ticks))} />
        )}

        {phase === 'feedback' && mark && attempt && (
          <Feedback item={item} mark={mark} attempt={attempt} order={order} choice={choice} ctx={props.ctx} onNext={props.onNext} onXp={props.onXp} />
        )}
      </div>
      <HelpChat
        item={item}
        ilo={ilos.get(item.iloIds[0])}
        answered={phase === 'feedback'}
        studentAnswer={attempt?.response ?? ''}
        correctAnswer={item.type === 'mcq' ? item.options[item.correctIndex] : item.type === 'order' ? item.steps.join(' → ') : item.answer}
        onUsedBeforeAnswer={() => { hintedRef.current = true; }}
      />
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
      {attempt.hinted && <div class="small muted">💬 You used the helper before answering, so this counts as half evidence and comes back a little sooner.</div>}
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
          <div class="small" style={{ marginTop: '6px' }}><b>Correct order:</b></div>
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
          {more.beyond_materials && <div class="beyond" style={{ marginTop: '6px' }}><b>Beyond course materials:</b> {more.beyond_materials}</div>}
        </div>
      ) : (
        <div>
          <button class="btn sm" onClick={askMore} disabled={moreBusy}>{moreBusy ? 'Thinking…' : 'Explain this more (≈1p)'}</button>
          {moreErr && <div class="err small" style={{ marginTop: '6px' }}>{moreErr}</div>}
        </div>
      )}

      {showElab && !elabDone && (
        <div class="think">
          <div class="small"><b>💭 Think it through</b> (optional, not marked)</div>
          <div style={{ margin: '6px 0' }}>{item.elaborationPrompt}</div>
          {!elabShown ? (
            <>
              <textarea style={{ minHeight: '70px' }} placeholder="Explain in a sentence or two…" value={elab} onInput={(e) => setElab(e.currentTarget.value)} />
              <button class="btn sm" style={{ marginTop: '6px' }} onClick={() => setElabShown(true)}>Compare with the lecture</button>
            </>
          ) : (
            <>
              <div class="source small">{item.elaborationAnswer}</div>
              <div class="small" style={{ marginTop: '6px' }}>How close were you?</div>
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
          <textarea style={{ minHeight: '60px' }} placeholder="Why is the mark wrong? (e.g. my answer says the same thing in other words)" value={reason} onInput={(e) => setReason(e.currentTarget.value)} />
          <button class="btn sm" disabled={!reason.trim()} onClick={async () => { await disputeMark(attempt, reason.trim()); setDisputed(true); setDisputing(false); }}>Log dispute</button>
        </div>
      )}

      <button class="btn primary big" onClick={props.onNext}>Next  →</button>
    </div>
  );
}

