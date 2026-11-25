/** Shared helpers for the hand-drawn biology diagrams. */
import type { JSX } from 'preact';

export const HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";
export const SANS = "'Segoe UI', system-ui, sans-serif";

/** small label */
export const L = (x: number, y: number, s: string, size = 8, anchor: 'start' | 'middle' | 'end' = 'start', italic = false) => (
  <text x={x} y={y} font-family={SANS} font-size={size} text-anchor={anchor} font-style={italic ? 'italic' : 'normal'} class="lbl">{s}</text>
);
/** handwritten title */
export const H = (x: number, y: number, s: string, size = 13) => (
  <text x={x} y={y} font-family={HAND} font-size={size} class="ttl">{s}</text>
);
export const arrowHead = (x: number, y: number, angleDeg: number, s = 5) => {
  const a = (angleDeg * Math.PI) / 180;
  const p1 = [x - s * Math.cos(a - 0.45), y - s * Math.sin(a - 0.45)];
  const p2 = [x - s * Math.cos(a + 0.45), y - s * Math.sin(a + 0.45)];
  return <path d={`M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L ${x} ${y} L ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`} />;
};

export interface Art { w: number; h: number; el: JSX.Element }
