import type AnthropicClient from '@anthropic-ai/sdk';
import { db, notifyChange, uid } from '../db';
import { settings } from '../settings';
import { MODELS, costGBP, estimateGBP, type Tier } from './pricing';
import { mockRespond } from './mock';

export class AiUnavailableError extends Error {
  constructor(
    public reason: 'no-key' | 'no-cap' | 'cap-reached' | 'notice' | 'offline' | 'auth' | 'api',
    message: string,
  ) {
    super(message);
  }
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function spentThisMonth(): Promise<number> {
  const rows = await (await db()).getAllFromIndex('spend', 'byMonth', monthKey());
  return rows.reduce((s, r) => s + r.costGBP, 0);
}

/** Money set aside for calls that are in flight, so parallel calls cannot overshoot the cap. */
let reserved = 0;

export interface AiStatus {
  ready: boolean;
  reason?: AiUnavailableError['reason'];
  message?: string;
  spent: number;
  cap: number | null;
}

export async function aiStatus(): Promise<AiStatus> {
  const spent = await spentThisMonth();
  const mock = settings.mock();
  const cap = settings.getCap() ?? (mock ? 5 : null);
  if (!mock && !settings.getApiKey()) return { ready: false, reason: 'no-key', message: 'Add your API key in Settings.', spent, cap };
  if (cap === null) return { ready: false, reason: 'no-cap', message: 'Set a monthly spending limit in Settings.', spent, cap };
  if (!mock && !settings.noticeAccepted())
    return { ready: false, reason: 'notice', message: 'Accept the data notice before material is sent to the model.', spent, cap };
  if (spent >= cap)
    return {
      ready: false,
      reason: 'cap-reached',
      message: `Monthly limit reached (£${spent.toFixed(2)} of £${cap.toFixed(2)}). New questions and AI marking are paused until next month; already-generated questions still work.`,
      spent,
      cap,
    };
  if (typeof navigator !== 'undefined' && !navigator.onLine)
    return { ready: false, reason: 'offline', message: 'Offline: using questions already on this device.', spent, cap };
  return { ready: true, spent, cap };
}

export interface JsonCall {
  purpose: string; // shown in the spend log
  tier: Tier;
  system: string;
  /**
   * Material that stays the same across several calls (e.g. a whole lecture, shared by each of its
   * lesson sections). Sent first and marked for prompt caching, so repeat calls read it at a tenth of the price.
   */
  prefix?: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  expectedOutputTokens: number;
  effort?: 'low' | 'medium' | 'high';
}

const inputChars = (call: JsonCall) => call.system.length + (call.prefix?.length ?? 0) + call.user.length;

/**
 * Check the spending cap and set the estimate aside while the work runs. `discount` is 0.5 for batch
 * requests. Throws if the call would go over the cap.
 */
export async function reserveSpend(estimate: number): Promise<() => void> {
  const status = await aiStatus();
  if (!status.ready) throw new AiUnavailableError(status.reason!, status.message!);
  const cap = status.cap!;
  if (status.spent + reserved + (await batchHeld()) + estimate > cap) {
    throw new AiUnavailableError(
      'cap-reached',
      `This (≈£${estimate.toFixed(3)}) would go over your monthly limit of £${cap.toFixed(2)}. Already-generated questions still work.`,
    );
  }
  reserved += estimate;
  return () => { reserved -= estimate; };
}

/** Estimated cost of Message Batches still running (they are billed when they finish). */
async function batchHeld(): Promise<number> {
  const d = await db();
  const keys = (await d.getAllKeys('kv')).map(String).filter((k) => k.startsWith('batch:'));
  let n = 0;
  for (const k of keys) {
    const b = (await d.get('kv', k)) as { status?: string; estimate?: number } | undefined;
    if (b?.status === 'running') n += b.estimate ?? 0;
  }
  return n;
}

export function estimateCall(call: JsonCall, discount = 1): number {
  return estimateGBP(call.tier, inputChars(call), call.expectedOutputTokens) * discount;
}

export async function callJSON<T>(call: JsonCall): Promise<T> {
  const release = await reserveSpend(estimateCall(call));
  try {
    if (settings.mock()) {
      const out = mockRespond({ ...call, user: (call.prefix ? call.prefix + '\n\n' : '') + call.user });
      await recordSpend(MODELS[call.tier], call.purpose, {
        input_tokens: Math.ceil(inputChars(call) / 3.5),
        output_tokens: 600,
      });
      return out as T;
    }
    return await realCall<T>(call);
  } finally {
    release();
  }
}

type SdkModule = typeof import('@anthropic-ai/sdk');
let sdk: SdkModule | null = null;
let cachedClient: { key: string; client: AnthropicClient } | null = null;
/** The SDK is loaded on first use so the app shell stays small and fast on phones. */
export async function getClient(): Promise<{ client: AnthropicClient; Anthropic: SdkModule['default'] }> {
  sdk ??= await import('@anthropic-ai/sdk');
  const Anthropic = sdk.default;
  const key = settings.getApiKey();
  if (!cachedClient || cachedClient.key !== key) {
    // The key belongs to the student and stays on their device; this flag allows the
    // SDK to run in the browser, which is the whole point of a no-server, local-only app.
    cachedClient = { key, client: new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 }) };
  }
  return { client: cachedClient.client, Anthropic };
}

