/**
 * Drawings for the reef: every organism and coral as hand-authored SVG, drawn around (0, 0) facing right.
 * Swimmers are centred; things that sit on the sand or rock have their base at y = 0 and grow upwards.
 */
import type { JSX } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { CoralSpecies, DrawSpec, FishSpec, Organism } from './catalogue';

// ---------------------------------------------------------------- helpers
export function rng(seed: string): () => number {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * Math.min(1, t)).toString(16).padStart(2, '0')).join('');
}
const BLEACH = '#f3f0e8';
/** colour as it looks when the reef is bleached by `b` (0–1) */
export const bl = (c: string, b: number) => mix(c, BLEACH, b * 0.85);

const f = (n: number) => n.toFixed(1);
const ellipsePath = (rx: number, ry: number) => `M ${f(rx)} 0 A ${f(rx)} ${f(ry)} 0 1 0 ${f(-rx)} 0 A ${f(rx)} ${f(ry)} 0 1 0 ${f(rx)} 0 Z`;
const OUT = 'rgba(0,0,0,0.28)';

// ---------------------------------------------------------------- fish
function fishBody(s: FishSpec): string {
  const { L, h } = s;
  switch (s.shape ?? 'normal') {
    case 'round':
      return ellipsePath(L / 2, h / 2);
    case 'box': {
      const x = -L / 2, y = -h / 2, r = h * 0.3;
      return `M ${f(x + r)} ${f(y)} H ${f(x + L - r)} Q ${f(x + L)} ${f(y)} ${f(x + L)} ${f(y + r)} V ${f(y + h - r)} Q ${f(x + L)} ${f(y + h)} ${f(x + L - r)} ${f(y + h)} H ${f(x + r)} Q ${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} V ${f(y + r)} Q ${f(x)} ${f(y)} ${f(x + r)} ${f(y)} Z`;
    }
    case 'disc':
      return `M ${f(L / 2)} ${f(h * 0.05)} C ${f(L * 0.45)} ${f(-h * 0.55)}, ${f(-L * 0.2)} ${f(-h * 0.62)}, ${f(-L / 2)} ${f(-h * 0.1)} L ${f(-L / 2)} ${f(h * 0.1)} C ${f(-L * 0.2)} ${f(h * 0.62)}, ${f(L * 0.45)} ${f(h * 0.55)}, ${f(L / 2)} ${f(h * 0.05)} Z`;
    default:
      return `M ${f(L / 2)} 0 C ${f(L * 0.46)} ${f(-h * 0.64)}, ${f(-L * 0.25)} ${f(-h * 0.62)}, ${f(-L / 2)} ${f(-h * 0.1)} L ${f(-L / 2)} ${f(h * 0.1)} C ${f(-L * 0.25)} ${f(h * 0.62)}, ${f(L * 0.46)} ${f(h * 0.64)}, ${f(L / 2)} 0 Z`;
  }
}

function fishTail(s: FishSpec): string {
  const x = -s.L / 2 + 1;
  const t = Math.max(s.h * 0.6, 4) * (s.tail === 'fan' ? 1.4 : s.tail === 'long' ? 0.7 : 1);
  switch (s.tail ?? 'fork') {
    case 'round':
    case 'fan':
      return `M ${f(x)} ${f(-t * 0.25)} C ${f(x - t * 1.2)} ${f(-t * 1)}, ${f(x - t * 1.2)} ${f(t * 1)}, ${f(x)} ${f(t * 0.25)} Z`;
    case 'lunate':
      return `M ${f(x)} 0 Q ${f(x - t * 0.4)} ${f(-t * 0.3)} ${f(x - t * 0.95)} ${f(-t * 0.95)} Q ${f(x - t * 0.55)} 0 ${f(x - t * 0.95)} ${f(t * 0.95)} Q ${f(x - t * 0.4)} ${f(t * 0.3)} ${f(x)} 0 Z`;
    default:
      return `M ${f(x)} 0 L ${f(x - t)} ${f(-t * 0.85)} Q ${f(x - t * 0.5)} 0 ${f(x - t)} ${f(t * 0.85)} Z`;
  }
}

function fishDorsal(s: FishSpec): JSX.Element | null {
  const { L, h } = s;
  const fin = s.fin ?? s.body;
  switch (s.dorsal ?? 'low') {
    case 'none':
      return null;
    case 'tall':
      return (
        <g fill={fin} stroke={OUT} stroke-width="0.4">
          <path d={`M ${f(L * 0.22)} ${f(-h * 0.4)} Q ${f(-L * 0.05)} ${f(-h * 1.1)} ${f(-L * 0.42)} ${f(-h * 0.2)} Z`} />
          <path d={`M ${f(L * 0.1)} ${f(h * 0.4)} Q ${f(-L * 0.1)} ${f(h * 0.95)} ${f(-L * 0.42)} ${f(h * 0.2)} Z`} />
        </g>
      );
    case 'streamer':
      return (
        <g fill={fin} stroke={OUT} stroke-width="0.4">
          <path d={`M ${f(L * 0.12)} ${f(-h * 0.42)} Q ${f(L * 0.05)} ${f(-h * 1.15)} ${f(-L * 0.95)} ${f(-h * 1.25)} Q ${f(-L * 0.1)} ${f(-h * 0.85)} ${f(-L * 0.3)} ${f(-h * 0.35)} Z`} />
          <path d={`M ${f(L * 0.05)} ${f(h * 0.42)} Q ${f(-L * 0.1)} ${f(h * 0.9)} ${f(-L * 0.38)} ${f(h * 0.25)} Z`} />
        </g>
      );
    case 'sail':
      return <path fill={fin} stroke={OUT} stroke-width="0.4" d={`M ${f(L * 0.25)} ${f(-h * 0.4)} Q ${f(L * 0.05)} ${f(-h * 1.6)} ${f(-L * 0.35)} ${f(-h * 0.35)} Z`} />;
    case 'spines':
      return (
        <g stroke={fin} stroke-width="0.8" stroke-linecap="round">
          <path fill={fin} opacity="0.35" stroke="none" d={`M ${f(L * 0.28)} ${f(-h * 0.38)} L ${f(L * 0.1)} ${f(-h * 1.1)} L ${f(-L * 0.4)} ${f(-h * 0.8)} L ${f(-L * 0.42)} ${f(-h * 0.2)} Z`} />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const x = L * (0.26 - i * 0.12);
            return <path d={`M ${f(x)} ${f(-h * 0.35)} L ${f(x - L * 0.08)} ${f(-h * (1.05 + (i % 2) * 0.25))}`} />;
          })}
        </g>
      );
    default:
      return <path fill={fin} stroke={OUT} stroke-width="0.4" d={`M ${f(L * 0.2)} ${f(-h * 0.42)} Q ${f(-L * 0.05)} ${f(-h * 0.78)} ${f(-L * 0.38)} ${f(-h * 0.28)} Z`} />;
  }
}

