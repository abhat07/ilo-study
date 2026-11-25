/** The reef tank (home screen and reef page) and the level-up creature picker. */
import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { Coral, Creature, CreatureIcon, mix, rng } from '../reef/art';
import type { Organism } from '../reef/catalogue';
import { choosePick, offersFor, type ReefState } from '../reef/state';
import { REPAIR_GOAL } from '../engine/streak';
import { go } from './common';
import { toast } from './fun';
import { MotionChip } from './motion';

const W = 480;
const f = (n: number) => n.toFixed(1);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

interface Placed { y: number; el: JSX.Element }

function Swimmer(p: { x: number; y: number; dx: number; dur: number; delay: number; scale: number; opacity?: number; children: JSX.Element; bob?: boolean }) {
  return (
    <g transform={`translate(${f(p.x)} ${f(p.y)})`} opacity={p.opacity}>
      <g class="rf-swim" style={{ '--dx': `${f(p.dx)}px`, animationDuration: `${f(p.dur)}s`, animationDelay: `${f(p.delay)}s` }}>
        <g class="rf-flip" style={{ animationDuration: `${f(p.dur * 2)}s`, animationDelay: `${f(p.delay)}s` }}>
          <g class={p.bob === false ? undefined : 'rf-bob'} style={{ animationDelay: `${f(p.delay / 3)}s` }}>
            <g transform={`scale(${f(p.scale)})`}>{p.children}</g>
          </g>
        </g>
      </g>
    </g>
  );
}

/** Lay out everything in the tank. Positions come from each creature's id, so the reef looks the same every time. */
function scene(reef: ReefState, H: number) {
  const b = reef.game.streakInfo.bleach;
  const sandY = H - 34;
  const ground: Placed[] = [];
  const water: JSX.Element[] = [];
  const far: JSX.Element[] = [];

  // corals: each module grows its own species in its own stretch of reef
  const M = Math.max(1, reef.modules.length);
  reef.modules.forEach((m, mi) => {
    const r = rng('coral:' + m.id);
    const x0 = (mi / M) * W + 14, x1 = ((mi + 1) / M) * W - 14;
    const n = Math.min(14, 1 + Math.floor(m.polyps / 6));
    for (let j = 0; j < n; j++) {
      const age = m.polyps - 6 * j;
      const s = clamp(0.32 + age * 0.045, 0.32, 1.25);
      const back = j % 2 === 1;
      const x = x0 + r() * (x1 - x0);
      const y = sandY + (back ? 1 + r() * 4 : 9 + r() * 9);
      ground.push({ y, el: <g transform={`translate(${f(x)} ${f(y)})`} class="rf-grow"><Coral sp={m.coral} s={s * (back ? 0.85 : 1)} seed={m.id + j} b={b} /></g> });
    }
  });

  for (const o of reef.owned) {
    const org = o.org;
    const size = org.size ?? 1;
    if (org.source === 'school') {
      // one school per module, swimming together
      const r = rng('school:' + org.id);
      const n = Math.min(o.count, 30);
      const fish: JSX.Element[] = [];
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r());
        const fx = Math.cos(a) * d * (20 + n * 1.6), fy = Math.sin(a) * d * (9 + n * 0.5);
        fish.push(<g transform={`translate(${f(fx)} ${f(fy)})`}><g class="rf-bob" style={{ animationDelay: `${f(-r() * 3)}s` }}><g transform="scale(0.7)"><Creature org={org} /></g></g></g>);
      }
      const y = 45 + r() * (sandY - 110);
      const span = 120 + r() * 140;
      const x = 40 + r() * (W - 80 - span);
      water.push(<Swimmer x={x} y={y} dx={span} dur={span / 9} delay={-r() * 30} scale={1} bob={false}>{<g>{fish}</g>}</Swimmer>);
      continue;
    }
    for (let i = 0; i < Math.min(o.count, 4); i++) {
      const r = rng(org.id + '#' + i);
      const depth = 0.8 + r() * 0.35;
      switch (org.zone) {
        case 'swim': {
          const span = 60 + r() * 170;
          const x = 15 + r() * (W - 30 - span);
          const y = 35 + r() * (sandY - 75);
          water.push(<Swimmer x={x} y={y} dx={span} dur={span / (5 + r() * 6)} delay={-r() * 40} scale={size * depth}><Creature org={org} /></Swimmer>);
          break;
        }
        case 'drift': {
          const x = 30 + r() * (W - 100);
          const y = 30 + r() * (sandY * 0.45);
          water.push(
            <g transform={`translate(${f(x)} ${f(y)})`}>
              <g class="rf-swim" style={{ '--dx': `${f(30 + r() * 40)}px`, animationDuration: `${f(25 + r() * 20)}s`, animationDelay: `${f(-r() * 30)}s` }}>
                <g class="rf-drift" style={{ animationDelay: `${f(-r() * 6)}s` }}><g transform={`scale(${f(size * depth)})`}><Creature org={org} /></g></g>
              </g>
            </g>,
          );
          break;
        }
        case 'big': {
          const y = 50 + r() * (sandY - 130);
          water.push(<Swimmer x={-90} y={y} dx={W + 180} dur={55 + r() * 30} delay={-r() * 80} scale={size} bob={false}><Creature org={org} /></Swimmer>);
          break;
        }
        case 'far':
          far.push(<Swimmer x={-140} y={48} dx={W + 280} dur={140} delay={-r() * 140} scale={size} opacity={0.28} bob={false}><Creature org={org} /></Swimmer>);
          break;
        case 'sand':
        case 'plant': {
          const x = 14 + r() * (W - 28);
          const y = sandY + 6 + r() * 20;
          const sway = org.zone === 'plant';
          ground.push({
            y,
            el: (
              <g transform={`translate(${f(x)} ${f(y)}) scale(${f(1.3 * size * (0.85 + r() * 0.25) * (r() < 0.5 ? -1 : 1))} ${f(1.3 * size * 0.95)})`}>
                <g class={sway ? 'rf-sway' : 'rf-idle'} style={{ animationDelay: `${f(-r() * 5)}s` }}><Creature org={org} b={b} /></g>
              </g>
            ),
          });
          break;
        }
      }
    }
  }
  ground.sort((p, q) => p.y - q.y);
  return { ground, water, far, sandY };
}

