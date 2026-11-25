/** FSRS spaced repetition (ts-fsrs). One card per item. */
import { FSRS, Rating, State, createEmptyCard, type Card, type Grade } from 'ts-fsrs';
import type { Confidence } from '../types';

const f = new FSRS({ request_retention: 0.9, enable_fuzz: true, maximum_interval: 180 });

export function newCard(now = new Date()): Card {
  return createEmptyCard(now);
}

/**
 * Turn an answer into an FSRS grade. Confidence matters: a correct guess is a weak
 * memory, so it is scheduled sooner than a confident correct answer.
 */
export function gradeFor(score: number, confidence: Confidence, hinted = false): Grade {
  if (score < 0.5) return Rating.Again;
  if (hinted) return Rating.Hard; // got there with help: review sooner
  if (score < 0.99 || confidence <= 2) return Rating.Hard;
  if (confidence === 4) return Rating.Easy;
  return Rating.Good;
}

export function review(card: Card, score: number, confidence: Confidence, now = new Date(), hinted = false): Card {
  return f.next(reviveCard(card), now, gradeFor(score, confidence, hinted)).card;
}

export function retrievability(card: Card, now = new Date()): number {
  const c = reviveCard(card);
  if (c.state === State.New) return 0;
  return f.retrievability(c, now);
}

export function isDue(card: Card, now = new Date()): boolean {
  const c = reviveCard(card);
  return c.state !== State.New && new Date(c.due).getTime() <= now.getTime();
}

/** Cards restored from a backup file have ISO date strings; turn them back into Dates. */
export function reviveCard(card: Card): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  } as Card;
}

export { State };

const replayer = new FSRS({ request_retention: 0.9, enable_fuzz: false, maximum_interval: 180 });

/**
 * Rebuild a question's FSRS card from its answer history (used when two devices both answered it).
 * No fuzz, so every device computes exactly the same schedule.
 */
export function replayCard(history: { at: number; score: number; confidence: Confidence; hinted?: boolean }[], createdAt: number): Card {
  let card = createEmptyCard(new Date(createdAt));
  for (const h of [...history].sort((a, b) => a.at - b.at)) {
    card = replayer.next(card, new Date(h.at), gradeFor(h.score, h.confidence, !!h.hinted)).card;
  }
  return card;
}