/** a pattern rectangle, trimmed to the body's box (so the picture's measured size matches what you see) */
function box(L: number, h: number, x0: number, y0: number, x1: number, y1: number, c: string): JSX.Element {
  const X0 = Math.max(x0, -L / 2), X1 = Math.min(x1, L / 2), Y0 = Math.max(y0, -h * 0.66), Y1 = Math.min(y1, h * 0.66);
  return <rect x={f(X0)} y={f(Y0)} width={f(Math.max(0, X1 - X0))} height={f(Math.max(0, Y1 - Y0))} fill={c} />;
}

function fishPattern(s: FishSpec, id: string): JSX.Element[] {
  const { L, h } = s;
  const out: JSX.Element[] = [];
  for (const p of s.pat ?? []) {
    switch (p.t) {
      case 'band': out.push(box(L, h, (p.x - p.w / 2) * L, -h, (p.x + p.w / 2) * L, h, p.c)); break;
      case 'stripe': out.push(box(L, h, -L, p.y * h - (p.w * h) / 2, L, p.y * h + (p.w * h) / 2, p.c)); break;
      case 'front': out.push(box(L, h, p.x * L, -h, L, h, p.c)); break;
      case 'back': out.push(box(L, h, -L, -h, p.x * L, h, p.c)); break;
      case 'top': out.push(box(L, h, -L, -h, L, p.y * h, p.c)); break;
      case 'eyespot': out.push(<circle cx={f(p.x * L)} cy={f(p.y * h)} r={f(p.r * L)} fill={p.c} stroke="#fff" stroke-width="0.6" />); break;
      case 'spots': {
        const r = rng(id + ':spots');
        for (let i = 0; i < p.n; i++) {
          const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.85;
          out.push(<circle cx={f(Math.cos(a) * d * L * 0.45)} cy={f(Math.sin(a) * d * h * 0.42)} r={f(p.r)} fill={p.c} />);
        }
        break;
      }
      case 'squiggle':
        for (let i = 0; i < 4; i++) {
          const y = -h * 0.3 + i * h * 0.2;
          out.push(<path d={`M ${f(-L * 0.5)} ${f(y)} q ${f(L * 0.12)} ${f(-h * 0.12)} ${f(L * 0.24)} 0 t ${f(L * 0.24)} 0 t ${f(L * 0.24)} 0 t ${f(L * 0.24)} 0`} fill="none" stroke={p.c} stroke-width={f(h * 0.07)} />);
        }
        break;
    }
  }
  return out;
}

function Fish({ s, id }: { s: FishSpec; id: string }) {
  const { L, h } = s;
  const fin = s.fin ?? s.body;
  const body = fishBody(s);
  const clip = `rfc-${id}`;
  const eyeX = L * (s.shape === 'disc' ? 0.3 : 0.32), eyeY = -h * 0.12, er = Math.max(1.1, h * 0.1);
  return (
    <g>
      {s.fans && (
        <g stroke={fin} stroke-width="0.7" stroke-linecap="round">
          <path fill={fin} opacity="0.3" stroke="none" d={`M ${f(L * 0.12)} ${f(h * 0.1)} L ${f(-L * 0.2)} ${f(h * 1.2)} L ${f(-L * 0.55)} ${f(h * 0.7)} Z`} />
          {[0, 1, 2, 3, 4].map((i) => <path d={`M ${f(L * 0.12)} ${f(h * 0.1)} L ${f(-L * (0.15 + i * 0.1))} ${f(h * (1.2 - i * 0.12))}`} />)}
        </g>
      )}
      <path d={fishTail(s)} fill={s.tailC ?? fin} stroke={OUT} stroke-width="0.4" />
      {fishDorsal(s)}
      {s.nose && (
        <path d={`M ${f(L * 0.44)} ${f(-h * 0.07)} L ${f(L * (s.nose === 'long' ? 0.72 : 0.56))} ${f(-h * 0.02)} L ${f(L * (s.nose === 'long' ? 0.72 : 0.56))} ${f(h * 0.04)} L ${f(L * 0.44)} ${f(h * 0.09)} Z`} fill={s.body} />
      )}
      {s.horns && (
        <g stroke={s.body} stroke-width="1.2" stroke-linecap="round">
          <path d={`M ${f(L * 0.38)} ${f(-h * 0.4)} L ${f(L * 0.62)} ${f(-h * 0.72)}`} />
          <path d={`M ${f(-L * 0.42)} ${f(h * 0.42)} L ${f(-L * 0.62)} ${f(h * 0.62)}`} />
        </g>
      )}
      <clipPath id={clip}><path d={body} /></clipPath>
      <path d={body} fill={s.body} />
      <g clip-path={`url(#${clip})`}>{fishPattern(s, id)}</g>
      <path d={body} fill="none" stroke={OUT} stroke-width="0.5" />
      {s.spikes && (
        <g stroke={s.fin ?? s.body} stroke-width="0.6">
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2;
            const x = Math.cos(a) * L * 0.5, y = Math.sin(a) * h * 0.5;
            return <path d={`M ${f(x)} ${f(y)} L ${f(x * 1.18)} ${f(y * 1.18)}`} />;
          })}
        </g>
      )}
      <ellipse cx={f(L * 0.1)} cy={f(h * 0.14)} rx={f(L * 0.09)} ry={f(h * 0.11)} fill={fin} opacity="0.85" transform={`rotate(25 ${f(L * 0.1)} ${f(h * 0.14)})`} />
      <circle cx={f(eyeX)} cy={f(eyeY)} r={f(er)} fill="#fff" />
      <circle cx={f(eyeX + er * 0.25)} cy={f(eyeY)} r={f(er * 0.6)} fill="#111" />
    </g>
  );
}

