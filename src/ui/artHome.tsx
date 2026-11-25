/**
 * Detailed molecular-biology line drawings (home page set) (university / postgraduate level).
 * Hand-authored SVG so they stay sharp, recolour with the theme, work offline and need no image licences.
 * Decorative only: aria-hidden, behind the content, and they draw themselves in.
 */
import type { JSX } from 'preact';
import { H, L, arrowHead, type Art } from './artkit';
void H; void L; void arrowHead;

// ---------------------------------------------------------------- ATP
export const atp: Art = {
  w: 310, h: 175,
  el: (
    <g>
      {/* adenine: pyrimidine ring fused to imidazole */}
      <path d="M60 48 L 79 59 L 79 81 L 60 92 L 41 81 L 41 59 Z" />
      <path d="M45 62 L 58 54 M45 78 L 58 86" />
      <path d="M79 59 L 98 53 L 108 70 L 98 87 L 79 81" />
      <path d="M100 58 L 106 69" />
      <path d="M60 48 L 60 32" />
      {L(52, 28, 'NH₂', 9)}
      {L(34, 61, 'N', 9)}{L(57, 101, 'N', 9)}{L(99, 50, 'N', 9)}{L(96, 97, 'N', 9)}
      {/* N9–C1′ glycosidic bond */}
      <path d="M98 87 L 118 108" />
      {L(92, 112, 'β-N9', 7, 'end', true)}
      {/* ribose */}
      <path d="M118 108 L 140 96 L 162 108 L 156 133 L 124 133 Z" />
      {L(137, 92, 'O', 9)}
      <path d="M124 133 L 124 150 M156 133 L 156 150" />
      {L(116, 160, 'OH', 8)}{L(149, 160, 'OH', 8)}
      {L(113, 125, "1′", 6)}{L(126, 128, "2′", 6)}{L(150, 128, "3′", 6)}{L(164, 116, "4′", 6)}
      <path d="M162 108 L 178 98" />{L(172, 94, "5′", 6)}
      <path d="M178 98 L 192 98" />{L(193, 101, 'O', 9)}
      {/* triphosphate */}
      {[214, 250, 286].map((x, i) => (
        <g>
          <path d={`M${x - 14} 98 L ${x - 5} 98`} />
          {L(x - 4, 101, 'P', 10)}
          <path d={`M${x + 1} 90 L ${x + 1} 78 M${x + 4} 90 L ${x + 4} 78`} />
          {L(x - 3, 74, 'O', 9)}
          <path d={`M${x + 2} 104 L ${x + 2} 116`} />
          {L(x - 4, 126, 'O⁻', 9)}
          {i < 2 && <path d={`M${x + 8} 98 L ${x + 16} 98`} />}
          {i < 2 && L(x + 17, 101, 'O', 9)}
          {L(x + 1, 66, ['α', 'β', 'γ'][i], 9, 'middle', true)}
        </g>
      ))}
      <path d="M294 98 L 303 98" />{L(304, 101, 'O⁻', 9)}
      {/* phosphoanhydride bond annotation */}
      <path d="M266 128 C 262 140, 252 146, 240 148" stroke-dasharray="3 3" />
      {L(184, 160, 'ΔG°′ = −30.5 kJ mol⁻¹', 8)}
      {H(8, 168, 'ATP', 15)}
    </g>
  ),
};

