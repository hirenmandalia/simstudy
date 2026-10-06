import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTextBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { completeStructured, completeText, imageBlock, MODELS, RefusalError } from "./llm";
import { loadKnowledgeBase } from "./knowledge";
import {
  CONSISTENCY_SYSTEM,
  moderatorSystemPrompt,
  personaSystemPrompt,
  renderPersonaCard,
} from "./prompts";
import { generateReport } from "./synthesis";
import { getProject, newId, now, readUpload, updateProject } from "@/lib/store";
import { runGate } from "@/lib/gates";
import { audit, notice } from "@/lib/review";
import {
  ConsistencyCheck,
  ModeratorProbe,
  TaskAttempt,
  type Persona,
  type StudyDesignInput,
} from "@/lib/schemas";
import { approvedVersion, emptyUsage, mergeUsage, type Run, type Screen, type TranscriptLine, type UsageTotals } from "@/lib/types";

type Effort = "low" | "medium" | "high";
const PERSONA_EFFORT = (process.env.PERSONA_EFFORT as Effort | undefined) ?? "low";
const CONCURRENCY = Math.max(1, Number(process.env.RUN_CONCURRENCY ?? 3));

const g = globalThis as unknown as { __activeRuns?: Set<string> };
export const activeRuns = (g.__activeRuns ??= new Set());

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export async function startRun(
  userId: string,
  projectId: string,
  initiatedBy: string,
): Promise<{ started: true; runId: string } | { started: false; blockers: string[] }> {
  const { result } = await updateProject(userId, projectId, (p) => {
    const blockers = runGate(p);
    if (blockers.length) {
      audit(p, "system", "run_blocked", blockers.join(" "));
      return { started: false as const, blockers };
    }
    const design = approvedVersion(p.design)!;
    const personas = approvedVersion(p.personas)!;
    const screens = [...p.screens].sort((a, b) => a.order - b.order);
    const run: Run = {
      id: newId("r"),
      status: "running",
      startedAt: now(),
      finishedAt: null,
      designVersion: design.version,
      personaVersion: personas.version,
      design: structuredClone(design.data),
      personas: structuredClone(personas.data),
      screens: screens.map((s) => ({ code: s.code, label: s.label, description: s.description })),
      flowNotes: p.flowNotes,
      progress: { total: estimateSteps(design.data, personas.data.personas.length), done: 0, current: "Preparing participants" },
      transcript: [],
      consistency: {},
      error: null,
      usage: emptyUsage(),
    };
    p.runs.push(run);
    audit(p, "pm", "run_started", `${run.id} (design v${design.version}, personas v${personas.version}) via ${initiatedBy}`);
    notice(p, `Simulated ${design.data.method === "usability_test" ? "usability test" : "focus group"} started with ${personas.data.personas.length} AI personas.`, [
      { label: "Watch the run", href: `/projects/${p.id}/run` },
    ]);
    return { started: true as const, runId: run.id };
  });

  if (result.started && process.env.SIMSTUDY_DRY_RUN === "true") {
    // Evals: record that a run passed the gate, but don't spend tokens executing it.
    await updateProject(userId, projectId, (p) => {
      const r = p.runs.find((x) => x.id === result.runId)!;
      r.status = "failed";
      r.error = "Dry run: not executed (SIMSTUDY_DRY_RUN=true)";
      r.finishedAt = now();
    });
  } else if (result.started) {
    activeRuns.add(result.runId);
    void executeRun(userId, projectId, result.runId).finally(() => activeRuns.delete(result.runId));
  }
  return result;
}

function estimateSteps(design: StudyDesignInput, n: number): number {
  const perPersona =
    design.method === "usability_test"
      ? design.warmUpQuestions.length + design.tasks.length * 3 + design.interviewQuestions.length
      : 0;
  // Focus group: opening round, per question (round + probe + ~2 replies + cross-talk),
  // ending round, summary, confirmation round.
  const group =
    design.method === "focus_group" ? n + design.interviewQuestions.length * (n + 1 + 2 + 2) + n + 1 + n : 0;
  return perPersona * n + group + n /* consistency */ + 1 /* report */;
}

