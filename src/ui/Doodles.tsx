/**
 * Margin diagrams for every screen. Each screen has its own set:
 *   home     – metabolism, molecular machines and techniques (artHome)
 *   session  – lab techniques and gene expression (artLab); static and dimmed while you answer
 *   module   – genetics and protein structure (artGenetics)
 *   upload / settings – a mix
 * Decorative only (aria-hidden), always in the side margins, never behind the question card.
 */
import { atp, bdna, crispr, dihybrid, etc, gel, gpcr, igg, mm, nucleosome, pcr, plasmid, ribosome, tca } from './artHome';
import { LAB_ARTS, fork, lac, qpcr, sanger, splicing, western } from './artLab';
import { crossingOver, hardyWeinberg, linkageMap, pedigree, ramachandran, secondary } from './artGenetics';
import type { Art } from './artkit';

type Placed = { art: Art; side: 'l' | 'r'; top: string; scale: number; rot: number; delay: number; mobile?: boolean };
export type DoodleSet = 'home' | 'session' | 'module' | 'upload' | 'settings';

const P = (art: Art, side: 'l' | 'r', top: string, scale: number, rot: number, delay: number, mobile = false): Placed => ({ art, side, top, scale, rot, delay, mobile });

const SETS: Record<Exclude<DoodleSet, 'session'>, Placed[]> = {
  home: [
    P(atp, 'l', '2%', 0.95, -3, 0, true), P(etc, 'r', '1%', 0.92, 2, 0.3, true),
    P(tca, 'l', '15%', 0.9, 4, 0.6), P(bdna, 'r', '17%', 0.85, -4, 0.9),
    P(crispr, 'l', '31%', 0.95, -2, 1.2, true), P(mm, 'r', '33%', 0.9, 3, 1.5),
    P(ribosome, 'l', '45%', 0.92, 2, 1.8), P(gpcr, 'r', '46%', 0.92, -3, 2.1, true),
    P(nucleosome, 'l', '59%', 0.95, -3, 2.4), P(igg, 'r', '59%', 0.9, 4, 2.7),
    P(plasmid, 'l', '71%', 0.92, 3, 3.0), P(dihybrid, 'r', '72%', 0.88, -2, 3.3),
    P(pcr, 'l', '85%', 0.95, -2, 3.6), P(gel, 'r', '86%', 0.85, 3, 3.9),
  ],
  module: [
    P(pedigree, 'l', '2%', 0.95, -2, 0, true), P(hardyWeinberg, 'r', '3%', 0.95, 3, 0.3, true),
    P(crossingOver, 'l', '24%', 0.9, 2, 0.6), P(linkageMap, 'r', '26%', 1, -2, 0.9),
    P(secondary, 'l', '48%', 0.92, -3, 1.2), P(ramachandran, 'r', '47%', 0.92, 3, 1.5),
    P(sanger, 'l', '70%', 0.9, 2, 1.8), P(lac, 'r', '70%', 0.9, -2, 2.1),
  ],
  upload: [
    P(gel, 'l', '4%', 0.95, -3, 0, true), P(western, 'r', '3%', 0.9, 2, 0.3, true),
    P(plasmid, 'l', '38%', 0.92, 3, 0.6), P(pcr, 'r', '40%', 0.95, -2, 0.9),
    P(fork, 'l', '70%', 0.85, -2, 1.2), P(qpcr, 'r', '70%', 0.85, 2, 1.5),
  ],
  settings: [
    P(nucleosome, 'l', '3%', 0.95, -2, 0, true), P(igg, 'r', '3%', 0.92, 3, 0.3, true),
    P(mm, 'l', '30%', 0.9, 2, 0.6), P(ramachandran, 'r', '30%', 0.9, -3, 0.9),
    P(splicing, 'l', '58%', 0.9, -2, 1.2), P(secondary, 'r', '58%', 0.9, 2, 1.5),
    P(tca, 'l', '82%', 0.85, 3, 1.8), P(crispr, 'r', '82%', 0.85, -2, 2.1),
  ],
};

/** Question screen: lab diagrams that rotate with each question (one under the side panel, three on the right). */
function sessionSet(rotate: number): Placed[] {
  const n = LAB_ARTS.length;
  const pick = (k: number) => LAB_ARTS[(rotate + k) % n];
  return [
    P(pick(0), 'r', '2%', 0.92, 0, 0), P(pick(1), 'r', '36%', 0.92, 0, 0),
    P(pick(2), 'r', '70%', 0.85, 0, 0), P(pick(3), 'l', '74%', 0.8, 0, 0),
  ];
}

export function Doodles({ set = 'home', rotate = 0 }: { set?: DoodleSet; rotate?: number }) {
  const placed = set === 'session' ? sessionSet(rotate) : SETS[set];
  return (
    <div class={'doodles' + (set === 'session' ? ' calm' : '')} aria-hidden="true">
      {placed.map((p, i) => (
        <svg
          key={`${set}-${i}-${set === 'session' ? rotate : 0}`}
          class={`doodle ${p.side}` + (p.mobile ? ' keep' : '')}
          viewBox={`-6 -6 ${p.art.w + 12} ${p.art.h + 12}`}
          width={Math.round(p.art.w * p.scale)}
          height={Math.round(p.art.h * p.scale)}
          style={{ top: p.top, '--rot': `${p.rot}deg`, '--delay': `${p.delay}s`, '--float': `${7 + (i % 4)}s` }}
        >
          {p.art.el}
        </svg>
      ))}
    </div>
  );
}

/** Narrow screens: one faint diagram under the question card, rotating with each question. */
export function FootArt({ rotate = 0 }: { rotate?: number }) {
  const a = LAB_ARTS[rotate % LAB_ARTS.length];
  return (
    <div class="foot-art" aria-hidden="true">
      <svg class="doodle" viewBox={`-6 -6 ${a.w + 12} ${a.h + 12}`}>{a.el}</svg>
    </div>
  );
}
