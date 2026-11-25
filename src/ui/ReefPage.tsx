/** #/reef: the big tank, your collection, and everything about the streak. */
import { useState } from 'preact/hooks';
import { TopBar, useLive } from './common';
import { ReefNotice, ReefTank, PickModal } from './Reef';
import { CreatureIcon } from '../reef/art';
import { LECTURE_SPECIALS, PICKS, SCHOOLS, STREAK_VISITORS, type Organism } from '../reef/catalogue';
import { loadReef, POLYP_XP, type ReefState } from '../reef/state';
import { chooseRestDay } from '../engine/game';
import { DAILY_GOAL, MAX_FREEZES, REPAIR_GOAL, TIERS, type DayInfo } from '../engine/streak';
import { notifyChange } from '../db';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ReefPage() {
  const reef = useLive(() => loadReef());
  const [picking, setPicking] = useState(false);
  if (!reef) return <><TopBar title="Your reef" back="/" /><div class="wrap"><p class="muted">Loading…</p></div></>;
  const g = reef.game;
  const si = g.streakInfo;
  return (
    <>
      <TopBar title="🪸 Your reef" back="/" />
      <div class="wrap">
        <div class="reef-card">
          <div class="reef-wrap"><ReefTank reef={reef} H={300} /></div>
          <ReefNotice reef={reef} />
        </div>
        {reef.pending.length > 0 && (
          <button class="btn primary big glow" onClick={() => setPicking(true)}>🎁 Choose a new creature ({reef.pending.length} waiting)</button>
        )}
        {picking && <PickModal reef={reef} onClose={() => setPicking(false)} />}

        <div class="card">
          <div class="reef-stats">
            <div><b>{reef.polyps}</b><span>polyps</span></div>
            <div><b>{reef.creatures}</b><span>creatures</span></div>
            <div><b>{reef.owned.length}</b><span>of {SCHOOLS.length + LECTURE_SPECIALS.length + STREAK_VISITORS.length + PICKS.length} species</span></div>
            <div><b>🔥 {g.streak}</b><span>day streak</span></div>
            <div><b>{si.longest}</b><span>longest</span></div>
            <div><b>❄️ {si.freezes}</b><span>freezes</span></div>
          </div>
          <p class="small muted" style={{ marginBottom: '0px' }}>
            Every {POLYP_XP} XP lays down a polyp, so the coral grows with every answer. Each module grows its own coral, each
            lecture you finish adds {3} fish to that module's school (and every 3rd lecture a special creature), every level-up
            lets you choose a creature, and long streaks bring big visitors.
          </p>
        </div>

        <StreakCard reef={reef} />

        <div class="card">
          <h2>🪸 Your corals</h2>
          {reef.modules.map((m) => (
            <div class="coral-row" key={m.id}>
              <div class="coral-sw" style={{ background: `linear-gradient(135deg, ${m.coral.c}, ${m.coral.c2})` }} />
              <div>
                <b>{m.coral.name}</b> <i class="small muted">{m.coral.latin}</i>
                <div class="small">{m.short}: {m.polyps} polyps from {m.xp.toLocaleString()} XP · {m.lecturesDone} lecture{m.lecturesDone === 1 ? '' : 's'} finished</div>
                <div class="small muted">{m.coral.fact}</div>
              </div>
            </div>
          ))}
        </div>

        <Collection reef={reef} title="🐟 Schools" sub="+3 fish for every lecture you finish in that module" list={SCHOOLS.slice(0, Math.max(1, reef.modules.length))} how={(o) => `Finish lectures in ${reef.modules[SCHOOLS.indexOf(o)]?.short ?? 'a module'}`} />
        <Collection reef={reef} title="✨ Lecture creatures" sub="Every 3rd lecture of a module brings one of these" list={LECTURE_SPECIALS} how={() => 'Finish every 3rd lecture of a module'} />
        <Collection reef={reef} title="🌊 Streak visitors" sub="Arrive when your streak reaches their length, and stay" list={STREAK_VISITORS} how={(o) => `Reach a ${o.streakAt}-day streak`} />
        <Collection reef={reef} title="🎁 Level-up creatures" sub="Choose one of three at every level-up" list={PICKS} how={() => 'Choose at a level-up'} />
      </div>
    </>
  );
}

