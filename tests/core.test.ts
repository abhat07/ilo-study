import { describe, expect, it } from 'vitest';
import { cuesToChunks, parseCues, parseTimestampedText, plainTextToChunks, quoteInPassage } from '../src/ingest/text';
import { detectIlos, looksLikeIloDoc } from '../src/ingest/ilo';
import { lexicalMap } from '../src/ingest/lexical';
import { estimateMastery } from '../src/engine/mastery';
import { gradeFor, newCard, review } from '../src/engine/scheduler';
import { Rating } from 'ts-fsrs';
import { validateItem, levelFor } from '../src/engine/generate';
import { markCloze, markOrder, selectNext } from '../src/engine/session';
import { costGBP } from '../src/ai/pricing';
import type { Attempt, Item } from '../src/types';

const PASSAGE =
  'The polymerase chain reaction amplifies a target DNA sequence. Each cycle has three steps: denaturation at 95 °C separates the strands, annealing at 50-65 °C lets primers bind, and extension at 72 °C lets Taq polymerase synthesise new DNA.';

describe('transcripts', () => {
  it('parses VTT cues with timestamps', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Today we look at PCR.

00:00:04.500 --> 00:00:09.000
<v Speaker>It amplifies DNA exponentially.`;
    const cues = parseCues(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[1].text).toBe('It amplifies DNA exponentially.');
    const chunks = cuesToChunks(cues);
    expect(chunks[0].locator).toEqual({ kind: 'time', start: 1, end: 9 });
  });
  it('parses SRT with comma decimals', () => {
    const srt = `1\n00:01:00,000 --> 00:01:02,500\nHello there\n\n2\n00:01:03,000 --> 00:01:05,000\nGeneral Kenobi`;
    const cues = parseCues(srt);
    expect(cues[0].start).toBe(60);
    expect(cues[0].end).toBe(62.5);
  });
  it('detects timestamped plain-text transcripts', () => {
    const txt = `0:00 Welcome\n0:15 Today is about restriction enzymes\n0:40 They cut at palindromic sites\n1:05 Sticky ends help ligation`;
    const cues = parseTimestampedText(txt)!;
    expect(cues).toHaveLength(4);
    expect(cues[2].start).toBe(40);
    expect(plainTextToChunks(txt)[0].locator.kind).toBe('time');
  });
});

describe('traceability', () => {
  it('accepts verbatim quotes with different spacing/case', () => {
    expect(quoteInPassage('denaturation at 95 °C  separates the strands', PASSAGE)).toBe(true);
    expect(quoteInPassage('Annealing at 50-65 °C lets primers bind', PASSAGE)).toBe(true);
  });
  it('rejects invented quotes', () => {
    expect(quoteInPassage('PCR was invented by Kary Mullis in 1983', PASSAGE)).toBe(false);
    expect(quoteInPassage('denaturation', PASSAGE)).toBe(false); // too short to be evidence
  });
});

describe('ILO detection', () => {
  it('finds a learning outcomes list on a slide', () => {
    const chunks = [
      { id: 'a', text: 'Lecture 3: PCR\nLearning outcomes\n1. Describe the three steps of a PCR cycle\n2. Explain why Taq polymerase is used\n3. Calculate the number of copies after n cycles\nIntroduction' },
      { id: 'b', text: 'Denaturation separates strands' },
    ];
    const ilos = detectIlos(chunks, 'L3 PCR');
    expect(ilos.map((i) => i.text)).toEqual([
      'Describe the three steps of a PCR cycle',
      'Explain why Taq polymerase is used',
      'Calculate the number of copies after n cycles',
    ]);
    expect(ilos[0].chunkId).toBe('a');
  });
  it('handles "by the end of this lecture you should be able to"', () => {
    const ilos = detectIlos([{ id: 'x', text: 'By the end of this lecture you should be able to:\n• outline Mendel’s laws\n• predict ratios from a dihybrid cross' }], 'L1');
    expect(ilos).toHaveLength(2);
  });
  it('recognises an ILO document', () => {
    expect(looksLikeIloDoc('AMB ILOs.docx', '')).toBe(true);
    expect(looksLikeIloDoc('notes.txt', 'Describe X and Y\nExplain how Z works\nCompare A and B in detail')).toBe(true);
  });
});

describe('lexical mapper', () => {
  it('maps passages to the most similar ILO', () => {
    const m = lexicalMap(
      [{ id: 'A-01', text: 'Describe the steps of the polymerase chain reaction' }, { id: 'A-02', text: 'Explain Mendelian inheritance of dominant and recessive alleles' }],
      [{ id: 'c1', text: PASSAGE }, { id: 'c2', text: 'Recessive alleles are only expressed when homozygous; Mendelian ratios follow.' }],
    );
    expect(m.get('c1')).toContain('A-01');
    expect(m.get('c2')).toContain('A-02');
  });
});

function att(p: Partial<Attempt>): Attempt {
  return {
    id: Math.random().toString(), itemId: 'i1', moduleId: 'M', iloIds: ['A-01'], sessionId: 's', at: Date.now(),
    confidence: 3, response: '', score: 1, firstExposure: true, transfer: false, level: 1, durationMs: 1000,
    mark: { by: 'auto', score: 1 }, ...p,
  };
}

describe('mastery', () => {
  it('has no evidence with no attempts', () => {
    expect(estimateMastery([], new Map()).label).toBe('No evidence');
  });
  it('weights unseen questions far above repeats', () => {
    const repeats = Array.from({ length: 10 }, () => att({ firstExposure: false }));
    const unseen = Array.from({ length: 3 }, () => att({ firstExposure: true }));
    const r = estimateMastery(repeats, new Map()).value;
    const u = estimateMastery(unseen, new Map()).value;
    expect(u).toBeGreaterThan(r);
  });
  it('caps mastery without a transfer success', () => {
    const many = Array.from({ length: 12 }, () => att({}));
    expect(estimateMastery(many, new Map()).value).toBeLessThan(0.8);
    const withTransfer = [...many, att({ transfer: true })];
    expect(estimateMastery(withTransfer, new Map()).value).toBeGreaterThan(0.8);
  });
  it('decays with time since last success', () => {
    const old = Array.from({ length: 6 }, () => att({ at: Date.now() - 60 * 86400000 }));
    const fresh = Array.from({ length: 6 }, () => att({}));
    expect(estimateMastery(old, new Map()).value).toBeLessThan(estimateMastery(fresh, new Map()).value);
  });
  it('penalises confident errors', () => {
    const calibrated = [...Array.from({ length: 4 }, () => att({})), ...Array.from({ length: 2 }, () => att({ score: 0, confidence: 1 }))];
    const over = [...Array.from({ length: 4 }, () => att({})), ...Array.from({ length: 2 }, () => att({ score: 0, confidence: 4 }))];
    expect(estimateMastery(over, new Map()).value).toBeLessThan(estimateMastery(calibrated, new Map()).value);
  });
  it('ignores disputed attempts', () => {
    expect(estimateMastery([att({ disputed: true })], new Map()).label).toBe('No evidence');
  });
});

describe('scheduler', () => {
  it('maps score and confidence to FSRS grades', () => {
    expect(gradeFor(0, 4)).toBe(Rating.Again);
    expect(gradeFor(1, 1)).toBe(Rating.Hard);
    expect(gradeFor(1, 3)).toBe(Rating.Good);
    expect(gradeFor(1, 4)).toBe(Rating.Easy);
  });
  it('schedules a confident answer further out than a guess', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const easy = review(newCard(now), 1, 4, now);
    const hard = review(newCard(now), 1, 1, now);
    expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(hard.due).getTime());
  });
  it('picks difficulty from mastery', () => {
    expect(levelFor(0.1)).toBe(1);
    expect(levelFor(0.5)).toBe(2);
    expect(levelFor(0.9)).toBe(3);
  });
});

const baseGen = {
  transfer: false, options: [], correct_index: 0, option_explanations: [], answer: '', accepted_answers: [], steps: [],
  explanation: 'x', rubric: [], elaboration_prompt: '', elaboration_answer: '', beyond_materials: '',
  source_quote: 'extension at 72 °C lets Taq polymerase synthesise new DNA',
};

describe('item validation', () => {
  it('accepts a grounded cloze', () => {
    expect(validateItem({ ...baseGen, type: 'cloze', prompt: 'Extension at 72 °C uses ____ polymerase.', answer: 'Taq' }, PASSAGE)).toBeNull();
  });
  it('rejects an untraceable quote', () => {
    expect(validateItem({ ...baseGen, type: 'cloze', prompt: 'x ____', answer: 'Taq', source_quote: 'Taq comes from Thermus aquaticus found in hot springs' }, PASSAGE)).toMatch(/quote/);
  });
  it('rejects a cloze whose answer is not in the passage', () => {
    expect(validateItem({ ...baseGen, type: 'cloze', prompt: 'x ____', answer: 'Pfu' }, PASSAGE)).toMatch(/not in passage/);
  });
  it('checks mcq structure', () => {
    expect(validateItem({ ...baseGen, type: 'mcq', prompt: 'q', options: ['a', 'b', 'c'], correct_index: 0 }, PASSAGE)).toMatch(/4 options/);
    expect(validateItem({ ...baseGen, type: 'mcq', prompt: 'q', options: ['a', 'b', 'c', 'd'], correct_index: 5 }, PASSAGE)).toMatch(/range/);
  });
});

function item(p: Partial<Item>): Item {
  return {
    id: 'it' + Math.random(), moduleId: 'M', iloIds: ['A-01'], type: 'cloze', level: 1, transfer: false, prompt: 'p', options: [],
    correctIndex: 0, distractorWhy: [], answer: 'denaturation', acceptedAnswers: ['denaturing'], steps: ['a', 'b', 'c', 'd'],
    explanation: '', rubric: [], elaborationPrompt: '', elaborationAnswer: '', beyondMaterials: '',
    source: { chunkId: 'c', fileName: 'L1.pdf', locator: { kind: 'page', page: 1 }, quote: '', chunkHash: '' },
    cacheKey: '', model: '', createdAt: 0, status: 'active', card: newCard(), seenCount: 0, ...p,
  };
}

describe('local marking', () => {
  it('accepts exact, synonym and near-miss spellings', () => {
    const it1 = item({});
    expect(markCloze(it1, 'Denaturation').score).toBe(1);
    expect(markCloze(it1, 'denaturing').score).toBe(1);
    expect(markCloze(it1, 'denaturaton').score).toBe(1);
    expect(markCloze(it1, 'annealing').score).toBe(0);
  });
  it('gives partial credit for order', () => {
    const it1 = item({ type: 'order' });
    expect(markOrder(it1, ['a', 'b', 'c', 'd']).score).toBe(1);
    const partial = markOrder(it1, ['a', 'b', 'd', 'c']).score;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
  });
});

describe('session selection', () => {
  it('interleaves ILOs rather than blocking', () => {
    const a1 = item({ id: 'a1', iloIds: ['A-01'] });
    const a2 = item({ id: 'a2', iloIds: ['A-01'] });
    const b1 = item({ id: 'b1', iloIds: ['A-02'], source: { ...a1.source, fileName: 'L2.pdf' } });
    const next = selectNext([a1, a2, b1], { served: ['a1'], retry: [] }, { 'A-01': 0, 'A-02': 0 }, (i) => i.source.fileName);
    expect(next?.id).toBe('b1');
  });
  it('brings a wrong answer back after a gap', () => {
    const items = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'].map((id, k) => item({ id, iloIds: [`A-0${k}`] }));
    const next = selectNext(items, { served: ['x1', 'x2', 'x3', 'x4', 'x5'], retry: [{ itemId: 'x1', after: 5 }] }, {}, (i) => i.source.fileName);
    expect(next?.id).toBe('x1');
  });
});

describe('pricing', () => {
  it('prices haiku far below opus', () => {
    const u = { input_tokens: 1000, output_tokens: 1000 };
    expect(costGBP('claude-haiku-5-5', u)).toBeLessThan(costGBP('claude-opus-5-5', u) / 30);
  });
  it('treats unknown models as expensive', () => {
    expect(costGBP('mystery', { input_tokens: 1e6, output_tokens: 0 })).toBeGreaterThanOrEqual(8);
  });
});

import { computeGame, levelFor as gameLevel, xpForAttempt } from '../src/engine/game';
import { CONF_PROB } from '../src/engine/mastery';

describe('game layer', () => {
  it('rewards honest confidence: expected calibration XP peaks at your true belief', () => {
    // If you truly believe you're right with probability q, which reported confidence maximises expected XP?
    for (const [q, honest] of [[0.25, 1], [0.5, 2], [0.75, 3], [0.95, 4]] as const) {
      const expected = (c: 1 | 2 | 3 | 4) => {
        const right = xpForAttempt(att({ confidence: c, score: 1, response: 'r' })).parts.find((p) => p.label === 'Honest confidence')!.xp;
        const wrong = xpForAttempt(att({ confidence: c, score: 0, response: 'r' })).parts.find((p) => p.label === 'Honest confidence')!.xp;
        return q * right + (1 - q) * wrong;
      };
      const best = ([1, 2, 3, 4] as const).reduce((b, c) => (expected(c) > expected(b) ? c : b), 1 as 1 | 2 | 3 | 4);
      expect(best).toBe(honest);
      expect(CONF_PROB[best]).toBeCloseTo(q, 1);
    }
  });
  it('gives more XP for new questions than repeats', () => {
    expect(xpForAttempt(att({ firstExposure: true })).total).toBeGreaterThan(xpForAttempt(att({ firstExposure: false })).total);
  });
  it('still rewards trying first ("I don\'t know")', () => {
    expect(xpForAttempt(att({ response: '', score: 0 })).total).toBeGreaterThan(0);
  });
  it('has rising level thresholds', () => {
    expect(gameLevel(0).level).toBe(1);
    expect(gameLevel(99).level).toBe(1);
    expect(gameLevel(100).level).toBe(2);
    expect(gameLevel(300).level).toBe(3);
    expect(gameLevel(300).title).toBe('Gene');
  });
  it('derives streak, quests and badges from history', () => {
    const now = new Date('2026-11-24T12:00:00').getTime();
    const day = 86400000;
    const sessions = [0, 1, 2].map((d) => ({ id: 's' + d, moduleId: 'M', startedAt: now - d * day, endedAt: now - d * day + 600000, attemptIds: ['x'], masteryBefore: {} }));
    const attempts = Array.from({ length: 6 }, (_, i) => att({ at: now - 1000 * (10 - i), sessionId: 's0', response: 'r', itemId: 'i' + i }));
    const g = computeGame(attempts, sessions, now);
    expect(g.streak).toBe(3);
    expect(g.quests).toHaveLength(3);
    expect(g.badges.find((b) => b.id === 'run5')!.earned).toBe(true);
    expect(g.badges.find((b) => b.id === 'streak3')!.earned).toBe(true);
    expect(g.xp).toBeGreaterThan(0);
  });
});

describe('help chat hints', () => {
  it('a correct answer after a hint is scheduled sooner', () => {
    expect(gradeFor(1, 4, true)).toBe(Rating.Hard);
    expect(gradeFor(0, 4, true)).toBe(Rating.Again);
  });
  it('hinted answers count as half evidence', () => {
    const clean = Array.from({ length: 4 }, () => att({}));
    const hinted = Array.from({ length: 4 }, () => att({ hinted: true }));
    expect(estimateMastery(hinted, new Map()).value).toBeLessThan(estimateMastery(clean, new Map()).value);
  });
  it('the prompt tells the helper not to reveal answers before the student has answered', async () => {
    const { tutorUser, TUTOR_SYSTEM } = await import('../src/ai/prompts');
    const before = tutorUser({ ilo: 'x', passage: 'p', where: 'w', question: 'q', options: [], answered: false, studentAnswer: '', correctAnswer: 'SECRET', history: [], message: 'what is it?' });
    expect(before).not.toContain('SECRET');
    expect(before).toContain('NOT answered');
    expect(TUTOR_SYSTEM).toMatch(/never state/i);
  });
});
