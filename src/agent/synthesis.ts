import { completeStructured, MODELS } from "./llm";
import { loadKnowledgeBase } from "./knowledge";
import { synthesisSystemPrompt, renderPersonaCard } from "./prompts";
import { getProject, now, updateProject } from "@/lib/store";
import { addReportVersion, audit, notice } from "@/lib/review";
import { ReportDraft, type Quote } from "@/lib/schemas";
import {
  currentVersion,
  emptyUsage,
  mergeUsage,
  type Report,
  type Run,
  type TaskMetric,
  type TranscriptLine,
  type VerifiedQuote,
} from "@/lib/types";

const g = globalThis as unknown as { __activeReports?: Set<string> };
export const activeReports = (g.__activeReports ??= new Set());

/** Kick off report generation in the background from the latest completed run. */
export async function startReportGeneration(
  userId: string,
  projectId: string,
  instructions: string | null,
  by: "agent" | "pm",
): Promise<{ started: boolean; reason?: string }> {
  const { result } = await updateProject(userId, projectId, (p) => {
    const run = [...p.runs].reverse().find((r) => r.status === "completed");
    if (!run) return { started: false, reason: "There is no completed study run to report on yet." };
    if (p.report.job.status === "generating" && activeReports.has(projectId))
      return { started: false, reason: "A report is already being generated." };
    p.report.job = { status: "generating", error: null, startedAt: now() };
    audit(p, by, "report_generation_started", instructions ? `revision: ${instructions}` : "initial");
    notice(p, instructions ? "Revising the report with your requested changes…" : "Generating the report…");
    return { started: true, runId: run.id };
  });
  if (result.started && "runId" in result) {
    void generateReport(userId, projectId, result.runId as string, instructions).catch(() => {});
  }
  return { started: result.started, reason: result.reason };
}

/** Synthesise a run's transcript into a new report version (awaitable). */
export async function generateReport(
  userId: string,
  projectId: string,
  runId: string,
  instructions: string | null,
) {
  activeReports.add(projectId);
  const usage = emptyUsage();
  try {
    const project = await getProject(userId, projectId);
    const run = project.runs.find((r) => r.id === runId);
    if (!run) throw new Error("Run not found");
    const previous = instructions ? currentVersion(project.report) : null;
    const guidance = await loadKnowledgeBase(["02-", "03-", "06-", "07-"]);

    const { data: draft } = await completeStructured(
      {
        model: MODELS.master,
        max_tokens: 48000,
        output_config: { effort: (process.env.SYNTHESIS_EFFORT as "medium" | "high" | undefined) ?? "high" },
        system: [{ type: "text", text: synthesisSystemPrompt(guidance), cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: renderStudyForSynthesis(run) },
              {
                type: "text",
                text: previous
                  ? `<previous_report version="${previous.version}">\n${JSON.stringify(previous.data.draft)}\n</previous_report>\n\n<pm_change_request>\n${instructions}\n</pm_change_request>\n\nProduce a revised report that applies the PM's change request. Keep everything grounded in the transcript; if the request asks for something the evidence doesn't support, keep the evidence-based version and say so in limitations.`
                  : "Write the report.",
              },
            ],
          },
        ],
      },
      ReportDraft,
      { usage },
    );

    const report = buildReport(run, draft, previous?.data.pmNotes ?? "");
    await updateProject(userId, projectId, (p) => {
      const version = addReportVersion(p, report, "agent", instructions ? `Revision requested: ${instructions}` : null);
      p.report.job = { status: "idle", error: null, startedAt: null };
      mergeUsage(p.usage, usage);
      const unverified = report.quoteCheck.total - report.quoteCheck.verified;
      notice(
        p,
        `Report v${version} is ready for your review.${unverified ? ` ${unverified} quote(s) couldn't be matched to the transcript and are flagged.` : ""}`,
        [{ label: "Review report", href: `/projects/${p.id}/report` }],
      );
      p.pendingAgentEvents.push(`Report v${version} was generated and is pending PM review.`);
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("report generation failed", e);
    await updateProject(userId, projectId, (p) => {
      p.report.job = { status: "failed", error: message, startedAt: null };
      mergeUsage(p.usage, usage);
      audit(p, "system", "report_generation_failed", message);
      notice(p, `Report generation failed: ${message}`);
    }).catch(() => {});
    throw e;
  } finally {
    activeReports.delete(projectId);
  }
}

// ---------------------------------------------------------------------------

export function renderStudyForSynthesis(run: Run): string {
  const d = run.design;
  const parts: string[] = [];
  parts.push(`<study>
Title: ${d.title}
Feature under test: ${d.featureUnderTest}
Decision the PM is making (not yours): ${d.decisionToSupport}
Method: ${d.method}; participants: ${run.personas.personas.length}
Research questions:
${d.researchQuestions.map((q) => `- ${q.id}: ${q.text}`).join("\n")}
${d.tasks.length ? `Tasks:\n${d.tasks.map((t) => `- ${t.id} "${t.title}": ${t.scenario} | success: ${t.successCriteria} | RQs: ${t.relatedQuestionIds.join(", ")}`).join("\n")}` : ""}
Questions:
${d.interviewQuestions.map((q) => `- ${q.id}: ${q.question} | RQs: ${q.relatedQuestionIds.join(", ")}`).join("\n")}
Screens: ${run.screens.map((s) => `${s.code} "${s.label}" (${s.description || "no description"})`).join("; ") || "none"}
</study>`);
  parts.push(
    `<personas>\n${run.personas.personas.map((p) => `<persona id="${p.id}">\n${renderPersonaCard(p)}\nRelevance: ${p.relevance}\n</persona>`).join("\n")}\n</personas>`,
  );
  parts.push(`<transcript>\n${run.transcript.map(renderLine).join("\n")}\n</transcript>`);
  const flags = Object.entries(run.consistency).flatMap(([pid, c]) => c.flags.map((f) => `- ${f.lineId} (${pid}) ${f.type}: ${f.note}`));
  parts.push(`<consistency_flags>\n${flags.join("\n") || "(none)"}\n</consistency_flags>`);
  parts.push(`<task_metrics computed_by_app="true">\n${JSON.stringify(computeTaskMetrics(run))}\n</task_metrics>`);
  return parts.join("\n\n");
}

