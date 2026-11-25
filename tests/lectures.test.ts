import { describe, expect, it } from 'vitest';
import { lectureNumbers, titleFromFile } from '../src/learn/lectures';

describe('lecture detection from file names', () => {
  const cases: [string, number[], string][] = [
    ['Lecture_01_Introduction_to_molecular_biology.pdf', [1], 'Introduction to molecular biology'],
    ['Lecture 1 Introduction to molecular biology (2026)-1.pptx', [1], 'Introduction to molecular biology'],
    ['Lecture 2-The toolkit(2026).pptx', [2], 'The toolkit'],
    ['Lecture_03_PCR.pdf', [3], 'PCR'],
    ['Lecture_08_Sequencing_continued_and_identifying_genes.pptx', [8], 'Sequencing continued and identifying genes'],
    ['Transcript_Lectures_07-08_2026-10-08.txt', [7, 8], ''],
    ['Transcript_Lecture_09_2026-10-09.txt', [9], ''],
    ['AMB_ILO_list_Lectures_1-9.txt', [1, 2, 3, 4, 5, 6, 7, 8, 9], ''],
    ['7. Sequencing_26_Canvas.pptx', [7], 'Sequencing'],
    ['08_Mutation and Repair_CM_26_BB.pptx', [8], 'Mutation and Repair CM BB'],
    ['L4 Transcription_CM_26_BB.pptx', [4], 'Transcription CM BB'],
    ['CBG.17 Mendelian Genetics 2026.pptx', [17], 'Mendelian Genetics 2026'],
    ['CBGLecture2 2026.pptx', [2], ''],
    ['26GEN-Intro-1.pptx', [], ''],
  ];
  for (const [name, nums, title] of cases) {
    it(name, () => {
      expect(lectureNumbers(name)).toEqual(nums);
      if (title) expect(titleFromFile(name)).toBe(title);
    });
  }
});

import { lectureState, latestScores, nextLessonItem, sectionState } from '../src/learn/progress';
import { newCard } from '../src/engine/scheduler';
import type { Attempt, Item, LearnSection, Lecture } from '../src/types';

function it2(id: string, extra: Partial<Item> = {}): Item {
  return {
    id, moduleId: 'M', iloIds: ['I1'], type: 'cloze', level: 1, transfer: false, prompt: id, options: [], correctIndex: 0, distractorWhy: [],
    answer: 'x', acceptedAnswers: [], steps: [], explanation: '', rubric: [], elaborationPrompt: '', elaborationAnswer: '', beyondMaterials: '',
    source: { chunkId: 'c', fileName: 'f', locator: { kind: 'page', page: 1 }, quote: '', chunkHash: '' }, cacheKey: id, model: 'm',
    createdAt: 0, status: 'active', card: newCard(), seenCount: 0, kind: 'point', pointIndex: 0, ...extra,
  };
}
const sec = (id: string, itemIds: string[], seenAt?: number): LearnSection => ({
  id, moduleId: 'M', lectureId: 'L1', iloId: id, order: Number(id.slice(1)), title: id, intro: '', points: [], chunkIds: [],
  visual: { kind: 'none', title: '', columns: [], items: [] }, itemIds, seenAt, updatedAt: 0,
});
const at = (itemId: string, score: number, t: number): Attempt => ({
  id: itemId + t, itemId, moduleId: 'M', iloIds: ['I1'], sessionId: 's', at: t, confidence: 3, response: 'r', score,
  firstExposure: true, transfer: false, level: 1, durationMs: 1, mark: { by: 'auto', score },
});

