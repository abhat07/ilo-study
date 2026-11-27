/** #/plan: exam countdown and the day-by-day plan; plus the home card, write-ahead and module-wide ILO cards. */
import { useState } from 'preact/hooks';
import { byModule } from '../db';
import { loadPlan } from '../plan/load';
import type { DayTask, Plan } from '../plan/plan';
import { examDate, moduleAims, setExamDate } from '../plan/store';
import { batches, cancelBatch, planWriteAhead, writeAhead, type BatchRec } from '../learn/batch';
import { AiUnavailableError } from '../ai/client';
import { fmtMin } from '../learn/progress';
import { sortedModules } from '../reef/state';
import { Bar, TopBar, go, useLive } from './common';
import { toast } from './fun';

const fmtDate = (t: number, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) => new Date(t).toLocaleDateString('en-GB', opts);

function taskPath(t: DayTask): string {
  if (t.kind === 'learn' && t.lectureId) return `/m/${t.moduleId}/l/${t.lectureId}`;
  return `/m/${t.moduleId}/study`;
}

function TaskRow({ t }: { t: DayTask }) {
  if (t.kind === 'exam') return <li class="task exam">📝 <b>{t.label}</b> · good luck!</li>;
  return (
    <li class={'task ' + t.kind}>
      <span>{t.kind === 'learn' ? '📖' : '🔁'} {t.label}</span>
      <span class="small muted">{t.minutes ? `≈ ${fmtMin(t.minutes)}` : ''}</span>
      <button class="btn sm" onClick={() => go(taskPath(t))}>Go</button>
    </li>
  );
}

/** Home: days to each exam and what to do today. */
export function ExamCard() {
  const plan = useLive(() => loadPlan());
  if (!plan) return null;
  const upcoming = plan.modules.filter((m) => m.phase === 'learn' || m.phase === 'review');
  if (!upcoming.length) return null;
  const today = plan.today.filter((t) => t.kind !== 'exam').slice(0, 4);
  const mins = today.reduce((s, t) => s + t.minutes, 0);
  return (
    <div class="card exam-card">
      <div class="row spread">
        <h2>🗓 Exam countdown</h2>
        <a class="small" href="#/plan">Full plan</a>
      </div>
      <div class="countdowns">
        {upcoming.map((m) => (
          <div key={m.id} class={'cd' + (m.daysLeft <= 7 ? ' soon' : '')}>
            <b>{m.daysLeft}</b>
            <span>day{m.daysLeft === 1 ? '' : 's'} to {m.short}</span>
            <small>{fmtDate(m.examAt)} · {m.lecturesDone}/{m.lecturesTotal} lectures</small>
          </div>
        ))}
      </div>
      {today.length > 0 ? (
        <>
          <div class="small muted" style={{ margin: '8px 0 4px' }}>Today{mins ? ` (≈ ${fmtMin(mins)})` : ''}:</div>
          <ul class="tasks">{today.map((t, i) => <TaskRow key={i} t={t} />)}</ul>
        </>
      ) : (
        <p class="small muted">Nothing scheduled today: every lesson is done. Recap and weak spots keep it fresh.</p>
      )}
    </div>
  );
}

export function PlanPage() {
  const plan = useLive(() => loadPlan());
  const mods = useLive(async () => Promise.all((await sortedModules()).map(async (m) => ({ m, date: await examDate(m.id) }))));
  return (
    <>
      <TopBar title="🗓 Exam plan" back="/" />
      <div class="wrap">
        {!plan && <p class="muted">Working out your plan…</p>}
        {plan && <Overview plan={plan} />}
        <div class="card">
          <h2>📅 Exam dates</h2>
          {mods?.map(({ m, date }) => (
            <label key={m.id} class="row spread exam-date">
              <span><b>{m.short}</b> <span class="small muted">{m.name}</span></span>
              <input type="date" value={date} onChange={(e) => void setExamDate(m.id, e.currentTarget.value).then(() => toast(`📅 ${m.short} exam date saved`))} />
            </label>
          ))}
          <p class="small muted">Saved and synced to your other devices. Clear a date to leave a module out of the plan.</p>
        </div>
        {mods?.map(({ m }) => <WriteAheadCard key={m.id} moduleId={m.id} title={`✍️ Write ${m.short} lessons ahead`} />)}
        {plan && <Calendar plan={plan} />}
      </div>
    </>
  );
}

