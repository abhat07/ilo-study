/**
 * Genetics and protein-structure diagrams ("What I know" set).
 */
import { H, L, arrowHead, type Art } from './artkit';

// ---------------------------------------------------------------- Pedigree (autosomal recessive)
export const pedigree: Art = (() => {
  const male = (x: number, y: number, kind: 'u' | 'a' | 'c' = 'u') => (
    <g>
      <rect class={kind === 'a' ? 'fillc' : 'solid'} x={x - 9} y={y - 9} width={18} height={18} />
      {kind === 'c' && <circle class="fillc" cx={x} cy={y} r={3} />}
    </g>
  );
  const female = (x: number, y: number, kind: 'u' | 'a' | 'c' = 'u') => (
    <g>
      <circle class={kind === 'a' ? 'fillc' : 'solid'} cx={x} cy={y} r={9.5} />
      {kind === 'c' && <circle class="fillc" cx={x} cy={y} r={3} />}
    </g>
  );
  return {
    w: 265, h: 215,
    el: (
      <g>
        {L(6, 34, 'I', 9)}{L(6, 94, 'II', 9)}{L(6, 164, 'III', 9)}
        {/* I: carrier parents */}
        <path d="M99 30 L 141 30 M120 30 L 120 66 M50 66 L 190 66" />
        {male(90, 30, 'c')}{female(150, 30, 'c')}
        {[50, 96, 143, 190].map((x) => <path d={`M${x} 66 L ${x} 81`} />)}
        {male(50, 90)}{female(96, 90, 'c')}{male(143, 90, 'a')}{female(190, 90, 'c')}
        {/* II-4 × unrelated carrier */}
        <path d="M200 90 L 226 90 M213 90 L 213 136 M180 136 L 246 136" />
        {male(235, 90, 'c')}
        {[180, 213, 246].map((x) => <path d={`M${x} 136 L ${x} 151`} />)}
        {female(180, 160)}{male(213, 160, 'a')}{female(246, 160, 'c')}
        {L(30, 196, '■● affected   ⊡⊙ carrier', 7.5)}
        {L(30, 208, 'skips generations; affected children of unaffected parents', 6.5, 'start', true)}
        {H(150, 196, 'autosomal recessive', 11)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- Hardy–Weinberg genotype frequencies
export const hardyWeinberg: Art = (() => {
  const X = (p: number) => 36 + p * 190;
  const Y = (f: number) => 160 - f * 130;
  const line = (f: (p: number) => number) => {
    const pts: string[] = [];
    for (let p = 0; p <= 1.0001; p += 0.025) pts.push(`${X(p).toFixed(1)},${Y(f(p)).toFixed(1)}`);
    return pts.join(' ');
  };
  return {
    w: 260, h: 200,
    el: (
      <g>
        <path d="M36 24 L 36 160 L 232 160" />
        {arrowHead(36, 24, -90)}{arrowHead(232, 160, 0)}
        <polyline points={line((p) => p * p)} />
        <polyline points={line((p) => (1 - p) ** 2)} stroke-dasharray="5 3" />
        <polyline points={line((p) => 2 * p * (1 - p))} stroke-dasharray="1.5 2.5" stroke-width="2" />
        <path d={`M${X(0.5)} ${Y(0.5)} L ${X(0.5)} 160`} stroke-dasharray="2 3" />
        {L(X(0.5), Y(0.5) - 6, 'Aa = 2pq (max ½)', 7, 'middle')}
        {L(X(1) - 2, Y(1) + 12, 'AA = p²', 7.5, 'end')}
        {L(X(0) + 4, Y(1) + 12, 'aa = q²', 7.5)}
        {L(32, 28, '1.0', 6.5, 'end')}{L(32, 163, '0', 6.5, 'end')}
        {L(X(0.5), 172, '0.5', 6.5, 'middle')}{L(X(1), 172, '1', 6.5, 'middle')}
        {L(134, 186, 'p (frequency of allele A),  q = 1 − p', 7.5, 'middle')}
        {L(10, 20, 'genotype freq.', 7, 'start', true)}
        {H(96, 18, 'p² + 2pq + q² = 1', 12)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- Crossing over at a chiasma
export const crossingOver: Art = {
  w: 330, h: 190,
  el: (
    <g>
      {/* maternal = solid, paternal = dashed; the two inner (non-sister) chromatids exchange segments at the chiasma */}
      <path d="M20 40 L 160 40" />
      <path d="M20 50 L 100 50 C 105 50, 107 55, 112 60" />
      <path d="M112 60 C 117 65, 119 70, 124 70 L 160 70" stroke-dasharray="4 2" />
      <path d="M20 70 L 100 70 C 105 70, 107 65, 112 60" stroke-dasharray="4 2" />
      <path d="M112 60 C 117 55, 119 50, 124 50 L 160 50" />
      <path d="M20 80 L 160 80" stroke-dasharray="4 2" />
      <circle class="fillc" cx={50} cy={45} r={4} /><circle class="fillc" cx={50} cy={75} r={4} />
      {L(24, 38, 'A', 7.5)}{L(24, 48, 'A', 7.5)}{L(24, 68, 'a', 7.5)}{L(24, 78, 'a', 7.5)}
      {L(150, 38, 'B', 7.5)}{L(150, 48, 'B', 7.5)}{L(150, 68, 'b', 7.5)}{L(150, 78, 'b', 7.5)}
      {L(112, 100, 'chiasma', 7, 'middle', true)}
      <path d="M112 94 L 112 64" stroke-dasharray="1 2" />
      {L(60, 118, 'homologues paired as a bivalent', 6.5, 'middle', true)}
      <path d="M170 60 L 196 60" />{arrowHead(196, 60, 0)}
      {/* four meiotic products */}
      {[
        ['A', 'B', 'parental', false, false],
        ['A', 'b', 'recombinant', false, true],
        ['a', 'B', 'recombinant', true, false],
        ['a', 'b', 'parental', true, true],
      ].map(([l, r, kind, left, right], i) => {
        const y = 24 + i * 24;
        return (
          <g>
            {left ? <path d={`M206 ${y} L 252 ${y}`} stroke-dasharray="4 2" /> : <path d={`M206 ${y} L 252 ${y}`} />}
            {right ? <path d={`M252 ${y} L 296 ${y}`} stroke-dasharray="4 2" /> : <path d={`M252 ${y} L 296 ${y}`} />}
            {L(212, y - 3, l as string, 7.5)}{L(286, y - 3, r as string, 7.5)}
            {L(300, y + 3, kind as string, 6.5, 'start', true)}
          </g>
        );
      })}
      {L(206, 130, 'RF = recombinants / total', 7.5)}
      {H(10, 178, 'crossing over · prophase I', 12)}
    </g>
  ),
};

// ---------------------------------------------------------------- Linkage map
export const linkageMap: Art = (() => {
  const X = (cm: number) => 20 + cm * 5.2;
  const loci: [string, number][] = [['A', 0], ['B', 12], ['C', 31], ['D', 47]];
  return {
    w: 300, h: 140,
    el: (
      <g>
        <rect x={16} y={44} width={268} height={16} rx={8} />
        {loci.map(([g, cm]) => (
          <g>
            <path d={`M${X(cm)} 40 L ${X(cm)} 64`} />
            {L(X(cm), 34, g, 9, 'middle', true)}
            {L(X(cm), 76, `${cm} cM`, 7, 'middle')}
          </g>
        ))}
        {loci.slice(1).map(([, cm], i) => {
          const a = X(loci[i][1]), b = X(cm);
          return (
            <g>
              <path d={`M${a} 88 L ${a} 92 L ${b} 92 L ${b} 88`} />
              {L((a + b) / 2, 103, `${cm - loci[i][1]}`, 7, 'middle')}
            </g>
          );
        })}
        {L(20, 120, '1 cM ≈ 1% recombinant gametes · distances add', 7.5)}
        {L(20, 132, 'large distances underestimated (double crossovers)', 6.5, 'start', true)}
        {H(190, 18, 'linkage map', 12)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- α-helix and β-sheet
export const secondary: Art = (() => {
  const pts: string[] = [];
  const dots: [number, number][] = [];
  const turns = 3.5, top = 24, h = 126;
  for (let t = 0; t <= turns * 2 * Math.PI; t += 0.12) {
    pts.push(`${(60 + 22 * Math.cos(t)).toFixed(1)},${(top + (t / (turns * 2 * Math.PI)) * h).toFixed(1)}`);
  }
  for (let i = 0; i < Math.floor(turns * 3.6); i++) {
    const t = (i * 2 * Math.PI) / 3.6;
    dots.push([60 + 22 * Math.cos(t), top + (t / (turns * 2 * Math.PI)) * h]);
  }
  const strand = (y: number, dir: 1 | -1) => {
    const [x0, x1] = dir === 1 ? [160, 300] : [300, 160];
    const tip = x1;
    const body = dir === 1 ? x1 - 14 : x1 + 14;
    return <path class="solid" d={`M${x0} ${y - 5} L ${body} ${y - 5} L ${body} ${y - 10} L ${tip} ${y} L ${body} ${y + 10} L ${body} ${y + 5} L ${x0} ${y + 5} Z`} />;
  };
  return {
    w: 320, h: 180,
    el: (
      <g>
        <polyline points={pts.join(' ')} stroke-width="2" />
        {dots.map(([x, y]) => <circle class="fillc" cx={x} cy={y} r={2.2} />)}
        {dots.slice(0, -4).map(([x, y], i) => i % 3 === 0 ? <path d={`M${x} ${y} L ${dots[i + 4][0]} ${dots[i + 4][1]}`} stroke-dasharray="1.5 2" /> : null)}
        {L(96, 50, '3.6 residues/turn', 7)}
        {L(96, 62, '0.54 nm pitch', 7)}
        {L(96, 74, 'C=O(i)···H–N(i+4)', 7, 'start', true)}
        {L(60, 166, 'α-helix', 9, 'middle', true)}
        {strand(44, 1)}{strand(84, -1)}{strand(124, 1)}
        {[180, 210, 240, 270].map((x) => (
          <g><path d={`M${x} 51 L ${x} 77`} stroke-dasharray="1.5 2" /><path d={`M${x + 8} 91 L ${x + 8} 117`} stroke-dasharray="1.5 2" /></g>
        ))}
        {L(230, 150, 'antiparallel β-sheet', 9, 'middle', true)}
        {L(230, 162, 'inter-strand H-bonds', 7, 'middle')}
        {H(150, 18, 'secondary structure', 12)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- Ramachandran plot
export const ramachandran: Art = (() => {
  const X = (phi: number) => 120 + phi / 2;
  const Y = (psi: number) => 110 - psi / 2;
  return {
    w: 235, h: 235,
    el: (
      <g>
        <rect x={30} y={20} width={180} height={180} />
        <path d={`M120 20 L 120 200 M30 110 L 210 110`} stroke-dasharray="3 3" />
        {/* β region */}
        <path class="fillc soft" d={`M${X(-180)} ${Y(180)} L ${X(-45)} ${Y(180)} C ${X(-40)} ${Y(150)}, ${X(-60)} ${Y(100)}, ${X(-90)} ${Y(90)} C ${X(-130)} ${Y(80)}, ${X(-170)} ${Y(100)}, ${X(-180)} ${Y(110)} Z`} />
        {/* right-handed α region */}
        <path class="fillc soft" d={`M${X(-150)} ${Y(-20)} C ${X(-120)} ${Y(5)}, ${X(-60)} ${Y(5)}, ${X(-40)} ${Y(-25)} C ${X(-35)} ${Y(-60)}, ${X(-70)} ${Y(-80)}, ${X(-100)} ${Y(-70)} C ${X(-140)} ${Y(-60)}, ${X(-160)} ${Y(-40)}, ${X(-150)} ${Y(-20)} Z`} />
        {/* left-handed α region */}
        <path class="fillc soft" d={`M${X(45)} ${Y(20)} C ${X(50)} ${Y(70)}, ${X(80)} ${Y(80)}, ${X(90)} ${Y(50)} C ${X(95)} ${Y(20)}, ${X(70)} ${Y(5)}, ${X(45)} ${Y(20)} Z`} />
        {L(X(-120), Y(140), 'β', 11, 'middle')}
        {L(X(-90), Y(-42), 'αR', 10, 'middle')}
        {L(X(66), Y(42), 'αL', 9, 'middle')}
        {L(30, 212, '−180', 6.5, 'middle')}{L(120, 212, '0', 6.5, 'middle')}{L(210, 212, '180', 6.5, 'middle')}
        {L(26, 23, '180', 6.5, 'end')}{L(26, 202, '−180', 6.5, 'end')}
        {L(120, 226, 'φ (degrees)', 8, 'middle', true)}
        {L(12, 112, 'ψ', 10, 'middle', true)}
        {L(208, 196, 'Gly: wider', 6.5, 'end', true)}
        {H(60, 14, 'Ramachandran plot', 11)}
      </g>
    ),
  };
})();

export const GENETICS_ARTS: Art[] = [pedigree, hardyWeinberg, crossingOver, linkageMap, secondary, ramachandran];