describe('lesson progress', () => {
  const items = new Map(['a', 'b', 'c'].map((id, i) => [id, it2(id, { pointIndex: i })]));
  it('stalls until every question in the section is right', () => {
    const s = sec('S1', ['a', 'b', 'c'], 1);
    const wrong = sectionState(s, items, latestScores([at('a', 1, 1), at('b', 0, 2), at('c', 1, 3)]));
    expect(wrong.done).toBe(false);
    expect(wrong.frac).toBeCloseTo(0.1 + 0.9 * (2 / 3));
    const fixed = sectionState(s, items, latestScores([at('a', 1, 1), at('b', 0, 2), at('c', 1, 3), at('b', 1, 4)]));
    expect(fixed.done).toBe(true);
  });
  it('is not complete without reading the explanation', () => {
    const s = sec('S1', ['a'], undefined);
    expect(sectionState(s, items, latestScores([at('a', 1, 1)])).done).toBe(false);
  });
  it('asks unanswered points in order, then repeats wrong ones', () => {
    const s = sec('S1', ['a', 'b', 'c'], 1);
    const latest = latestScores([at('a', 0, 1)]);
    expect(nextLessonItem({ section: s, items, latest, askedThisSitting: ['a'], reviewPool: [] })!.item.id).toBe('b');
    const latest2 = latestScores([at('a', 0, 1), at('b', 1, 2), at('c', 1, 3)]);
    expect(nextLessonItem({ section: s, items, latest: latest2, askedThisSitting: ['a', 'b', 'c'], reviewPool: [] })!.item.id).toBe('a');
  });
  it('slips in a spaced review every 4 questions', () => {
    const many = new Map([...'abcdef'].map((id, i) => [id, it2(id, { pointIndex: i })]));
    const s = sec('S2', [...'abcdef'], 1);
    const old = it2('old', { seenCount: 2 });
    const r = nextLessonItem({ section: s, items: many, latest: latestScores([]), askedThisSitting: ['a', 'b', 'c', 'd'], reviewPool: [old] });
    expect(r!.review).toBe(true);
    expect(r!.item.id).toBe('old');
  });
  it('reaches 100% only when every ILO section is done, then counts recap reviews', () => {
    const lec: Lecture = { id: 'L1', moduleId: 'M', number: 1, title: 'x', fileIds: [], iloIds: ['S1', 'S2'], updatedAt: 0 };
    const s1 = sec('S1', ['a'], 1);
    const st1 = lectureState(lec, [s1], items, latestScores([at('a', 1, 1)]));
    expect(st1.done).toBe(false);
    expect(st1.frac).toBeLessThan(1);
    const s2 = sec('S2', ['b'], 1);
    const st2 = lectureState(lec, [s1, s2], items, latestScores([at('a', 1, 1), at('b', 1, 2)]));
    expect(st2.done).toBe(true);
    expect(st2.frac).toBe(1);
  });
});

import { DEFAULT_PACE, lectureMinutes, nextLessonStep } from '../src/learn/progress';

describe('step-by-step lessons', () => {
  const pts = ['Denaturation', 'Annealing', 'Extension'].map((label) => ({ label, text: `${label} happens at a set temperature in each cycle.`, quote: 'q', chunkId: 'c' }));
  const items = new Map([
    ['d', it2('d', { pointIndex: 0 })],
    ['a', it2('a', { pointIndex: 1 })],
    ['a-link', it2('a-link', { pointIndex: 1, kind: 'link', type: 'short' })],
    ['e', it2('e', { pointIndex: 2 })],
    ['end', it2('end', { pointIndex: -1, kind: 'link', type: 'short' })],
  ]);
  const s = (readTo: number): LearnSection => ({ ...sec('S1', [...items.keys()]), points: pts, readTo });
  const step = (readTo: number, attempts: Attempt[], asked: string[] = []) =>
    nextLessonStep({ section: s(readTo), items, latest: latestScores(attempts), askedThisSitting: asked, reviewPool: [] });

  it('reads a step, asks its question, links it back, then moves on', () => {
    expect(step(0, [])).toEqual({ kind: 'read', index: 0 });
    expect((step(1, []) as any).item.id).toBe('d');
    expect(step(1, [at('d', 1, 1)])).toEqual({ kind: 'read', index: 1 });
    expect((step(2, [at('d', 1, 1)]) as any).item.id).toBe('a');
    expect((step(2, [at('d', 1, 1), at('a', 1, 2)]) as any).item.id).toBe('a-link');
    expect(step(2, [at('d', 1, 1), at('a', 1, 2), at('a-link', 1, 3)])).toEqual({ kind: 'read', index: 2 });
  });
  it('retries a wrong answer before the next step, then finishes with end-of-section links', () => {
    const wrongD = [at('d', 0, 1), at('a', 1, 2), at('a-link', 1, 3)];
    expect((step(2, wrongD, ['d', 'a', 'a-link']) as any).item.id).toBe('d');
    const allRead = [at('d', 1, 4), at('a', 1, 2), at('a-link', 1, 3), at('e', 1, 5)];
    expect((step(3, allRead) as any).item.id).toBe('end');
    expect(step(3, [...allRead, at('end', 1, 6)])).toBeNull();
  });
  it('counts steps read towards progress, and estimates time left', () => {
    const lec: Lecture = { id: 'L1', moduleId: 'M', number: 1, title: 'x', fileIds: [], iloIds: ['S1'], updatedAt: 0 };
    expect(sectionState(s(1), items, latestScores([])).frac).toBeCloseTo(0.1 / 3);
    const fresh = lectureMinutes(lec, [s(0)], items, latestScores([]), DEFAULT_PACE);
    expect(fresh.total).toBeGreaterThan(3);
    expect(fresh.left).toBeGreaterThanOrEqual(fresh.total);
    const all = [at('d', 1, 1), at('a', 1, 2), at('a-link', 1, 3), at('e', 1, 4), at('end', 1, 5)];
    expect(lectureMinutes(lec, [s(3)], items, latestScores(all), DEFAULT_PACE).left).toBe(0);
    // an ILO without a written section yet counts like the written ones
    expect(lectureMinutes({ ...lec, iloIds: ['S1', 'S2'] }, [s(3)], items, latestScores(all)).left).toBe(lectureMinutes(lec, [s(3)], items, latestScores(all)).total);
  });
});
