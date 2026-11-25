/**
 * Lab-technique and gene-expression diagrams (question-screen set).
 * Hand-authored SVG line art; labels follow standard textbook conventions.
 */
import type { JSX } from 'preact';
import { H, L, arrowHead, type Art } from './artkit';

// ---------------------------------------------------------------- DNA replication fork (E. coli)
export const fork: Art = {
  w: 345, h: 215,
  el: (
    <g>
      {/* parental duplex ahead of the fork (fork moves right) */}
      <path d="M212 96 L 338 96 M212 116 L 338 116" />
      {Array.from({ length: 10 }, (_, i) => 222 + i * 12).map((x) => <path d={`M${x} 98 L ${x} 114`} />)}
      <ellipse class="solid" cx={292} cy={106} rx={9} ry={19} />
      {L(292, 78, 'gyrase', 7.5, 'middle', true)}
      {L(340, 92, '5′', 7, 'end')}{L(340, 128, '3′', 7, 'end')}
      {/* helicase at the fork */}
      <path class="solid" d="M205 92 L 216 98 L 216 112 L 205 118 L 194 112 L 194 98 Z" />
      {L(226, 134, 'DnaB helicase', 7.5, 'start', true)}
      {/* leading arm */}
      <path d="M196 98 L 150 68 L 14 68" />
      <path d="M14 78 L 146 78 L 188 104" />
      {arrowHead(188, 104, 32)}
      <ellipse class="solid" cx={168} cy={88} rx={14} ry={9} />
      {L(168, 91, 'Pol III', 6.5, 'middle')}
      {L(14, 63, '3′', 7)}{L(8, 82, '5′', 7)}
      {L(80, 60, 'leading strand (continuous)', 7.5, 'middle', true)}
      {/* lagging arm */}
      <path d="M196 114 L 150 146 L 14 146" />
      {/* Okazaki fragments: 5′ primer (zigzag) nearest the fork, 3′ end pointing away */}
      {[[22, 64], [76, 120], [128, 152]].map(([a, b], i) => (
        <g>
          <path d={`M${b - 8} 136 L ${a} 136`} />
          {arrowHead(a, 136, 180)}
          <path d={`M${b - 8} 136 l 2 -3 l 2 6 l 2 -6 l 2 3`} />
          {i === 2 && L(146, 160, 'RNA primer', 6.5, 'start', true)}
        </g>
      ))}
      <circle class="solid" cx={70} cy={136} r={5} />
      {L(70, 125, 'ligase', 6.5, 'middle', true)}
      {/* SSB on single-stranded lagging template */}
      {[160, 172, 184].map((x, i) => <circle cx={x} cy={141 - i * 8} r={3.5} />)}
      {L(196, 150, 'SSB', 6.5, 'start', true)}
      <circle class="solid" cx={176} cy={124} r={6} />
      {L(176, 113, 'DnaG', 6.5, 'middle', true)}
      {L(70, 165, 'Okazaki fragments (discontinuous)', 7.5, 'middle', true)}
      {L(14, 141, '5′', 7)}{L(8, 152, '3′', 7)}
      {H(8, 208, 'replication fork', 13)}
    </g>
  ),
};