// ---------------------------------------------------------------- B-DNA
export const bdna: Art = (() => {
  // Two strands offset by ~0.6 turn so the major and minor grooves differ in width, as in B-DNA.
  const P = 120, A = 42, cx = 70, top = 14, bottom = 274;
  const x1 = (y: number) => cx + A * Math.sin((2 * Math.PI * (y - top)) / P);
  const x2 = (y: number) => cx + A * Math.sin((2 * Math.PI * (y - top)) / P + 0.62 * 2 * Math.PI);
  const pts = (f: (y: number) => number) => {
    const o: string[] = [];
    for (let y = top; y <= bottom; y += 3) o.push(`${f(y).toFixed(1)},${y}`);
    return o.join(' ');
  };
  const rungs: JSX.Element[] = [];
  for (let y = top + 6; y < bottom; y += 11) {
    const a = x1(y), b = x2(y);
    // solid rungs = G≡C-style, dashed = A=T-style, alternating for texture
    if (Math.abs(a - b) > 8) {
      const d = `M${(Math.min(a, b) + 2).toFixed(1)} ${y} L ${(Math.max(a, b) - 2).toFixed(1)} ${y}`;
      rungs.push(y % 22 < 11 ? <path d={d} /> : <path d={d} stroke-dasharray="5 2" />);
    }
  }
  return {
    w: 200, h: 300,
    el: (
      <g>
        <polyline points={pts(x1)} stroke-width="2.2" />
        <polyline points={pts(x2)} stroke-width="2.2" />
        {rungs}
        <path d={`M140 ${top} L 140 ${top + P}`} />
        <path d={`M135 ${top} L 145 ${top} M135 ${top + P} L 145 ${top + P}`} />
        {L(146, top + 56, '3.4 nm', 8)}
        {L(146, top + 66, '10.5 bp/turn', 8)}
        {L(146, top + 150, 'major groove', 8, 'start', true)}
        <path d="M144 162 L 112 154" />
        {L(146, top + 210, 'minor groove', 8, 'start', true)}
        <path d="M144 222 L 104 214" />
        {L(146, top + 100, '2 nm Ø', 8)}
        {L(18, 10, "5′", 8)}{L(112, 10, "3′", 8)}
        {L(4, 290, 'A=T  G≡C', 8)}
        {H(120, 296, 'B-DNA', 13)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- Electron transport chain + ATP synthase
export const etc: Art = {
  w: 370, h: 230,
  el: (
    <g>
      {/* lipid bilayer */}
      {Array.from({ length: 30 }, (_, i) => 10 + i * 12).map((x) => (
        <g>
          <circle cx={x} cy={84} r={3.6} />
          <path d={`M${x - 1.5} 88 L ${x - 1.5} 102 M${x + 1.5} 88 L ${x + 1.5} 102`} />
          <circle cx={x} cy={132} r={3.6} />
          <path d={`M${x - 1.5} 128 L ${x - 1.5} 114 M${x + 1.5} 128 L ${x + 1.5} 114`} />
        </g>
      ))}
      {L(4, 16, 'intermembrane space', 8, 'start', true)}
      {L(150, 222, 'matrix', 8, 'middle', true)}
      {/* Complex I (L-shaped) */}
      <path class="solid" d="M28 70 Q 26 62 36 62 L 70 62 Q 78 62 78 72 L 78 140 Q 78 150 70 150 L 66 150 L 66 178 Q 66 188 56 188 L 40 188 Q 30 188 30 178 L 30 150 Q 28 150 28 142 Z" />
      {L(50, 112, 'I', 12, 'middle')}
      {L(48, 202, 'NADH → NAD⁺', 7, 'middle')}
      {/* Complex II */}
      <path class="solid" d="M92 112 Q 92 104 100 104 L 116 104 Q 124 104 124 112 L 124 160 Q 124 168 116 168 L 100 168 Q 92 168 92 160 Z" />
      {L(108, 142, 'II', 10, 'middle')}
      {L(108, 180, 'succ → fum', 7, 'middle')}
      {/* Q */}
      <circle class="solid" cx={140} cy={108} r={8} />
      {L(140, 111, 'Q', 8, 'middle')}
      {/* Complex III */}
      <path class="solid" d="M156 70 Q 156 60 166 60 L 196 60 Q 206 60 206 70 L 206 150 Q 206 160 196 160 L 166 160 Q 156 160 156 150 Z" />
      {L(181, 114, 'III', 11, 'middle')}
      {/* cyt c */}
      <circle class="solid" cx={224} cy={56} r={9} />
      {L(224, 59, 'c', 9, 'middle', true)}
      {/* Complex IV */}
      <path class="solid" d="M240 66 Q 240 58 248 58 L 278 58 Q 286 58 286 66 L 286 152 Q 286 160 278 160 L 248 160 Q 240 160 240 152 Z" />
      {L(263, 114, 'IV', 11, 'middle')}
      {L(263, 182, '½O₂ + 2H⁺ → H₂O', 7, 'middle')}
      {/* ATP synthase: Fo ring + stalk + F1 head */}
      <path class="solid" d="M304 90 Q 304 80 314 80 L 346 80 Q 356 80 356 90 L 356 126 Q 356 136 346 136 L 314 136 Q 304 136 304 126 Z" />
      <path d="M312 84 L 312 132 M322 84 L 322 132 M332 84 L 332 132 M342 84 L 342 132" stroke-dasharray="2 3" />
      <path d="M326 136 L 326 158 M334 136 L 334 158" />
      <path d="M358 96 L 364 96 L 364 176" />
      <circle class="solid" cx={330} cy={182} r={22} />
      <path d="M330 160 L 330 204 M311 171 L 349 193 M311 193 L 349 171" stroke-dasharray="2 3" />
      {L(330, 62, 'Fₒ', 9, 'middle')}{L(330, 216, 'F₁', 9, 'middle')}
      {L(300, 226, 'ADP + Pᵢ → ATP', 7, 'start')}
      {/* proton pumping */}
      {[50, 181, 263].map((x) => (
        <g>
          <path d={`M${x + 18} 170 L ${x + 18} 36`} stroke-dasharray="4 3" />
          {arrowHead(x + 18, 36, -90)}
          {L(x + 22, 34, x === 50 ? '4H⁺' : x === 181 ? '4H⁺' : '2H⁺', 8)}
        </g>
      ))}
      <path d="M318 30 L 318 74" stroke-dasharray="4 3" />{arrowHead(318, 74, 90)}
      {L(322, 30, 'H⁺', 8)}
      {/* electron path */}
      <path d="M56 100 C 90 80, 120 96, 134 104 M148 104 C 154 104, 158 100, 162 96 M196 66 C 204 56, 210 54, 215 55 M233 58 C 240 60, 244 66, 248 72" stroke-dasharray="1 3" stroke-width="2.4" />
      {L(96, 82, 'e⁻', 9, 'middle', true)}
      {H(150, 20, 'oxidative phosphorylation', 12)}
      {L(290, 8, 'Δp ≈ 180 mV', 8)}
    </g>
  ),
};

// ---------------------------------------------------------------- TCA cycle
export const tca: Art = (() => {
  const cx = 140, cy = 140, r = 82;
  const names = ['citrate', 'isocitrate', 'α-ketoglutarate', 'succinyl-CoA', 'succinate', 'fumarate', 'L-malate', 'oxaloacetate'];
  const pos = (deg: number, rr = r) => [cx + rr * Math.sin((deg * Math.PI) / 180), cy - rr * Math.cos((deg * Math.PI) / 180)];
  const outs: [number, string][] = [[90, 'NADH + CO₂'], [135, 'NADH + CO₂'], [180, 'GTP'], [225, 'FADH₂'], [270, '+H₂O'], [315, 'NADH']];
  return {
    w: 290, h: 290,
    el: (
      <g>
        <circle cx={cx} cy={cy} r={r} stroke-dasharray="0" />
        {[45, 90, 135, 180, 225, 270, 315, 360].map((d) => {
          const [x, y] = pos(d - 8);
          return arrowHead(x, y, d + 90 - 8 + 0);
        })}
        {names.map((n, i) => {
          const d = 22.5 + i * 45;
          const [x, y] = pos(d, r);
          const [tx, ty] = pos(d, r - 26);
          return (
            <g>
              <circle cx={x} cy={y} r={4} />
              {L(tx, ty + 3, n, 8, 'middle')}
            </g>
          );
        })}
        {outs.map(([d, s]) => {
          const [x1, y1] = pos(d, r + 2);
          const [x2, y2] = pos(d, r + 22);
          const [tx, ty] = pos(d, r + 32);
          return (
            <g>
              <path d={`M${x1} ${y1} L ${x2} ${y2}`} />
              {arrowHead(x2, y2, d - 90)}
              {L(tx, ty + 3, s, 7.5, d > 180 ? 'end' : d === 180 ? 'middle' : 'start')}
            </g>
          );
        })}
        <path d={`M${cx} 22 L ${cx} ${cy - r - 2}`} />
        {arrowHead(cx, cy - r - 2, 90)}
        {L(cx + 4, 20, 'acetyl-CoA (C₂)', 8)}
        {H(cx - 34, cy + 5, 'TCA cycle', 13)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- CRISPR-Cas9
export const crispr: Art = {
  w: 320, h: 180,
  el: (
    <g>
      {/* Cas9 bilobed */}
      <path d="M70 70 C 60 28, 120 8, 180 18 C 236 26, 262 54, 250 82 C 244 96, 220 98, 200 94 L 120 94 C 96 96, 74 90, 70 70 Z" />
      <path d="M72 108 C 66 136, 110 160, 170 158 C 230 156, 262 138, 252 112 C 248 102, 230 100, 210 102 L 110 102 C 90 100, 76 100, 72 108 Z" />
      {L(150, 44, 'REC lobe', 9, 'middle', true)}
      {L(110, 140, 'HNH', 9, 'middle')}{L(210, 140, 'RuvC', 9, 'middle')}
      {/* target DNA with R-loop */}
      <path d="M4 92 L 96 92 C 110 92, 112 112, 126 112 L 214 112 C 228 112, 230 92, 244 92 L 316 92" />
      <path d="M4 100 L 96 100 C 110 100, 112 86, 126 86 L 214 86 C 228 86, 230 100, 244 100 L 316 100" />
      {/* sgRNA spacer pairing with target strand */}
      <path d="M126 106 L 214 106" stroke-dasharray="3 2" />
      {Array.from({ length: 12 }, (_, i) => 130 + i * 7.3).map((x) => <path d={`M${x} 106 L ${x} 111`} />)}
      {/* sgRNA scaffold hairpins */}
      <path d="M126 106 C 116 106, 112 120, 104 122 C 92 126, 88 116, 96 112 C 102 108, 96 100, 88 100" />
      <path d="M214 106 C 226 106, 232 64, 246 60 C 262 56, 270 70, 258 74 C 250 78, 254 46, 270 42 C 284 40, 286 54, 276 56" />
      {L(272, 36, 'sgRNA', 9)}
      {/* PAM */}
      <rect x={244} y={78} width={30} height={12} rx={3} />
      {L(259, 87, 'NGG', 8, 'middle')}
      {L(259, 124, 'PAM', 8, 'middle', true)}
      {/* cut sites: 3 bp upstream of PAM */}
      <path d="M222 80 l 4 6 l -4 6 M222 106 l 4 6 l -4 6" />
      {L(200, 172, 'blunt DSB, 3 bp 5′ of PAM', 8, 'middle')}
      {L(4, 86, "5′", 8)}{L(306, 86, "3′", 8)}
      {L(130, 128, '20-nt spacer', 7, 'start', true)}
      {H(6, 22, 'CRISPR–Cas9', 13)}
    </g>
  ),
};

// ---------------------------------------------------------------- Michaelis–Menten + Lineweaver–Burk inset
export const mm: Art = (() => {
  const pts: string[] = [];
  for (let s = 0; s <= 190; s += 5) pts.push(`${30 + s},${(160 - (120 * s) / (40 + s)).toFixed(1)}`);
  return {
    w: 330, h: 195,
    el: (
      <g>
        <path d="M30 10 L 30 160 L 230 160" />
        {arrowHead(30, 10, -90)}{arrowHead(230, 160, 0)}
        <polyline points={pts.join(' ')} />
        <path d="M30 40 L 225 40" stroke-dasharray="5 4" />
        <path d="M30 100 L 70 100 L 70 160" stroke-dasharray="3 3" />
        {L(26, 43, 'Vmax', 8, 'end')}
        {L(26, 103, 'Vmax/2', 8, 'end')}
        {L(70, 171, 'Kₘ', 9, 'middle', true)}
        {L(232, 172, '[S]', 9, 'end')}
        {L(34, 12, 'v₀', 9, 'start', true)}
        {L(92, 128, 'v₀ = Vmax[S] / (Kₘ + [S])', 8)}
        {/* inset: Lineweaver–Burk */}
        <rect x={246} y={14} width={80} height={84} rx={6} stroke-dasharray="2 3" />
        <path d="M252 76 L 322 76 M276 22 L 276 92" />
        <path d="M258 84 L 318 34" />
        {L(266, 86, '−1/Kₘ', 6.5, 'end')}
        {L(280, 64, '1/Vmax', 6.5)}
        {L(286, 108, 'Lineweaver–Burk', 7, 'middle', true)}
        {L(318, 90, '1/[S]', 6.5, 'end')}
        {H(60, 190, 'Michaelis–Menten kinetics', 12)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- Ribosome translating
export const ribosome: Art = {
  w: 310, h: 200,
  el: (
    <g>
      <path d="M62 120 C 48 80, 80 46, 150 44 C 222 42, 258 78, 246 120 Z" />
      <path d="M70 132 C 70 158, 230 158, 238 132 Z" />
      <path d="M4 128 L 306 128" />
      {['AUG', 'GCU', 'UUC', 'AAG', 'UGG', 'CCA', 'UAA'].map((c, i) => L(16 + i * 46, 141, c, 7.5, 'middle'))}
      {[1, 2, 3, 4, 5, 6].map((i) => <path d={`M${i * 46 - 7} 125 L ${i * 46 - 7} 131`} />)}
      {L(4, 124, "5′", 7)}{L(298, 124, "3′", 7)}
      {[['E', 108], ['P', 154], ['A', 200]].map(([s, x]) => (
        <g>
          <path d={`M${(x as number) - 18} 120 L ${(x as number) - 18} 64 M${(x as number) + 18} 120 L ${(x as number) + 18} 64`} stroke-dasharray="2 4" />
          {L(x as number, 60, s as string, 10, 'middle')}
        </g>
      ))}
      {/* tRNA in P site with peptide; tRNA in A site */}
      <path d="M146 120 L 146 96 L 140 90 L 146 84 L 146 76 M162 120 L 162 96 L 168 90 L 162 84 L 162 76 M146 76 L 162 76" />
      <path d="M192 120 L 192 96 L 186 90 L 192 84 L 192 76 M208 120 L 208 96 L 214 90 L 208 84 L 208 76 M192 76 L 208 76" />
      {L(154, 118, 'UUC', 6, 'middle')}{L(200, 118, 'ACC', 6, 'middle')}
      {/* polypeptide through exit tunnel */}
      {[[154, 70], [148, 60], [138, 52], [126, 46], [112, 40], [98, 30], [86, 20], [72, 14], [58, 12]].map(([x, y]) => <circle cx={x} cy={y} r={4.5} />)}
      {L(30, 8, 'nascent polypeptide', 7.5, 'start', true)}
      {L(230, 90, 'peptidyl', 7)}{L(230, 99, 'transferase', 7)}
      {L(150, 172, 'small subunit · anticodons 3′→5′', 7, 'middle')}
      {H(196, 194, 'translation', 12)}
    </g>
  ),
};

// ---------------------------------------------------------------- GPCR → cAMP → PKA
export const gpcr: Art = {
  w: 356, h: 200,
  el: (
    <g>
      <path d="M0 62 L 330 62 M0 100 L 330 100" />
      {/* 7TM receptor */}
      {Array.from({ length: 7 }, (_, i) => 18 + i * 13).map((x, i) => (
        <g>
          <rect x={x} y={56} width={9} height={50} rx={4} />
          {i < 6 && <path d={i % 2 === 0 ? `M${x + 4.5} 106 Q ${x + 11} 118 ${x + 17.5} 106` : `M${x + 4.5} 56 Q ${x + 11} 44 ${x + 17.5} 56`} />}
        </g>
      ))}
      <path d="M58 30 l 6 6 l -6 6 l -6 -6 z" />
      {L(68, 30, 'ligand', 7.5, 'start', true)}
      {L(60, 22, '7TM GPCR', 8, 'middle')}
      {/* G protein heterotrimer */}
      <path d="M50 128 C 40 116, 70 110, 84 118 C 98 126, 90 146, 72 146 C 58 146, 56 138, 50 128 Z" />
      {L(72, 134, 'Gαs·GTP', 7, 'middle')}
      <circle cx={104} cy={122} r={8} /><circle cx={114} cy={132} r={7} />
      {L(110, 152, 'βγ', 8, 'middle')}
      <path d="M92 130 C 120 140, 140 140, 160 130" stroke-dasharray="3 3" />{arrowHead(160, 130, -20)}
      {/* adenylyl cyclase */}
      <rect x={168} y={56} width={14} height={50} rx={5} /><rect x={186} y={56} width={14} height={50} rx={5} />
      <path d="M170 106 C 160 136, 210 136, 198 106" />
      {L(184, 48, 'adenylyl cyclase', 7.5, 'middle')}
      {L(150, 160, 'ATP', 8)}
      <path d="M168 156 L 196 156" />{arrowHead(196, 156, 0)}
      {L(200, 160, 'cAMP', 8)}
      {/* PKA R2C2 → release of C */}
      <rect x={236} y={130} width={20} height={14} rx={4} /><rect x={236} y={146} width={20} height={14} rx={4} />
      <circle cx={268} cy={137} r={7} /><circle cx={268} cy={153} r={7} />
      {L(246, 141, 'R', 7, 'middle')}{L(246, 157, 'R', 7, 'middle')}{L(268, 140, 'C', 7, 'middle')}{L(268, 156, 'C', 7, 'middle')}
      <path d="M228 156 L 234 150" />
      <path d="M280 145 L 304 145" />{arrowHead(304, 145, 0)}
      {L(308, 140, 'P-Ser/Thr', 7)}
      {L(250, 178, 'PKA (R₂C₂)', 7.5, 'middle')}
      {H(196, 196, 'Gs signalling', 12)}
    </g>
  ),
};

// ---------------------------------------------------------------- Nucleosome
export const nucleosome: Art = {
  w: 260, h: 180,
  el: (
    <g>
      <ellipse cx={100} cy={52} rx={56} ry={18} />
      <path d="M44 52 L 44 112 M156 52 L 156 112" />
      <path d="M44 112 A 56 18 0 0 0 156 112" />
      <path d="M44 112 A 56 18 0 0 1 156 112" stroke-dasharray="3 4" />
      {/* DNA wraps ~1.65 turns */}
      <path d="M2 40 C 30 40, 34 66, 70 70 C 110 74, 160 60, 160 74 C 160 88, 110 96, 70 94 C 36 92, 36 108, 70 114 C 110 120, 160 104, 160 118 C 160 132, 120 140, 90 140 C 60 140, 40 150, 2 150" />
      <path d="M2 46 C 28 46, 34 70, 70 76 C 110 80, 154 66, 154 74 M154 118 C 154 128, 120 134, 90 134 C 60 134, 40 144, 2 144" />
      <circle cx={168} cy={96} r={9} />
      {L(182, 99, 'H1', 8)}
      {L(100, 50, '(H2A·H2B·H3·H4)₂', 7, 'middle')}
      {L(100, 172, '147 bp, ~1.65 turns', 7.5, 'middle', true)}
      {/* beads on a string */}
      <path d="M190 30 L 256 30" />
      {[200, 224, 248].map((x) => <circle cx={x} cy={30} r={7} />)}
      {L(222, 50, '10 nm fibre', 7.5, 'middle', true)}
      {H(170, 140, 'chromatin', 12)}
    </g>
  ),
};

// ---------------------------------------------------------------- IgG
export const igg: Art = (() => {
  const hx = 115, hy = 126; // hinge
  const dom = (x: number, y: number, rot: number) => (
    <rect class="solid" x={-11} y={-17} width={22} height={34} rx={9} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})`} />
  );
  const arm = (k: 1 | -1) => {
    const ang = 38 * k;
    const r = (ang * Math.PI) / 180;
    const d = [Math.sin(r), -Math.cos(r)];
    const n = [Math.cos(r) * k, Math.sin(r) * k];
    const at = (t: number, off = 0) => [hx + k * 6 + d[0] * t + n[0] * off, hy + d[1] * t + n[1] * off];
    const [ch1x, ch1y] = at(30), [vhx, vhy] = at(68), [clx, cly] = at(30, 25), [vlx, vly] = at(68, 25);
    const tip = (x: number, y: number) => {
      const [tx, ty] = [x + d[0] * 19, y + d[1] * 19];
      return <path d={`M${(tx - 6).toFixed(1)} ${ty.toFixed(1)} q 3 -6 6 0 q 3 -6 6 0`} />;
    };
    return (
      <g>
        <path d={`M${vhx.toFixed(1)} ${vhy.toFixed(1)} L ${ch1x.toFixed(1)} ${ch1y.toFixed(1)} L ${hx + k * 6} ${hy} L ${hx + k * 13} 150`} />
        <path d={`M${vlx.toFixed(1)} ${vly.toFixed(1)} L ${clx.toFixed(1)} ${cly.toFixed(1)}`} />
        {dom(ch1x, ch1y, ang)}{dom(vhx, vhy, ang)}{dom(clx, cly, ang)}{dom(vlx, vly, ang)}
        {tip(vhx, vhy)}{tip(vlx, vly)}
        <path d={`M${(ch1x + n[0] * 11).toFixed(1)} ${(ch1y + n[1] * 11 + 8).toFixed(1)} L ${(clx - n[0] * 11).toFixed(1)} ${(cly - n[1] * 11 + 8).toFixed(1)}`} stroke-dasharray="2 2" />
        {L(vhx, vhy + 3, 'VH', 6.5, 'middle')}{L(ch1x, ch1y + 3, 'CH1', 6.5, 'middle')}
        {L(vlx, vly + 3, 'VL', 6.5, 'middle')}{L(clx, cly + 3, 'CL', 6.5, 'middle')}
      </g>
    );
  };
  return {
    w: 240, h: 250,
    el: (
      <g>
        {arm(-1)}{arm(1)}
        {/* hinge disulfides */}
        <path d="M109 124 L 121 124 M109 131 L 121 131" />
        {L(126, 130, 'hinge S–S', 6.5)}
        {/* Fc: CH2 and CH3 pairs */}
        {dom(hx - 13, 168, 0)}{dom(hx + 13, 168, 0)}{dom(hx - 13, 208, 0)}{dom(hx + 13, 208, 0)}
        {L(hx - 13, 171, 'CH2', 6.5, 'middle')}{L(hx + 13, 171, 'CH2', 6.5, 'middle')}
        {L(hx - 13, 211, 'CH3', 6.5, 'middle')}{L(hx + 13, 211, 'CH3', 6.5, 'middle')}
        {/* N297 glycan between the CH2 domains */}
        <path d="M110 160 L 115 166 L 120 160 M115 166 L 115 174" />
        <rect x={112} y={174} width={6} height={6} /><circle cx={110} cy={158} r={2.5} /><circle cx={120} cy={158} r={2.5} />
        {L(150, 166, 'N297 glycan', 6.5)}
        <path d="M148 164 L 122 172" />
        {/* brackets */}
        {L(115, 10, 'antigen-binding sites (CDR loops)', 7.5, 'middle', true)}
        {L(8, 118, 'Fab', 9)}{L(222, 118, 'Fab', 9, 'end')}
        <path d="M148 150 L 154 150 L 154 228 L 148 228" />
        {L(158, 192, 'Fc', 9)}
        {L(8, 132, 'κ/λ light', 6.5, 'start', true)}{L(222, 132, 'γ1 heavy', 6.5, 'end', true)}
        {H(8, 244, 'IgG1', 13)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- pUC19 plasmid map
export const plasmid: Art = (() => {
  const cx = 110, cy = 120, r = 70;
  const pt = (a: number, rr: number) => [cx + rr * Math.sin((a * Math.PI) / 180), cy - rr * Math.cos((a * Math.PI) / 180)];
  const arc = (a0: number, a1: number, rr = r) => {
    const [x0, y0] = pt(a0, rr);
    const [x1, y1] = pt(a1, rr);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A ${rr} ${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const tick = (a: number, label: string, rr = 14) => {
    const [x0, y0] = pt(a, r);
    const [x1, y1] = pt(a, r + rr);
    const [tx, ty] = pt(a, r + rr + 6);
    return <g><path d={`M${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`} />{L(tx, ty + 3, label, 7, a > 180 ? 'end' : 'start')}</g>;
  };
  const [m0x, m0y] = pt(4, r + 4), [m1x, m1y] = pt(16, r + 4);
  return {
    w: 240, h: 240,
    el: (
      <g>
        <circle cx={cx} cy={cy} r={r} />
        <path d={arc(130, 236, r - 6)} stroke-width="5" />
        {(() => { const [x, y] = pt(236, r - 6); return <path d={`M${x - 6} ${y - 6} L ${x} ${y} L ${x + 7} ${y - 3}`} />; })()}
        <path d={arc(276, 330, r - 6)} stroke-width="5" />
        <path d={arc(352, 395, r - 6)} stroke-width="5" />
        {L(cx + 44, cy + 70, 'bla (AmpR)', 7.5, 'start', true)}
        {L(cx - 74, cy - 30, 'ori (pMB1)', 7.5, 'end', true)}
        {L(cx + 30, cy - 36, 'lacZα', 7.5, 'start', true)}
        {tick(200, 'ScaI')}
        {/* MCS callout */}
        <path d={`M${m0x.toFixed(1)} ${m0y.toFixed(1)} L 150 14 M${m1x.toFixed(1)} ${m1y.toFixed(1)} L 150 14`} stroke-dasharray="2 2" />
        {L(152, 10, 'MCS', 8, 'start', true)}
        {L(152, 20, 'EcoRI · SacI · KpnI · SmaI · BamHI', 6.2)}
        {L(152, 28, 'XbaI · SalI · PstI · SphI · HindIII', 6.2)}
        {L(cx, cy - 2, 'pUC19', 11, 'middle')}
        {L(cx, cy + 12, '2686 bp', 8, 'middle')}
        {L(cx, cy + 24, 'high copy · blue/white', 6.5, 'middle', true)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- Dihybrid Punnett square
export const dihybrid: Art = (() => {
  const g = ['AB', 'Ab', 'aB', 'ab'];
  const cross = (x: string, y: string) => {
    const a = [x[0], y[0]].sort().join('');
    const b = [x[1], y[1]].sort().join('');
    return a + b;
  };
  return {
    w: 220, h: 232,
    el: (
      <g>
        <rect x={40} y={40} width={168} height={168} />
        {[1, 2, 3].map((i) => <path d={`M${40 + i * 42} 40 L ${40 + i * 42} 208 M40 ${40 + i * 42} L 208 ${40 + i * 42}`} />)}
        {g.map((x, i) => L(61 + i * 42, 34, x, 8, 'middle', true))}
        {g.map((y, j) => L(34, 65 + j * 42, y, 8, 'end', true))}
        {g.map((x, i) => g.map((y, j) => L(61 + i * 42, 65 + j * 42, cross(x, y), 8, 'middle')))}
        {L(124, 224, 'AaBb × AaBb → 9 : 3 : 3 : 1', 8, 'middle')}
        {H(4, 16, 'dihybrid cross', 12)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- Agarose gel
export const gel: Art = {
  w: 200, h: 220,
  el: (
    <g>
      <rect x={20} y={20} width={160} height={170} rx={4} />
      {[0, 1, 2, 3, 4].map((i) => <rect x={30 + i * 30} y={28} width={20} height={6} rx={1} />)}
      {[[52, '10 kb'], [74, '5'], [96, '3'], [120, '1.5'], [148, '1.0'], [168, '0.5']].map(([y, s]) => (
        <g><path d={`M32 ${y} L 48 ${y}`} stroke-width="3" />{L(16, (y as number) + 3, s as string, 7, 'end')}</g>
      ))}
      {[[68], [120], [96, 158], [74, 140]].map((ys, i) => ys.map((y) => <path d={`M${62 + i * 30} ${y} L ${78 + i * 30} ${y}`} stroke-width="3" />))}
      {L(40, 14, 'M', 8, 'middle')}{L(186, 30, '−', 12)}{L(186, 192, '+', 12)}
      <path d="M192 60 L 192 160" />{arrowHead(192, 160, 90)}
      {L(100, 206, '1% agarose · EtBr', 7.5, 'middle', true)}
    </g>
  ),
};

// ---------------------------------------------------------------- PCR thermal profile
export const pcr: Art = {
  w: 300, h: 160,
  el: (
    <g>
      <path d="M24 10 L 24 130 L 296 130" />
      {arrowHead(24, 10, -90)}{arrowHead(296, 130, 0)}
      <path d="M24 30 L 54 30 L 60 30 L 84 30 L 92 78 L 116 78 L 122 52 L 150 52 L 158 30 L 182 30 L 190 78 L 214 78 L 220 52 L 246 52 L 252 52 L 270 52 L 274 116 L 294 116" />
      {L(20, 33, '95', 7, 'end')}{L(20, 55, '72', 7, 'end')}{L(20, 81, '55', 7, 'end')}{L(20, 119, '4', 7, 'end')}
      {L(70, 24, 'denature', 7, 'middle', true)}{L(104, 92, 'anneal', 7, 'middle', true)}{L(136, 46, 'extend', 7, 'middle', true)}
      <path d="M84 140 L 84 146 L 250 146 L 250 140" />
      {L(167, 157, '× 30 cycles · 1 min kb⁻¹ extension', 7.5, 'middle')}
      {L(284, 110, '∞', 9, 'middle')}
      {L(8, 8, '°C', 8)}
      {H(170, 20, 'PCR', 13)}
    </g>
  ),
};

