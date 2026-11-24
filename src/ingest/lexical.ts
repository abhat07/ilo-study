/** Free, offline fallback mapper: TF-IDF cosine similarity between passages and ILOs. */

const STOP = new Set(
  'the and for with that this from are was were which their there these those into onto than then also such have has had been being can could will would should may might must not but how what when where why who whom your you able describe explain outline discuss understand lecture slide using use used between within each other more most many some'.split(' '),
);

export function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => w.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : '')));
}

export function lexicalMap(
  ilos: { id: string; text: string }[],
  chunks: { id: string; text: string }[],
  threshold = 0.1,
): Map<string, string[]> {
  const docs = [...ilos.map((i) => tokens(i.text)), ...chunks.map((c) => tokens(c.text))];
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  const vec = (toks: string[]) => {
    const tf = new Map<string, number>();
    for (const w of toks) tf.set(w, (tf.get(w) ?? 0) + 1);
    const v = new Map<string, number>();
    let norm = 0;
    for (const [w, f] of tf) {
      const x = (1 + Math.log(f)) * Math.log(1 + N / (df.get(w) ?? 1));
      v.set(w, x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [w, x] of v) v.set(w, x / norm);
    return v;
  };
  const iv = ilos.map((i) => ({ id: i.id, v: vec(tokens(i.text)) }));
  const out = new Map<string, string[]>();
  for (const c of chunks) {
    const cv = vec(tokens(c.text));
    const scored = iv
      .map((i) => {
        let s = 0;
        for (const [w, x] of i.v) s += x * (cv.get(w) ?? 0);
        return { id: i.id, s };
      })
      .filter((x) => x.s >= threshold)
      .sort((a, b) => b.s - a.s)
      .slice(0, 2);
    out.set(c.id, scored.map((x) => x.id));
  }
  return out;
}
