import { MAX_PARTICIPANTS, type PersonaSetInput, type StudyDesignInput } from "./schemas";
import { approvedVersion, currentVersion, latestRun, type Project } from "./types";

/**
 * Deterministic approval gates. The agent's prompt explains these rules, but
 * enforcement lives here so no model output can bypass them.
 */

/** The subset of a project the gates need (works for server and client copies). */
export type GateProject = Pick<Project, "design" | "personas" | "screens" | "runs">;

export interface Check {
  blocking: string[];
  warnings: string[];
}

export function checkDesign(design: StudyDesignInput, project: Pick<Project, "screens">): Check {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (design.participantCount < 1) blocking.push("The study needs at least 1 simulated participant.");
  if (design.participantCount > MAX_PARTICIPANTS)
    blocking.push(`Simulated studies are capped at ${MAX_PARTICIPANTS} participants (design has ${design.participantCount}).`);
  if (!design.researchQuestions.length) blocking.push("Add at least one research question.");
  const suggested = design.researchQuestions.filter((q) => q.origin === "agent_suggested");
  if (suggested.length)
    warnings.push(
      `${suggested.length} research question(s) were suggested by the agent. Approving the design confirms them as your research questions.`,
    );

  if (design.method === "usability_test") {
    if (!design.tasks.length) blocking.push("A usability test needs at least one task.");
    if (!project.screens.length) blocking.push("A usability test needs uploaded screens. Add screenshots on the Brief & screens tab.");
    const codes = new Set(project.screens.map((s) => s.code));
    for (const t of design.tasks) {
      if (t.startScreen && !codes.has(t.startScreen))
        warnings.push(`${t.id} starts on ${t.startScreen}, which isn't an uploaded screen.`);
    }
    if (design.tasks.length > 6) warnings.push("More than 6 tasks is a lot for one session; consider trimming.");
  } else {
    if (!design.interviewQuestions.length) blocking.push("A focus group needs a discussion guide (at least one question).");
    if (!project.screens.length)
      warnings.push("No screens uploaded: participants will react to the written concept only, which gives weaker evidence.");
    if (design.interviewQuestions.length > 8) warnings.push("More than 8 discussion questions is a lot for one session.");
  }

  const covered = new Set([
    ...design.tasks.flatMap((t) => t.relatedQuestionIds),
    ...design.interviewQuestions.flatMap((q) => q.relatedQuestionIds),
  ]);
  for (const rq of design.researchQuestions) {
    if (!covered.has(rq.id)) warnings.push(`${rq.id} isn't covered by any task or question.`);
  }
  if (design.missingInputs.length) warnings.push(`Missing inputs noted: ${design.missingInputs.join("; ")}`);

  return { blocking, warnings };
}

export function checkPersonas(set: PersonaSetInput, project: GateProject): Check {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const design = approvedVersion(project.design) ?? currentVersion(project.design);

  if (set.personas.length > MAX_PARTICIPANTS)
    blocking.push(`Simulated studies are capped at ${MAX_PARTICIPANTS} participants (${set.personas.length} personas proposed).`);
  if (!set.personas.length) blocking.push("Add at least one persona.");
  if (design && set.personas.length !== design.data.participantCount)
    blocking.push(
      `The study design plans ${design.data.participantCount} participant(s) but there are ${set.personas.length} persona(s). Each persona is one simulated participant, so the numbers must match.`,
    );
  const ids = set.personas.map((p) => p.id);
  if (new Set(ids).size !== ids.length) blocking.push("Persona ids must be unique.");
  const names = set.personas.map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) warnings.push("Two personas share a name; give each a distinct name.");
  for (const p of set.personas) {
    if (!p.relevance.trim()) warnings.push(`${p.name} has no stated relevance to the target users.`);
  }
  return { blocking, warnings };
}

export function canApprovePersonas(project: GateProject): string[] {
  const reasons: string[] = [];
  if (project.design.status !== "approved") reasons.push("Approve the study design first.");
  const cur = currentVersion(project.personas);
  if (!cur) reasons.push("There are no personas to approve yet.");
  else reasons.push(...checkPersonas(cur.data, project).blocking);
  if (isRunActive(project)) reasons.push("A study run is in progress.");
  return reasons;
}

export function isRunActive(project: Pick<Project, "runs">): boolean {
  return latestRun(project)?.status === "running";
}

/** Everything that must be true before a simulated study may start. */
export function runGate(project: GateProject): string[] {
  const reasons: string[] = [];
  const design = approvedVersion(project.design);
  const personas = approvedVersion(project.personas);
  if (!design) reasons.push("The study design is not approved.");
  if (!personas) reasons.push("The personas are not approved.");
  if (design && personas) {
    if (project.personas.approvedForDesignVersion !== design.version)
      reasons.push("The personas were approved against an earlier design version. Re-approve them for the current design.");
    if (personas.data.personas.length !== design.data.participantCount)
      reasons.push("Approved persona count doesn't match the approved participant count.");
    reasons.push(...checkDesign(design.data, project).blocking);
  }
  if (personas && personas.data.personas.length > MAX_PARTICIPANTS)
    reasons.push(`More than ${MAX_PARTICIPANTS} participants.`);
  const unacknowledged = project.screens.filter((s) => s.piiConcerns.length && !s.piiAcknowledged);
  if (unacknowledged.length)
    reasons.push(
      `Screen(s) ${unacknowledged.map((s) => s.code).join(", ")} were flagged for possible personal data. Review and confirm they're redacted on the Brief & screens tab.`,
    );
  if (isRunActive(project)) reasons.push("A study run is already in progress.");
  return reasons;
}
