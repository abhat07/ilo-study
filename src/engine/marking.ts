/** Model-backed marking and explanations (PRECISE tier). */
import { db, kvGet, kvSet, sha256 } from '../db';
import type { Item, MarkDetail } from '../types';
import { callJSON } from '../ai/client';
import {
  EXPLAIN_SCHEMA, EXPLAIN_SYSTEM, MARK_SCHEMA, MARK_SYSTEM, explainUser, markUser, type ExplainOut, type MarkOut,
} from '../ai/prompts';

export async function passageFor(it: Item): Promise<string> {
  const c = await (await db()).get('chunks', it.source.chunkId);
  return c?.text ?? it.source.quote;
}

/** Marks a free-text answer against the item's rubric. Throws AiUnavailableError when AI can't be used. */
export async function markShortAI(it: Item, response: string): Promise<MarkDetail> {
  const passage = await passageFor(it);
  const out = await callJSON<MarkOut>({
    purpose: 'mark short answer',
    tier: 'PRECISE',
    system: MARK_SYSTEM,
    user: markUser(it.prompt, it.rubric, it.answer, passage, response),
    schema: MARK_SCHEMA,
    maxTokens: 6000,
    expectedOutputTokens: 900,
    effort: 'medium',
  });
  const total = it.rubric.reduce((s, r) => s + (r.marks || 1), 0) || 1;
  const points = out.points.slice(0, it.rubric.length);
  const got = points.reduce((s, p, i) => s + (p.awarded ? it.rubric[i].marks || 1 : 0), 0);
  return {
    by: 'ai',
    score: Math.min(1, got / total),
    points,
    reasoning: out.overall_reasoning,
    confidence: out.confidence,
    feedback: out.feedback,
  };
}

/** Self-marking fallback: the student ticks the rubric points they covered. */
export function selfMark(it: Item, ticked: boolean[]): MarkDetail {
  const total = it.rubric.reduce((s, r) => s + (r.marks || 1), 0) || 1;
  const got = it.rubric.reduce((s, r, i) => s + (ticked[i] ? r.marks || 1 : 0), 0);
  return {
    by: 'self',
    score: got / total,
    points: it.rubric.map((r, i) => ({ point: r.point, awarded: !!ticked[i], reasoning: 'Self-marked' })),
    reasoning: 'Self-marked against the rubric.',
  };
}

/** Deeper explanation on request, cached per item and answer so it is only paid for once. */
export async function explainMore(it: Item, studentAnswer: string, correct: string): Promise<ExplainOut> {
  const key = `explain:${it.id}:${(await sha256(studentAnswer.trim().toLowerCase())).slice(0, 12)}`;
  const cached = await kvGet<ExplainOut | null>(key, null);
  if (cached) return cached;
  const out = await callJSON<ExplainOut>({
    purpose: 'explain more',
    tier: 'PRECISE',
    system: EXPLAIN_SYSTEM,
    user: explainUser(it.prompt, correct, studentAnswer, await passageFor(it)),
    schema: EXPLAIN_SCHEMA,
    maxTokens: 4000,
    expectedOutputTokens: 600,
    effort: 'low',
  });
  await kvSet(key, out);
  return out;
}
