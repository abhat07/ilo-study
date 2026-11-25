/**
 * A lecture's lesson path, taught in small steps. For each ILO section:
 *   read one point (with the diagram highlighting it and its slide) → answer a question on it → answer a
 *   link-back question tying it to the step before → arrow on to the next point …
 * then end-of-section link questions and anything still wrong (it repeats until right). Spaced reviews from
 * earlier sections and the previous lecture are mixed in. The ring only reaches 100% when everything is
 * right, then the lecture moves to spaced recap.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { byModule, db, notifyChange } from '../db';
import type { Ilo, Item, LearnSection, Lecture } from '../types';
import { endSession, startSession, type SessionCtx } from '../engine/session';
import { buildLectures } from '../learn/lectures';
import { ensureSections, isGeneratingLecture } from '../learn/sections';
import { CORRECT, fmtMin, latestScores, lectureMinutes, lectureState, liveItems, nextLessonStep, paceFrom, readToOf, sectionState } from '../learn/progress';
import { renderStoredPdfPage } from '../ingest/extract';
import { locatorLabel } from '../ingest/text';
import { ensureBlob, syncNow } from '../sync/sync';
import { achievements, loadGame, type GameState } from '../engine/game';
import { Spinner, TopBar, go, useLive } from './common';
import { QuestionCard } from './QuestionCard';
import { Ring, Visual } from './Visual';
import { useSlidePics } from './SlidePics';
import { Doodles } from './Doodles';
import { confetti, toast } from './fun';

type Mode = 'loading' | 'step' | 'quiz' | 'sectionDone' | 'done' | 'reread' | 'waiting' | 'error';

async function loadAll(moduleId: string, lectureId: string) {
  const d = await db();
  let lecture = await d.get('lectures', lectureId);
  if (!lecture) {
    await buildLectures(moduleId);
    lecture = await d.get('lectures', lectureId);
  }
  const [sections, items, attempts, ilos, lectures] = await Promise.all([
    byModule('sections', moduleId), byModule('items', moduleId), byModule('attempts', moduleId), byModule('ilos', moduleId), byModule('lectures', moduleId),
  ]);
  const itemMap = new Map(items.map((i) => [i.id, i]));
  return {
    lecture,
    lectures: lectures.sort((a, b) => a.number - b.number),
    sections: sections.filter((s) => s.lectureId === lectureId).sort((a, b) => a.order - b.order),
    allSections: sections,
    items: itemMap,
    latest: latestScores(attempts),
    ilos: new Map(ilos.map((i) => [i.id, i])),
    pace: paceFrom(attempts, itemMap),
  };
}
type Data = Awaited<ReturnType<typeof loadAll>>;

const labelOf = (s: LearnSection, k: number) => s.points[k]?.label || `Step ${k + 1}`;

function stepFor(fresh: Data, sec: LearnSection, asked: string[]) {
  const prevLecture = fresh.lectures.filter((l) => l.number > 0 && l.number < (fresh.lecture?.number ?? 0)).pop();
  const reviewPool = [
    ...fresh.sections.filter((x) => x.order < sec.order),
    ...(prevLecture ? fresh.allSections.filter((x) => x.lectureId === prevLecture.id) : []),
  ].flatMap((x) => liveItems(x, fresh.items)).filter((i) => i.seenCount > 0);
  return nextLessonStep({ section: sec, items: fresh.items, latest: fresh.latest, askedThisSitting: asked, reviewPool });
}

export function Learn({ moduleId, lectureId }: { moduleId: string; lectureId: string }) {
  const data = useLive(() => loadAll(moduleId, lectureId), [lectureId]);
  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState('');
  const [item, setItem] = useState<{ it: Item; review: boolean } | null>(null);
  const [step, setStep] = useState<{ secId: string; index: number } | null>(null);
  const [nextLabel, setNextLabel] = useState<string | undefined>(undefined);
  const [reread, setReread] = useState<LearnSection | null>(null);
  const [doneSection, setDoneSection] = useState<LearnSection | null>(null);
  const asked = useRef<string[]>([]);
  const ctxRef = useRef<SessionCtx | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const started = useRef(false);
  const busy = useRef(false);
  /** the section you were working on, so finishing it shows its completion screen */
  const activeSec = useRef<string | null>(null);

  // write the lesson (first section awaited, rest in background)
  useEffect(() => {
    if (!data?.lecture || started.current) return;
    started.current = true;
    void ensureSections(data.lecture).then((r) => r.error && setError(r.error));
    void loadGame().then((g) => (gameRef.current = g));
  }, [data?.lecture?.id]);

  // end the study session when leaving
  useEffect(() => () => {
    const ctx = ctxRef.current;
    if (ctx && ctx.record.attemptIds.length) {
      void endSession(ctx).then(() => syncNow('lesson'));
    }
    document.body.dataset.stage = 'home';
  }, []);

  const st = data?.lecture ? lectureState(data.lecture, data.sections, data.items, data.latest) : null;
  const current = data?.sections.find((s) => s.id === st?.currentSectionId) ?? null;

  // decide what to show when nothing is in progress
  useEffect(() => {
    if (!data || !st || mode === 'step' || mode === 'quiz' || mode === 'sectionDone' || mode === 'reread') return;
    if (current) {
      void askNext();
      return;
    }
    if (st.done) return setMode('done');
    if (data.sections.length < (data.lecture?.iloIds.length ?? 0)) return setMode(error ? 'error' : isGeneratingLecture(lectureId) || data.sections.length === 0 ? 'waiting' : 'error');
    setMode('done');
  }, [data, current?.id, st?.done, error]);

  useEffect(() => {
    document.body.dataset.stage = mode === 'done' ? 'reward' : 'retrieve';
  }, [mode]);

  async function ensureCtx(): Promise<SessionCtx> {
    if (!ctxRef.current) ctxRef.current = await startSession(moduleId);
    return ctxRef.current;
  }

  async function askNext() {
    if (busy.current) return;
    busy.current = true;
    try {
      const fresh = await loadAll(moduleId, lectureId);
      const s = fresh.lecture ? lectureState(fresh.lecture, fresh.sections, fresh.items, fresh.latest) : null;
      // the section you were working on is now complete: celebrate it before moving on
      if (activeSec.current && activeSec.current !== s?.currentSectionId) {
        const finished = fresh.sections.find((x) => x.id === activeSec.current) ?? null;
        activeSec.current = null;
        setItem(null);
        setStep(null);
        setDoneSection(finished);
        setMode(finished ? 'sectionDone' : 'loading');
        if (finished) confetti(window.innerWidth / 2, 160, 60);
        return;
      }
      const sec = fresh.sections.find((x) => x.id === s?.currentSectionId);
      if (!sec) {
        setItem(null);
        setStep(null);
        setMode(s?.done ? 'done' : 'waiting');
        return;
      }
      const next = stepFor(fresh, sec, asked.current);
      if (!next) {
        setItem(null);
        setStep(null);
        setDoneSection(sec);
        setMode('sectionDone');
        confetti(window.innerWidth / 2, 160, 60);
        return;
      }
      activeSec.current = sec.id;
      if (next.kind === 'read') {
        setItem(null);
        setStep({ secId: sec.id, index: next.index });
        setMode('step');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      await ensureCtx();
      asked.current.push(next.item.id);
      setStep(null);
      setNextLabel(undefined);
      setItem({ it: next.item, review: next.review });
      setMode('quiz');
    } finally {
      busy.current = false;
    }
  }

  /** "Got it": mark this step read and go to its question(s). */
  async function readStep(sec: LearnSection, k: number) {
    const d = await db();
    const cur = (await d.get('sections', sec.id)) ?? sec;
    const n = cur.points.length;
    const readTo = Math.max(readToOf(cur), k + 1);
    await d.put('sections', { ...cur, readTo, seenAt: readTo >= n ? cur.seenAt ?? Date.now() : cur.seenAt, updatedAt: Date.now() });
    notifyChange();
    setStep(null);
    setMode('loading');
    await askNext();
  }

  async function onAnswered(_a: unknown, m: { score: number }) {
    if (m.score >= 0.99) confetti(window.innerWidth / 2, 180, 30);
    // label the "next" button with where it goes: the next step's name, or a retry
    const fresh = await loadAll(moduleId, lectureId);
    const sec = fresh.sections.find((x) => x.id === activeSec.current);
    const nx = sec ? stepFor(fresh, sec, asked.current) : null;
    setNextLabel(
      !sec || !nx ? 'Finish this section →'
        : nx.kind === 'read' ? `Next: ${labelOf(sec, nx.index)} →`
        : nx.item.kind === 'link' && (nx.item.pointIndex ?? -1) >= 0 ? 'Link it back →'
        : undefined,
    );
    const before = gameRef.current;
    const after = await loadGame();
    gameRef.current = after;
    if (before) achievements(before, after).forEach((msg, i) => setTimeout(() => toast(msg), i * 700));
  }

  if (!data) return <TopBar title="Lesson" back={`/m/${moduleId}`} />;
  if (!data.lecture) {
    return (
      <div class="has-doodles">
        <TopBar title="Lesson" back={`/m/${moduleId}`} />
        <div class="wrap"><div class="card">This lecture no longer exists. <a href={`#/m/${moduleId}`}>Back to the module</a></div></div>
      </div>
    );
  }
  const lecture = data.lecture;
  const title = `${lecture.number ? `L${lecture.number} · ` : ''}${lecture.title}`;
  const stepSec = step ? data.sections.find((s) => s.id === step.secId) ?? null : null;
  const qPoint = item && !item.review && current && (item.it.pointIndex ?? -1) >= 0 ? item.it.pointIndex! : null;

  return (
    <div class="has-doodles learn-page">
      <Doodles set="session" rotate={asked.current.length} />
      <TopBar title={title} back={`/m/${moduleId}`} />
      <LessonRail data={data} lecture={lecture} st={st!} currentId={current?.id} onOpen={(s) => { setReread(s); setMode('reread'); }} />
      <div class="wrap">
        <LessonHeader lecture={lecture} st={st!} current={current} data={data} qPoint={qPoint} />

        {mode === 'loading' && <div class="center muted"><Spinner /></div>}
        {mode === 'waiting' && (
          <div class="card center">
            <Spinner />
            <p>{data.sections.length ? 'Writing the next section from your slides…' : 'Writing your lesson from the slides…'}</p>
            <p class="muted small">Each section teaches one ILO in small steps, with a question on every step.</p>
          </div>
        )}
        {mode === 'error' && (
          <div class="card">
            <div class="err">{error || 'The lesson could not be written.'}</div>
            <div class="row" style={{ marginTop: '10px' }}>
              <button class="btn" onClick={() => { setError(''); started.current = false; void ensureSections(lecture).then((r) => r.error && setError(r.error)); setMode('waiting'); }}>Try again</button>
              <button class="btn ghost" onClick={() => go(`/m/${moduleId}`)}>Back</button>
            </div>
          </div>
        )}

        {mode === 'step' && stepSec && step && (
          <StepCard
            key={`${stepSec.id}-${step.index}`}
            section={stepSec}
            index={step.index}
            ilo={data.ilos.get(stepSec.iloId)}
            questions={liveItems(stepSec, data.items).filter((i) => i.pointIndex === step.index).length}
            onNext={() => (stepSec.points.length ? readStep(stepSec, step.index) : skipEmpty(stepSec))}
          />
        )}

        {mode === 'reread' && reread && (
          <ExplainCard section={reread} ilo={data.ilos.get(reread.iloId)} onDone={() => { setReread(null); setMode('loading'); void askNext(); }} />
        )}

        {mode === 'quiz' && item && ctxRef.current && (
          <QuestionCard
            key={`${item.it.id}-${asked.current.length}`}
            ctx={ctxRef.current}
            item={item.it}
            ilos={data.ilos}
            tags={[
              ...(item.review ? [{ text: '🔁 spaced review', cls: 'warn' }] : []),
              ...(item.it.kind === 'link' ? [{ text: (item.it.pointIndex ?? -1) >= 0 ? '🔗 links back' : '🔗 links topics', cls: 'ok' }] : []),
              ...(!item.review && current && (item.it.pointIndex ?? -1) >= 0 && item.it.kind !== 'link' ? [{ text: `📍 ${labelOf(current, item.it.pointIndex!)}`, cls: '' }] : []),
              ...(!item.review && (data.latest.get(item.it.id)?.score ?? 1) < CORRECT ? [{ text: '↻ try again', cls: 'warn' }] : []),
            ]}
            onAnswered={onAnswered}
            onNext={() => void askNext()}
            onXp={() => {}}
            nextLabel={nextLabel}
          />
        )}
        {mode === 'quiz' && !item && <div class="center muted"><Spinner /></div>}

        {mode === 'sectionDone' && doneSection && (
          <div class="card center section-done">
            <div class="trophy" aria-hidden="true">✅</div>
            <h2>{doneSection.title}: complete</h2>
            <p class="muted small">Every step read and every question answered correctly. It will come back in spaced recap.</p>
            <button class="btn primary big" onClick={() => { setDoneSection(null); setMode('loading'); void askNext(); }}>Continue →</button>
          </div>
        )}

        {mode === 'done' && <LectureDone lecture={lecture} data={data} moduleId={moduleId} />}
      </div>
    </div>
  );

  async function skipEmpty(sec: LearnSection) {
    await (await db()).put('sections', { ...sec, seenAt: Date.now(), updatedAt: Date.now() });
    notifyChange();
    setStep(null);
    setMode('loading');
    await askNext();
  }
}