export function ReefTank({ reef, H = 230, onClick }: { reef: ReefState; H?: number; onClick?: () => void }) {
  const si = reef.game.streakInfo;
  const streak = reef.game.streak;
  const b = si.bleach;
  const { ground, water, far, sandY } = useMemo(() => scene(reef, H), [reef, H]);
  const id = `rf${H}`;
  const top = mix('#1b93c9', '#5f7d8c', b * 0.6);
  const bottom = mix('#0a4d78', '#3f5866', b * 0.6);
  const r = rng('fx');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class={'reef-tank' + (onClick ? ' clickable' : '')} onClick={onClick} role="img"
      aria-label={`Your reef: ${reef.polyps} polyps, ${reef.creatures} creatures, ${streak}-day streak${b > 0 ? ', bleaching' : ''}`}>
      <defs>
        <linearGradient id={`${id}-w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color={top} />
          <stop offset="1" stop-color={bottom} />
        </linearGradient>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffd54a" stop-opacity="0.28" />
          <stop offset="0.6" stop-color="#ffd54a" stop-opacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#e9d6a4" />
          <stop offset="1" stop-color="#c9ad74" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-w)`} />
      {streak >= 3 && (
        <g class="rf-rays" fill="#fff">
          {[40, 150, 260, 370].map((x, i) => <path d={`M ${x} 0 L ${x + 40} 0 L ${x + 110} ${sandY} L ${x + 50} ${sandY} Z`} opacity="0.06" style={{ animationDelay: `${-i * 1.7}s` }} />)}
        </g>
      )}
      {streak >= 30 && <rect width={W} height={H} fill={`url(#${id}-g)`} />}
      {far}
      {/* live rock */}
      <path d={`M 0 ${sandY + 6} Q 40 ${sandY - 22} 90 ${sandY - 6} Q 130 ${sandY - 30} 190 ${sandY - 4} Q 250 ${sandY - 18} 300 ${sandY} Q 360 ${sandY - 26} 420 ${sandY - 4} Q 455 ${sandY - 14} ${W} ${sandY} L ${W} ${H} L 0 ${H} Z`} fill="#4d4363" />
      <g fill="#c06c8f" opacity="0.55">
        {[[60, -10], [150, -14], [250, -8], [380, -12], [440, -6]].map(([x, dy]) => <ellipse cx={x} cy={sandY + dy} rx="12" ry="4" />)}
      </g>
      <path d={`M 0 ${sandY + 10} Q 80 ${sandY + 2} 160 ${sandY + 9} T 320 ${sandY + 8} T ${W} ${sandY + 6} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${id}-s)`} />
      {ground.map((p) => p.el)}
      {water}
      {streak >= 7 && (
        <g fill="#ffd1e8">
          {Array.from({ length: 14 }, (_, i) => <circle class="rf-rise" cx={f(20 + r() * (W - 40))} cy={sandY} r={f(0.8 + r() * 1.2)} style={{ animationDelay: `${f(-r() * 9)}s`, animationDuration: `${f(7 + r() * 5)}s` }} />)}
        </g>
      )}
      {streak >= 14 && (
        <g fill="#7ff9ff">
          {Array.from({ length: 26 }, () => <circle class="rf-twinkle" cx={f(r() * W)} cy={f(r() * sandY)} r={f(0.6 + r() * 0.9)} style={{ animationDelay: `${f(-r() * 4)}s` }} />)}
        </g>
      )}
      <g fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="0.7">
        {[0, 1, 2, 3, 4].map((i) => <circle class="rf-bubble" cx={W - 30 + (i % 2) * 5} cy={sandY} r={1.2 + (i % 3)} style={{ animationDelay: `${-i * 1.3}s` }} />)}
      </g>
      {b > 0 && <rect width={W} height={H} fill="#e8e4da" opacity={f(b * 0.12)} />}
    </svg>
  );
}

