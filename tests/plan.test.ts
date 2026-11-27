import { describe, expect, it } from 'vitest';
import { computePlan, reviewDaysFor, type PlanModuleIn } from '../src/plan/plan';
import { isTranscript, lectureMaterial, MATERIAL_CHARS } from '../src/learn/sections';
import { eventsFor, fullMoonsIn, seasonStatus } from '../src/reef/seasons';
import { computeWeek, weekStart } from '../src/reef/report';
import { requestParams } from '../src/ai/client';
import type { Attempt, Chunk, Lecture, SourceFile } from '../src/types';

const NOW = new Date('2026-11-27T10:00:00').getTime();
const lec = (n: number, left: number, done = false) => ({ id: `L${n}`, number: n, title: `Lecture ${n}`, left, done });

describe('exam plan', () => {
  const mods: PlanModuleIn[] = [
    { id: 'A', short: 'AMB', exam: '2027-01-12', lectures: [lec(1, 0, true), lec(2, 30), lec(3, 30), lec(4, 30)], due: 5, weak: [{ id: 'A-1', text: 'x', mastery: 0.3 }] },
    { id: 'G', short: 'Gen', exam: '2027-01-14', lectures: [lec(1, 40), lec(2, 40)], due: 0, weak: [] },
  ];
  const plan = computePlan(mods, NOW);
  it('counts down to each exam and keeps the last days for review', () => {
    const amb = plan.modules.find((m) => m.id === 'A')!;
    expect(amb.daysLeft).toBe(46);
    expect(amb.reviewDays).toBe(reviewDaysFor(46));
    expect(amb.lecturesDone).toBe(1);
    expect(amb.phase).toBe('learn');
  });
  it('spreads every remaining lesson over the days before review, in lecture order', () => {
    const learnt = new Map<string, number>();
    for (const d of plan.days) for (const t of d.tasks) if (t.kind === 'learn') learnt.set(t.moduleId + t.lectureId, (learnt.get(t.moduleId + t.lectureId) ?? 0) + t.minutes);
    expect(learnt.get('AL2')).toBeGreaterThanOrEqual(29);
    expect(learnt.get('GL2')).toBeGreaterThanOrEqual(39);
    const firstL3 = plan.days.findIndex((d) => d.tasks.some((t) => t.lectureId === 'L3' && t.moduleId === 'A'));
    const firstL2 = plan.days.findIndex((d) => d.tasks.some((t) => t.lectureId === 'L2' && t.moduleId === 'A'));
    expect(firstL2).toBeLessThanOrEqual(firstL3);
    // no lessons in the review days, and the exam day is marked
    const examDay = plan.days.find((d) => d.tasks.some((t) => t.kind === 'exam' && t.moduleId === 'A'))!;
    expect(new Date(examDay.date).getDate()).toBe(12);
    const before = plan.days[plan.days.indexOf(examDay) - 1];
    expect(before.tasks.filter((t) => t.moduleId === 'A').every((t) => t.kind === 'review')).toBe(true);
  });
  it("puts today's recap and the weakest outcomes on today's list", () => {
    expect(plan.today.some((t) => t.label.includes('recap: 5'))).toBe(true);
    expect(plan.weak[0].id).toBe('A-1');
  });
  it('leaves out modules without a date and marks past exams', () => {
    const p = computePlan([{ ...mods[0], exam: '' }, { ...mods[1], exam: '2026-11-01' }], NOW);
    expect(p.modules.map((m) => m.phase)).toEqual(['none', 'past']);
    expect(p.days).toHaveLength(0);
  });
});

describe('lessons from slides + transcript', () => {
  const file = (id: string, name: string, kind: SourceFile['kind']): SourceFile => ({ id, moduleId: 'M', name, kind, size: 1, hash: id, uploadedAt: 0, hasIlos: false, status: 'active', version: 1, chunkCount: 0, ocrCount: 0 });
  const files = new Map([['s', file('s', 'L3 slides.pdf', 'pdf')], ['t', file('t', 'L3 transcript.txt', 'text')]]);
  const chunk = (fileId: string, i: number, len: number, ilo = false): Chunk => ({
    id: `${fileId}${i}`, moduleId: 'M', fileId, fileName: files.get(fileId)!.name,
    locator: fileId === 's' ? { kind: 'page', page: i } : { kind: 'section', section: i },
    text: 'x'.repeat(len), hash: '', ocr: false, iloIds: ilo ? ['M-1'] : [], mappedBy: 'ai', status: 'active', updatedAt: 0,
  });
  const lecture: Lecture = { id: 'L3', moduleId: 'M', number: 3, title: 'T', fileIds: ['s', 't'], iloIds: ['M-1'], updatedAt: 0 };
  it('recognises transcripts by type, timestamps or name', () => {
    expect(isTranscript(files.get('t'))).toBe(true);
    expect(isTranscript(files.get('s'))).toBe(false);
    expect(isTranscript(files.get('s'), { locator: { kind: 'time', start: 0, end: 60 } })).toBe(true);
  });
  it('includes everything when the lecture fits, slides first', () => {
    const m = lectureMaterial(lecture, [chunk('t', 1, 500), chunk('s', 2, 500), chunk('s', 1, 500)], files);
    expect(m.passages.map((c) => c.id)).toEqual(['s1', 's2', 't1']);
    expect([...m.spoken]).toEqual(['t1']);
  });
  it('shares the space between slides and transcript when it is too long, keeping ILO-matched passages', () => {
    const slides = Array.from({ length: 40 }, (_, i) => chunk('s', i, 2000, i === 39));
    const spoken = Array.from({ length: 40 }, (_, i) => chunk('t', i, 2000, i === 39));
    const m = lectureMaterial(lecture, [...slides, ...spoken], files);
    const size = m.passages.reduce((n, c) => n + c.text.length, 0);
    expect(size).toBeLessThanOrEqual(MATERIAL_CHARS);
    expect(m.spoken.size).toBeGreaterThanOrEqual(14);
    expect(m.passages.length - m.spoken.size).toBeGreaterThanOrEqual(14);
    expect(m.passages.some((c) => c.id === 's39')).toBe(true);
    expect(m.passages.some((c) => c.id === 't39')).toBe(true);
  });
});

