import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import type { UsageTotals } from "@/lib/types";

/**
 * Single entry point for every Claude call in the app.
 *
 * - Models are configurable per role via env (all default to Claude Opus 5.5).
 * - Server-side refusal fallbacks (`fallbacks: "default"`) are on for
 *   generation calls; classifier-style calls (guard, screen check) opt out so a
 *   refusal is treated as a "block" signal instead of being rerouted.
 * - Usage is metered into a caller-provided totals object.
 */

export const MODELS = {
  master: process.env.MASTER_MODEL ?? "claude-opus-5-5",
  persona: process.env.PERSONA_MODEL ?? "claude-opus-5-5",
  utility: process.env.UTILITY_MODEL ?? "claude-opus-5-5",
} as const;

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const g = globalThis as unknown as { __anthropic?: Anthropic };
export function client(): Anthropic {
  // Organization-level API keys (not scoped to a workspace) must name the workspace on every request.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return (g.__anthropic ??= new Anthropic({
    maxRetries: 3,
    ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
  }));
}

export class RefusalError extends Error {
  constructor(public category: string | null) {
    super(`The model declined this request${category ? ` (${category})` : ""}.`);
  }
}

export class TruncatedError extends Error {
  constructor() {
    super("The model's response hit the output limit before finishing.");
  }
}

type BaseParams = Omit<MessageCreateParamsNonStreaming, "betas" | "fallbacks" | "stream">;

export interface CallOptions {
  usage?: UsageTotals;
  /** Reroute policy refusals to Anthropic's recommended fallback model (default true). */
  fallbacks?: boolean;
  /** Additional beta headers for this request. */
  betas?: string[];
}

function addUsage(totals: UsageTotals | undefined, msg: BetaMessage) {
  if (!totals) return;
  totals.calls += 1;
  totals.inputTokens += msg.usage.input_tokens ?? 0;
  totals.outputTokens += msg.usage.output_tokens ?? 0;
  totals.cacheReadTokens += msg.usage.cache_read_input_tokens ?? 0;
  totals.cacheWriteTokens += msg.usage.cache_creation_input_tokens ?? 0;
}

function withBetas<T extends BaseParams>(params: T, opts: CallOptions) {
  const fallbacks = opts.fallbacks ?? true;
  const betas = [...(fallbacks ? [FALLBACK_BETA] : []), ...(opts.betas ?? [])];
  return {
    ...params,
    ...(betas.length ? { betas } : {}),
    ...(fallbacks ? { fallbacks: "default" as const } : {}),
  };
}

/** Plain (non-streaming) call. Used for the master agent's tool loop. */
export async function createMessage(params: BaseParams, opts: CallOptions = {}): Promise<BetaMessage> {
  const msg = await client().beta.messages.create(withBetas(params, opts));
  addUsage(opts.usage, msg);
  return msg;
}

/** Text completion via streaming (safe for long outputs). Throws on refusal/truncation. */
export async function completeText(params: BaseParams, opts: CallOptions = {}): Promise<{ text: string; message: BetaMessage }> {
  const msg = await client().beta.messages.stream(withBetas(params, opts)).finalMessage();
  addUsage(opts.usage, msg);
  if (msg.stop_reason === "refusal") throw new RefusalError(msg.stop_details?.category ?? null);
  if (msg.stop_reason === "max_tokens") throw new TruncatedError();
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { text, message: msg };
}

/**
 * Structured output: the response is constrained to the zod schema and
 * re-validated client-side (the SDK enforces limits the API schema compiler
 * can't, such as numeric bounds).
 */
export async function completeStructured<S extends z.ZodType>(
  params: BaseParams,
  schema: S,
  opts: CallOptions = {},
): Promise<{ data: z.infer<S>; message: BetaMessage }> {
  const stream = client().beta.messages.stream(
    withBetas(
      {
        ...params,
        output_config: { ...(params.output_config ?? {}), format: betaZodOutputFormat(schema) },
      },
      opts,
    ),
  );
  const msg = await stream.finalMessage();
  addUsage(opts.usage, msg);
  if (msg.stop_reason === "refusal") throw new RefusalError(msg.stop_details?.category ?? null);
  if (msg.stop_reason === "max_tokens") throw new TruncatedError();
  const parsed = (msg as { parsed_output?: unknown }).parsed_output;
  if (parsed != null) return { data: parsed as z.infer<S>, message: msg };
  const text = msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return { data: schema.parse(JSON.parse(text)), message: msg };
}

/** Read an image from disk-backed bytes as an image content block. */
export function imageBlock(data: Buffer, mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif") {
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: mediaType, data: data.toString("base64") },
  };
}
