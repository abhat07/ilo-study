/**
 * Model routing and price table (USD per million tokens, Anthropic first-party rates).
 *
 * BULK    = cheap, fast work: ILO parsing, mapping passages to ILOs, generating question items.
 * PRECISE = judgement-heavy work: marking free-text answers, deeper explanations.
 *
 * To change models, edit these two constants. Prices for unknown models fall back to the
 * most expensive row so the spending cap errs on the safe side.
 */
export const MODELS = {
  BULK: 'claude-haiku-5-5',
  PRECISE: 'claude-opus-5-5',
} as const;

export type Tier = keyof typeof MODELS;

interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES: Record<string, Price> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  // possible server-side fallback targets
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};
const MOST_EXPENSIVE: Price = { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 };

/**
 * Conservative fixed conversion. Spend shown in the app is an estimate; your Anthropic
 * Console billing is the real figure. Rounded up on purpose so the cap triggers early rather than late.
 */
export const USD_TO_GBP = 0.8;

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costGBP(model: string, u: UsageLike): number {
  const p = PRICES[model] ?? MOST_EXPENSIVE;
  const usd =
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000;
  return usd * USD_TO_GBP;
}

/** Rough pre-call estimate: ~4 characters per token for input, typical output for the purpose. */
export function estimateGBP(tier: Tier, inputChars: number, expectedOutputTokens: number): number {
  return costGBP(MODELS[tier], { input_tokens: Math.ceil(inputChars / 3.5), output_tokens: expectedOutputTokens });
}
