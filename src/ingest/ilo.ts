/**
 * Local (free, private) ILO detection. Looks for "learning outcomes" style headings and
 * collects the list that follows. The AI parser is only used if this finds nothing.
 */
import { normalise } from './text';

export interface IloCandidate {
  text: string;
  lecture: string;
  chunkId?: string;
}

const HEADER =
  /(intended\s+learning\s+outcomes?|learning\s+outcomes?|learning\s+objectives?|\bILOs?\b|by\s+the\s+end\s+of\s+(?:this|the)\s+(?:lecture|session|module|course|topic|unit)[^\n]*?(?:able\s+to|should|will)[^\n]*)/i;

const VERB =
  /^(describe|explain|outline|compare|contrast|discuss|evaluate|define|apply|interpret|calculate|design|identify|list|state|understand|appreciate|analy[sz]e|recogni[sz]e|summari[sz]e|predict|distinguish|demonstrate|critically|use|perform|construct|derive|relate|assess|illustrate|know|name|draw|justify|propose|explore|differentiate|be able to)\b/i;

const BULLET = /^\s*(?:\(?\d{1,2}[.)]|\(?[a-z][.)]|[-•*▪●◦–])\s*/;

function clean(line: string): string {
  return line.replace(BULLET, '').replace(/\s+/g, ' ').trim();
}

export function detectIlos(chunks: { id: string; text: string }[], lecture: string, wholeFileIsIloDoc = false): IloCandidate[] {
  const out: IloCandidate[] = [];
  const seen = new Set<string>();
  const push = (t: string, chunkId: string) => {
    const c = clean(t).replace(/[;,.]$/, '');
    if (c.split(' ').length < 3 || c.length > 400) return;
    const k = normalise(c);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ text: c, lecture, chunkId });
  };

  for (const ch of chunks) {
    const lines = ch.text.split('\n');
    let inList = false;
    let misses = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const h = line.match(HEADER);
      if (h) {
        inList = true;
        misses = 0;
        // header and first outcome on the same line: "By the end you should be able to: describe X"
        const after = line.slice((h.index ?? 0) + h[0].length).replace(/^[\s:–-]+/, '');
        if (after && VERB.test(clean(after))) push(after, ch.id);
        continue;
      }
      if (inList || wholeFileIsIloDoc) {
        const c = clean(line);
        if (VERB.test(c) || (inList && BULLET.test(line) && c.split(' ').length >= 4)) {
          push(c, ch.id);
          misses = 0;
        } else if (inList && ++misses >= 2) {
          inList = false;
        }
      }
    }
  }
  return out;
}

/** A file is treated as an ILO document when its name says so or most of its lines read like outcomes. */
export function looksLikeIloDoc(fileName: string, text: string): boolean {
  if (/\bilo|learning[\s_-]*outcome|objectives/i.test(fileName)) return true;
  const lines = text.split('\n').map(clean).filter((l) => l.split(' ').length >= 3);
  if (lines.length < 3) return false;
  return lines.filter((l) => VERB.test(l)).length / lines.length > 0.5;
}
