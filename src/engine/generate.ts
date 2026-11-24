/**
 * Question generation with caching and traceability checks.
 *  - Cache key = passage content hash + ILO + difficulty level: the same passage/ILO/level is never paid for twice.
 *  - Every item must quote its passage verbatim; items that cannot be traced are rejected.
 */
import { byModule, db, notifyChange, uid } from '../db';
import type { Chunk, Ilo, Item, ItemType } from '../types';
import { AiUnavailableError, callJSON } from '../ai/client';
import { MODELS } from '../ai/pricing';
import { GEN_SCHEMA, GEN_SYSTEM, genUser, type GenItemOut, type GenOut } from '../ai/prompts';
import { locatorLabel, normalise, quoteInPassage } from '../ingest/text';
import { newCard } from './scheduler';
import { estimateMastery } from './mastery';

export function cacheKey(chunk: Chunk, iloId: string, level: number): string {
  return `${chunk.hash.slice(0, 20)}|${iloId}|L${level}`;
}

const TYPES_BY_LEVEL: Record<1 | 2 | 3, ItemType[]> = {
  1: ['cloze', 'mcq'],
  2: ['mcq', 'short', 'order'],
  3: ['short', 'mcq'],
};

export function levelFor(mastery: number): 1 | 2 | 3 {
  return mastery < 0.4 ? 1 : mastery < 0.75 ? 2 : 3;
}

/** Validate one generated item. Returns a reason string if rejected. */
export function validateItem(g: GenItemOut, passage: string): string | null {
  if (!g.prompt?.trim()) return 'empty prompt';
  if (!quoteInPassage(g.source_quote ?? '', passage)) return 'source quote not found in passage';
  switch (g.type) {
    case 'mcq':
      if (g.options.length !== 4 || g.options.some((o) => !o.trim())) return 'mcq needs 4 options';
      if (g.correct_index < 0 || g.correct_index > 3) return 'mcq correct_index out of range';
      if (new Set(g.options.map(normalise)).size !== 4) return 'mcq has duplicate options';
      break;
    case 'cloze':
      if (!g.prompt.includes('____')) return 'cloze has no blank';
      if (!g.answer.trim()) return 'cloze has no answer';
      if (!normalise(passage).includes(normalise(g.answer))) return 'cloze answer not in passage';
      break;
    case 'short':
      if (!g.rubric.length) return 'short answer has no rubric';
      if (!g.answer.trim()) return 'short answer has no model answer';
      break;
    case 'order':
      if (g.steps.length < 3 || g.steps.length > 7) return 'order needs 3-7 steps';
      if (new Set(g.steps.map(normalise)).size !== g.steps.length) return 'order has duplicate steps';
      break;
    default:
      return 'unknown type';
  }
  return null;
}

function toItem(g: GenItemOut, moduleId: string, ilo: Ilo, chunk: Chunk, level: 1 | 2 | 3, key: string): Item {
  return {
    id: uid('it_'),
    moduleId,
    iloIds: [ilo.id],
    type: g.type,
    level,
    transfer: level === 3 && g.transfer,
    prompt: g.prompt.trim(),
    options: g.type === 'mcq' ? g.options : [],
    correctIndex: g.type === 'mcq' ? g.correct_index : 0,
    distractorWhy: g.type === 'mcq' ? g.option_explanations : [],
    answer: g.answer,
    acceptedAnswers: g.accepted_answers ?? [],
    steps: g.type === 'order' ? g.steps : [],
    explanation: g.explanation,
    rubric: g.type === 'short' ? g.rubric : [],
    elaborationPrompt: g.elaboration_prompt,
    elaborationAnswer: g.elaboration_answer,
    beyondMaterials: g.beyond_materials ?? '',
    source: { chunkId: chunk.id, fileName: chunk.fileName, locator: chunk.locator, quote: g.source_quote, chunkHash: chunk.hash },
    cacheKey: key,
    model: MODELS.BULK,
    createdAt: Date.now(),
    status: 'active',
    card: newCard(),
    seenCount: 0,
  };
}