function LessonHeader({ lecture, st, current, data, qPoint }: { lecture: Lecture; st: ReturnType<typeof lectureState>; current: LearnSection | null; data: Data; qPoint: number | null }) {
  const idx = current ? data.sections.findIndex((s) => s.id === current.id) + 1 : data.sections.length;
  const cs = current ? sectionState(current, data.items, data.latest) : null;
  const mins = lectureMinutes(lecture, data.sections, data.items, data.latest, data.pace);
  const n = current?.points.length ?? 0;
  const readTo = current ? readToOf(current) : 0;
  return (
    <div class="lesson-head card">
      <Ring value={st.frac} size={58} />
      <div class="lh-text">
        <div class="small muted">
          Lecture {lecture.number || ''} · section {Math.max(1, idx)} of {st.expected}
          {current && n > 0 && ` · step ${Math.min(n, qPoint !== null ? qPoint + 1 : readTo + (readTo < n ? 1 : 0))} of ${n}`}
        </div>
        <b>{current?.title ?? (st.done ? 'Lecture complete' : lecture.title)}</b>
        <div class="small muted">
          {cs && cs.total > 0 && <>{cs.correct}/{cs.total} right in this section · </>}
          <span class="lh-time">⏱ {st.done ? 'complete' : `≈ ${fmtMin(mins.left)} left`}</span>
        </div>
      </div>
    </div>
  );
}

