/**
 * DEVELOPMENT ONLY. A deterministic stand-in for the model so the whole flow can be
 * exercised without an API key. Enabled with localStorage['ilo.mock']='1' in `npm run dev`.
 * Production builds never use it (settings.mock() checks import.meta.env.DEV).
 */
import type { JsonCall } from './client';
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
    const ans = (u.match(/<answer>\n([\s\S]*?)\n<\/answer>/) ?? [])[1] ?? '';
    const rubricBlock = (u.match(/RUBRIC:\n([\s\S]*?)\n\n/) ?? [])[1] ?? '';
    const rubric = [...rubricBlock.matchAll(/^\d+\. (.*)$/gm)].map((m) => m[1]);
    return {
      points: rubric.map((p, i) => ({ point: p, awarded: ans.length > 20 * (i + 1), reasoning: '(mock marking by answer length)' })),
      overall_reasoning: 'Mock marker: awards points by answer length. Not a real judgement.',
      confidence: 'low',
      feedback: 'This is a mock mark used for testing the app without an API key.',
    } satisfies MarkOut;
  }
  if (call.purpose.startsWith('tutor')) {
    const answered = u.includes('STATUS: the student has answered');
    return {
      reply: answered
        ? 'Mock helper: compare your answer with the highlighted quote, which states the key point directly.'
        : 'Mock helper: think about what the slide says happens at this step. Have a go first, then ask me again.',
      beyond_materials: '',
    };
  }
  if (call.purpose.startsWith('explain')) {
    return { explanation: 'Mock explanation: re-read the highlighted passage.', beyond_materials: '' } satisfies ExplainOut;
  }
  throw new Error('mock: unknown purpose ' + call.purpose);
}
