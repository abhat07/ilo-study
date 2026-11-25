import { lectureOverview, nextLecture, type LectureRow } from '../learn/overview';
import { fmtMin } from '../learn/progress';
import { go, useLive } from './common';
import { Ring } from './Visual';

/** The module's lectures, each with its progress ring, and what to do next. */
export function LectureList({ moduleId }: { moduleId: string }) {
  const rows = useLive(() => lectureOverview(moduleId), [moduleId]);
  if (!rows) return null;
  if (!rows.length) {
    return (
      <div class="card">
        <h2>📚 Lectures</h2>
        <p class="small muted">Confirm the ILOs first, then each lecture gets its own lesson.</p>
      </div>
    );
  }
  const next = nextLecture(rows);
  const totalDue = rows.reduce((n, r) => n + r.st.due, 0);
  return (
    <div class="card">
      <div class="row spread">
        <h2>📚 Lectures</h2>
        <a class="small" href={`#/m/${moduleId}/lectures`}>Edit lectures</a>
      </div>
      <p class="small muted" style={{ marginTop: '0px' }}>
        Each lecture is a lesson taught in small steps from your slides: one idea, a question on it, a question linking it back,
        then the next idea. Wrong answers repeat until right; at 100% the lecture moves to spaced recap. Times are estimates
        and adjust to your own pace once you have answered a few questions.
      </p>
      {totalDue > 0 && <div class="pill-row" style={{ marginBottom: '8px' }}><span class="pill hot">⏰ {totalDue} recap questions due</span></div>}
      <div class="lec-list">
        {rows.map((r) => {
          const L = r.lecture;
          const isNext = next?.lecture.id === L.id;
          const label = r.st.done ? (r.st.due ? `Recap (${r.st.due})` : 'Review') : r.st.started ? 'Continue' : 'Start';
          const path = r.st.done && r.st.due ? `/m/${moduleId}/l/${L.id}/recap` : `/m/${moduleId}/l/${L.id}`;
          return (
            <div key={L.id} class={'lec-row' + (isNext ? ' next' : '') + (r.st.done ? ' done' : '')}>
              <Ring value={r.st.frac} size={52} stroke={6} />
              <div class="lec-main">
                <div class="small muted">{L.number ? `Lecture ${L.number}` : 'Not tied to a lecture'}{isNext ? ' · up next' : ''}</div>
                <b>{L.title}</b>
                <div class="small muted">
                  {L.iloIds.length} ILO{L.iloIds.length === 1 ? '' : 's'} · {L.fileIds.length} file{L.fileIds.length === 1 ? '' : 's'}
                  {r.questions ? ` · ${r.correct}/${r.questions} questions right` : ''}
                </div>
                {L.iloIds.length > 0 && <div class="small lec-time">⏱ {timeText(r)}</div>}
              </div>
              {L.iloIds.length > 0 ? (
                <button class={'btn sm' + (isNext || (r.st.done && r.st.due) ? ' primary' : '')} onClick={() => go(path)}>{label}</button>
              ) : (
                <span class="small muted">no ILOs</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "≈ 25 min", "≈ 12 min left", "recap ≈ 4 min" */
export function timeText(r: LectureRow): string {
  if (r.st.done) return r.mins.recap ? `recap ≈ ${fmtMin(r.mins.recap)}` : `≈ ${fmtMin(r.mins.total)} in total · nothing due`;
  if (r.st.started) return `≈ ${fmtMin(r.mins.left)} left of ≈ ${fmtMin(r.mins.total)}`;
  return `≈ ${fmtMin(r.mins.total)}`;
}
