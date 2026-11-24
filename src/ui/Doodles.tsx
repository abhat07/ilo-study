/**
 * Hand-drawn style bio/biochem doodles for the home page margins.
 * Decorative only (aria-hidden), behind the content, and they draw themselves in.
 */
import type { JSX } from 'preact';

const HAND = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive";

type D = { x: string; y: string; size: number; rot: number; delay: number; mobile?: boolean; art: JSX.Element };

const T = (x: number, y: number, s: string, size = 16) => (
  <text x={x} y={y} font-family={HAND} font-size={size} fill="currentColor" stroke="none">{s}</text>
);

/** DNA double helix */
const helix = (
  <g>
    <path d="M30 6 C 80 26, 80 46, 30 66 S -20 106, 30 126 S 80 166, 30 186" />
    <path d="M70 6 C 20 26, 20 46, 70 66 S 120 106, 70 126 S 20 166, 70 186" />
    {[22, 50, 82, 110, 142, 170].map((y) => <path d={`M${y % 56 < 28 ? 38 : 34} ${y} L ${y % 56 < 28 ? 62 : 66} ${y + 1}`} />)}
  </g>
);

/** Phenol: benzene ring with OH */
const phenol = (
  <g>
    <path d="M50 18 L 80 35 L 80 70 L 50 87 L 20 70 L 20 35 Z" />
    <circle cx="50" cy="52" r="18" />
    <path d="M50 18 L 50 2" />
    {T(40, 0, 'OH', 15)}
  </g>
);

/** Glucose-style pyranose ring */
const sugar = (
  <g>
    <path d="M20 50 L 42 30 L 78 30 L 98 50 L 78 70 L 42 70 Z" />
    {T(84, 47, 'O', 13)}
    <path d="M42 30 L 38 14 M78 70 L 82 88 M20 50 L 6 54" />
    {T(26, 12, 'OH', 12)}
    {T(76, 102, 'OH', 12)}
  </g>
);

/** Mitochondrion with cristae */
const mito = (
  <g>
    <ellipse cx="60" cy="40" rx="54" ry="30" />
    <path d="M14 40 C 22 18, 30 62, 38 36 S 52 60, 60 34 S 74 62, 82 36 S 96 58, 104 40" />
  </g>
);

/** Animal cell */
const cell = (
  <g>
    <path d="M60 6 C 100 4, 116 40, 110 66 C 104 100, 64 116, 34 104 C 6 92, 2 54, 14 32 C 24 14, 40 7, 60 6 Z" />
    <circle cx="58" cy="58" r="20" />
    <circle cx="62" cy="54" r="6" />
    <path d="M24 70 C 30 66, 34 76, 40 72 M86 30 C 90 36, 96 32, 98 38 M84 86 l 4 2 M30 40 l 3 -3" />
  </g>
);

/** Amino acid */
const amino = (
  <g>
    {T(0, 44, 'H₂N', 16)}
    <path d="M38 38 L 56 38 M80 38 L 98 38 M68 30 L 68 14 M68 46 L 68 62" />
    {T(61, 44, 'C', 16)}
    {T(100, 44, 'COOH', 16)}
    {T(63, 12, 'H', 14)}
    {T(64, 78, 'R', 16)}
  </g>
);

/** X chromosome */
const chromosome = (
  <g>
    <path d="M20 10 C 34 30, 40 40, 46 50 C 40 62, 32 74, 18 96" />
    <path d="M34 8 C 44 28, 50 40, 52 50 C 50 62, 44 76, 32 98" />
    <path d="M86 10 C 72 30, 66 40, 60 50 C 66 62, 74 74, 88 96" />
    <path d="M72 8 C 62 28, 56 40, 54 50 C 56 62, 62 76, 74 98" />
  </g>
);

/** Punnett square */
const punnett = (
  <g>
    <path d="M20 20 L 100 20 L 100 100 L 20 100 Z M60 20 L 60 100 M20 60 L 100 60" />
    {T(34, 14, 'A', 14)}{T(76, 14, 'a', 14)}{T(4, 46, 'A', 14)}{T(6, 86, 'a', 14)}
    {T(28, 46, 'AA', 14)}{T(68, 46, 'Aa', 14)}{T(28, 86, 'Aa', 14)}{T(70, 86, 'aa', 14)}
  </g>
);