// ---------------------------------------------------------------- everything else
function star(arms: number, R: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < arms * 2; i++) {
    const a = (i / (arms * 2)) * Math.PI * 2 - Math.PI / 2;
    const d = i % 2 ? r : R;
    pts.push(`${f(Math.cos(a) * d)},${f(Math.sin(a) * d)}`);
  }
  return 'M ' + pts.join(' L ') + ' Z';
}

function Other({ d, id, b }: { d: Exclude<DrawSpec, FishSpec>; id: string; b: number }) {
  switch (d.kind) {
    case 'jelly':
      if (d.comb) {
        return (
          <g>
            {d.glow && <circle r="13" fill={d.c} opacity="0.15" />}
            <ellipse rx="6" ry="8" fill={d.c} opacity="0.55" stroke="#fff" stroke-width="0.4" />
            {[-4, -2, 0, 2, 4].map((x, i) => <path d={`M ${x} -7 Q ${x * 1.3} 0 ${x} 7`} stroke={['#f472b6', '#facc15', '#4ade80', '#60a5fa', '#c084fc'][i]} stroke-width="0.7" fill="none" opacity="0.9" />)}
            <path d="M -1 7 q -3 8 -1 16 M 1 7 q 4 7 2 15" stroke={d.c} stroke-width="0.4" fill="none" opacity="0.7" />
          </g>
        );
      }
      return (
        <g>
          {[-6, -2, 2, 6].map((x) => <path d={`M ${x} 0 q 2 6 0 12 t 0 10`} stroke={d.c} stroke-width="0.5" fill="none" opacity="0.6" />)}
          <path d="M -3 0 q -1 6 1 12 M 3 0 q 2 6 -1 11" stroke="#f9c6dd" stroke-width="1.2" fill="none" opacity="0.7" />
          <path d="M -10 0 Q -10 -12 0 -12 Q 10 -12 10 0 Q 7.5 2 5 0 Q 2.5 2 0 0 Q -2.5 2 -5 0 Q -7.5 2 -10 0 Z" fill={d.c} opacity="0.6" stroke="#fff" stroke-width="0.4" />
          {[[-3.5, -6], [3.5, -6], [0, -8.5], [0, -3.5]].map(([x, y]) => <circle cx={x} cy={y} r="1.7" fill="none" stroke="#f0a6c8" stroke-width="0.8" />)}
        </g>
      );
    case 'star':
      if (d.thin) {
        return (
          <g transform="translate(0 -2) scale(1 0.45)" stroke={d.c} stroke-width="1.6" stroke-linecap="round" fill="none">
            {[0, 1, 2, 3, 4].map((i) => {
              const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
              return <path d={`M 0 0 Q ${f(Math.cos(a) * 8 + Math.cos(a + 1) * 4)} ${f(Math.sin(a) * 8 + Math.sin(a + 1) * 4)} ${f(Math.cos(a) * 15)} ${f(Math.sin(a) * 15)}`} />;
            })}
            <circle r="3" fill={d.c} />
          </g>
        );
      }
      return (
        <g transform="translate(0 -3) scale(1 0.5)">
          <path d={star(5, 11, 4)} fill={d.c} stroke={OUT} stroke-width="0.6" stroke-linejoin="round" />
          {d.c2 && [0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            return <g fill={d.c2}><circle cx={f(Math.cos(a) * 4)} cy={f(Math.sin(a) * 4)} r="1.3" /><circle cx={f(Math.cos(a) * 7.5)} cy={f(Math.sin(a) * 7.5)} r="1.1" /></g>;
          })}
          {d.c2 && <circle r="1.6" fill={d.c2} />}
        </g>
      );
    case 'urchin':
      return (
        <g>
          <g stroke={d.c} stroke-width="0.6" stroke-linecap="round">
            {Array.from({ length: 17 }, (_, i) => {
              const a = Math.PI + (i / 16) * Math.PI;
              const l = d.long ? 14 : 7;
              return <path d={`M 0 -4 L ${f(Math.cos(a) * l)} ${f(-4 + Math.sin(a) * l)}`} />;
            })}
          </g>
          <ellipse cy="-3.5" rx="5" ry="4" fill={d.c} />
          <circle cx="0" cy="-6" r="0.8" fill="#f97316" />
        </g>
      );
    case 'crab':
      if (d.deco) {
        return (
          <g>
            <g stroke={d.c} stroke-width="0.8" fill="none" stroke-linecap="round">
              {[-1, 1].map((s) => [0, 1, 2].map((i) => <path d={`M ${s * 3} -4 L ${s * (8 + i * 3)} ${-8 + i * 2} L ${s * (10 + i * 3)} 0`} />))}
            </g>
            <ellipse cy="-5" rx="5" ry="4" fill={d.c} />
            {[[-3, -8, '#16a34a'], [1, -9, '#f97316'], [3.5, -7, '#a855f7'], [-1, -7.5, '#facc15']].map(([x, y, c]) => <circle cx={x} cy={y} r="1.6" fill={c as string} />)}
            <circle cx="4.5" cy="-5" r="0.7" fill="#111" />
          </g>
        );
      }
      return (
        <g>
          <g stroke={d.c} stroke-width="1" stroke-linecap="round">
            <path d="M 6 -2 L 9 0 M 4 -2 L 6 0 M 2 -2 L 3 0" />
          </g>
          <path d="M -9 -1 Q -12 -12 -2 -12 Q 4 -11 3 -4 Q 0 -1 -9 -1 Z" fill={bl(d.shell!, 0)} stroke={OUT} stroke-width="0.5" />
          <path d="M -6 -5 Q -5 -9 -2 -8 Q 0 -7 -2 -5.5" fill="none" stroke="#b89b70" stroke-width="0.6" />
          <ellipse cx="5" cy="-4.5" rx="3.2" ry="2.4" fill={d.c} />
          <ellipse cx="8.5" cy="-3" rx="2.2" ry="1.6" fill={d.c} />
          <path d="M 6 -6 L 7 -9 M 7.5 -6 L 9 -8.5" stroke={d.c} stroke-width="0.6" />
          <circle cx="7" cy="-9" r="0.7" fill="#111" /><circle cx="9" cy="-8.5" r="0.7" fill="#111" />
        </g>
      );
    case 'lobster':
      return (
        <g>
          <path d="M 8 -4 Q 22 -16 30 -10 M 8 -3 Q 20 -12 28 -4" stroke={d.c2} stroke-width="0.6" fill="none" />
          <g stroke={d.c} stroke-width="0.8">{[0, 1, 2, 3].map((i) => <path d={`M ${2 - i * 2} -2 L ${3 - i * 2.5} 0`} />)}</g>
          <path d="M 8 -4 Q 6 -8 0 -7 L -12 -6 Q -16 -5 -18 -2 L -14 -1 Q -6 -1 0 -1 Q 6 -1 8 -4 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          {[-2, -5, -8, -11].map((x) => <path d={`M ${x} -6.6 L ${x} -1.2`} stroke={d.c2} stroke-width="0.7" />)}
          <path d="M -18 -2 L -22 -6 L -21 0 Z" fill={d.c2} />
          <circle cx="6" cy="-5.5" r="0.8" fill="#111" />
        </g>
      );
    case 'shrimp':
      if (d.mantis) {
        return (
          <g>
            <path d="M 10 -5 Q 0 -9 -12 -6 Q -15 -4 -13 -2 Q 0 -1 10 -2 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
            {[-8, -5, -2, 1, 4].map((x) => <path d={`M ${x} -7.5 L ${x} -1.5`} stroke="#1f7a43" stroke-width="0.5" />)}
            <path d="M -13 -2 L -16 -5 L -16 0 Z" fill={d.c2} />
            <path d="M 9 -3 Q 13 -1 11 2 Q 8 0 9 -3 Z" fill={d.c2} />
            <path d="M 9 -5 L 11 -9 M 10 -5 L 13 -8" stroke={d.c} stroke-width="0.6" />
            <circle cx="11" cy="-9.5" r="1.1" fill="#7dd3fc" /><circle cx="13.3" cy="-8.3" r="1.1" fill="#7dd3fc" />
            <g stroke={d.c2} stroke-width="0.6">{[-6, -3, 0, 3].map((x) => <path d={`M ${x} -2 L ${x - 1} 0`} />)}</g>
          </g>
        );
      }
      return (
        <g>
          <path d="M 7 -6 Q 18 -16 24 -12 M 7 -5 Q 16 -10 22 -3" stroke="#fff" stroke-width="0.4" fill="none" />
          <path d="M 8 -5 Q 4 -10 -4 -8 Q -10 -6 -11 -1 L -8 -1 Q -6 -4 0 -4 Q 5 -3 8 -5 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          <path d="M 7 -6.5 Q 3 -10.5 -4 -8.6 Q -9 -7 -10.5 -2.5" stroke={d.c2} stroke-width="1.4" fill="none" />
          {!d.claw && <path d="M 3 -8.5 Q -1 -9.5 -4 -8.2" stroke="#fff" stroke-width="0.6" fill="none" />}
          <g stroke={d.c} stroke-width="0.5">{[4, 2, 0, -2, -4].map((x) => <path d={`M ${x} -4 L ${x - 1} 0`} />)}</g>
          {d.claw && <path d="M 7 -4 Q 14 -6 15 -3 Q 13 -1 8 -2 Z" fill={d.c2} stroke={OUT} stroke-width="0.4" />}
          <circle cx="7" cy="-6" r="0.8" fill="#111" />
        </g>
      );
    case 'nudi':
      return (
        <g>
          <path d="M 11 -1 Q 10 -6 3 -6 L -8 -5 Q -12 -4 -12 -1 Z" fill={d.c} />
          <path d="M 11 -1 Q 10 -6 3 -6 L -8 -5 Q -12 -4 -12 -1" fill="none" stroke={d.c3} stroke-width="0.9" />
          <path d="M 6 -6 L 7 -10 M 8 -5.5 L 10 -9" stroke={d.c2} stroke-width="1.3" stroke-linecap="round" />
          <g fill={d.c2}>{[-9, -8, -7].map((x, i) => <ellipse cx={x} cy={-7 - i * 0.6} rx="0.8" ry="2.2" transform={`rotate(${-25 + i * 25} ${x} ${-7 - i * 0.6})`} />)}</g>
          <g fill={d.c3} opacity="0.8">{[-4, -1, 2].map((x) => <circle cx={x} cy="-3.5" r="0.8" />)}</g>
        </g>
      );
    case 'cucumber':
      return (
        <g>
          <path d="M -13 -1 Q -14 -7 -6 -7 L 6 -7 Q 13 -7 13 -1 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          {[[-8, -4], [-3, -5], [2, -4], [7, -4.5], [-5, -2], [4, -2]].map(([x, y]) => <circle cx={x} cy={y} r="1.3" fill="#5a4320" />)}
          <path d="M 13 -3 l 2 -2 M 13 -2 l 2.5 -0.5 M 13 -1 l 2 1" stroke="#e2cfa5" stroke-width="0.5" />
        </g>
      );
    case 'featherstar':
      return (
        <g fill="none" stroke={d.c} stroke-width="1" stroke-linecap="round">
          {Array.from({ length: 9 }, (_, i) => {
            const a = -Math.PI + (i / 8) * Math.PI;
            const x = Math.cos(a) * 14, y = Math.sin(a) * 16 - 2;
            return (
              <g>
                <path d={`M 0 -2 Q ${f(x * 0.6)} ${f(y * 1.1)} ${f(x)} ${f(y)} q ${f(-x * 0.15)} 4 ${f(-x * 0.05)} 6`} />
                <path d={`M ${f(x * 0.3)} ${f(y * 0.5 - 1)} l 1.5 -1.5 M ${f(x * 0.55)} ${f(y * 0.8 - 1)} l 1.5 -1.5`} stroke-width="0.5" />
              </g>
            );
          })}
          <circle cy="-2" r="2" fill="#7c2d12" stroke="none" />
        </g>
      );
    case 'xmasworm':
      return (
        <g>
          <path d="M -14 0 Q -14 -10 -4 -11 Q 8 -12 13 -5 Q 15 -1 14 0 Z" fill={bl('#a58e74', b)} />
          {[[-7, -10, d.c], [1, -11, '#f97316'], [8, -9, '#facc15']].map(([x, y, c]) => (
            <g transform={`translate(${x} ${y})`}>
              <path d="M -3 0 L 0 -8 L 3 0 Z" fill={c as string} />
              <path d="M -2.3 -2 L 2.3 -2 M -1.6 -4 L 1.6 -4 M -0.9 -6 L 0.9 -6" stroke="#fff" stroke-width="0.4" opacity="0.7" />
            </g>
          ))}
        </g>
      );
    case 'duster':
      return (
        <g>
          <path d="M 0 0 L 0 -12" stroke={d.c} stroke-width="2.2" />
          <g stroke={d.c2} stroke-width="0.8" stroke-linecap="round">
            {Array.from({ length: 13 }, (_, i) => {
              const a = -Math.PI + (i / 12) * Math.PI;
              return <path d={`M 0 -12 L ${f(Math.cos(a) * 9)} ${f(-12 + Math.sin(a) * 9)}`} />;
            })}
          </g>
          <g stroke={d.c} stroke-width="0.8" opacity="0.6">
            {Array.from({ length: 13 }, (_, i) => {
              const a = -Math.PI + (i / 12) * Math.PI;
              return <path d={`M ${f(Math.cos(a) * 5)} ${f(-12 + Math.sin(a) * 5)} L ${f(Math.cos(a) * 6.5)} ${f(-12 + Math.sin(a) * 6.5)}`} />;
            })}
          </g>
        </g>
      );
    case 'seafan': {
      const r = rng(id + ':fan');
      const paths: string[] = [];
      const grow = (x: number, y: number, a: number, len: number, depth: number) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        paths.push(`M ${f(x)} ${f(y)} L ${f(x2)} ${f(y2)}`);
        if (depth > 0) {
          grow(x2, y2, a - 0.35 - r() * 0.2, len * 0.78, depth - 1);
          grow(x2, y2, a + 0.35 + r() * 0.2, len * 0.78, depth - 1);
        }
      };
      grow(0, 0, -Math.PI / 2, 9, 5);
      return <path d={paths.join(' ')} stroke={bl(d.c, b)} stroke-width="1" stroke-linecap="round" fill="none" />;
    }
    case 'sponge':
      if (d.tube) {
        return (
          <g>
            {[[-5, 22, 3.5], [1, 30, 4], [7, 18, 3.2]].map(([x, h, w]) => (
              <g>
                <path d={`M ${x - w} 0 L ${x - w * 1.15} ${-h} L ${x + w * 1.15} ${-h} L ${x + w} 0 Z`} fill={bl(d.c, b)} stroke={OUT} stroke-width="0.5" />
                <ellipse cx={x} cy={-h} rx={w * 1.15} ry="1.4" fill="#3b2a5a" />
              </g>
            ))}
          </g>
        );
      }
      return (
        <g>
          <path d="M -9 0 L -13 -26 L 13 -26 L 9 0 Z" fill={bl(d.c, b)} stroke={OUT} stroke-width="0.5" />
          {[-20, -14, -8].map((y) => <path d={`M ${f(-9 + (y / 26) * 4)} ${y} Q 0 ${y + 2} ${f(9 - (y / 26) * 4)} ${y}`} stroke="rgba(0,0,0,0.2)" fill="none" />)}
          <ellipse cy="-26" rx="13" ry="3" fill="#4a2508" />
        </g>
      );
    case 'seagrass':
      return (
        <g fill="none" stroke={bl(d.c, b * 0.5)} stroke-width="1.6" stroke-linecap="round">
          {[-6, -3.5, -1, 1.5, 4, 6.5].map((x, i) => <path d={`M ${x} 0 Q ${x + (i % 2 ? 4 : -3)} -12 ${x + (i % 2 ? 2 : -1)} ${-20 - (i % 3) * 5}`} />)}
        </g>
      );
    case 'gardeneels':
      return (
        <g>
          {[-12, -4, 4, 12].map((x, i) => (
            <g>
              <ellipse cx={x} cy="0" rx="2.5" ry="0.8" fill="#6b5a3a" />
              <path d={`M ${x} 0 Q ${x - 3} -8 ${x} ${-14 - (i % 2) * 4} q 2 -3 4 -2`} stroke={d.c} stroke-width="2" fill="none" stroke-linecap="round" />
              <circle cx={x + 1} cy={-14 - (i % 2) * 4 - 1.2} r="0.6" fill={d.c2} />
              <circle cx={x - 1.5} cy={-8} r="0.5" fill={d.c2} />
            </g>
          ))}
        </g>
      );
    case 'octopus':
      return (
        <g>
          <g stroke={d.c} stroke-width="2" fill="none" stroke-linecap="round">
            {[-10, -6, -2, 2, 6, 10].map((x, i) => <path d={`M ${x * 0.4} -5 Q ${x} -1 ${x * 1.3} 0 q ${i % 2 ? 3 : -3} -1 ${i % 2 ? 2 : -2} -4`} />)}
          </g>
          <path d="M -6 -5 Q -9 -17 0 -18 Q 9 -17 6 -5 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          <circle cx="-2.5" cy="-8" r="1.3" fill="#fde68a" /><circle cx="2.5" cy="-8" r="1.3" fill="#fde68a" />
          <path d="M -3 -8 h 1 M 2 -8 h 1" stroke="#111" stroke-width="0.6" />
          {d.rings && [[-3, -13], [3, -14], [0, -16], [-5, -10], [5, -10], [-8, -1], [8, -1]].map(([x, y]) => <circle cx={x} cy={y} r="1.4" fill="none" stroke="#2563eb" stroke-width="0.8" />)}
        </g>
      );
    case 'cowrie':
      return (
        <g>
          <path d="M -9 0 Q -9 -9 0 -9 Q 9 -9 9 0 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          {[[-5, -4], [-1, -6], [3, -5], [5, -2], [-2, -2], [1, -3]].map(([x, y]) => <circle cx={x} cy={y} r="1.3" fill={d.c2} />)}
        </g>
      );
    case 'anemone': {
      const n = 17;
      return (
        <g>
          <path d="M -7 0 Q -8 -6 -6 -9 L 6 -9 Q 8 -6 7 0 Z" fill={bl('#c0765a', b)} />
          <g stroke-linecap="round" fill="none">
            {Array.from({ length: n }, (_, i) => {
              const a = -Math.PI + 0.25 + (i / (n - 1)) * (Math.PI - 0.5);
              const x = Math.cos(a) * 13, y = -9 + Math.sin(a) * 13;
              return (
                <g>
                  <path d={`M 0 -9 Q ${f(x * 0.5)} ${f(y - 4)} ${f(x)} ${f(y)}`} stroke={bl(d.c, b)} stroke-width="2.6" />
                  <circle cx={f(x)} cy={f(y)} r="1.4" fill={bl(d.tip, b)} />
                </g>
              );
            })}
          </g>
          {d.clowns && (
            <g>
              <g transform="translate(-5 -16) scale(0.6)"><Fish id="clown" s={CLOWN} /></g>
              <g transform="translate(6 -22) scale(-0.55 0.55)"><Fish id="clown" s={CLOWN} /></g>
            </g>
          )}
        </g>
      );
    }
    case 'clam':
      return (
        <g>
          <path d="M -12 0 L -12 -6 L 12 -6 L 12 0 Z" fill="#d8d2c4" stroke={OUT} stroke-width="0.5" />
          <path d="M -12 -6 L -9 -10 L -6 -6 L -3 -10 L 0 -6 L 3 -10 L 6 -6 L 9 -10 L 12 -6 Z" fill={bl(d.c, b)} stroke={OUT} stroke-width="0.4" />
          {[-8, -2, 4, 9].map((x) => <circle cx={x} cy="-7.5" r="0.9" fill={d.c2} />)}
          <path d="M -10 -3 L 10 -3" stroke="#bdb5a3" stroke-width="0.6" />
        </g>
      );
    case 'seahorse':
      return (
        <g transform="translate(0 -14)">
          <path d="M 2 -12 Q 6 -12 6 -9 L 10.5 -8.2 L 10.5 -6.6 L 5.6 -6.4 Q 6.4 -3 3.6 0 Q 5.6 5 2.6 9 Q 0.6 12 2.4 14 Q 5.4 15 4.4 17.4 Q 1.4 19.6 -1 16.2 Q -2.2 13 0 10 Q -3.2 6 -2 0 Q -3.2 -5 -1 -9 Q 0 -12 2 -12 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          <path d="M -2.3 -2 Q -6 0 -2.6 3" fill="#fde68a" opacity="0.8" />
          {[-6, -2, 2, 6].map((y) => <path d={`M -1.5 ${y} L 3 ${y + 0.5}`} stroke="rgba(0,0,0,0.2)" stroke-width="0.5" />)}
          <circle cx="3.6" cy="-9" r="0.9" fill="#111" />
          <path d="M 1 -12 L 1.5 -14 L 3 -12.3" fill={d.c} />
        </g>
      );
    case 'cuttle':
      return (
        <g>
          <ellipse cx="-2" rx="13" ry="6.5" fill={d.c2} opacity="0.9" />
          <ellipse cx="-2" rx="11" ry="5" fill={d.c} stroke={OUT} stroke-width="0.5" />
          {[-9, -5, -1, 3].map((x) => <path d={`M ${x} -4 Q ${x + 1} 0 ${x} 4`} stroke={d.c2} stroke-width="0.8" fill="none" />)}
          <path d="M 9 -2 Q 16 -3 17 -1 M 9 0 Q 16 0 17 1 M 9 1.5 Q 15 3 16 3" stroke={d.c} stroke-width="1.2" stroke-linecap="round" fill="none" />
          <circle cx="7" cy="-2.5" r="1.4" fill="#fde68a" />
          <path d="M 6.2 -2.5 q 0.8 0.8 1.6 0" stroke="#111" stroke-width="0.6" fill="none" />
        </g>
      );
    case 'moray':
      return (
        <g>
          <path d="M -16 0 Q -16 -14 -4 -15 Q 10 -16 14 -6 Q 16 -2 15 0 Z" fill={bl('#7a6a5a', b)} />
          <path d="M -2 -8 Q 2 -10 5 -7" fill="none" stroke="#3a2f26" stroke-width="3" stroke-linecap="round" />
          <path d="M 2 -9 Q 6 -22 14 -20 Q 20 -19 21 -15 L 17 -14 L 19 -12 Q 12 -12 9 -16 Q 6 -11 5 -8 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          {[[8, -17], [5, -13], [12, -18]].map(([x, y]) => <circle cx={x} cy={y} r="0.9" fill={d.c2} />)}
          <circle cx="16" cy="-17.5" r="0.9" fill="#fde68a" />
        </g>
      );
    case 'shark':
      if (d.whale) {
        return (
          <g>
            <path d="M -26 0 L -38 -12 L -35 0 L -39 11 Z" fill={d.c} />
            <path d="M -4 -7 L 2 -15 L 6 -7 Z" fill={d.c} />
            <path d="M 26 -1 Q 26 -9 12 -10 L -10 -8 Q -24 -6 -28 0 Q -24 5 -10 6 L 12 7 Q 26 6 26 -1 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
            <path d="M 26 1 Q 18 7 8 6 Q 14 3 26 1 Z" fill="#dfe8ee" />
            {Array.from({ length: 18 }, (_, i) => <circle cx={-22 + (i % 9) * 5 + (i > 8 ? 2.5 : 0)} cy={i > 8 ? -2 : -6} r="0.9" fill="#f1f5f9" />)}
            {[-14, -6, 2, 10].map((x) => <path d={`M ${x} -9 L ${x} 4`} stroke="#f1f5f9" stroke-width="0.5" opacity="0.6" />)}
            <path d="M 4 5 L -2 13 L 10 6 Z" fill={d.c} />
            <circle cx="22" cy="-3" r="0.8" fill="#111" />
          </g>
        );
      }
      return (
        <g>
          <path d="M -16 0 L -24 -10 L -21 0 L -24 6 Z" fill={d.c} />
          <path d="M -24 -10 L -22 -7" stroke={d.tip} stroke-width="1.5" />
          <path d="M 18 0 Q 14 -6 2 -6 L -12 -3 Q -18 -1 -18 0 Q -16 2 -8 3 L 6 4 Q 14 4 18 0 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          <path d="M 18 0 Q 10 4 2 4 Q 10 1.5 18 0 Z" fill="#f1f5f9" />
          <path d="M -1 -6 L 3 -13 L 6 -6 Z" fill={d.c} /><path d="M 1.5 -10.5 L 3 -13 L 4.5 -10.5 Z" fill={d.tip} />
          <path d="M 4 3 L 0 9 L 9 3.5 Z" fill={d.c} /><path d="M 1.2 7.4 L 0 9 L 2.6 7.8 Z" fill={d.tip} />
          <circle cx="13" cy="-1.5" r="0.7" fill="#111" />
          {[8, 9.5, 11].map((x) => <path d={`M ${x} -2.5 L ${x - 0.5} 1`} stroke="rgba(0,0,0,0.35)" stroke-width="0.4" />)}
        </g>
      );
    case 'ray':
      return d.manta ? (
        <g>
          <path d="M -6 0 L -26 2" stroke={d.c} stroke-width="0.8" />
          <path d="M 12 0 Q 2 -4 -2 -20 Q -6 -6 -8 0 Q -6 6 -2 20 Q 2 4 12 0 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          <path d="M 4 -2 Q -2 -2 -4 -10 M 4 2 Q -2 2 -4 10" stroke={d.belly} stroke-width="1" fill="none" opacity="0.5" />
          <path d="M 12 -2 q 4 -1 4 -3 M 12 2 q 4 1 4 3" stroke={d.c} stroke-width="1.5" fill="none" stroke-linecap="round" />
        </g>
      ) : (
        <g>
          <path d="M -6 0 Q -20 1 -30 4" stroke={d.c} stroke-width="0.7" fill="none" />
          <path d="M 13 0 Q 3 -3 -2 -16 Q -5 -5 -7 0 Q -5 5 -2 16 Q 3 3 13 0 Z" fill={d.c} stroke={OUT} stroke-width="0.5" />
          {d.spots && [[0, -6], [-3, -10], [3, -3], [0, 6], [-3, 10], [3, 3], [-5, 0]].map(([x, y]) => <circle cx={x} cy={y} r="0.9" fill={d.spots} />)}
        </g>
      );
    case 'turtle':
      return (
        <g>
          <path d="M 2 4 Q -2 14 -10 16 Q -4 10 -4 4 Z" fill={d.c} />
          <path d="M -10 2 Q -14 7 -18 7 Q -15 4 -14 1 Z" fill={d.c} />
          <path d="M 10 -1 Q 16 -4 19 -1 Q 18 2 12 2 Z" fill={d.c} stroke={OUT} stroke-width="0.4" />
          <path d="M -14 1 Q -12 -11 0 -11 Q 12 -11 12 1 Q 0 4 -14 1 Z" fill={d.shell} stroke={OUT} stroke-width="0.5" />
          <path d="M -8 -1 L -4 -8 L 4 -8 L 7 -1 M -4 -8 L 0 -2 L 4 -8" stroke="rgba(255,255,255,0.35)" stroke-width="0.6" fill="none" />
          <circle cx="16.5" cy="-1.5" r="0.7" fill="#111" />
          <path d="M 6 2 Q 10 10 4 16 Q 2 10 0 3 Z" fill={d.c} opacity="0.8" />
        </g>
      );
    case 'whale':
      return (
        <g fill={d.c}>
          <path d="M 30 -2 Q 28 -10 10 -10 L -20 -6 Q -30 -4 -34 0 L -42 -8 L -40 0 L -43 7 L -34 2 Q -24 6 -10 7 L 12 8 Q 30 7 30 -2 Z" />
          <path d="M 12 4 Q 6 18 -6 22 Q 2 12 4 5 Z" />
          <path d="M -12 -6 L -9 -10 L -6 -6 Z" />
          <path d="M 30 0 Q 20 6 4 6" stroke="rgba(255,255,255,0.25)" stroke-width="0.6" fill="none" />
        </g>
      );
    case 'mushroom':
      return (
        <g>
          <ellipse cy="-2.5" rx="9" ry="3" fill={bl(d.c, b)} stroke={OUT} stroke-width="0.5" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <path d={`M 0 -3 L ${f(Math.cos(a) * 8)} ${f(-2.5 + Math.sin(a) * 2.6)}`} stroke="rgba(0,0,0,0.18)" stroke-width="0.4" />;
          })}
          <ellipse cy="-3" rx="1.6" ry="0.6" fill="#7e22ce" />
        </g>
      );
  }
}

