import { activeRuns } from "./run";
import { activeReports } from "./synthesis";
import { isTurnActive } from "./master";
import { audit } from "@/lib/review";
import { now } from "@/lib/store";
import type { Project } from "@/lib/types";

/**
 * Background work lives in this Node process. If the server restarted while a
 * run or report was in flight, mark it interrupted so the PM can retry.
 * Returns true when the project was modified.
 */
export function reconcileJobs(p: Project): boolean {
  let changed = false;
  for (const r of p.runs) {
    if (r.status === "running" && !activeRuns.has(r.id)) {
      r.status = "interrupted";
      r.error = "The server restarted while the study was running. Start the run again.";
      r.finishedAt = now();
      audit(p, "system", "run_interrupted", r.id);
      changed = true;
    }
  }
  if (p.report.job.status === "generating" && !activeReports.has(p.id)) {
    p.report.job = { status: "failed", error: "Report generation was interrupted. Try again.", startedAt: null };
    changed = true;
  }
  return changed;
}

export function needsReconcile(p: Project): boolean {
  return (
    p.runs.some((r) => r.status === "running" && !activeRuns.has(r.id)) ||
    (p.report.job.status === "generating" && !activeReports.has(p.id))
  );
}

export function agentBusy(projectId: string): boolean {
  return isTurnActive(projectId);
}