function Overview({ plan }: { plan: Plan }) {
  const live = plan.modules.filter((m) => m.phase !== 'none');
  return (
    <div class="card">
      <div class="countdowns">
        {live.map((m) => (
          <div key={m.id} class={'cd' + (m.phase === 'past' ? ' past' : m.daysLeft <= 7 ? ' soon' : '')}>
            <b>{m.phase === 'past' ? '✓' : m.daysLeft}</b>
            <span>{m.phase === 'past' ? `${m.short} exam done` : `day${m.daysLeft === 1 ? '' : 's'} to ${m.short}`}</span>
            <small>{fmtDate(m.examAt)}</small>
          </div>
        ))}
      </div>
      {live.filter((m) => m.phase === 'learn' || m.phase === 'review').map((m) => (
        <div key={m.id} class="plan-mod">
          <div class="row spread small">
            <b>{m.short}</b>
            <span class="muted">{m.lecturesDone}/{m.lecturesTotal} lectures · {m.learnLeft ? `≈ ${fmtMin(m.learnLeft)} of lessons left` : 'all lessons done'}</span>
          </div>
          <Bar value={m.lecturesTotal ? m.lecturesDone / m.lecturesTotal : 0} thin />
          <div class="small muted">
            {m.phase === 'learn'
              ? m.learnLeft
                ? `≈ ${fmtMin(m.perDay)} a day finishes every lesson by ${fmtDate(m.learnEnds)}; the last ${m.reviewDays} day${m.reviewDays === 1 ? '' : 's'} before the exam are for review.`
                : `Every lesson is done: keep it fresh with recap until the last ${m.reviewDays} days, which are for review.`
              : 'Review phase: weak spots, recap and exam-style questions.'}
          </div>
        </div>
      ))}
      {plan.perDay > 0 && (
        <p class={'small ' + (plan.perDay > 120 ? 'notice' : 'muted')}>
          In total ≈ <b>{fmtMin(plan.perDay)}</b> of lessons a day{plan.perDay > 120 ? ': a lot. Writing lessons ahead and starting today makes it lighter.' : '.'} Missed a day? The plan
          spreads what's left over the days remaining, so there is nothing to catch up.
        </p>
      )}
      {plan.today.length > 0 && (
        <>
          <h3>Today</h3>
          <ul class="tasks">{plan.today.map((t, i) => <TaskRow key={i} t={t} />)}</ul>
        </>
      )}
      {plan.weak.length > 0 && (
        <>
          <h3>Weak spots</h3>
          <ul class="small weak-list">
            {plan.weak.slice(0, 6).map((w) => (
              <li key={w.id}><a href={`#/m/${w.moduleId}/study`}><b>{w.id}</b></a> {w.text} <span class="muted">({Math.round(w.mastery * 100)}%)</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Calendar({ plan }: { plan: Plan }) {
  const [all, setAll] = useState(false);
  const days = all ? plan.days : plan.days.slice(0, 14);
  if (!days.length) return null;
  return (
    <div class="card">
      <h2>🗓 Day by day</h2>
      <p class="small muted">Recap questions come on top, timed by spaced repetition. This updates itself as you go.</p>
      <ol class="cal">
        {days.map((d, i) => (
          <li key={d.key} class={(i === 0 ? 'today ' : '') + (d.tasks.some((t) => t.kind === 'exam') ? 'examday' : '')}>
            <div class="cal-d"><b>{i === 0 ? 'Today' : fmtDate(d.date, { weekday: 'short' })}</b><span>{fmtDate(d.date, { day: 'numeric', month: 'short' })}</span></div>
            <div class="cal-t">
              {d.tasks.length === 0 && <span class="muted small">Free</span>}
              {d.tasks.map((t, k) => (
                <span key={k} class={'cal-chip ' + t.kind}>{t.kind === 'exam' ? '📝 ' : t.kind === 'review' ? '🔁 ' : ''}{t.kind === 'review' ? `${t.short} review` : t.label}{t.minutes ? ` · ${fmtMin(t.minutes)}` : ''}</span>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {plan.days.length > 14 && <button class="btn ghost" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${plan.days.length} days`}</button>}
    </div>
  );
}

/** Write every lesson the module still needs as one half-price batch. */
export function WriteAheadCard({ moduleId, title = '✍️ Write lessons ahead' }: { moduleId: string; title?: string }) {
  const info = useLive(async () => {
    const all = (await batches()).filter((b) => b.moduleId === moduleId);
    const running = all.find((b) => b.status === 'running');
    const last = all.find((b) => b.status === 'done');
    const mod = (await sortedModules()).find((m) => m.id === moduleId);
    const ready = mod?.iloStatus === 'confirmed' && (await byModule('ilos', moduleId)).length > 0;
    const todo = ready && !running ? await planWriteAhead(moduleId) : null;
    return { running, last, todo, ready };
  }, [moduleId]);
  const [busy, setBusy] = useState(false);
  if (!info?.ready) return null;
  const { running, last, todo } = info;
  const send = async () => {
    setBusy(true);
    try {
      const rec = await writeAhead(moduleId);
      toast(rec ? `✍️ ${rec.jobs.length} lessons sent to be written at half price` : 'Nothing left to write');
    } catch (e) {
      toast(e instanceof AiUnavailableError ? e.message : `Couldn't send them: ${(e as Error).message}`, 5000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="card">
      <h2>{title}</h2>
      {running ? (
        <RunningBatch rec={running} />
      ) : todo && todo.jobs.length ? (
        <>
          <p class="small">
            {todo.jobs.length} lesson section{todo.jobs.length === 1 ? '' : 's'} across {todo.lectures} lecture{todo.lectures === 1 ? '' : 's'} still need writing.
            Send them all now as one batch at <b>half price</b> (≈ £{todo.estimate.toFixed(3)}): usually ready within an hour, at most 24 hours,
            and you can close the app meanwhile.
          </p>
          <button class="btn primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : `Write ${todo.jobs.length} ahead (≈ £${todo.estimate.toFixed(3)})`}</button>
        </>
      ) : (
        <p class="small muted">Every lesson in this module is written{last ? ` (last batch: ${last.written} written ${fmtDate(last.endedAt ?? last.createdAt)})` : ''}.</p>
      )}
    </div>
  );
}

function RunningBatch({ rec }: { rec: BatchRec }) {
  const mins = Math.max(1, Math.round((Date.now() - rec.createdAt) / 60_000));
  return (
    <>
      <p class="small">⏳ {rec.jobs.length} lessons are being written at half price (sent {mins} min ago). They appear by themselves when ready; the app checks every couple of minutes while it's open.</p>
      <button class="btn sm ghost" onClick={() => confirm('Cancel the batch? Lessons already finished are still collected.') && void cancelBatch(rec).catch((e) => toast(String((e as Error).message)))}>Cancel</button>
    </>
  );
}

/** Module page: the module-wide ILOs, and which lessons feed into each. */
export function AimsCard({ moduleId }: { moduleId: string }) {
  const data = useLive(async () => {
    const [aims, sections] = await Promise.all([moduleAims(moduleId), byModule('sections', moduleId)]);
    return { aims, sections };
  }, [moduleId]);
  if (!data) return null;
  return (
    <div class="card">
      <div class="row spread">
        <h2>🧭 Module-wide ILOs</h2>
        <a class="small" href={`#/m/${moduleId}/ilos`}>{data.aims.length ? 'Edit' : 'Add them'}</a>
      </div>
      {data.aims.length === 0 ? (
        <p class="small muted">The module's overarching outcomes. Add them on the ILO page (tick "Module-wide ILO"): lessons then say how each lecture feeds into them and ask essay-style questions that connect the two.</p>
      ) : (
        <ul class="small aims">
          {data.aims.map((a) => {
            const feeds = data.sections.filter((s) => s.aims?.includes(a.id));
            return (
              <li key={a.id}>
                <b>{a.id}</b> {a.text}
                <div class="muted">{feeds.length ? `${feeds.length} lesson section${feeds.length === 1 ? '' : 's'} feed into this: ${feeds.slice(0, 4).map((s) => s.title).join('; ')}${feeds.length > 4 ? '…' : ''}` : 'No lessons linked yet (they link as they are written).'}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