// ---------------------------------------------------------------- Sanger chromatogram
export const sanger: Art = (() => {
  const seq = 'GATTACAGCTTGACCAG';
  const base = 128, x0 = 24, dx = 18, sigma = 4.6;
  const heights = seq.split('').map((_, i) => 46 + ((i * 37) % 40));
  const styles: Record<string, string | undefined> = { A: undefined, C: '4 2', G: '6 2 1 2', T: '1.2 2.4' };
  const trace = (b: string) => {
    const pts: string[] = [];
    for (let x = 12; x <= 330; x += 1.5) {
      let y = 0;
      seq.split('').forEach((c, i) => {
        if (c === b) y += heights[i] * Math.exp(-((x - (x0 + i * dx)) ** 2) / (2 * sigma * sigma));
      });
      pts.push(`${x.toFixed(1)},${(base - y).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  return {
    w: 340, h: 175,
    el: (
      <g>
        <path d={`M10 ${base} L 334 ${base}`} />
        {(['A', 'C', 'G', 'T'] as const).map((b) => (styles[b] ? <polyline points={trace(b)} stroke-dasharray={styles[b]} /> : <polyline points={trace(b)} />))}
        {seq.split('').map((c, i) => L(x0 + i * dx, base - heights[i] - 6, c, 8, 'middle'))}
        {[['A', 0], ['C', 1], ['G', 2], ['T', 3]].map(([b, i]) => (
          <g>
            {styles[b as string] ? <path d={`M${20 + (i as number) * 52} 148 l 22 0`} stroke-dasharray={styles[b as string]} /> : <path d={`M${20 + (i as number) * 52} 148 l 22 0`} />}
            {L(46 + (i as number) * 52, 151, b as string, 8)}
          </g>
        ))}
        {L(232, 151, 'read 5′ → 3′', 7.5, 'start', true)}
        {L(10, 166, 'ddNTP lacks 3′-OH → chain termination · capillary electrophoresis', 7, 'start', true)}
        {H(206, 18, 'Sanger sequencing', 12)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- qPCR amplification + standard curve
export const qpcr: Art = (() => {
  const X = (c: number) => 30 + c * 5;
  const Y = (v: number) => 150 - v;
  const curve = (c0: number) => {
    const pts: string[] = [];
    for (let c = 0; c <= 40; c += 0.5) pts.push(`${X(c).toFixed(1)},${Y(110 / (1 + Math.exp(-(c - c0) / 1.6))).toFixed(1)}`);
    return pts.join(' ');
  };
  const thr = 22;
  const ct = (c0: number) => c0 - 1.6 * Math.log(4);
  return {
    w: 320, h: 195,
    el: (
      <g>
        <path d="M30 20 L 30 150 L 232 150" />
        {arrowHead(30, 20, -90)}{arrowHead(232, 150, 0)}
        {[18, 22, 26].map((c0) => <polyline points={curve(c0)} />)}
        <path d={`M30 ${Y(thr)} L 230 ${Y(thr)}`} stroke-dasharray="5 3" />
        {L(232, Y(thr) + 3, 'threshold', 7, 'start', true)}
        {[18, 22, 26].map((c0) => (
          <g>
            <path d={`M${X(ct(c0)).toFixed(1)} ${Y(thr)} L ${X(ct(c0)).toFixed(1)} 150`} stroke-dasharray="2 2" />
            {L(X(ct(c0)), 160, ct(c0).toFixed(1), 6.5, 'middle')}
          </g>
        ))}
        {L(130, 172, 'cycle', 8, 'middle')}
        {L(26, 16, 'ΔRn', 8, 'end', true)}
        {L(30, 186, 'ΔCt = 4 cycles ≈ 2⁴ = 16-fold difference', 7, 'start', true)}
        {/* standard curve inset */}
        <rect x={244} y={40} width={72} height={78} rx={6} stroke-dasharray="2 3" />
        <path d="M252 108 L 310 108 M252 108 L 252 48" />
        <path d="M256 54 L 306 102" />
        {[[262, 64], [274, 75], [286, 87], [298, 98]].map(([x, y]) => <circle cx={x} cy={y} r={2} />)}
        {L(280, 126, 'log [template]', 6.5, 'middle')}
        {L(248, 46, 'Ct', 6.5, 'end')}
        {L(280, 136, 'slope −3.32 → E = 100%', 6.5, 'middle', true)}
        {H(60, 14, 'qPCR', 13)}
      </g>
    ),
  };
})();

// ---------------------------------------------------------------- Western blot workflow
export const western: Art = {
  w: 345, h: 160,
  el: (
    <g>
      {/* SDS-PAGE */}
      <rect x={8} y={20} width={70} height={96} rx={3} />
      {[0, 1, 2, 3].map((i) => <rect x={14 + i * 16} y={24} width={10} height={4} />)}
      {[40, 52, 66, 84, 100].map((y) => <path d={`M15 ${y} L 23 ${y}`} stroke-width="2.5" />)}
      <path d="M31 58 L 39 58 M47 70 L 55 70 M63 58 L 71 58" stroke-width="2.5" />
      {L(43, 130, 'SDS-PAGE', 8, 'middle')}
      {L(43, 141, 'denatured, by size', 6.5, 'middle', true)}
      <path d="M84 68 L 104 68" />{arrowHead(104, 68, 0)}
      {/* transfer sandwich */}
      {[
        [110, 'sponge'], [126, 'filter paper'], [138, 'gel'], [150, 'membrane'], [162, 'filter paper'], [174, 'sponge'],
      ].map(([x, n], i) => (
        <g>
          <rect x={x as number} y={i === 0 || i === 5 ? 22 : 26} width={i === 0 || i === 5 ? 12 : 8} height={i === 0 || i === 5 ? 92 : 84} rx={2} stroke-dasharray={i === 0 || i === 5 ? '3 2' : undefined} />
          {(i === 2 || i === 3) && L((x as number) + 4, i === 2 ? 128 : 140, n as string, 6.5, 'middle', true)}
        </g>
      ))}
      {L(104, 18, '−', 11)}{L(186, 18, '+', 11)}
      <path d="M128 70 L 168 70" stroke-dasharray="3 2" />{arrowHead(168, 70, 0)}
      {L(147, 152, 'wet transfer', 7, 'middle')}
      <path d="M194 68 L 212 68" />{arrowHead(212, 68, 0)}
      {/* immunodetection */}
      <rect x={218} y={20} width={120} height={96} rx={3} />
      <path d="M232 92 L 324 92" stroke-width="3" />
      {/* primary antibody on target */}
      <path d="M262 72 L 262 58 M262 72 L 254 88 M262 72 L 270 88" />
      {L(250, 76, '1° Ab', 6.5, 'end', true)}
      {/* secondary antibody with HRP */}
      <path d="M262 44 L 262 32 M262 44 L 254 57 M262 44 L 270 57" />
      <path d="M262 32 L 276 28" />
      <path d="M282 24 l 3 6 l 6 1 l -5 4 l 2 6 l -6 -3 l -6 3 l 2 -6 l -5 -4 l 6 -1 z" />
      {L(296, 40, '2° Ab–HRP', 6.5, 'start', true)}
      {[[300, 22, 316, 14], [304, 30, 322, 28]].map(([a, b, c, d]) => <path d={`M${a} ${b} L ${c} ${d}`} stroke-dasharray="2 2" />)}
      {L(278, 108, 'target band', 6.5, 'middle', true)}
      {L(278, 130, 'block → 1° → 2° → ECL', 7, 'middle')}
      {L(278, 141, 'chemiluminescence', 6.5, 'middle', true)}
      {H(8, 158, 'western blot', 12)}
    </g>
  ),
};

// ---------------------------------------------------------------- lac operon (induced)
export const lac: Art = {
  w: 345, h: 185,
  el: (
    <g>
      <path d="M6 112 L 340 112" />
      {[
        [10, 52, 'lacI'], [82, 98, 'CAP'], [98, 122, 'P'], [122, 142, 'O'], [142, 226, 'lacZ'], [226, 278, 'lacY'], [278, 326, 'lacA'],
      ].map(([a, b, n]) => (
        <g>
          <rect class="solid" x={a as number} y={104} width={(b as number) - (a as number)} height={16} rx={2} />
          {L(((a as number) + (b as number)) / 2, 115, n as string, 7, 'middle', (n as string).startsWith('lac'))}
        </g>
      ))}
      {L(184, 134, 'β-galactosidase', 6.5, 'middle', true)}{L(252, 134, 'permease', 6.5, 'middle', true)}{L(302, 134, 'transacetylase', 6.5, 'middle', true)}
      {/* repressor tetramer released by allolactose */}
      {[[118, 62], [130, 62], [118, 74], [130, 74]].map(([x, y]) => <circle cx={x} cy={y} r={6} />)}
      <path d="M124 82 L 130 100" stroke-dasharray="3 3" />
      <path d="M140 60 l 6 -4 l 6 4 l 0 7 l -6 4 l -6 -4 z" />
      {L(156, 56, 'allolactose', 6.5, 'start', true)}
      {L(96, 50, 'LacI repressor (inactive)', 6.5, 'start', true)}
      <path d="M31 104 C 31 80, 60 70, 108 68" stroke-dasharray="2 3" />{arrowHead(108, 68, 0)}
      {/* CAP-cAMP and RNA polymerase */}
      <ellipse class="solid" cx={90} cy={96} rx={10} ry={7} />
      <circle cx={84} cy={86} r={3} />
      {L(70, 84, 'CAP–cAMP', 6.5, 'end', true)}
      <ellipse class="solid" cx={150} cy={92} rx={22} ry={13} />
      {L(150, 95, 'RNAP', 7, 'middle')}
      {/* polycistronic mRNA */}
      <path d="M172 84 C 190 70, 200 92, 218 78 S 250 88, 268 76 S 300 86, 322 76" />
      {arrowHead(322, 76, -15)}
      {L(250, 66, 'polycistronic mRNA', 7, 'middle', true)}
      {L(6, 160, 'lactose present, glucose low → cAMP high → strong transcription', 7.5)}
      {H(6, 22, 'lac operon (induced)', 12)}
    </g>
  ),
};

// ---------------------------------------------------------------- pre-mRNA splicing
export const splicing: Art = {
  w: 340, h: 200,
  el: (
    <g>
      {/* pre-mRNA */}
      {L(6, 54, 'm⁷G', 7)}
      <rect class="solid" x={30} y={44} width={70} height={14} rx={2} />
      <path d="M100 51 L 232 51" />
      <rect class="solid" x={232} y={44} width={70} height={14} rx={2} />
      {L(65, 54, 'exon 1', 7, 'middle')}{L(267, 54, 'exon 2', 7, 'middle')}
      {L(104, 47, 'GU', 7)}{L(212, 47, 'AG', 7)}
      {L(190, 47, 'A', 7, 'middle')}
      <circle cx={190} cy={51} r={2} />
      {L(190, 66, 'branch point', 6.5, 'middle', true)}
      <circle cx={112} cy={30} r={8} /><circle cx={190} cy={28} r={8} />
      {L(112, 33, 'U1', 6.5, 'middle')}{L(190, 31, 'U2', 6.5, 'middle')}
      {L(306, 54, '3′', 7)}
      <path d="M166 74 L 166 92" />{arrowHead(166, 92, 90)}
      {L(172, 86, '① 2′-OH of A attacks 5′ splice site', 6.5, 'start', true)}
      {/* lariat intermediate */}
      <rect class="solid" x={30} y={104} width={70} height={14} rx={2} />
      <path d="M190 111 C 170 92, 130 92, 128 111 C 130 130, 170 130, 190 111 L 232 111" />
      <circle cx={190} cy={111} r={2.5} />
      <rect class="solid" x={232} y={104} width={70} height={14} rx={2} />
      {L(158, 140, 'lariat (2′–5′ bond)', 6.5, 'middle', true)}
      <path d="M166 146 L 166 160" />{arrowHead(166, 160, 90)}
      {L(172, 156, '② 3′-OH of exon 1 attacks 3′ splice site', 6.5, 'start', true)}
      {/* mature mRNA */}
      {L(46, 178, 'm⁷G', 7)}
      <rect class="solid" x={70} y={168} width={70} height={14} rx={2} />
      <rect class="solid" x={140} y={168} width={70} height={14} rx={2} />
      {L(105, 178, 'exon 1', 7, 'middle')}{L(175, 178, 'exon 2', 7, 'middle')}
      {L(214, 178, 'AAAA…(A)ₙ', 7)}
      {H(220, 22, 'splicing', 13)}
    </g>
  ),
};

export const LAB_ARTS: Art[] = [fork, sanger, qpcr, western, lac, splicing];
void (null as unknown as JSX.Element);
