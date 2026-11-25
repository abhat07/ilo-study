/** Help chat during a session: cheapest model, grounded in the question's own slide. */
import type { Ilo, Item } from '../types';
import { callJSON } from '../ai/client';
import { TUTOR_SCHEMA, TUTOR_SYSTEM, tutorUser, type TutorOut } from '../ai/prompts';
import { passageFor } from './marking';
import { locatorLabel } from '../ingest/text';

export interface ChatTurn {
  role: 'student' | 'helper';
  text: string;
  beyond?: string;
  error?: boolean;
}

export async function askTutor(args: {
  item: Item;
  ilo?: Ilo;
  answered: boolean;
  studentAnswer: string;
  correctAnswer: string;
  history: ChatTurn[];
  message: string;
}): Promise<TutorOut> {
  const { item } = args;
  return callJSON<TutorOut>({
    purpose: 'tutor chat',
    tier: 'BULK',
    system: TUTOR_SYSTEM,
    user: tutorUser({
      ilo: args.ilo ? `${args.ilo.id}: ${args.ilo.text}` : item.iloIds.join(', '),
      passage: await passageFor(item),
      where: `${item.source.fileName}, ${locatorLabel(item.source.locator)}`,
      question: item.prompt,
      // ordering questions: show the steps alphabetically so the order isn't leaked before answering
      options: item.type === 'mcq' ? item.options : item.type === 'order' ? [...item.steps].sort() : [],
      answered: args.answered,
      studentAnswer: args.studentAnswer,
      correctAnswer: args.correctAnswer,
      history: args.history.filter((h) => !h.error).slice(-6).map((h) => ({ role: h.role, text: h.text })),
      message: args.message.slice(0, 600),
    }),
    schema: TUTOR_SCHEMA,
    maxTokens: 3000,
    expectedOutputTokens: 400,
    effort: 'low',
  });
}
