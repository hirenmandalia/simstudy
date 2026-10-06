import crypto from "crypto";
import { runGate, checkDesign } from "@/lib/gates";
import { approvedVersion, currentVersion, latestRun, type Project } from "@/lib/types";

/**
 * Compact, deterministic snapshot of the project for the master agent. It is
 * appended to each PM turn (only when it changed) so the agent always knows
 * approval status and versions without re-asking.
 */
export function renderProjectState(p: Project): string {
  const b = p.brief;
  const lines: string[] = [];
  lines.push(`Project: ${p.name}`);
  lines.push("## Brief (recorded so far)");
  lines.push(`- Product: ${b.productName ?? "(missing)"}`);
  lines.push(`- Product context: ${b.productContext ?? "(missing)"}`);
  lines.push(`- Feature: ${b.featureDescription ?? "(missing)"}`);
  lines.push(`- Feature stage: ${b.featureStage ?? "(missing)"}`);
  lines.push(`- Decision to support: ${b.decisionToSupport ?? "(missing)"}`);
  lines.push(
    `- Research questions (PM-stated): ${b.researchQuestions.length ? "\n" + b.researchQuestions.map((q, i) => `  ${i + 1}. ${q}`).join("\n") : "(none yet)"}`,
  );
  lines.push(`- Target users: ${b.targetUsers ?? "(missing)"}`);
  if (b.additionalContext) lines.push(`- Additional context: ${b.additionalContext}`);

  lines.push("## Screens (uploaded by the PM; descriptions are AI-generated, PM-editable)");
  if (!p.screens.length) lines.push("(none uploaded)");
  for (const s of [...p.screens].sort((a, c) => a.order - c.order)) {
    const flag = s.piiConcerns.length ? (s.piiAcknowledged ? " [PII concern acknowledged by PM]" : " [possible PII — PM must review]") : "";
    lines.push(`- ${s.code} "${s.label}": ${s.description || "(no description)"}${flag}`);
  }
  lines.push(`Navigation flow notes: ${p.flowNotes.trim() || "(none)"}`);

  const d = currentVersion(p.design);
  const dApproved = approvedVersion(p.design);
  lines.push("## Study design");
  if (!d) lines.push("(not proposed yet)");
  else {
    lines.push(`- Latest: v${d.version} by ${d.createdBy}; status: ${p.design.status}${dApproved ? ` (approved v${dApproved.version})` : ""}`);
    if (p.design.reviewNote) lines.push(`- PM review note: ${p.design.reviewNote}`);
    lines.push(`- Method: ${d.data.method}; participants: ${d.data.participantCount}`);
    lines.push(`- Research questions: ${d.data.researchQuestions.map((q) => `${q.id} [${q.origin}] ${q.text}`).join(" | ")}`);
    if (d.data.tasks.length) lines.push(`- Tasks: ${d.data.tasks.map((t) => `${t.id} ${t.title}`).join(" | ")}`);
    lines.push(`- Questions: ${d.data.interviewQuestions.map((q) => `${q.id} ${q.question}`).join(" | ")}`);
    const chk = checkDesign(d.data, p);
    if (chk.blocking.length) lines.push(`- Blocking issues: ${chk.blocking.join(" ")}`);
  }

  const pv = currentVersion(p.personas);
  lines.push("## Personas");
  if (!pv) lines.push("(not proposed yet)");
  else {
    lines.push(
      `- Latest: v${pv.version} by ${pv.createdBy}; status: ${p.personas.status}${p.personas.approvedForDesignVersion ? ` (approved for design v${p.personas.approvedForDesignVersion})` : ""}`,
    );
    if (p.personas.reviewNote) lines.push(`- PM review note: ${p.personas.reviewNote}`);
    lines.push(`- ${pv.data.personas.map((x) => `${x.id} ${x.name} — ${x.label}`).join(" | ")}`);
  }

  const run = latestRun(p);
  lines.push("## Study run");
  if (!run) lines.push("(not run yet)");
  else lines.push(`- Latest run ${run.id}: ${run.status} (design v${run.designVersion}, personas v${run.personaVersion})${run.error ? `; error: ${run.error}` : ""}`);
  const gate = runGate(p);
  lines.push(gate.length ? `- Run gate: BLOCKED — ${gate.join(" ")}` : "- Run gate: open (study may start when the PM explicitly asks)");

  const r = currentVersion(p.report);
  lines.push("## Report");
  if (!r) lines.push("(none yet)");
  else lines.push(`- Latest: v${r.version} by ${r.createdBy}; status: ${p.report.status}${p.report.reviewNote ? `; PM note: ${p.report.reviewNote}` : ""}`);

  return lines.join("\n");
}

export function stateHash(state: string): string {
  return crypto.createHash("sha256").update(state).digest("hex").slice(0, 16);
}
