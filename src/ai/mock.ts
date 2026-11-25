/**
 * A deterministic stand-in for the model, so every feature can be tried without an API key or cost.
 * Used in demo mode (a separate sandbox database; see src/mode.ts) and, in `npm run dev`, with
 * localStorage['ilo.mock']='1'. Never used for real material outside those.
 */
import type { JsonCall } from './client';
import { DEMO_LABELS, DEMO_VISUALS } from '../demo/content';
import type { GenItemOut, GenOut, MapOut, MarkOut, ExplainOut, IloOut } from './prompts';

const words = (s: string) => s.toLowerCase().match(/[a-z0-9']{4,}/g) ?? [];

export function mockRespond(call: JsonCall): unknown {
  const u = call.user;
  if (call.purpose.startsWith('ilo')) {
    const lines = u.split('\n').filter((l) => /^\s*(\d+[.)]|[-•*])\s+\w/.test(l));
    return { ilos: lines.map((l) => ({ text: l.replace(/^\s*(\d+[.)]|[-•*])\s+/, '').trim(), lecture: '' })) } satisfies IloOut;
  }
  if (call.purpose.startsWith('map')) {
    const ilos = [...u.matchAll(/^([A-Z]+-\d+): (.*)$/gm)].map((m) => ({ id: m[1], w: new Set(words(m[2])) }));
    const passages = [...u.matchAll(/<passage id="([^"]+)">\n([\s\S]*?)\n<\/passage>/g)];
    return {
      mappings: passages.map((p) => {
        const pw = new Set(words(p[2]));
        const scored = ilos.map((i) => ({ id: i.id, s: [...i.w].filter((w) => pw.has(w)).length }));
        return { chunk_id: p[1], ilo_ids: scored.filter((x) => x.s >= 2).map((x) => x.id) };
      }),
    } satisfies MapOut;
  }
  if (call.purpose.startsWith('generate')) {
    const passage = (u.match(/<passage>\n([\s\S]*?)\n<\/passage>/) ?? [])[1] ?? '';
    const sentences = passage.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.split(' ').length >= 6);
    if (sentences.length === 0) return { supports_ilo: false, reason: 'passage too short', items: [] } satisfies GenOut;
    const s = sentences[0];
    const ws = s.split(/\s+/);
    const keyIdx = ws.reduce((best, w, i) => (w.replace(/\W/g, '').length > ws[best].replace(/\W/g, '').length ? i : best), 0);
    const key = ws[keyIdx].replace(/[^\w-]/g, '');
    const cloze = ws.map((w, i) => (i === keyIdx ? '____' : w)).join(' ');
    const others = [...new Set(words(passage))].filter((w) => w !== key.toLowerCase()).slice(0, 3);
    while (others.length < 3) others.push(`option${others.length}`);
    const base = {
      transfer: false, options: [], correct_index: 0, option_explanations: [], accepted_answers: [], steps: [],
      rubric: [], beyond_materials: '', source_quote: s,
      elaboration_prompt: `Why is "${key}" important here?`, elaboration_answer: s,
    };
    const items: GenItemOut[] = [
      { ...base, type: 'cloze', prompt: cloze, answer: key, accepted_answers: [key.toLowerCase()], explanation: `The passage states: ${s}` },
      {
        ...base, type: 'mcq', prompt: `According to the lecture, which term completes: "${cloze}"?`,
        options: [key, ...others], correct_index: 0,
        option_explanations: [`Correct — the passage says "${s}".`, ...others.map((o) => `"${o}" is not what the passage says here.`)],
        answer: key, explanation: `The passage states: ${s}`,
      },
    ];
    if (sentences.length >= 3) {
      items.push({
        ...base, type: 'order', prompt: 'Put these statements in the order they appear in the lecture.',
        steps: sentences.slice(0, 4).map((x) => x.split(' ').slice(0, 10).join(' ')), answer: '', explanation: 'This is the order given in the passage.',
      });
    }
    items.push({
      ...base, type: 'short', prompt: `In your own words, explain: ${s.split(' ').slice(0, 8).join(' ')}…`,
      answer: s, rubric: [{ point: `Mentions ${key}`, marks: 1 }, { point: 'Explains the relationship described', marks: 1 }],
      explanation: s,
    });
    return { supports_ilo: true, reason: '', items } satisfies GenOut;
  }
  if (call.purpose.startsWith('mark')) {
    // Marks by how many key words of the model answer the student used (a stand-in, not a judgement).
    const ans = (u.match(/<answer>\n([\s\S]*?)\n<\/answer>/) ?? [])[1] ?? '';
    const model = (u.match(/MODEL ANSWER: (.*)/) ?? [])[1] ?? '';
    const rubricBlock = (u.match(/RUBRIC:\n([\s\S]*?)\n\n/) ?? [])[1] ?? '';
    const rubric = [...rubricBlock.matchAll(/^\d+\. (.*)$/gm)].map((m) => m[1]);
    const mw = new Set(words(model).filter((w) => w.length >= 5));
    const hit = [...new Set(words(ans))].filter((w) => mw.has(w)).length;
    return {
      points: rubric.map((pt, i) => ({ point: pt, awarded: hit >= 2 + 2 * i, reasoning: `(demo marker: ${hit} key words from the model answer)` })),
      overall_reasoning: 'Demo marker: counts key words from the model answer. The real marker judges meaning against the rubric.',
      confidence: 'low',
      feedback: hit >= 2 ? 'Good: you used the key terms. Check the model answer for anything you left out.' : 'Use the key terms from the slide: compare your answer with the model answer below.',
    } satisfies MarkOut;
  }
  if (call.purpose.startsWith('lesson')) {
    // Fake lesson: points are the passages' own sentences (so quotes are verbatim); every question type is used.
    const iloLine = (u.match(/^ILO ([A-Z]+-\d+): (.*)$/m) ?? []) as string[];
    const passages = [...u.matchAll(/<passage id="([^"]+)" where="[^"]*">\n([\s\S]*?)\n<\/passage>/g)];
    const points: { text: string; quote: string; passage_id: string; label?: string; visual_item?: number }[] = [];
    const seenP = new Set<string>();
    for (const [, pid, text] of passages) {
      for (const sen of text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.replace(/^Speaker notes:\s*/, '').trim()).filter((x) => x.split(/\s+/).length >= 8 && !/^\d+\./.test(x) && /[.!?]$/.test(x))) {
        const k = sen.toLowerCase();
        if (points.length < 8 && !seenP.has(k)) { seenP.add(k); points.push({ text: sen, quote: sen, passage_id: pid }); }
      }
    }
    const visual = (iloLine[1] && DEMO_VISUALS[iloLine[1]]) || {
      kind: 'process', title: 'Key ideas', columns: [], items: points.slice(0, 5).map((x, i) => ({ label: `${i + 1}`, detail: x.text.split(' ').slice(0, 8).join(' ') + '…' })),
    };
    // step labels: a diagram label the sentence starts with, else its first words
    const labelled = points.map((pt, i) => {
      const low = pt.text.toLowerCase();
      const starts = visual.items.findIndex((it) => low.startsWith(it.label.toLowerCase().replace(/^\d+$/, '#')));
      const mentions = visual.items.findIndex((it) => it.label.length > 3 && low.includes(it.label.toLowerCase()));
      // fallback name: the sentence's subject (words before its verb), without a leading article
      const VERB = /^(has|have|is|are|was|were|lets|let|breaks|comes|lacks|removes|recognises|recognise|cuts|leaves|contains|anneal|seals|gives|runs|run|migrates|forms|move|moves|separates|doubles|can|reaches|need|needs|does|means|allows|usually|then|also|so|because|in)$/i;
      const ws = pt.text.replace(/[,:;].*$/, '').split(/\s+/);
      const cut = ws.findIndex((w, j) => j > 0 && VERB.test(w));
      const subj = ws.slice(0, cut > 0 ? Math.min(cut, 5) : 4).filter((w, j) => !(j === 0 && /^(each|the|a|an|this|these|in)$/i.test(w))).join(' ');
      const first = subj ? subj[0].toUpperCase() + subj.slice(1) : ws.slice(0, 4).join(' ');
      const vi = starts >= 0 ? starts : mentions >= 0 ? mentions : visual.kind === 'process' && !DEMO_VISUALS[iloLine[1]] && i < visual.items.length ? i : -1;
      const named = DEMO_LABELS[pt.text.toLowerCase().split(/\s+/).slice(0, 4).join(' ').replace(/,$/, '')];
      return { ...pt, label: named ?? (starts >= 0 ? visual.items[starts].label : first), visual_item: vi };
    });
    points.splice(0, points.length, ...labelled);
    const keyOf = (q: string) => {
      const ws = q.split(/\s+/);
      const k = ws.reduce((best, w, j) => (w.replace(/\W/g, '').length > ws[best].replace(/\W/g, '').length ? j : best), 0);
      return { ws, k, key: ws[k].replace(/[^\w-]/g, '') };
    };
    const pool = [...new Set(points.flatMap((pt) => pt.text.split(/\s+/).map((w) => w.replace(/[^\w-]/g, '')).filter((w) => w.length >= 7)))];
    const blank = { transfer: false, options: [] as string[], correct_index: 0, option_explanations: [] as string[], accepted_answers: [] as string[], steps: [] as string[],
      rubric: [] as { point: string; marks: number }[], elaboration_prompt: '', elaboration_answer: '', beyond_materials: '', link_points: [] as string[] };
    const questions: any[] = [];
    points.forEach((pt, i) => {
      const { ws, k, key } = keyOf(pt.quote);
      const cloze = ws.map((w, j) => (j === k ? w.replace(key, '____') : w)).join(' ');
      const base = { ...blank, source_quote: pt.quote, point_index: i, passage_id: pt.passage_id, explanation: pt.text };
      const others = pool.filter((w) => w.toLowerCase() !== key.toLowerCase()).slice(i, i + 3);
      if (i % 3 === 1 && others.length === 3) {
        const at = i % 4;
        const opts = [...others];
        opts.splice(at, 0, key);
        questions.push({ ...base, type: 'mcq', prompt: `Which word completes this statement from the lecture? "${cloze}"`, options: opts, correct_index: at,
          option_explanations: opts.map((o) => (o === key ? `Correct: the slide says "${pt.quote}"` : `"${o}" is a term from this section, but not the one used here.`)), answer: key });
      } else if (i % 3 === 2) {
        questions.push({ ...base, type: 'short', prompt: `Explain this point from the lecture in your own words: "${pt.text.split(' ').slice(0, 8).join(' ')}…"`, answer: pt.text,
          rubric: [{ point: `Uses the key term "${key}"`, marks: 1 }, { point: 'States the cause or mechanism given on the slide', marks: 1 }] });
      } else {
        questions.push({ ...base, type: 'cloze', prompt: cloze, answer: key, accepted_answers: [key.toLowerCase()] });
      }
    });
    // link-back questions: after each step, connect it to the step before (or order the steps so far)
    const short = (x: { text: string }) => x.text.split(' ').slice(0, 9).join(' ') + '…';
    points.forEach((pt, k) => {
      if (k === 0) return;
      const prev = points[k - 1];
      const base = { ...blank, source_quote: pt.quote, point_index: k, passage_id: pt.passage_id, link_points: [`S${k - 1}`] };
      if (k >= 2 && k % 2 === 0 && new Set(points.slice(0, k + 1).map(short)).size === k + 1 && k + 1 <= 7) {
        questions.push({ ...base, type: 'order', prompt: `Link back: put the steps up to "${pt.label}" in the order they were taught.`, steps: points.slice(0, k + 1).map(short),
          answer: '', explanation: 'Each step builds on the one before it.' });
      } else {
        questions.push({ ...base, type: 'short', prompt: `Link back: how does "${prev.label}" connect to "${pt.label}"?`, answer: prev.text + ' ' + pt.text,
          rubric: [{ point: `Recalls ${prev.label}`, marks: 1 }, { point: `Explains how it leads to or relates to ${pt.label}`, marks: 1 }],
          explanation: `Step ${k} (${prev.label}) and step ${k + 1} (${pt.label}) are linked: ${prev.text} ${pt.text}` });
      }
    });
    const mine = new Set(points.map((x) => x.text));
    const earlier = [...u.matchAll(/^(E\d+): (.*) \((this lecture|Lecture \d+)[^)]*\)$/gm)].filter((m) => !mine.has(m[2]));
    if (earlier.length && points.length) {
      // the earlier point sharing most words with this section (ties: this lecture first)
      const here = new Set(words(points.map((x) => x.text).join(' ')).filter((w) => w.length >= 5));
      const score = (m: RegExpMatchArray) => words(m[2]).filter((w) => here.has(w)).length + (m[3] === 'this lecture' ? 0.5 : 0);
      const e = earlier.reduce((best, m) => (score(m) > score(best) ? m : best), earlier[0]);
      questions.push({ ...blank, type: 'short', prompt: `Link it up: how does "${e[2].split(' ').slice(0, 10).join(' ')}…" (${e[3]}) connect to "${points[0].text.split(' ').slice(0, 10).join(' ')}…"?`,
        answer: e[2] + ' ' + points[0].text, rubric: [{ point: 'Recalls the earlier idea correctly', marks: 1 }, { point: 'Explains how it connects to this section', marks: 1 }],
        explanation: 'Linking ideas across sections and lectures is the basis of essay answers.', source_quote: points[0].quote, point_index: -1, link_points: [e[1]], passage_id: points[0].passage_id });
    }
    const title = (iloLine[2] ?? 'Lesson section').replace(/^(Describe|Explain|Interpret|Compare|Outline)\s+/i, '').replace(/^./, (c) => c.toUpperCase()).slice(0, 100);
    return {
      title, intro: `This part of the lecture in ${points.length} small steps. After each one you answer a question on it, then one linking it back to the step before.`, points, visual, questions,
    };
  }
  if (call.purpose.startsWith('tutor')) {
    const answered = u.includes('STATUS: the student has answered');
    const passage = ((u.match(/<passage>\n([\s\S]*?)\n<\/passage>/) ?? [])[1] ?? '').split(/(?<=[.!?])\s+/)[0] ?? '';
    return {
      reply: answered
        ? `(Demo helper) The slide puts it like this: "${passage}" Compare that with what you wrote.`
        : '(Demo helper) Think about what the slide says happens at this step and which key term it uses. Have a go first; I will not give the answer away.',
      beyond_materials: '',
    };
  }
  if (call.purpose.startsWith('explain')) {
    const passage = (u.match(/<passage>\n([\s\S]*?)\n<\/passage>/) ?? [])[1] ?? '';
    return { explanation: `(Demo explanation) The lecture says: ${passage.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ')}`, beyond_materials: '' } satisfies ExplainOut;
  }
  throw new Error('mock: unknown purpose ' + call.purpose);
}