function Collection({ reef, title, sub, list, how }: { reef: ReefState; title: string; sub: string; list: Organism[]; how: (o: Organism) => string }) {
  const owned = new Map(reef.owned.map((o) => [o.org.id, o]));
  const n = list.filter((o) => owned.has(o.id)).length;
  return (
    <div class="card">
      <div class="row spread"><h2>{title}</h2><span class="tag">{n}/{list.length}</span></div>
      <p class="small muted" style={{ marginTop: '0px' }}>{sub}</p>
      <div class="org-grid">
        {list.map((o) => {
          const have = owned.get(o.id);
          return have ? (
            <details class="org-tile" key={o.id}>
              <summary>
                <CreatureIcon org={o} size={64} />
                <b>{o.name}</b>
                {have.count > 1 && <span class="tag">×{have.count}</span>}
              </summary>
              <i class="small muted">{o.latin}</i>
              <p class="small">{o.fact}</p>
            </details>
          ) : (
            <div class="org-tile locked" key={o.id} title={how(o)}>
              <CreatureIcon org={o} size={64} locked />
              <b>{o.name}</b>
              <span class="small muted">{how(o)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StreakCard({ reef }: { reef: ReefState }) {
  const g = reef.game;
  const si = g.streakInfo;
  const setRest = async (day: number) => {
    await chooseRestDay(day);
    notifyChange();
  };
  return (
    <div class="card">
      <h2>🔥 Streak</h2>
      <div class="tiers">
        {TIERS.map((t) => (
          <div key={t.at} class={'tier' + (g.streak >= t.at ? ' on' : '') + (si.tier.at === t.at ? ' now' : '')}>
            <b>{t.at === 0 ? 'Start' : `${t.at} days`}</b>
            <span>{t.name}</span>
            <small>{t.desc}</small>
          </div>
        ))}
      </div>
      <h3>🧬 Your last 5 weeks, as a gel</h3>
      <Gel days={si.days.slice(-35)} />
      <p class="small muted">Each lane is a day; the brighter and thicker the band, the more you answered. ❄️ a freeze covered it, 🩹 repaired, 💤 rest day.</p>
      <ul class="small streak-rules">
        <li><b>Any answer counts.</b> One question keeps the streak alive on a bad day.</li>
        <li><b>❄️ Cryptobiosis freezes</b> ({si.freezes}/{MAX_FREEZES}): every 7 days of streak earns one. A missed day uses one automatically, like a tardigrade drying out and reviving later.</li>
        <li><b>🩹 Repair window:</b> miss a day with no freeze and you have 2 days to save the streak with a big day of {REPAIR_GOAL} answers.</li>
        <li><b>⚡ Streak boost:</b> +10% XP for each full week of streak (up to +50%), on days you reach your goal of {DAILY_GOAL}.{si.boostToday > 0 ? ` Today: +${Math.round(si.boostToday * 100)}%.` : ''}</li>
        <li><b>🤍 Bleaching:</b> each missed day drains colour from the coral. One study day brings it straight back.</li>
      </ul>
      <label class="field">💤 Rest day (never breaks the streak; starts tomorrow)</label>
      <select value={String(si.restDay)} onChange={(e) => void setRest(Number(e.currentTarget.value))}>
        <option value="-1">No rest day</option>
        {WEEKDAYS.map((d, i) => <option value={String(i)}>{d}</option>)}
      </select>
    </div>
  );
}

function Gel({ days }: { days: DayInfo[] }) {
  const pad = 35 - days.length;
  const cells: (DayInfo | null)[] = [...Array(Math.max(0, pad)).fill(null), ...days];
  const lane = 30, gap = 6, w = 7 * lane + 8 * gap, rowH = 46;
  return (
    <svg viewBox={`0 0 ${w} ${rowH * 5 + 8}`} class="gel" role="img" aria-label="Study days over the last five weeks">
      <rect width={w} height={rowH * 5 + 8} rx="10" fill="#141b2b" />
      {cells.map((d, i) => {
        const row = Math.floor(i / 7), col = i % 7;
        const x = gap + col * (lane + gap), y = 6 + row * rowH;
        const amt = d ? Math.min(1, Math.log10(1 + d.answers) / Math.log10(1 + DAILY_GOAL * 2)) : 0;
        const label = d ? `${new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.answers} answers · ${d.status}` : '';
        return (
          <g key={i}>
            <title>{label}</title>
            <rect x={x} y={y} width={lane} height={rowH - 8} rx="3" fill="#1d2740" />
            <rect x={x + 3} y={y + 2} width={lane - 6} height="4" rx="1" fill="#0b1020" />
            {d && d.answers > 0 && (
              <rect x={x + 3} y={y + 22 - amt * 6} width={lane - 6} height={2 + amt * 10} rx="2" fill="#ff8fc7" opacity={0.35 + amt * 0.65} style={{ filter: 'drop-shadow(0 0 3px #ff6fb5)' }} />
            )}
            {d && d.status === 'frozen' && <text x={x + lane / 2} y={y + 27} text-anchor="middle" font-size="12">❄️</text>}
            {d && d.status === 'repaired' && <text x={x + lane / 2} y={y + 27} text-anchor="middle" font-size="12">🩹</text>}
            {d && d.status === 'rest' && <text x={x + lane / 2} y={y + 27} text-anchor="middle" font-size="12">💤</text>}
            {d && d.status === 'today' && <rect x={x} y={y} width={lane} height={rowH - 8} rx="3" fill="none" stroke="#ffd166" stroke-dasharray="3 2" />}
            {d && <text x={x + lane / 2} y={y + rowH - 11} text-anchor="middle" font-size="7" fill="#7f8db0">{new Date(d.date).getDate()}</text>}
          </g>
        );
      })}
    </svg>
  );
}