/** Erlenmeyer flask with bubbles */
const flask = (
  <g>
    <path d="M44 6 L 44 40 L 14 96 C 12 102, 16 106, 22 106 L 86 106 C 92 106, 96 102, 94 96 L 64 40 L 64 6" />
    <path d="M38 6 L 70 6 M24 78 C 44 72, 64 84, 84 78" />
    <circle cx="48" cy="92" r="4" /><circle cx="62" cy="86" r="3" /><circle cx="56" cy="64" r="2.5" />
  </g>
);

/** ATP: base + ribose + three phosphates */
const atp = (
  <g>
    <path d="M10 30 L 26 18 L 42 30 L 36 48 L 16 48 Z" />
    <path d="M42 30 L 58 34" />
    {[70, 96, 122].map((x, i) => (
      <g>
        <circle cx={x} cy="36" r="10" />
        {T(x - 5, 41, 'P', 13)}
        {i < 2 && <path d={`M${x + 10} 36 L ${x + 16} 36`} />}
      </g>
    ))}
    {T(14, 70, 'ATP', 16)}
  </g>
);

/** Enzyme + substrate (lock and key) */
const enzyme = (
  <g>
    <path d="M10 60 C 8 24, 40 6, 70 14 L 70 40 L 54 40 L 54 62 L 70 62 L 70 92 C 40 104, 12 92, 10 60 Z" />
    <path d="M84 40 L 100 40 L 100 62 L 84 62 Z" />
    <path d="M78 30 C 82 26, 86 26, 90 30" />
    {T(18, 120, 'E + S', 14)}
  </g>
);

/** Virus */
const virus = (
  <g>
    <path d="M50 20 L 76 34 L 76 64 L 50 78 L 24 64 L 24 34 Z" />
    {[[50, 20, 50, 6], [76, 34, 88, 26], [76, 64, 88, 72], [50, 78, 50, 92], [24, 64, 12, 72], [24, 34, 12, 26]].map(([a, b, c, d]) => (
      <g><path d={`M${a} ${b} L ${c} ${d}`} /><circle cx={c} cy={d} r="3" /></g>
    ))}
  </g>
);

/** Pipette tip */
const pipette = (
  <g>
    <path d="M40 4 L 60 4 L 60 40 L 54 100 L 50 116 L 46 100 L 40 40 Z" />
    <path d="M40 22 L 60 22 M44 60 L 56 60" />
    <path d="M50 124 C 48 128, 52 130, 50 134" />
  </g>
);

const DOODLES: D[] = [
  { x: '2%', y: '12%', size: 130, rot: -8, delay: 0, mobile: true, art: phenol },
  { x: '6%', y: '38%', size: 120, rot: 10, delay: 0.4, art: mito },
  { x: '1.5%', y: '60%', size: 120, rot: -4, delay: 0.8, mobile: true, art: amino },
  { x: '7%', y: '82%', size: 110, rot: 6, delay: 1.2, art: punnett },
  { x: '14%', y: '24%', size: 80, rot: 14, delay: 1.6, art: virus },
  { x: '13%', y: '70%', size: 90, rot: -12, delay: 2.0, art: pipette },
  { x: '88%', y: '6%', size: 110, rot: 8, delay: 0.2, mobile: true, art: helix },
  { x: '80%', y: '30%', size: 120, rot: -6, delay: 0.6, art: cell },
  { x: '90%', y: '48%', size: 110, rot: 12, delay: 1.0, art: chromosome },
  { x: '82%', y: '66%', size: 130, rot: -4, delay: 1.4, mobile: true, art: atp },
  { x: '91%', y: '84%', size: 100, rot: 6, delay: 1.8, art: flask },
  { x: '75%', y: '88%', size: 100, rot: -10, delay: 2.2, art: sugar },
  { x: '79%', y: '12%', size: 90, rot: 4, delay: 2.4, art: enzyme },
];

export function Doodles() {
  return (
    <div class="doodles" aria-hidden="true">
      {DOODLES.map((d, i) => (
        <svg
          key={i}
          class={'doodle' + (d.mobile ? ' keep' : '')}
          viewBox="-8 -12 150 150"
          width={d.size}
          height={d.size}
          style={{ left: d.x, top: d.y, '--rot': `${d.rot}deg`, '--delay': `${d.delay}s`, '--float': `${6 + (i % 4)}s` }}
        >
          {d.art}
        </svg>
      ))}
    </div>
  );
}
