import { newId, now } from "./store";
import { canApprovePersonas, checkDesign, checkPersonas, isRunActive } from "./gates";
import { UserFacingError } from "./errors";
import type { PersonaSetInput, StudyDesignInput } from "./schemas";
import { currentVersion, type ChatMessage, type Project, type Report } from "./types";

/**
 * State transitions for the three reviewable artifacts (design, personas,
 * report). Used by both the approval screens and the agent's tools so the
 * rules are identical regardless of who triggers them.
 */

export function notice(project: Project, text: string, actions: ChatMessage["actions"] = []) {
  project.chat.push({ id: newId("m"), role: "notice", text, at: now(), guardrail: null, actions });
}

export function audit(project: Project, actor: "pm" | "agent" | "system", type: string, detail: string) {
  project.audit.push({ at: now(), actor, type, detail });
}

/** Tell the agent about a UI action at its next turn. */
export function agentEvent(project: Project, text: string) {
  project.pendingAgentEvents.push(text);
}

export function assertNotRunning(project: Project) {
  if (isRunActive(project)) throw new UserFacingError("A simulated study is running. Wait for it to finish before changing the plan.", 409);
}

// --- study design ---------------------------------------------------------------

export function addDesignVersion(project: Project, data: StudyDesignInput, by: "agent" | "pm", note: string | null) {
  assertNotRunning(project);
  const prev = currentVersion(project.design);
  const wasApproved = project.design.status === "approved";
  const version = (prev?.version ?? 0) + 1;
  project.design.versions.push({ version, createdAt: now(), createdBy: by, note, data });
  project.design.status = "pending_review";
  project.design.approvedVersion = null;
  project.design.approvedAt = null;
  project.design.reviewNote = null;
  audit(project, by, "design_version_created", `v${version}${wasApproved ? " (previous approval withdrawn)" : ""}`);

  // Persona approval was given against the old design; it must be re-confirmed.
  if (project.personas.status === "approved") {
    project.personas.status = "pending_review";
    project.personas.approvedAt = null;
    project.personas.reviewNote = "The study design changed. Re-confirm the personas against the new design.";
    audit(project, "system", "personas_approval_reset", `design v${version} created`);
  }
  return version;
}

export function approveDesign(project: Project) {
  assertNotRunning(project);
  const cur = currentVersion(project.design);
  if (!cur) throw new UserFacingError("There is no study design to approve yet.");
  const { blocking } = checkDesign(cur.data, project);
  if (blocking.length) throw new UserFacingError("The design can't be approved yet.", 400, blocking);
  project.design.status = "approved";
  project.design.approvedVersion = cur.version;
  project.design.approvedAt = now();
  project.design.reviewNote = null;
  // Approving the design confirms its research questions as the PM's.
  project.brief.researchQuestions = cur.data.researchQuestions.map((q) => q.text);
  audit(project, "pm", "design_approved", `v${cur.version}`);
  notice(project, `You approved study design v${cur.version}.`, [{ label: "Review personas", href: `/projects/${project.id}/personas` }]);
  agentEvent(project, `PM approved study design v${cur.version} (its research questions are now confirmed).`);
}

/** Screens are part of what the PM approved; changing them requires re-approval. */
export function withdrawDesignApproval(project: Project, why: string) {
  if (project.design.status !== "approved") return;
  project.design.status = "pending_review";
  project.design.approvedVersion = null;
  project.design.approvedAt = null;
  project.design.reviewNote = `${why} Please re-approve the study design.`;
  audit(project, "system", "design_approval_withdrawn", why);
  notice(project, `${why} The study design approval was withdrawn; re-approve it before running.`, [
    { label: "Review study design", href: `/projects/${project.id}/design` },
  ]);
  agentEvent(project, `Design approval withdrawn automatically: ${why}`);
}

export function rejectDesign(project: Project, reason: string) {
  assertNotRunning(project);
  const cur = currentVersion(project.design);
  if (!cur) throw new UserFacingError("There is no study design to reject.");
  project.design.status = "rejected";
  project.design.approvedVersion = null;
  project.design.approvedAt = null;
  project.design.reviewNote = reason || null;
  audit(project, "pm", "design_rejected", `v${cur.version}: ${reason}`);
  notice(project, `You rejected study design v${cur.version}.${reason ? ` Reason: ${reason}` : ""}`);
  agentEvent(project, `PM rejected study design v${cur.version}. Reason: ${reason || "(none given)"}`);
}