const CLOWN: FishSpec = {
  kind: 'fish', L: 14, h: 7, body: '#f97316', fin: '#f97316', tail: 'round', dorsal: 'low',
  pat: [{ t: 'band', x: 0.25, w: 0.12, c: '#fff' }, { t: 'band', x: -0.02, w: 0.14, c: '#fff' }, { t: 'band', x: -0.38, w: 0.1, c: '#fff' }],
};

export function Creature({ org, b = 0 }: { org: Organism; b?: number }) {
  const d = org.draw;
  return d.kind === 'fish' ? <Fish s={d} id={org.id} /> : <Other d={d} id={org.id} b={b} />;
}

/** a single organism in its own little picture (collection, picks) */
export function CreatureIcon({ org, size = 64, locked = false }: { org: Organism; size?: number; locked?: boolean }) {
  // fit the picture to the drawing itself, so small fish and big sharks fill their tile alike
  const svg = useRef<SVGSVGElement>(null);
  const g = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    try {
      const b = g.current!.getBBox();
      const side = Math.max(b.width, b.height / 0.87) * 1.12;
      if (side > 0) svg.current!.setAttribute('viewBox', `${f(b.x + b.width / 2 - side / 2)} ${f(b.y + b.height / 2 - (side * 0.87) / 2)} ${f(side)} ${f(side * 0.87)}`);
    } catch { /* not rendered yet (hidden): keep the default box */ }
  }, [org.id]);
  return (
    <svg ref={svg} viewBox="-30 -26 60 52" width={size} height={size * 0.87} class={'reef-icon' + (locked ? ' locked' : '')} aria-hidden="true">
      <g ref={g}><Creature org={org} /></g>
    </svg>
  );
}

