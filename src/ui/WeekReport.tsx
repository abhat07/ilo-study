import { loadWeek, markReportSeen, reportToShow, weekStart, type WeekReport } from '../reef/report';
import { CreatureIcon } from '../reef/art';
import { notifyChange } from '../db';
import { useLive } from './common';

const fmt = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Home: the weekly reef report on Sunday (this week) and Monday–Tuesday (last week), until closed. */
export function WeekReportHome() {
  const r = useLive(async () => {
    const start = await reportToShow();
    return start === null ? null : loadWeek(start);
  });
  if (!r) return null;
  if (!r.answered && !r.lectures.length) return null; // nothing to report
  return <WeekReportCard r={r} onClose={() => void markReportSeen(r.start).then(notifyChange)} />;
}

/** Reef page: this week so far. */
export function WeekSoFar() {
  const r = useLive(() => loadWeek(weekStart(Date.now())));
  return r ? <WeekReportCard r={r} /> : null;
}

export function WeekReportCard({ r, onClose }: { r: WeekReport; onClose?: () => void }) {
  const ongoing = Date.now() < r.end;
  const diff = r.xp - r.xpLastWeek;
  const goalDays = r.days.filter((d) => d.goal).length;
  const studied = r.days.filter((d) => d.answers > 0).length;
  const fish = r.lectures.reduce((s, l) => s + l.fish, 0);
  const specials = r.lectures.map((l) => l.special).filter((o) => !!o);
  const arrivals = [...specials, ...r.picks];
  return (
    <div class="card week-report">
      <div class="row spread">
        <h2>🪸 {ongoing ? 'Your reef this week' : 'Your reef last week'}</h2>
        <span class="small muted">{fmt(r.start)} – {fmt(r.end - 1)}</span>
      </div>
      {r.bestWeekEver && !ongoing && <div class="reef-note ok">🏆 Your best week yet!</div>}
      <div class="wk-stats">
        <div><b>+{r.xp}</b><span>XP{r.xpLastWeek || r.xp ? ` (${diff >= 0 ? '+' : ''}${diff} vs the week before)` : ''}</span></div>
        <div><b>🪸 {r.polyps}</b><span>polyps grown</span></div>
        <div><b>{r.answered}</b><span>answered · {r.answered ? Math.round((r.correct / r.answered) * 100) : 0}% right</span></div>
        <div><b>🐟 {fish}</b><span>fish from {r.lectures.length} lecture{r.lectures.length === 1 ? '' : 's'}</span></div>
      </div>
      <div class="wk-days" aria-label={`Studied on ${studied} of 7 days, daily goal on ${goalDays}`}>
        {r.days.map((d, i) => (
          <span key={i} class={(d.goal ? 'goal' : d.answers ? 'some' : '') + (d.date > Date.now() ? ' future' : '')} title={`${fmt(d.date)}: ${d.answers} answers`}>
            <i>{DOW[i]}</i>
          </span>
        ))}
      </div>
      <p class="small muted" style={{ margin: '6px 0 0' }}>
        Studied on {studied} day{studied === 1 ? '' : 's'}, daily goal on {goalDays}.
        {r.bestDay && r.bestDay.answers > 0 && ` Best day: ${new Date(r.bestDay.date).toLocaleDateString('en-GB', { weekday: 'long' })} (${r.bestDay.answers} answers).`}
      </p>
      {arrivals.length > 0 && (
        <div class="wk-arrivals">
          <div class="small muted">New in your reef:</div>
          <div class="row">
            {arrivals.map((o, i) => (
              <span key={i} class="wk-arrival" title={o!.fact}><CreatureIcon org={o!} size={40} /><small>{o!.name}</small></span>
            ))}
          </div>
        </div>
      )}
      {onClose && <button class="btn sm" style={{ marginTop: '10px' }} onClick={onClose}>Nice! Close</button>}
    </div>
  );
}