/** Home screen: the reef at the top, with what it needs from you today. */
export function ReefCard({ reef }: { reef: ReefState }) {
  const [picking, setPicking] = useState(false);
  const g = reef.game;
  const si = g.streakInfo;
  return (
    <div class="reef-card">
      <div class="reef-wrap">
        <ReefTank reef={reef} H={250} onClick={() => go('/reef')} />
        <div class="reef-hud top">
          <span class="rchip" title="Every 50 XP lays down a polyp">🪸 {reef.polyps} polyps</span>
          <span class="rchip" title="Creatures living in your reef">🐠 {reef.creatures}</span>
          <span class="grow" />
          <span class="rchip" title={`${si.tier.name}: ${si.tier.desc}`}>🔥 {g.streak}</span>
          {si.freezes > 0 && <span class="rchip" title="Streak freezes: each one covers a missed day automatically">❄️ {si.freezes}</span>}
        </div>
        <div class="reef-hud bottom">
          <span class="rchip soft">{si.tier.name}{si.nextTier ? ` · ${si.nextTier.at - g.streak} day${si.nextTier.at - g.streak === 1 ? '' : 's'} to ${si.nextTier.name}` : ''}</span>
          <span class="grow" />
          <MotionChip />
        </div>
      </div>
      {reef.pending.length > 0 && (
        <button class="gift-btn" onClick={() => setPicking(true)}>🎁 Level up! Choose a new creature for your reef{reef.pending.length > 1 ? ` (${reef.pending.length} waiting)` : ''}</button>
      )}
      <ReefNotice reef={reef} />
      {picking && <PickModal reef={reef} onClose={() => setPicking(false)} />}
    </div>
  );
}

/** The one thing the streak needs from you today, if anything. */
export function ReefNotice({ reef }: { reef: ReefState }) {
  const g = reef.game;
  const si = g.streakInfo;
  if (si.repair) {
    return (
      <div class="reef-note repair">
        🩹 Your <b>{si.repair.saved}-day streak</b> broke. Save it with a big day: answer <b>{REPAIR_GOAL}</b> questions today ({si.repair.done}/{REPAIR_GOAL}).
        <div class="bar thin"><span style={{ width: `${Math.min(100, (si.repair.done / REPAIR_GOAL) * 100)}%` }} /></div>
      </div>
    );
  }
  if (si.bleach > 0) {
    return <div class="reef-note bleach">🤍 Your coral is bleaching after {si.missedInARow} missed day{si.missedInARow === 1 ? '' : 's'}. Answer anything today and the colour comes straight back.</div>;
  }
  if (!si.studiedToday && g.streak > 0) {
    return <div class="reef-note">🔥 Answer one question today to keep your {g.streak}-day streak{si.boostToday > 0 ? `, and reach your daily goal for +${Math.round(si.boostToday * 100)}% XP` : ''}.</div>;
  }
  if (si.studiedToday && si.boostToday > 0) {
    return <div class="reef-note ok">⚡ Streak boost: +{Math.round(si.boostToday * 100)}% XP today {g.goal.done >= g.goal.target ? `(+${g.boostXpToday} XP so far)` : `once you reach your daily goal (${g.goal.done}/${g.goal.target})`}.</div>;
  }
  return null;
}

export function PickModal({ reef, onClose }: { reef: ReefState; onClose: () => void }) {
  const level = reef.pending[0];
  const ownedPicks = new Set(reef.owned.filter((o) => o.org.source === 'pick').map((o) => o.org.id));
  const offers = level ? offersFor(level, ownedPicks) : [];
  const choose = async (o: Organism) => {
    await choosePick(level, o.id);
    toast(`✨ <b>${o.name}</b> moved into your reef`);
    if (reef.pending.length <= 1) onClose();
  };
  if (!level) return null;
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose a creature">
        <div class="row spread">
          <h2>🎁 Level {level}: choose a creature</h2>
          <button class="btn sm ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p class="small muted" style={{ marginTop: '0px' }}>It joins your reef for good. {reef.pending.length > 1 ? `${reef.pending.length - 1} more to choose after this.` : ''}</p>
        <div class="pick-grid">
          {offers.map((o) => (
            <button key={o.id + level} class="pick" onClick={() => void choose(o)}>
              <CreatureIcon org={o} size={96} />
              <b>{o.name}</b>
              <i class="small muted">{o.latin}</i>
              <span class="small">{o.fact}</span>
              {ownedPicks.has(o.id) && <span class="tag">you have one: adds another</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

