import type { ModelUsage, UsageTotals } from "./types";

/**
 * List prices in USD per million tokens (Claude API, Oct 2026). Cache writes use the
 * 5-minute TTL rate (1.25x input). Update this table if prices or models change.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

function priceFor(model: string) {
  // Responses may report a dated id (e.g. claude-haiku-4-5-20251001); match on prefix.
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`));
  return key ? PRICES[key] : null;
}

function cost(u: ModelUsage, p: (typeof PRICES)[string]) {
  return (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite) / 1_000_000;
}

export interface CostEstimate {
  usd: number;
  /** false when some usage couldn't be priced by model (older records, unknown model). */
  exact: boolean;
  models: string[];
}

/**
 * Estimated cost at list prices, priced per model actually used. Older records without a
 * per-model breakdown are priced as Opus 5.5 (an upper bound) and flagged as not exact.
 */
export function estimateCost(usage: UsageTotals): CostEstimate | null {
  if (!usage.calls) return null;
  const byModel = usage.byModel ?? {};
  let usd = 0;
  let exact = true;
  const tracked: ModelUsage = { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const [model, u] of Object.entries(byModel)) {
    const p = priceFor(model);
    if (p) usd += cost(u, p);
    else {
      usd += cost(u, PRICES["claude-opus-5-5"]);
      exact = false;
    }
    tracked.calls += u.calls;
    tracked.inputTokens += u.inputTokens;
    tracked.outputTokens += u.outputTokens;
    tracked.cacheReadTokens += u.cacheReadTokens;
    tracked.cacheWriteTokens += u.cacheWriteTokens;
  }
  const untracked: ModelUsage = {
    calls: usage.calls - tracked.calls,
    inputTokens: usage.inputTokens - tracked.inputTokens,
    outputTokens: usage.outputTokens - tracked.outputTokens,
    cacheReadTokens: usage.cacheReadTokens - tracked.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens - tracked.cacheWriteTokens,
  };
  if (untracked.calls > 0) {
    usd += cost(untracked, PRICES["claude-opus-5-5"]);
    exact = false;
  }
  return { usd, exact, models: Object.keys(byModel) };
}