// ---------------------------------------------------------------------------
// Recorder: transcript lines + progress, flushed to the project store
// ---------------------------------------------------------------------------

class Recorder {
  private lineNo = 0;
  readonly usage: UsageTotals = emptyUsage();
  private pending: TranscriptLine[] = [];
  private flushing: Promise<unknown> = Promise.resolve();

  constructor(
    private userId: string,
    private projectId: string,
    private runId: string,
  ) {}

  line(partial: Omit<TranscriptLine, "id" | "at">): TranscriptLine {
    this.lineNo += 1;
    const line: TranscriptLine = { ...partial, id: `L${String(this.lineNo).padStart(3, "0")}`, at: now() };
    this.pending.push(line);
    return line;
  }

  /** Persist new lines and progress (serialised so writes never interleave). */
  flush(stepDone = 0, current?: string) {
    const lines = this.pending.splice(0);
    this.flushing = this.flushing.then(() =>
      updateProject(this.userId, this.projectId, (p) => {
        const run = p.runs.find((r) => r.id === this.runId);
        if (!run) return;
        run.transcript.push(...lines);
        run.progress.done = Math.min(run.progress.total, run.progress.done + stepDone);
        if (current) run.progress.current = current;
        run.usage = { ...this.usage };
      }),
    );
    return this.flushing;
  }
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

interface ScreenPack {
  blocks: BetaContentBlockParam[];
  codes: string[];
}

async function loadScreenPack(userId: string, projectId: string, screens: Screen[], flowNotes: string): Promise<ScreenPack> {
  const blocks: BetaContentBlockParam[] = [];
  for (const s of screens) {
    const data = await readUpload(userId, projectId, s.fileName);
    blocks.push({ type: "text", text: `Screen ${s.code} — "${s.label}"` });
    blocks.push(imageBlock(data, s.mediaType));
  }
  blocks.push({
    type: "text",
    text: screens.length
      ? `These are static screenshots of the app (${screens.map((s) => s.code).join(", ")}).\nNavigation flow notes from the product team: ${flowNotes.trim() || "(none provided)"}`
      : "No screenshots were provided for this study; the concept is described in words only.",
    cache_control: { type: "ephemeral" },
  });
  return { blocks, codes: screens.map((s) => s.code) };
}

async function executeRun(userId: string, projectId: string, runId: string) {
  const rec = new Recorder(userId, projectId, runId);
  try {
    const project = await getProject(userId, projectId);
    const run = project.runs.find((r) => r.id === runId)!;
    const screens = [...project.screens].sort((a, b) => a.order - b.order);
    const pack = await loadScreenPack(userId, projectId, screens, run.flowNotes);
    const questionGuidance = await loadKnowledgeBase(["04-"]);

    if (run.design.method === "usability_test") {
      await mapLimit(run.personas.personas, CONCURRENCY, (persona) =>
        usabilitySession(rec, run.design, persona, pack, questionGuidance),
      );
    } else {
      await focusGroupSession(rec, run.design, run.personas.personas, pack, questionGuidance);
    }
    await rec.flush(0, "Checking persona consistency");

    // Consistency check per persona.
    const latest = await getProject(userId, projectId);
    const transcript = latest.runs.find((r) => r.id === runId)!.transcript;
    const checks: Record<string, ConsistencyCheck> = {};
    await mapLimit(run.personas.personas, CONCURRENCY, async (persona) => {
      checks[persona.id] = await consistencyCheck(rec.usage, persona, transcript, pack);
      await rec.flush(1);
    });

    await updateProject(userId, projectId, (p) => {
      const r = p.runs.find((x) => x.id === runId)!;
      r.consistency = checks;
      r.status = "completed";
      r.finishedAt = now();
      r.progress.current = "Writing the report";
      r.usage = { ...rec.usage };
      mergeUsage(p.usage, rec.usage);
      audit(p, "system", "run_completed", runId);
      notice(p, "The simulated study finished. I'm now synthesising the transcript into a report.", [
        { label: "View transcript", href: `/projects/${p.id}/run` },
      ]);
      p.pendingAgentEvents.push(`Simulated study run ${runId} completed; report generation started automatically.`);
      p.report.job = { status: "generating", error: null, startedAt: now() };
    });

    // Report failures are recorded on the report job; the run itself succeeded.
    await generateReport(userId, projectId, runId, null).catch(() => {});
    await updateProject(userId, projectId, (p) => {
      const r = p.runs.find((x) => x.id === runId)!;
      r.progress.done = r.progress.total;
      r.progress.current = "Done";
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("run failed", e);
    await rec.flush().catch(() => {});
    await updateProject(userId, projectId, (p) => {
      const r = p.runs.find((x) => x.id === runId);
      if (r && r.status === "running") {
        r.status = "failed";
        r.error = message;
        r.finishedAt = now();
        mergeUsage(p.usage, rec.usage);
      }
      audit(p, "system", "run_failed", message);
      notice(p, `The simulated study failed: ${message}`);
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Usability test: one-to-one session per persona
// ---------------------------------------------------------------------------

async function usabilitySession(
  rec: Recorder,
  design: StudyDesignInput,
  persona: Persona,
  pack: ScreenPack,
  questionGuidance: string,
) {
  const system = personaSystemPrompt(persona, design.method);
  const sid = persona.id;
  const speaker = { kind: "persona" as const, personaId: persona.id, name: persona.name };
  const mod = { kind: "moderator" as const };
  const messages: BetaMessageParam[] = [];

  const ask = async (moderatorText: string, first = false): Promise<string> => {
    const content: BetaContentBlockParam[] = first ? [...pack.blocks] : [];
    content.push({ type: "text", text: `Moderator: ${moderatorText}` });
    messages.push({ role: "user", content });
    const text = await personaText(rec.usage, system, messages);
    messages.push({ role: "assistant", content: text });
    return text;
  };

  // Introduction + warm-up
  const warmUps = design.warmUpQuestions.length ? design.warmUpQuestions : ["To start, tell me a little about how you use apps like this today."];
  for (let i = 0; i < warmUps.length; i++) {
    const q = i === 0 ? `${design.moderatorIntroduction}\n\n${warmUps[0]}` : warmUps[i];
    rec.line({ sessionId: sid, speaker: mod, kind: i === 0 ? "intro" : "warm_up", taskId: null, questionId: null, text: q, attempt: null });
    const a = await ask(q, i === 0);
    rec.line({ sessionId: sid, speaker, kind: "answer", taskId: null, questionId: null, text: a, attempt: null });
    await rec.flush(1, `${persona.name}: warm-up`);
  }

  // Tasks
  for (const task of design.tasks) {
    const prompt = `Here's a task. ${task.scenario}${task.startScreen ? ` (You start on screen ${task.startScreen}.)` : ""}\nPlease think aloud as you work through the screens, then tell me how easy that was on a scale from 1 (very difficult) to 7 (very easy).`;
    rec.line({ sessionId: sid, speaker: mod, kind: "task_prompt", taskId: task.id, questionId: null, text: prompt, attempt: null });
    messages.push({ role: "user", content: [{ type: "text", text: `Moderator: ${prompt}` }] });
    let attemptText: string;
    let attempt: TaskAttempt | null = null;
    try {
      const { data } = await retryOnce(() =>
        completeStructured(
          {
            model: MODELS.persona,
            max_tokens: 12000,
            output_config: { effort: PERSONA_EFFORT },
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            cache_control: { type: "ephemeral" },
            messages,
          },
          TaskAttempt,
          { usage: rec.usage },
        ),
      );
      attempt = { ...data, easeRating: Math.min(7, Math.max(1, Math.round(data.easeRating))) };
      attemptText = data.thinkAloud;
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      attemptText = "(No response: declined by the model's safety system.)";
    }
    messages.push({ role: "assistant", content: attempt ? JSON.stringify(attempt) : attemptText });
    rec.line({ sessionId: sid, speaker, kind: "task_attempt", taskId: task.id, questionId: null, text: attemptText, attempt });
    await rec.flush(1, `${persona.name}: ${task.title}`);

    // Moderator follow-up probe
    const probe = await moderatorProbe(rec.usage, design, questionGuidance, [persona], {
      context: `Task ${task.id} "${task.title}": ${task.scenario}\nRelated probes from the guide: ${relatedProbes(design, task.relatedQuestionIds)}`,
      recent: attempt
        ? `${persona.name} (think-aloud): ${attempt.thinkAloud}\nOutcome: ${attempt.outcome}; ease ${attempt.easeRating}/7; confusion: ${attempt.confusionPoints.join("; ") || "none"}; expectations not met: ${attempt.expectationsNotMet.join("; ") || "none"}`
        : `${persona.name}: ${attemptText}`,
    });
    rec.line({ sessionId: sid, speaker: mod, kind: "probe", taskId: task.id, questionId: null, text: probe.probe, attempt: null });
    await rec.flush(1);
    const answer = await ask(probe.probe);
    rec.line({ sessionId: sid, speaker, kind: "answer", taskId: task.id, questionId: null, text: answer, attempt: null });
    await rec.flush(1);
  }

  // Debrief
  for (const q of design.interviewQuestions) {
    rec.line({ sessionId: sid, speaker: mod, kind: "question", taskId: null, questionId: q.id, text: q.question, attempt: null });
    const a = await ask(q.question);
    rec.line({ sessionId: sid, speaker, kind: "answer", taskId: null, questionId: q.id, text: a, attempt: null });
    await rec.flush(1, `${persona.name}: debrief`);
  }
  rec.line({ sessionId: sid, speaker: mod, kind: "closing", taskId: null, questionId: null, text: design.closingRemarks, attempt: null });
  await rec.flush(0, `${persona.name}: session complete`);
}

function relatedProbes(design: StudyDesignInput, rqIds: string[]): string {
  const probes = design.interviewQuestions.filter((q) => q.relatedQuestionIds.some((id) => rqIds.includes(id))).flatMap((q) => q.probes);
  return probes.length ? probes.join(" | ") : "(none)";
}

async function personaText(usage: UsageTotals, system: string, messages: BetaMessageParam[]): Promise<string> {
  try {
    const { text } = await completeText(
      {
        model: MODELS.persona,
        max_tokens: 8000,
        output_config: { effort: PERSONA_EFFORT },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        cache_control: { type: "ephemeral" },
        messages,
      },
      { usage },
    );
    return text || "(no answer)";
  } catch (e) {
    if (e instanceof RefusalError) return "(No response: declined by the model's safety system.)";
    throw e;
  }
}

async function moderatorProbe(
  usage: UsageTotals,
  design: StudyDesignInput,
  questionGuidance: string,
  participants: Persona[],
  input: { context: string; recent: string },
): Promise<ModeratorProbe> {
  const { data } = await retryOnce(() =>
    completeStructured(
      {
        model: MODELS.utility,
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: [{ type: "text", text: moderatorSystemPrompt(questionGuidance, design), cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `Participants: ${participants.map((p) => `${p.id} ${p.name} (${p.label})`).join("; ")}\n\nCurrent point in the guide:\n${input.context}\n\nWhat was just said:\n${input.recent}\n\nChoose one follow-up probe.`,
          },
        ],
      },
      ModeratorProbe,
      { usage },
    ),
  );
  const valid = data.addressedTo.filter((id) => participants.some((p) => p.id === id));
  return { ...data, addressedTo: valid.length ? valid.slice(0, 3) : [participants[0].id] };
}

// ---------------------------------------------------------------------------
// Focus group: one moderated group discussion
// ---------------------------------------------------------------------------

async function focusGroupSession(
  rec: Recorder,
  design: StudyDesignInput,
  personas: Persona[],
  pack: ScreenPack,
  questionGuidance: string,
) {
  const sid = "group";
  const mod = { kind: "moderator" as const };
  const discussion: string[] = [];
  const roster = personas.map((p) => `${p.name} (${p.label})`).join(", ");

  const say = async (persona: Persona, moderatorLine: string, addressed: "you" | "the group") => {
    const system = personaSystemPrompt(persona, "focus_group");
    const content: BetaContentBlockParam[] = [
      ...pack.blocks,
      {
        type: "text",
        text: `Participants in this group: ${roster}. You are ${persona.name}.\n\nDiscussion so far:\n${discussion.join("\n") || "(just starting)"}\n\nModerator (to ${addressed}): ${moderatorLine}\n\nRespond as ${persona.name} would speak in a group: 1-4 sentences, reacting to others where natural. Agree or disagree honestly.`,
      } satisfies BetaTextBlockParam,
    ];
    const text = await personaText(rec.usage, system, [{ role: "user", content }]);
    rec.line({
      sessionId: sid,
      speaker: { kind: "persona", personaId: persona.id, name: persona.name },
      kind: "discussion",
      taskId: null,
      questionId: currentQ,
      text,
      attempt: null,
    });
    discussion.push(`${persona.name}: ${text}`);
    await rec.flush(1, `Group discussion: ${persona.name}`);
  };

  let currentQ: string | null = null;
  const line = (kind: TranscriptLine["kind"], text: string, questionId: string | null) => {
    rec.line({ sessionId: sid, speaker: mod, kind, taskId: null, questionId, text, attempt: null });
    discussion.push(`Moderator: ${text}`);
  };

  // 1. Opening: short introduction, then an easy recent-experience question
  //    that everyone answers in turn, so every participant speaks early.
  const opening = `${design.moderatorIntroduction}\n\nLet's go around the table first. ${design.warmUpQuestions[0] ?? "Please tell us your first name and the last time you used an app like this, and what for."}`;
  line("intro", opening, null);
  for (const p of personas) await say(p, opening, "the group");

  // 2. Key questions: open floor (rotating who speaks first), a follow-up probe,
  //    then cross-talk where one participant reacts directly to another's point.
  for (let qi = 0; qi < design.interviewQuestions.length; qi++) {
    const q = design.interviewQuestions[qi];
    currentQ = q.id;
    const asked = `${q.question} Anyone can start.`;
    line("question", asked, q.id);
    const order = personas.map((_, i) => personas[(i + qi) % personas.length]);
    for (const p of order) await say(p, q.question, "the group");

    const roundText = discussion.slice(-personas.length).join("\n");
    const probe = await moderatorProbe(rec.usage, design, questionGuidance, personas, {
      context: `${q.id}: ${q.question}\nGuide probes: ${q.probes.join(" | ") || "(none)"}\nProbe anything vague or cryptic, or draw out a quieter participant.`,
      recent: roundText,
    });
    const probeText = `${namesOf(probe.addressedTo)}, ${probe.probe}`;
    line("probe", probeText, q.id);
    await rec.flush(1);
    for (const id of probe.addressedTo) await say(byId(id), probeText, "you");

    const cross = await moderatorProbe(rec.usage, design, questionGuidance, personas, {
      context: `${q.id}: ${q.question}\nCROSS-TALK: invite exactly ONE participant to respond directly to a specific point another participant made, naming that participant and their point neutrally (e.g. "Theo, Maya said X. How does that compare with your experience?"). Prefer someone who disagrees or has said little.`,
      recent: discussion.slice(-(personas.length + 4)).join("\n"),
    });
    const crossText = `${namesOf(cross.addressedTo.slice(0, 1))}, ${cross.probe}`;
    line("probe", crossText, q.id);
    await rec.flush(1);
    await say(byId(cross.addressedTo[0]), crossText, "you");
  }

  // 3. Ending question: everyone names the most important thing said. This tends
  //    to surface minority or contrary views the main discussion suppressed.
  currentQ = "END";
  const ending =
    "Our final question, and we'll go around the table: of everything we've talked about today, what is the most important thing that's been said? It can be something you said or something you heard someone else say.";
  line("question", ending, "END");
  for (const p of personas) await say(p, ending, "the group");

  // 4. Summary and confirmation: the moderator summarises key points and asks
  //    participants to confirm or correct them.
  currentQ = "SUMMARY";
  const summary = await moderatorSummary(rec.usage, design, discussion.join("\n"));
  const summaryText = `Let me briefly summarise what I heard. ${summary} Did we hear that correctly? Is there anything we missed?`;
  line("probe", summaryText, "SUMMARY");
  await rec.flush(1, "Moderator summary");
  for (const p of personas) await say(p, summaryText, "the group");

  rec.line({ sessionId: sid, speaker: mod, kind: "closing", taskId: null, questionId: null, text: design.closingRemarks, attempt: null });
  await rec.flush(0, "Group discussion complete");

  function byId(id: string) {
    return personas.find((p) => p.id === id) ?? personas[0];
  }
  function namesOf(ids: string[]) {
    return ids.map((id) => byId(id).name).join(" and ");
  }
}

/** Short neutral summary of the discussion for participants to confirm or correct. */
async function moderatorSummary(usage: UsageTotals, design: StudyDesignInput, discussion: string): Promise<string> {
  try {
    const { text } = await completeText(
      {
        model: MODELS.utility,
        max_tokens: 4000,
        output_config: { effort: "low" },
        system:
          "You are the assistant moderator of a SIMULATED focus group. Summarise the key points of the discussion in 3-5 short, neutral sentences, spoken aloud to the participants. Include points of disagreement and any minority view. Do not add interpretation, recommendations or anything that wasn't said.",
        messages: [{ role: "user", content: `Discussion guide topic: ${design.featureUnderTest}\n\nDiscussion:\n${discussion}` }],
      },
      { usage },
    );
    return text;
  } catch (e) {
    if (e instanceof RefusalError) return "We covered a range of experiences and views.";
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Consistency check
// ---------------------------------------------------------------------------

async function consistencyCheck(
  usage: UsageTotals,
  persona: Persona,
  transcript: TranscriptLine[],
  pack: ScreenPack,
): Promise<ConsistencyCheck> {
  const lines = transcript
    // Usability: this persona's own session. Focus group: the whole discussion, for context.
    .filter((l) => l.sessionId === persona.id || l.sessionId === "group")
    .map((l) => {
      const who = l.speaker.kind === "moderator" ? "Moderator" : l.speaker.name;
      const extra = l.attempt
        ? `\n    [steps: ${l.attempt.stepsTaken.map((s) => `${s.screen}: ${s.action} — ${s.thought}`).join(" / ")}]`
        : "";
      return `${l.id} ${who}: ${l.text}${extra}`;
    })
    .join("\n");
  try {
    const { data } = await completeStructured(
      {
        model: MODELS.utility,
        max_tokens: 8000,
        output_config: { effort: "low" },
        system: CONSISTENCY_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              ...pack.blocks,
              { type: "text", text: `<persona id="${persona.id}">\n${renderPersonaCard(persona)}\n</persona>\n\n<transcript>\n${lines}\n</transcript>\n\nCheck only ${persona.name}'s lines.` },
            ],
          },
        ],
      },
      ConsistencyCheck,
      { usage },
    );
    return data;
  } catch (e) {
    if (e instanceof RefusalError) return { overallConsistent: true, summary: "Consistency check unavailable (declined).", flags: [] };
    throw e;
  }
}

// ---------------------------------------------------------------------------

/**
 * Retry once on a malformed or truncated structured response. API errors are
 * already retried by the SDK, and refusals are handled by callers.
 */
async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof RefusalError || e instanceof Anthropic.APIError) throw e;
    return fn();
  }
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  });
  await Promise.all(workers);
}
