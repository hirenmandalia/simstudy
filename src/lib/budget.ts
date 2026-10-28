import { estimateCost } from "./pricing";
import { UserFacingError } from "./errors";
import { getCode } from "./codes";
import { getProject } from "./store";
import type { Project, UsageTotals } from "./types";

/**
 * AI spend cap per activation code. A code opens one study, so the study's
 * recorded usage is the code's spend. Checked before every action that calls
 * the AI, and between steps of a running study. Users who signed in some other
 * way (local development) have no cap.
 */

export function usageUsd(usage: UsageTotals): number {
  return estimateCost(usage)?.usd ?? 0;
}

/** Spend so far, including runs still in progress (merged into p.usage only when they end). */
export function projectSpendUsd(p: Project): number {
  return usageUsd(p.usage) + p.runs.filter((r) => r.status === "running").reduce((sum, r) => sum + usageUsd(r.usage), 0);
}

/** The cap for this user's study, or null when there is none. */
export async function budgetCapFor(userId: string): Promise<number | null> {
  if (!userId.startsWith("k")) return null;
  return (await getCode(userId))?.capUsd ?? null;
}

export function budgetMessage(capUsd: number): string {
  return `This study has used its $${capUsd.toFixed(2)} AI budget, so it can't do more AI work. Ask the person who gave you your code if you need more.`;
}

/** Why the study can't spend more, or null if it can. */
export async function budgetProblem(userId: string, project: Project | string): Promise<string | null> {
  const cap = await budgetCapFor(userId);
  if (cap === null) return null;
  const p = typeof project === "string" ? await getProject(userId, project) : project;
  return projectSpendUsd(p) >= cap ? budgetMessage(cap) : null;
}

export async function assertBudget(userId: string, project: Project | string) {
  const problem = await budgetProblem(userId, project);
  if (problem) throw new UserFacingError(problem, 402);
}