describe('prompt caching', () => {
  it('marks the system prompt and the shared lecture material for caching', () => {
    const p = requestParams({ purpose: 'lesson section', tier: 'BULK', system: 'S', prefix: 'LECTURE', user: 'ILO', schema: {}, maxTokens: 10, expectedOutputTokens: 5 });
    expect(p.system[0].cache_control).toEqual({ type: 'ephemeral' });
    const content = p.messages[0].content as { text: string; cache_control?: unknown }[];
    expect(content[0]).toMatchObject({ text: 'LECTURE', cache_control: { type: 'ephemeral' } });
    expect(content[1].cache_control).toBeUndefined();
  });
  it('sends no fallback beta in a batch', () => {
    const p = requestParams({ purpose: 'mark', tier: 'PRECISE', system: 'S', user: 'U', schema: {}, maxTokens: 10, expectedOutputTokens: 5 }, { batch: true });
    expect('fallbacks' in p).toBe(false);
  });
});

describe('seasons', () => {
  it('finds the real full moons (24 Nov and 24 Dec 2026, give or take a day)', () => {
    const near = (t: number, y: number, m: number, d: number) => Math.abs(t - new Date(y, m, d).getTime()) <= 86_400_000;
    expect(near(fullMoonsIn(2026, 10)[0], 2026, 10, 24)).toBe(true);
    expect(near(fullMoonsIn(2026, 11)[0], 2026, 11, 24)).toBe(true);
  });
  it('brings a visitor when the daily goal is reached on enough event days', () => {
    const spawn = eventsFor(2026).find((e) => e.id.startsWith('spawn-2026-11'))!;
    const day = (n: number) => spawn.from + n * 86_400_000;
    const two = seasonStatus(day(4), new Map([[day(0), 25], [day(1), 25]]));
    expect(two.progress.find((p) => p.ev.id === spawn.id)!.earned).toBe(false);
    const three = seasonStatus(day(4), new Map([[day(0), 25], [day(1), 25], [day(3), 20]]));
    expect(three.progress.find((p) => p.ev.id === spawn.id)!.earned).toBe(true);
    expect(three.active.map((e) => e.id)).toContain(spawn.id);
  });
  it('makes an exam season for the two weeks before each exam', () => {
    const exam = new Date(2027, 0, 12).getTime();
    const ev = eventsFor(2027, [{ short: 'AMB', at: exam }]).find((e) => e.effect === 'exam')!;
    expect(new Date(ev.from).getDate()).toBe(29);
    expect(new Date(ev.to).getDate()).toBe(11);
  });
});

describe('weekly report', () => {
  it('adds up the week from Monday to Sunday', () => {
    const start = weekStart(NOW);
    expect(new Date(start).getDay()).toBe(1);
    const at = (d: number) => start + d * 86_400_000 + 3_600_000 * 12;
    const a = (t: number, score: number): Attempt => ({ id: String(t) + score, itemId: 'i', moduleId: 'M', iloIds: [], sessionId: 's', at: t, confidence: 3, response: '', score, firstExposure: true, transfer: false, level: 1, durationMs: 1, mark: { by: 'auto', score } });
    const attempts = [...Array.from({ length: 20 }, (_, i) => a(at(0) + i, 1)), a(at(2), 0), a(at(-3), 1)];
    const r = computeWeek(attempts, [{ at: at(1), moduleId: 'M', index: 0, short: 'AMB', moduleIndex: 0 }], [], start);
    expect(r.answered).toBe(21);
    expect(r.correct).toBe(20);
    expect(r.days[0].goal).toBe(true);
    expect(r.days.filter((d) => d.answers).length).toBe(2);
    expect(r.lectures[0].fish).toBe(3);
    expect(r.xp).toBeGreaterThan(r.xpLastWeek);
  });
});
