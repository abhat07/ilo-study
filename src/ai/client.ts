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
  user: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  expectedOutputTokens: number;
  effort?: 'low' | 'medium' | 'high';
}

export async function callJSON<T>(call: JsonCall): Promise<T> {
  const status = await aiStatus();
  if (!status.ready) throw new AiUnavailableError(status.reason!, status.message!);

  const estimate = estimateGBP(call.tier, call.system.length + call.user.length, call.expectedOutputTokens);
  const cap = status.cap!;
  if (status.spent + reserved + estimate > cap) {
    throw new AiUnavailableError(
      'cap-reached',
      `This call (≈£${estimate.toFixed(3)}) would go over your monthly limit of £${cap.toFixed(2)}. Already-generated questions still work.`,
    );
  }
  reserved += estimate;
  try {
    if (settings.mock()) {
      const out = mockRespond(call);
      await recordSpend(MODELS[call.tier], call.purpose, {
        input_tokens: Math.ceil(call.user.length / 3.5),
        output_tokens: 600,
      });
      return out as T;
    }
    return await realCall<T>(call);
  } finally {
    reserved -= estimate;
  }
}

type SdkModule = typeof import('@anthropic-ai/sdk');
let sdk: SdkModule | null = null;
let cachedClient: { key: string; client: AnthropicClient } | null = null;
/** The SDK is loaded on first use so the app shell stays small and fast on phones. */
async function getClient(): Promise<{ client: AnthropicClient; Anthropic: SdkModule['default'] }> {
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

async function realCall<T>(call: JsonCall): Promise<T> {
  const model = MODELS[call.tier];
  const { client, Anthropic } = await getClient();
  let response;
  try {
    // Streamed, then collected: the SDK refuses large non-streaming requests (lessons ask for 24k tokens)
    // because they could outlast its 10-minute HTTP timeout. Same result and cost either way.
    response = await client.beta.messages.stream({
      model,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: [{ role: 'user', content: call.user }],
      output_config: { effort: call.effort ?? 'medium', format: { type: 'json_schema', schema: call.schema } },
      // Opus can hand a refused request to another model server-side instead of failing.
      ...(call.tier === 'PRECISE'
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    }).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError)
      throw new AiUnavailableError('auth', 'The API key was rejected. Check it in Settings.');
    if (err instanceof Anthropic.PermissionDeniedError)
      throw new AiUnavailableError('auth', 'This API key is not allowed to use the model. Check your Anthropic Console.');
    if (err instanceof Anthropic.RateLimitError)
      throw new AiUnavailableError('api', 'The model provider is rate-limiting requests. Try again in a minute.');
    if (err instanceof Anthropic.BadRequestError) throw new AiUnavailableError('api', `Request rejected: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError)
      throw new AiUnavailableError('offline', 'Could not reach the model provider. Using questions already on this device.');
    if (err instanceof Anthropic.APIError) throw new AiUnavailableError('api', `Model provider error (${err.status}).`);
    throw err;
  }

  // Bill at the more expensive of the requested and serving models (a fallback may have run).
  const served = response.model;
  const billModel = costGBP(served, response.usage) > costGBP(model, response.usage) ? served : model;
  await recordSpend(billModel, call.purpose, response.usage);

  if (response.stop_reason === 'refusal') throw new AiUnavailableError('api', 'The model declined this request.');
  if (response.stop_reason === 'max_tokens') throw new AiUnavailableError('api', 'The model response was cut off.');
  const text = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiUnavailableError('api', 'The model returned malformed output.');
  }
}

async function recordSpend(
  model: string,
  purpose: string,
  u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
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
    costGBP: costGBP(model, u),
  });
  notifyChange();
}
