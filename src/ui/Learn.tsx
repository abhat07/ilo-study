/**
 * A lecture's lesson path: for each ILO, read a short explanation (points + visual + the slides), then
 * answer questions on every point. Wrong answers repeat until right; spaced reviews from earlier sections
 * and the previous lecture are mixed in; link questions tie ideas together. The ring only reaches 100%
 * when everything is right, then the lecture moves to spaced recap.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { byModule, db, notifyChange } from '../db';
import type { Ilo, Item, LearnSection, Lecture } from '../types';
import { endSession, startSession, type SessionCtx } from '../engine/session';
import { buildLectures } from '../learn/lectures';
import { ensureSections, isGeneratingLecture } from '../learn/sections';
import { CORRECT, latestScores, lectureState, liveItems, nextLessonItem, sectionState } from '../learn/progress';
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

type Mode = 'loading' | 'explain' | 'quiz' | 'sectionDone' | 'done' | 'reread' | 'waiting' | 'error';

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
  return {
    lecture,
    lectures: lectures.sort((a, b) => a.number - b.number),
    sections: sections.filter((s) => s.lectureId === lectureId).sort((a, b) => a.order - b.order),
    allSections: sections,
    items: new Map(items.map((i) => [i.id, i])),
    latest: latestScores(attempts),
    ilos: new Map(ilos.map((i) => [i.id, i])),
  };
}
type Data = Awaited<ReturnType<typeof loadAll>>;

export function Learn({ moduleId, lectureId }: { moduleId: string; lectureId: string }) {
  const data = useLive(() => loadAll(moduleId, lectureId), [lectureId]);
  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState('');
  const [item, setItem] = useState<{ it: Item; review: boolean } | null>(null);
  const [reread, setReread] = useState<LearnSection | null>(null);
  const [doneSection, setDoneSection] = useState<LearnSection | null>(null);
  const asked = useRef<string[]>([]);
  const ctxRef = useRef<SessionCtx | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const started = useRef(false);
  /** the section you were being quizzed on, so finishing it shows its completion screen */
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
    if (!data || !st || mode === 'quiz' || mode === 'sectionDone' || mode === 'reread') return;
    if (current) {
      setMode(current.seenAt ? 'quiz' : 'explain');
      return;
    }
    if (st.done) return setMode('done');
    if (data.sections.length < (data.lecture?.iloIds.length ?? 0)) return setMode(error ? 'error' : isGeneratingLecture(lectureId) || data.sections.length === 0 ? 'waiting' : 'error');
    setMode('done');
  }, [data, current?.id, current?.seenAt, st?.done, error]);

  useEffect(() => {
    document.body.dataset.stage = mode === 'done' ? 'reward' : 'retrieve';
  }, [mode]);

  // first question when entering quiz mode
  useEffect(() => {
    if (mode === 'quiz' && !item && data && current) void askNext();
  }, [mode, current?.id, !!data]);

  async function ensureCtx(): Promise<SessionCtx> {
    if (!ctxRef.current) ctxRef.current = await startSession(moduleId);
    return ctxRef.current;
  }

  async function askNext() {
    const fresh = await loadAll(moduleId, lectureId);
    const s = fresh.lecture ? lectureState(fresh.lecture, fresh.sections, fresh.items, fresh.latest) : null;
    // the section you were working on is now complete: celebrate it before moving on
    if (activeSec.current && activeSec.current !== s?.currentSectionId) {
      const finished = fresh.sections.find((x) => x.id === activeSec.current) ?? null;
      activeSec.current = null;
      setItem(null);
      setDoneSection(finished);
      setMode(finished ? 'sectionDone' : 'loading');
      if (finished) confetti(window.innerWidth / 2, 160, 60);
      return;
    }
    const sec = fresh.sections.find((x) => x.id === s?.currentSectionId);
    if (!sec) {
      setItem(null);
      setMode(s?.done ? 'done' : 'waiting');
      return;
    }
    if (!sec.seenAt) {
      setItem(null);
      setMode('explain');
      return;
    }
    const prevLecture = fresh.lectures.filter((l) => l.number > 0 && l.number < (fresh.lecture?.number ?? 0)).pop();
    const reviewPool = [
      ...fresh.sections.filter((x) => x.order < sec.order),
      ...(prevLecture ? fresh.allSections.filter((x) => x.lectureId === prevLecture.id) : []),
    ].flatMap((x) => liveItems(x, fresh.items)).filter((i) => i.seenCount > 0);
    await ensureCtx();
    const pick = nextLessonItem({ section: sec, items: fresh.items, latest: fresh.latest, askedThisSitting: asked.current, reviewPool });
    if (!pick) {
      // section complete
      setItem(null);
      setDoneSection(sec);
      setMode('sectionDone');
      confetti(window.innerWidth / 2, 160, 60);
      return;
    }
    activeSec.current = sec.id;
    asked.current.push(pick.item.id);
    setItem({ it: pick.item, review: pick.review });
    setMode('quiz');
  }

  async function markRead(sec: LearnSection) {
    await (await db()).put('sections', { ...sec, seenAt: Date.now(), updatedAt: Date.now() });
    notifyChange();
    setMode('quiz');
    setItem(null);
    await askNext();
  }

  async function onAnswered(_a: unknown, m: { score: number }) {
    if (m.score >= 0.99) confetti(window.innerWidth / 2, 180, 30);
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

  return (
    <div class="has-doodles learn-page">
      <Doodles set="session" rotate={asked.current.length} />
      <TopBar title={title} back={`/m/${moduleId}`} />
      <LessonRail data={data} lecture={lecture} st={st!} currentId={current?.id} onOpen={(s) => { setReread(s); setMode('reread'); }} />
      <div class="wrap">
        <LessonHeader lecture={lecture} st={st!} current={current} data={data} />

        {mode === 'loading' && <div class="center muted"><Spinner /></div>}
        {mode === 'waiting' && (
          <div class="card center">
            <Spinner />
            <p>{data.sections.length ? 'Writing the next section from your slides…' : 'Writing your lesson from the slides…'}</p>
            <p class="muted small">Each section explains one ILO in short points, then tests every point.</p>
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

        {mode === 'explain' && current && <ExplainCard section={current} ilo={data.ilos.get(current.iloId)} count={liveItems(current, data.items).length} onDone={() => markRead(current)} />}

        {mode === 'reread' && reread && (
          <ExplainCard section={reread} ilo={data.ilos.get(reread.iloId)} count={0} reread onDone={() => { setReread(null); setMode(current ? (current.seenAt ? 'quiz' : 'explain') : 'done'); }} />
        )}

        {mode === 'quiz' && item && ctxRef.current && (
          <QuestionCard
            key={`${item.it.id}-${asked.current.length}`}
            ctx={ctxRef.current}
            item={item.it}
            ilos={data.ilos}
            tags={[
              ...(item.review ? [{ text: '🔁 spaced review', cls: 'warn' }] : []),
              ...(item.it.kind === 'link' ? [{ text: '🔗 links topics', cls: 'ok' }] : []),
              ...(!item.review && (data.latest.get(item.it.id)?.score ?? 1) < CORRECT ? [{ text: '↻ try again', cls: 'warn' }] : []),
            ]}
            onAnswered={onAnswered}
            onNext={() => void askNext()}
            onXp={() => {}}
          />
        )}
        {mode === 'quiz' && !item && <div class="center muted"><Spinner /></div>}

        {mode === 'sectionDone' && doneSection && (
          <div class="card center section-done">
            <div class="trophy" aria-hidden="true">✅</div>
            <h2>{doneSection.title}: complete</h2>
            <p class="muted small">Every question in this section answered correctly. It will come back in spaced recap.</p>
            <button class="btn primary big" onClick={() => { setDoneSection(null); setMode('loading'); void askNext(); }}>Continue →</button>
          </div>
        )}

        {mode === 'done' && <LectureDone lecture={lecture} data={data} moduleId={moduleId} />}
      </div>
    </div>
  );
}

function LessonHeader({ lecture, st, current, data }: { lecture: Lecture; st: ReturnType<typeof lectureState>; current: LearnSection | null; data: Data }) {
  const idx = current ? data.sections.findIndex((s) => s.id === current.id) + 1 : data.sections.length;
  const cs = current ? sectionState(current, data.items, data.latest) : null;
  return (
    <div class="lesson-head card">
      <Ring value={st.frac} size={58} />
      <div class="lh-text">
        <div class="small muted">Lecture {lecture.number || ''} · section {Math.max(1, idx)} of {st.expected}</div>
        <b>{current?.title ?? (st.done ? 'Lecture complete' : lecture.title)}</b>
        {cs && cs.total > 0 && (
          <div class="small muted">{cs.correct}/{cs.total} questions right in this section{cs.correct < cs.total && current?.seenAt ? ' · wrong ones repeat until right' : ''}</div>
        )}
      </div>
    </div>
  );
}

function LessonRail({ data, lecture, st, currentId, onOpen }: { data: Data; lecture: Lecture; st: ReturnType<typeof lectureState>; currentId?: string; onOpen: (s: LearnSection) => void }) {
  const pending = lecture.iloIds.filter((id) => !data.sections.some((s) => s.iloId === id));
  return (
    <aside class="rail lesson-rail" aria-label="Lesson map">
      <div class="rail-card center">
        <Ring value={st.frac} size={96} stroke={9} />
        <div class="small muted" style={{ marginTop: '6px' }}>{st.done ? `Complete · ${st.due} due for recap` : 'Lecture progress'}</div>
      </div>
      <div class="rail-card">
        <div class="rail-h">Lesson map</div>
        <ol class="flow-map">
          {data.sections.map((s) => {
            const ss = sectionState(s, data.items, data.latest);
            const state = ss.done ? 'done' : s.id === currentId ? 'now' : 'next';
            return (
              <li key={s.id} class={state}>
                <button class="fm-node" disabled={!ss.done} onClick={() => onOpen(s)} title={ss.done ? 'Re-read this section' : ''}>
                  <span class="dot">{ss.done ? '✓' : ''}</span>
                  <span class="fm-text">
                    <b>{s.title}</b>
                    <span>{ss.total ? `${ss.correct}/${ss.total}` : 'no slides matched'}</span>
                  </span>
                </button>
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

function ExplainCard({ section, ilo, count, onDone, reread }: { section: LearnSection; ilo?: Ilo; count: number; onDone: () => void; reread?: boolean }) {
  const [openQuote, setOpenQuote] = useState<number | null>(null);
  return (
    <div class="card paper explain">
      <div class="row small"><span class="tag">📖 Learn</span>{ilo && <span class="tag ok">🎯 {ilo.id}</span>}</div>
      <h2 class="ex-title">{section.title}</h2>
      {ilo && <div class="ilo-line">ILO: {ilo.text}</div>}
      {section.intro && <p class="ex-intro">{section.intro}</p>}
      {section.points.length > 0 && (
        <ol class="ex-points">
          {section.points.map((p, i) => (
            <li key={i} style={{ '--i': i }}>
              <span>{p.text}</span>
              <button class="src-chip" onClick={() => setOpenQuote(openQuote === i ? null : i)} aria-expanded={openQuote === i}>source</button>
              {openQuote === i && <div class="source small">“<mark>{p.quote}</mark>”</div>}
            </li>
          ))}
        </ol>
      )}
      <Visual v={section.visual} />
      <SlideStrip section={section} />
      {section.points.length > 0 || reread ? (
        <button class="btn primary big" style={{ marginTop: '12px' }} onClick={onDone}>
          {reread ? '← Back to the lesson' : `I've read this: test me (${count} question${count === 1 ? '' : 's'})`}
        </button>
      ) : (
        <button class="btn big" style={{ marginTop: '12px' }} onClick={onDone}>Skip this outcome for now</button>
      )}
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