// ---------------------------------------------------------------- coral
export function Coral({ sp, s, seed, b }: { sp: CoralSpecies; s: number; seed: string; b: number }) {
  const c = bl(sp.c, b), c2 = bl(sp.c2, b);
  const r = rng(seed);
  switch (sp.kind) {
    case 'staghorn': {
      const segs: JSX.Element[] = [];
      const grow = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        segs.push(<path d={`M ${f(x)} ${f(y)} L ${f(x2)} ${f(y2)}`} stroke={c} stroke-width={f(w)} />);
        if (depth <= 0) { segs.push(<circle cx={f(x2)} cy={f(y2)} r={f(w * 0.55)} fill={c2} />); return; }
        const n = r() < 0.5 ? 2 : 3;
        for (let i = 0; i < n; i++) grow(x2, y2, a + (i - (n - 1) / 2) * (0.5 + r() * 0.3), len * (0.7 + r() * 0.15), w * 0.78, depth - 1);
      };
      grow(0, 0, -Math.PI / 2 + (r() - 0.5) * 0.3, 12, 4, 3);
      return <g transform={`scale(${f(s)})`} stroke-linecap="round" fill="none">{segs}</g>;
    }
    case 'brain': {
      const grooves: JSX.Element[] = [];
      for (let i = 0; i < 6; i++) {
        const y = -3 - i * 3.2, w = 16 * Math.sqrt(Math.max(0, 1 - ((y + 0) / 20) ** 2));
        grooves.push(<path d={`M ${f(-w)} ${f(y)} q ${f(w / 4)} -2 ${f(w / 2)} 0 t ${f(w / 2)} 0 t ${f(w / 2)} 0 t ${f(w / 2)} 0`} stroke="rgba(0,0,0,0.22)" stroke-width="0.9" fill="none" />);
      }
      return (
        <g transform={`scale(${f(s)})`}>
          <path d="M -17 0 Q -18 -21 0 -21 Q 18 -21 17 0 Z" fill={c} stroke="rgba(0,0,0,0.2)" stroke-width="0.5" />
          {grooves}
          <path d="M -12 -15 Q -6 -19 0 -19" stroke={c2} stroke-width="1.2" fill="none" opacity="0.7" />
        </g>
      );
    }
    case 'table':
      return (
        <g transform={`scale(${f(s)})`}>
          <path d="M -2.5 0 L -2 -16 L 2 -16 L 2.5 0 Z" fill={c} />
          <path d="M -22 -16 Q 0 -24 22 -16 Q 0 -13 -22 -16 Z" fill={c} stroke="rgba(0,0,0,0.2)" stroke-width="0.5" />
          {Array.from({ length: 9 }, (_, i) => <circle cx={-18 + i * 4.5} cy={-17.6 - Math.sin((i / 8) * Math.PI) * 2.5} r="1" fill={c2} />)}
        </g>
      );
    case 'pillar':
      return (
        <g transform={`scale(${f(s)})`}>
          {[[-8, 20, 3.4], [-2, 30, 4], [5, 24, 3.6], [10, 14, 3]].map(([x, h, w]) => (
            <g>
              <rect x={x - w} y={-h} width={w * 2} height={h} rx={w} fill={c} stroke="rgba(0,0,0,0.18)" stroke-width="0.5" />
              {[0.2, 0.45, 0.7].map((t) => <path d={`M ${x - w} ${f(-h * t)} h ${w * 2}`} stroke={c2} stroke-width="0.8" opacity="0.7" stroke-dasharray="1 1.2" />)}
            </g>
          ))}
        </g>
      );
    case 'lettuce':
      return (
        <g transform={`scale(${f(s)})`}>
          {[[-6, -14, -20], [5, -18, 15], [0, -10, 0], [-10, -7, -35], [10, -8, 30]].map(([x, h, rot]) => (
            <path d={`M ${x} 0 Q ${x - 9} ${h} ${x} ${h - 6} Q ${x + 9} ${h} ${x} 0 Z`} fill={c} stroke={c2} stroke-width="0.8" transform={`rotate(${rot} ${x} 0)`} />
          ))}
        </g>
      );
    case 'finger':
      return (
        <g transform={`scale(${f(s)})`} stroke-linecap="round" fill="none">
          <path d="M -12 0 Q -12 -10 0 -11 Q 12 -10 12 0 Z" fill={c} stroke="none" />
          {Array.from({ length: 9 }, (_, i) => {
            const x = -10 + i * 2.5, h = 8 + ((i * 7) % 5) * 2.6;
            return <path d={`M ${x} -8 Q ${x + (i % 2 ? 2 : -2)} ${-8 - h / 2} ${x + (i % 3) - 1} ${-8 - h}`} stroke={i % 2 ? c : c2} stroke-width="3.2" />;
          })}
        </g>
      );
  }
}