/** Generate items for one (passage, ILO, level). Uses the cache; returns accepted items. */
export async function generateFor(moduleId: string, ilo: Ilo, chunk: Chunk, level: 1 | 2 | 3): Promise<Item[]> {
  const d = await db();
  const key = cacheKey(chunk, ilo.id, level);
  if (await d.get('genlog', key)) return [];
  const types = TYPES_BY_LEVEL[level];
  const out = await callJSON<GenOut>({
    purpose: `generate L${level}`,
    tier: 'BULK',
    system: GEN_SYSTEM,
    user: genUser(ilo, chunk.text, `${chunk.fileName}, ${locatorLabel(chunk.locator)}`, level, types),
    schema: GEN_SCHEMA,
    maxTokens: 10000,
    expectedOutputTokens: 2500,
    effort: 'medium',
  });
  const existing = new Set((await d.getAllFromIndex('items', 'byModule', moduleId)).map((i) => normalise(i.prompt)));
  const accepted: Item[] = [];
  const reasons: string[] = [];
  if (out.supports_ilo) {
    for (const g of out.items) {
      const why = validateItem(g, chunk.text);
      if (why) {
        reasons.push(why);
        continue;
      }
      if (existing.has(normalise(g.prompt))) {
        reasons.push('duplicate prompt');
        continue;
      }
      existing.add(normalise(g.prompt));
      accepted.push(toItem(g, moduleId, ilo, chunk, level, key));
    }
  } else {
    reasons.push('model judged passage does not teach this ILO: ' + out.reason);
  }
  const tx = d.transaction(['items', 'genlog'], 'readwrite');
  for (const it of accepted) await tx.objectStore('items').put(it);
  await tx.objectStore('genlog').put({ cacheKey: key, moduleId, at: Date.now(), accepted: accepted.length, rejected: reasons.length, rejectReasons: reasons });
  await tx.done;
  notifyChange();
  return accepted;
}

interface Target {
  ilo: Ilo;
  chunk: Chunk;
  level: 1 | 2 | 3;
  need: number;
}

/** Pick the next (ILO, passage, level) combinations worth generating, neediest ILO first. */
export async function pickTargets(moduleId: string, max: number): Promise<Target[]> {
  const d = await db();
  const [ilos, chunks, items, attempts, logs] = await Promise.all([
    byModule('ilos', moduleId),
    byModule('chunks', moduleId),
    byModule('items', moduleId),
    byModule('attempts', moduleId),
    byModule('genlog', moduleId),
  ]);
  void d;
  const done = new Set(logs.map((l) => l.cacheKey));
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const targets: Target[] = [];
  for (const ilo of ilos) {
    const m = estimateMastery(attempts.filter((a) => a.iloIds.includes(ilo.id)), itemMap);
    const level = levelFor(m.value);
    const unseen = items.filter((i) => i.status === 'active' && i.seenCount === 0 && i.iloIds.includes(ilo.id) && i.level === level).length;
    if (unseen >= 3) continue;
    const cands = chunks
      .filter((c) => c.status === 'active' && c.iloIds.includes(ilo.id) && c.text.length >= 80)
      .filter((c) => !done.has(cacheKey(c, ilo.id, level)))
      .sort((x, y) => y.text.length - x.text.length);
    if (!cands.length) continue;
    // need: low mastery and few unseen items => generate first
    targets.push({ ilo, chunk: cands[0], level, need: (1 - m.value) * 2 + (3 - unseen) });
  }
  return targets.sort((a, b) => b.need - a.need).slice(0, max);
}

const running = new Map<string, Promise<number>>();

/**
 * Keep a pool of unseen questions ready so sessions start instantly. Safe to call often:
 * only one top-up per module runs at a time. Stops quietly when AI is unavailable.
 */
export function topUpPool(moduleId: string, maxCalls = 4): Promise<number> {
  const cur = running.get(moduleId);
  if (cur) return cur;
  const p = (async () => {
    let made = 0;
    try {
      const targets = await pickTargets(moduleId, maxCalls);
      // run two at a time to keep it quick without bursting the rate limit
      for (let i = 0; i < targets.length; i += 2) {
        const res = await Promise.allSettled(targets.slice(i, i + 2).map((t) => generateFor(moduleId, t.ilo, t.chunk, t.level)));
        for (const r of res) {
          if (r.status === 'fulfilled') made += r.value.length;
          else if (r.reason instanceof AiUnavailableError) return made;
          else console.warn(r.reason);
        }
      }
    } finally {
      running.delete(moduleId);
    }
    return made;
  })();
  running.set(moduleId, p);
  return p;
}

export function isGenerating(moduleId: string): boolean {
  return running.has(moduleId);
}
