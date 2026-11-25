/**
 * Floating help bubble for the question screen. Uses the cheapest model and only the slide the
 * question came from. Before you answer it gives hints, not answers (asking marks the answer as
 * "hinted"); after you answer it explains freely.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Ilo, Item } from '../types';
import { AiUnavailableError } from '../ai/client';
import { askTutor, type ChatTurn } from '../engine/tutor';

const BEFORE = ['Give me a hint', 'What does the question mean?', 'Which part of the lecture is this?'];
const AFTER = ['Why was my answer wrong?', 'Explain it simply', 'How does this link to the ILO?', 'Give me an example'];

export function HelpChat(props: {
  item: Item;
  ilo?: Ilo;
  answered: boolean;
  studentAnswer: string;
  correctAnswer: string;
  onUsedBeforeAnswer: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // new question → fresh conversation
  useEffect(() => {
    setTurns([]);
    setText('');
  }, [props.item.id]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    if (!props.answered) props.onUsedBeforeAnswer();
    const history = turns;
    setTurns([...history, { role: 'student', text: m }]);
    setText('');
    setBusy(true);
    try {
      const out = await askTutor({
        item: props.item, ilo: props.ilo, answered: props.answered, studentAnswer: props.studentAnswer,
        correctAnswer: props.correctAnswer, history, message: m,
      });
      setTurns((t) => [...t, { role: 'helper', text: out.reply, beyond: out.beyond_materials || undefined }]);
    } catch (e) {
      const msg = e instanceof AiUnavailableError ? e.message : 'The helper could not answer just now.';
      setTurns((t) => [...t, { role: 'helper', text: msg, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const chips = props.answered ? AFTER : BEFORE;

  return (
    <>
      {!open && (
        <button class="help-fab" onClick={() => setOpen(true)} aria-label="Ask the study helper">
          <span aria-hidden="true">💬</span>
          <b>Ask</b>
        </button>
      )}
      {open && (
        <div class="help-panel" role="dialog" aria-label="Study helper">
          <div class="help-head">
            <div>
              <b>Study helper</b>
              <div class="small muted">
                {props.answered ? 'Ask anything about this question.' : 'Hints only until you answer.'}
              </div>
            </div>
            <button class="btn sm ghost" onClick={() => setOpen(false)} aria-label="Close helper">✕</button>
          </div>
          <div class="help-list" ref={listRef}>
            {turns.length === 0 && (
              <div class="small muted help-empty">
                Ask about this question or the slide it came from.
                {!props.answered && <> Using the helper before answering marks your answer as <b>hinted</b>: it counts as half evidence and comes back sooner.</>}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} class={`help-msg ${t.role}${t.error ? ' err' : ''}`}>
                {t.text}
                {t.beyond && <div class="beyond small" style={{ marginTop: '6px' }}><b>Beyond course materials:</b> {t.beyond}</div>}
              </div>
            ))}
            {busy && <div class="help-msg helper typing"><i /><i /><i /></div>}
          </div>
          <div class="help-chips">
            {chips.map((c) => <button key={c} class="chip-btn" disabled={busy} onClick={() => send(c)}>{c}</button>)}
          </div>
          <form class="help-input" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
            <input ref={inputRef} type="text" placeholder="Ask about this question…" value={text} maxLength={600} onInput={(e) => setText(e.currentTarget.value)} />
            <button class="btn primary sm" type="submit" disabled={busy || !text.trim()}>Send</button>
          </form>
          <div class="help-foot">Uses only this question's slide · cheapest model · ≈0.03p per message</div>
        </div>
      )}
    </>
  );
}