// --- personas ---------------------------------------------------------------------

export function addPersonaVersion(project: Project, data: PersonaSetInput, by: "agent" | "pm", note: string | null) {
  assertNotRunning(project);
  const prev = currentVersion(project.personas);
  const version = (prev?.version ?? 0) + 1;
  const wasApproved = project.personas.status === "approved";
  project.personas.versions.push({ version, createdAt: now(), createdBy: by, note, data });
  project.personas.status = "pending_review";
  project.personas.approvedVersion = null;
  project.personas.approvedAt = null;
  project.personas.approvedForDesignVersion = null;
  project.personas.reviewNote = null;
  audit(project, by, "personas_version_created", `v${version}${wasApproved ? " (previous approval withdrawn)" : ""}`);
  return version;
}

export function approvePersonas(project: Project) {
  const reasons = canApprovePersonas(project);
  if (reasons.length) throw new UserFacingError("The personas can't be approved yet.", 400, reasons);
  const cur = currentVersion(project.personas)!;
  project.personas.status = "approved";
  project.personas.approvedVersion = cur.version;
  project.personas.approvedAt = now();
  project.personas.approvedForDesignVersion = project.design.approvedVersion;
  project.personas.reviewNote = null;
  audit(project, "pm", "personas_approved", `v${cur.version} for design v${project.design.approvedVersion}`);
  notice(project, `You approved personas v${cur.version}. The study is ready to run when you are.`, [
    { label: "Go to run", href: `/projects/${project.id}/run` },
  ]);
  agentEvent(project, `PM approved personas v${cur.version} for design v${project.design.approvedVersion}.`);
}

export function rejectPersonas(project: Project, reason: string) {
  assertNotRunning(project);
  const cur = currentVersion(project.personas);
  if (!cur) throw new UserFacingError("There are no personas to reject.");
  project.personas.status = "rejected";
  project.personas.approvedVersion = null;
  project.personas.approvedAt = null;
  project.personas.approvedForDesignVersion = null;
  project.personas.reviewNote = reason || null;
  audit(project, "pm", "personas_rejected", `v${cur.version}: ${reason}`);
  notice(project, `You rejected personas v${cur.version}.${reason ? ` Reason: ${reason}` : ""}`);
  agentEvent(project, `PM rejected personas v${cur.version}. Reason: ${reason || "(none given)"}`);
}

export function validatePersonasForSave(project: Project, data: PersonaSetInput) {
  return checkPersonas(data, project);
}

// --- report -------------------------------------------------------------------------

export function addReportVersion(project: Project, data: Report, by: "agent" | "pm", note: string | null) {
  const prev = currentVersion(project.report);
  const version = (prev?.version ?? 0) + 1;
  project.report.versions.push({ version, createdAt: now(), createdBy: by, note, data });
  project.report.status = "pending_review";
  project.report.approvedVersion = null;
  project.report.approvedAt = null;
  project.report.reviewNote = null;
  audit(project, by, "report_version_created", `v${version}`);
  return version;
}

export function approveReport(project: Project) {
  const cur = currentVersion(project.report);
  if (!cur) throw new UserFacingError("There is no report to approve yet.");
  project.report.status = "approved";
  project.report.approvedVersion = cur.version;
  project.report.approvedAt = now();
  project.report.reviewNote = null;
  audit(project, "pm", "report_approved", `v${cur.version}`);
  notice(project, `You approved report v${cur.version}. You can now download it or create a share link.`);
  agentEvent(project, `PM approved report v${cur.version}.`);
}

export function rejectReport(project: Project, reason: string) {
  const cur = currentVersion(project.report);
  if (!cur) throw new UserFacingError("There is no report to reject.");
  project.report.status = "rejected";
  project.report.approvedVersion = null;
  project.report.approvedAt = null;
  project.report.reviewNote = reason || null;
  audit(project, "pm", "report_rejected", `v${cur.version}: ${reason}`);
  notice(project, `You rejected report v${cur.version}.${reason ? ` Reason: ${reason}` : ""}`);
  agentEvent(project, `PM rejected report v${cur.version}. Reason: ${reason || "(none given)"}`);
}