function LessonRail({ data, lecture, st, currentId, onOpen }: { data: Data; lecture: Lecture; st: ReturnType<typeof lectureState>; currentId?: string; onOpen: (s: LearnSection) => void }) {
  const pending = lecture.iloIds.filter((id) => !data.sections.some((s) => s.iloId === id));
  const mins = lectureMinutes(lecture, data.sections, data.items, data.latest, data.pace);
  return (
    <aside class="rail lesson-rail" aria-label="Lesson map">
      <div class="rail-card center">
        <Ring value={st.frac} size={96} stroke={9} />
        <div class="small muted" style={{ marginTop: '6px' }}>{st.done ? `Complete · ${st.due} due for recap` : `Lecture progress · ≈ ${fmtMin(mins.left)} left`}</div>
      </div>
      <div class="rail-card">
        <div class="rail-h">Lesson map</div>
        <ol class="flow-map">
          {data.sections.map((s) => {
            const ss = sectionState(s, data.items, data.latest);
            const state = ss.done ? 'done' : s.id === currentId ? 'now' : 'next';
            const readTo = readToOf(s);
            return (
              <li key={s.id} class={state}>
                <button class="fm-node" disabled={!ss.done && !readTo} onClick={() => onOpen(s)} title="Re-read this section">
                  <span class="dot">{ss.done ? '✓' : ''}</span>
                  <span class="fm-text">
                    <b>{s.title}</b>
                    <span>{ss.total ? `${ss.correct}/${ss.total}` : 'no slides matched'}</span>
                  </span>
                </button>
                {state === 'now' && s.points.length > 0 && (
                  <ol class="substeps">
                    {s.points.map((p, k) => (
                      <li key={k} class={k < readTo ? 'read' : k === readTo ? 'now' : ''}>{p.label || `Step ${k + 1}`}</li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
          {pending.map((id) => (
            <li key={id} class="next pending">
              <div class="fm-node"><span class="dot" /><span class="fm-text"><b>{data.ilos.get(id)?.text.slice(0, 48)}…</b><span>being written</span></span></div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}

/** One step of the lesson: a single idea, its place in the diagram, and its slide. */
function StepCard({ section, index, ilo, questions, onNext }: { section: LearnSection; index: number; ilo?: Ilo; questions: number; onNext: () => void }) {
  const [quote, setQuote] = useState(false);
  const n = section.points.length;
  const p = section.points[index];
  if (!p) {
    return (
      <div class="card paper explain step-card">
        <h2 class="ex-title">{section.title}</h2>
        {ilo && <div class="ilo-line">ILO: {ilo.text}</div>}
        <p class="ex-intro">{section.intro}</p>
        <button class="btn big" style={{ marginTop: '12px' }} onClick={onNext}>Skip this outcome for now</button>
      </div>
    );
  }
  const label = p.label || `Step ${index + 1}`;
  const nextLabel = index + 1 < n ? section.points[index + 1].label || `Step ${index + 2}` : null;
  return (
    <div class="card paper explain step-card">
      <div class="row small"><span class="tag">📖 Learn</span>{ilo && <span class="tag ok">🎯 {ilo.id}</span>}</div>
      {index === 0 && (
        <>
          <h2 class="ex-title">{section.title}</h2>
          {ilo && <div class="ilo-line">ILO: {ilo.text}</div>}
          {section.intro && <p class="ex-intro">{section.intro}</p>}
        </>
      )}
      <div class="step-dots" aria-label={`Step ${index + 1} of ${n}`}>
        {section.points.map((_, k) => <span key={k} class={k < index ? 'read' : k === index ? 'now' : ''} />)}
      </div>
      <div class="step-k">Step {index + 1} of {n}</div>
      <h3 class="step-label">{label}</h3>
      <p class="step-text">{p.text}</p>
      <button class="src-chip" onClick={() => setQuote(!quote)} aria-expanded={quote}>source</button>
      {quote && <div class="source small">“<mark>{p.quote}</mark>”</div>}
      <Visual v={section.visual} active={p.visualItem} />
      <ChunkSlide chunkId={p.chunkId} />
      {index > 0 && (
        <details class="so-far">
          <summary>Steps so far ({index})</summary>
          <ol>{section.points.slice(0, index).map((q, k) => <li key={k}><b>{q.label || `Step ${k + 1}`}:</b> {q.text}</li>)}</ol>
        </details>
      )}
      <button class="btn primary big" style={{ marginTop: '12px' }} onClick={onNext}>
        {questions ? `Got it: question on ${label} →` : nextLabel ? `Next: ${nextLabel} →` : 'Finish this section →'}
      </button>
    </div>
  );
}

/** The slide (rendered PDF page or PowerPoint pictures) a single step comes from. */
function ChunkSlide({ chunkId }: { chunkId: string }) {
  const ref = useLive(async () => {
    const d = await db();
    const c = await d.get('chunks', chunkId);
    if (!c) return null;
    const f = await d.get('files', c.fileId);
    const pics = (await d.getAllFromIndex('images', 'byChunk', c.id)).some((i) => i.status === 'active');
    return { c, f, pics };
  }, [chunkId]);
  if (!ref) return null;
  const { c, f, pics } = ref;
  const pdf = f && f.kind === 'pdf' && c.locator.kind === 'page' ? { file: f, page: c.locator.page } : undefined;
  if (!pdf && !pics) return null; // text-only slides add nothing to the step itself
  return (
    <div class="one-slide">
      <div class="slide-row">
        <SlideThumb chunkId={pics ? c.id : undefined} chunkText={c.text} where={`${c.fileName.replace(/\.[^.]+$/, '')} · ${locatorLabel(c.locator)}`} pdf={pdf} />
      </div>
    </div>
  );
}

/** The whole section at once, for re-reading from the lesson map. */
function ExplainCard({ section, ilo, onDone }: { section: LearnSection; ilo?: Ilo; onDone: () => void }) {
  const [openQuote, setOpenQuote] = useState<number | null>(null);
  return (
    <div class="card paper explain">
      <div class="row small"><span class="tag">📖 Re-read</span>{ilo && <span class="tag ok">🎯 {ilo.id}</span>}</div>
      <h2 class="ex-title">{section.title}</h2>
      {ilo && <div class="ilo-line">ILO: {ilo.text}</div>}
      {section.intro && <p class="ex-intro">{section.intro}</p>}
      {section.points.length > 0 && (
        <ol class="ex-points">
          {section.points.map((p, i) => (
            <li key={i} style={{ '--i': i }}>
              <span>{p.label && <b>{p.label}: </b>}{p.text}</span>
              <button class="src-chip" onClick={() => setOpenQuote(openQuote === i ? null : i)} aria-expanded={openQuote === i}>source</button>
              {openQuote === i && <div class="source small">“<mark>{p.quote}</mark>”</div>}
            </li>
          ))}
        </ol>
      )}
      <Visual v={section.visual} />
      <SlideStrip section={section} />
      <button class="btn primary big" style={{ marginTop: '12px' }} onClick={onDone}>← Back to the lesson</button>
    </div>
  );
}

/** The original slides behind this section: rendered PDF pages, or the passage text for PPTX and transcripts. */
function SlideStrip({ section }: { section: LearnSection }) {
  const refs = useLive(async () => {
    const d = await db();
    const chunks = (await Promise.all(section.chunkIds.map((id) => d.get('chunks', id)))).filter((c) => !!c);
    // slides with pictures first: they are what the explanation can't draw
    const withPics = await Promise.all(chunks.map(async (c) => (await d.getAllFromIndex('images', 'byChunk', c!.id)).some((i) => i.status === 'active')));
    const ranked = chunks.map((c, i) => ({ c: c!, pics: withPics[i] })).sort((a, b) => Number(b.pics) - Number(a.pics)).slice(0, 4);
    const files = await Promise.all(ranked.map((r) => d.get('files', r.c.fileId)));
    return ranked.map((r, i) => ({ c: r.c, f: files[i], pics: r.pics }));
  }, [section.id]);
  if (!refs?.length) return null;
  return (
    <details class="slides" open>
      <summary>From the slides ({refs.length})</summary>
      <div class="slide-row">
        {refs.map(({ c, f, pics }) => (
          <SlideThumb
            key={c.id}
            chunkId={pics ? c.id : undefined}
            chunkText={c.text}
            where={`${c.fileName.replace(/\.[^.]+$/, '')} · ${locatorLabel(c.locator)}`}
            pdf={f && f.kind === 'pdf' && c.locator.kind === 'page' ? { file: f, page: c.locator.page } : undefined}
          />
        ))}
      </div>
    </details>
  );
}
function SlideThumb({ chunkId, chunkText, where, pdf }: { chunkId?: string; chunkText: string; where: string; pdf?: { file: import('../types').SourceFile; page: number } }) {
  const [img, setImg] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  const { pics } = useSlidePics(chunkId);
  useEffect(() => {
    if (!pdf) return;
    let alive = true;
    void (async () => {
      const blob = await ensureBlob(pdf.file).catch(() => null);
      if (!blob || !alive) return;
      const c = await renderStoredPdfPage(blob, pdf.page, 900);
      if (alive) setImg(c.toDataURL('image/jpeg', 0.85));
    })();
    return () => { alive = false; };
  }, [pdf?.file.id, pdf?.page]);
  const text = <div class="slide-text">{big ? chunkText : chunkText.slice(0, 260) + (chunkText.length > 260 ? '…' : '')}</div>;
  return (
    <figure class={'slide-thumb' + (big ? ' big' : '')} onClick={() => setBig(!big)}>
      {img ? (
        <img src={img} alt={where} />
      ) : pics.length ? (
        <>
          <div class={'pic-grid n' + Math.min(big ? pics.length : 1, 3)}>
            {(big ? pics : pics.slice(0, 1)).map((p) => <img key={p.id} src={p.url} width={p.w} height={p.h} alt={where} />)}
            {!big && pics.length > 1 && <span class="pic-count">+{pics.length - 1}</span>}
          </div>
          {big && text}
        </>
      ) : (
        text
      )}
      <figcaption>{where}</figcaption>
    </figure>
  );
}

function LectureDone({ lecture, data, moduleId }: { lecture: Lecture; data: Data; moduleId: string }) {
  const st = lectureState(lecture, data.sections, data.items, data.latest);
  const next = data.lectures.find((l) => l.number > lecture.number && l.iloIds.length);
  const total = data.sections.reduce((n, s) => n + liveItems(s, data.items).length, 0);
  useEffect(() => { confetti(window.innerWidth / 2, 140, 90); }, []);
  return (
    <div class="card center">
      <Ring value={1} size={110} stroke={10} />
      <h2 style={{ marginTop: '10px' }}>{lecture.title}: lecture complete 🎉</h2>
      <p class="small muted">{data.sections.length} sections · {total} questions all answered correctly. From now on it comes back as spaced recap (FSRS), timed to just before you'd forget.</p>
      <button class="btn primary big" disabled={st.due === 0} onClick={() => go(`/m/${moduleId}/l/${lecture.id}/recap`)}>
        {st.due ? `Recap now (${st.due} due)` : 'Nothing due for recap yet'}
      </button>
      {next && <button class="btn big" style={{ marginTop: '8px' }} onClick={() => go(`/m/${moduleId}/l/${next.id}`)}>Next: L{next.number} · {next.title} →</button>}
      <button class="btn ghost" style={{ marginTop: '6px', width: '100%' }} onClick={() => go(`/m/${moduleId}`)}>All lectures</button>
    </div>
  );
}