/**
 * The request body for a call. The system prompt and any shared prefix carry cache breakpoints:
 * the first call writes them to the prompt cache and later calls within a few minutes read them back
 * at a tenth of the input price. (Prompts shorter than the model's minimum simply aren't cached.)
 */
export function requestParams(call: JsonCall, opts: { batch?: boolean } = {}) {
  const cache = { type: 'ephemeral' as const };
  return {
    model: MODELS[call.tier],
    max_tokens: call.maxTokens,
    system: [{ type: 'text' as const, text: call.system, cache_control: cache }],
    messages: [{
      role: 'user' as const,
      content: call.prefix
        ? [{ type: 'text' as const, text: call.prefix, cache_control: cache }, { type: 'text' as const, text: call.user }]
        : call.user,
    }],
    output_config: { effort: call.effort ?? ('medium' as const), format: { type: 'json_schema' as const, schema: call.schema } },
    // Opus can hand a refused request to another model server-side instead of failing (not offered for batches).
    ...(call.tier === 'PRECISE' && !opts.batch
      ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
      : {}),
  };
}

type Reply = Awaited<ReturnType<AnthropicClient['beta']['messages']['create']>> & { content: unknown[] };

/** Record what a reply cost (batch replies at half price) and parse its JSON. */
export async function readReply<T>(call: JsonCall, response: Pick<Extract<Reply, { usage: unknown }>, 'model' | 'usage' | 'stop_reason' | 'content'>, discount = 1): Promise<T> {
  const model = MODELS[call.tier];
  // Bill at the more expensive of the requested and serving models (a fallback may have run).
  const served = response.model;
  const billModel = costGBP(served, response.usage) > costGBP(model, response.usage) ? served : model;
  await recordSpend(billModel, call.purpose, response.usage, discount);

  if (response.stop_reason === 'refusal') throw new AiUnavailableError('api', 'The model declined this request.');
  if (response.stop_reason === 'max_tokens') throw new AiUnavailableError('api', 'The model response was cut off.');
  const text = (response.content as { type: string; text?: string }[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiUnavailableError('api', 'The model returned malformed output.');
  }
}

async function realCall<T>(call: JsonCall): Promise<T> {
  const { client, Anthropic } = await getClient();
  let response;
  try {
    // Streamed, then collected: the SDK refuses large non-streaming requests (lessons ask for 24k tokens)
    // because they could outlast its 10-minute HTTP timeout. Same result and cost either way.
    response = await client.beta.messages.stream(requestParams(call)).finalMessage();
  } catch (err) {
    throw apiError(Anthropic, err);
  }
  return readReply<T>(call, response);
}

/** Turn an SDK error into a message the student can act on. */
export function apiError(Anthropic: SdkModule['default'], err: unknown): unknown {
  if (err instanceof Anthropic.AuthenticationError) return new AiUnavailableError('auth', 'The API key was rejected. Check it in Settings.');
  if (err instanceof Anthropic.PermissionDeniedError)
    return new AiUnavailableError('auth', 'This API key is not allowed to use the model. Check your Anthropic Console.');
  if (err instanceof Anthropic.RateLimitError)
    return new AiUnavailableError('api', 'The model provider is rate-limiting requests. Try again in a minute.');
  if (err instanceof Anthropic.BadRequestError) return new AiUnavailableError('api', `Request rejected: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError)
    return new AiUnavailableError('offline', 'Could not reach the model provider. Using questions already on this device.');
  if (err instanceof Anthropic.APIError) return new AiUnavailableError('api', `Model provider error (${err.status}).`);
  return err;
}

/** Log a call's cost. `discount` is 0.5 for Message Batches, which are billed at half price. */
async function recordSpend(
  model: string,
  purpose: string,
  u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
  discount = 1,
): Promise<void> {
  const d = await db();
  await d.put('spend', {
    id: uid('sp_'),
    at: Date.now(),
    month: monthKey(),
    model,
    purpose,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    costGBP: costGBP(model, u) * discount,
  });
  notifyChange();
}
