import { UserFacingError } from "./errors";
import { estimateCost } from "./pricing";
import { backend } from "./store";
import type { UsageTotals } from "./types";

/**
 * App-wide monthly AI spend cap, across every study and code. Every Claude
 * call goes through src/agent/llm.ts, which checks the cap before the call and
 * records the call's cost after it. The running total is kept in the store and
 * cached here, so one process (one Render instance) stays exact; a cached
 * total older than a minute is re-read in case another process spent too.
 */

export const APP_MONTHLY_CAP_USD = Number(process.env.APP_MONTHLY_CAP_USD ?? 100);
const CACHE_MS = 60_000;

const g = globalThis as unknown as { __spend?: { month: string; usd: number; loadedAt: number } };

export function currentMonth(at = new Date()): string {
  return at.toISOString().slice(0, 7);
}

export async function monthSpendUsd(): Promise<number> {
  const month = currentMonth();
  const cached = g.__spend;
  if (cached && cached.month === month && Date.now() - cached.loadedAt < CACHE_MS) return cached.usd;
  const usd = await backend().getSpend(month);
  g.__spend = { month, usd, loadedAt: Date.now() };
  return usd;
}

export const APP_CAP_MESSAGE =
  "SimStudy has reached its AI spending limit for this month, so it can't do more AI work right now. Your study is saved; tell the person who gave you your code.";

/** Throws once this month's spend has reached the cap. */
export async function assertAppBudget() {
  if ((await monthSpendUsd()) >= APP_MONTHLY_CAP_USD) throw new UserFacingError(APP_CAP_MESSAGE, 402);
}

/** Add one call's cost to this month's total. Never throws: a failed write must not fail the call. */
export async function recordSpend(usage: UsageTotals) {
  const usd = estimateCost(usage)?.usd ?? 0;
  if (usd <= 0) return;
  const month = currentMonth();
  if (g.__spend?.month === month) g.__spend.usd += usd;
  try {
    await backend().addSpend(month, usd);
  } catch (e) {
    console.error("couldn't record AI spend", e);
  }
}