function renderLine(l: TranscriptLine): string {
  const who = l.speaker.kind === "moderator" ? "MODERATOR" : `${l.speaker.name} [${l.speaker.personaId}]`;
  const tag = [l.taskId, l.questionId].filter(Boolean).join(",");
  let s = `${l.id} | session ${l.sessionId} | ${who}${tag ? ` | ${tag}` : ""} | ${l.kind}: ${l.text}`;
  if (l.attempt) {
    s += `\n      (structured, not quotable) outcome=${l.attempt.outcome}; ease=${l.attempt.easeRating}/7; steps=${l.attempt.stepsTaken.map((x) => `${x.screen}: ${x.action}`).join(" > ")}; confusion=${l.attempt.confusionPoints.join("; ") || "none"}; expectations not met=${l.attempt.expectationsNotMet.join("; ") || "none"}`;
  }
  return s;
}

export function computeTaskMetrics(run: Run): TaskMetric[] {
  return run.design.tasks.map((t) => {
    const attempts = run.transcript.filter((l) => l.kind === "task_attempt" && l.taskId === t.id && l.attempt);
    const count = (o: string) => attempts.filter((a) => a.attempt!.outcome === o).length;
    const eases = attempts.map((a) => a.attempt!.easeRating);
    return {
      taskId: t.id,
      title: t.title,
      attempts: attempts.length,
      completed: count("completed"),
      completedWithDifficulty: count("completed_with_difficulty"),
      failed: count("failed"),
      gaveUp: count("gave_up"),
      averageEase: eases.length ? Math.round((eases.reduce((a, b) => a + b, 0) / eases.length) * 10) / 10 : null,
    };
  });
}

// --- quote verification ---------------------------------------------------------

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function searchable(l: TranscriptLine): string {
  const extra = l.attempt
    ? [...l.attempt.stepsTaken.map((s) => s.thought), ...l.attempt.confusionPoints, ...l.attempt.expectationsNotMet].join(" ")
    : "";
  return normalize(`${l.text} ${extra}`);
}

/** A quote matches if each "..."-separated fragment appears in order in the line. */
function matches(quote: string, haystack: string): boolean {
  const fragments = normalize(quote)
    .replace(/^["']|["']$/g, "")
    .split("...")
    .map((f) => f.trim().replace(/^[.,;:!?\s]+|[.,;:!?\s]+$/g, ""))
    .filter((f) => f.length >= 3);
  if (!fragments.length) return false;
  let from = 0;
  for (const f of fragments) {
    const i = haystack.indexOf(f, from);
    if (i < 0) return false;
    from = i + f.length;
  }
  return true;
}

export function verifyQuote(q: Quote, run: Run): VerifiedQuote {
  const personaLines = run.transcript.filter((l) => l.speaker.kind === "persona" && l.speaker.personaId === q.personaId);
  const referenced = personaLines.find((l) => l.id === q.lineId);
  if (referenced && matches(q.text, searchable(referenced))) return { ...q, verified: true };
  // The model sometimes cites the neighbouring line; accept the true source and correct the id.
  const found = personaLines.find((l) => matches(q.text, searchable(l)));
  if (found) return { ...q, lineId: found.id, verified: true };
  return { ...q, verified: false };
}

function buildReport(run: Run, draft: ReportDraft, pmNotes: string): Report {
  let total = 0;
  let verified = 0;
  const check = (qs: Quote[]): VerifiedQuote[] =>
    qs.map((q) => {
      const v = verifyQuote(q, run);
      total += 1;
      if (v.verified) verified += 1;
      return v;
    });
  const checked: ReportDraft = {
    ...draft,
    researchQuestionAnswers: draft.researchQuestionAnswers.map((a) => ({ ...a, evidence: check(a.evidence) })),
    findings: draft.findings.map((f) => ({ ...f, evidence: check(f.evidence) })),
    contradictions: draft.contradictions.map((c) => ({ ...c, evidence: check(c.evidence) })),
  };
  const d = run.design;
  return {
    runId: run.id,
    generatedAt: now(),
    title: d.title,
    scope: {
      featureUnderTest: d.featureUnderTest,
      decisionToSupport: d.decisionToSupport,
      method: d.method,
      participantCount: run.personas.personas.length,
      personas: run.personas.personas.map((p) => ({ id: p.id, name: p.name, label: p.label })),
      screens: run.screens.map((s) => ({ code: s.code, label: s.label })),
      designVersion: run.designVersion,
      personaVersion: run.personaVersion,
    },
    researchQuestions: d.researchQuestions.map((q) => ({ id: q.id, text: q.text })),
    taskMetrics: computeTaskMetrics(run),
    draft: checked,
    quoteCheck: { total, verified },
    pmNotes,
  };
}
