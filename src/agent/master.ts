import { z } from "zod";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { createMessage, MODELS } from "./llm";
import { loadKnowledgeBase } from "./knowledge";
import { masterSystemPrompt } from "./prompts";
import { classifyMessage } from "./guard";
import { renderProjectState, stateHash } from "./state";
import { startRun } from "./run";
import { startReportGeneration } from "./synthesis";
import { getProject, newId, now, updateProject } from "@/lib/store";
import { UserFacingError } from "@/lib/errors";
import { checkDesign, checkPersonas } from "@/lib/gates";
import { addDesignVersion, addPersonaVersion, audit } from "@/lib/review";
import {
  BriefUpdate,
  GuardrailCategory,
  PersonaSetInput,
  StudyDesignInput,
  type GuardVerdict,
} from "@/lib/schemas";
import { emptyUsage, mergeUsage, type ChatMessage, type Project, type UsageTotals } from "@/lib/types";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** Convert a zod schema to a strict-tool-compatible JSON schema. Limits the API can't enforce are re-checked with zod. */
function toInputSchema(schema: z.ZodType): BetaTool["input_schema"] {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const o = { ...(node as Record<string, unknown>) };
    for (const k of ["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "maxItems"])
      delete o[k];
    if (typeof o.minItems === "number" && o.minItems > 1) delete o.minItems;
    if (Array.isArray(o.type)) {
      const types = o.type as string[];
      const { description, ...rest } = o;
      delete rest.type;
      return {
        ...(description ? { description } : {}),
        anyOf: types.map((t) => (t === "null" ? { type: "null" } : strip({ ...rest, type: t }))),
      };
    }
    for (const [k, v] of Object.entries(o)) o[k] = strip(v);
    return o;
  };
  return strip(z.toJSONSchema(schema)) as BetaTool["input_schema"];
}

const StartRunInput = z.object({
  pmRequest: z.string().describe("The PM's explicit request to run the study, quoted from their message."),
});
const RegenerateReportInput = z.object({
  instructions: z.string().describe("What the PM wants changed in the report, in their words."),
});
const GuardrailEventInput = z.object({
  category: GuardrailCategory,
  summary: z.string().describe("One sentence: what was requested and why you declined or paused."),
});

const TOOL_SCHEMAS = {
  update_study_brief: BriefUpdate,
  propose_study_design: StudyDesignInput,
  propose_personas: PersonaSetInput,
  start_study_run: StartRunInput,
  regenerate_report: RegenerateReportInput,
  record_guardrail_event: GuardrailEventInput,
} as const;
type ToolName = keyof typeof TOOL_SCHEMAS;

const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  update_study_brief:
    "Record or update the study brief from the PM's answers (product, feature, stage, decision, PM-confirmed research questions, target users). Pass null for unchanged fields.",
  propose_study_design:
    "Create a new study-design version for the PM to review on the Study design screen. If a design is already approved, this withdraws that approval until the PM re-approves. Only call when required inputs are available.",
  propose_personas:
    "Create a new persona-set version for the PM to review on the Personas screen. Persona count must equal the design's participant count (max 12). Withdraws any existing persona approval.",
  start_study_run:
    "Start the approved simulated study. Only call when the PM has explicitly asked to run it. The app verifies approvals and returns blockers if the study can't start.",
  regenerate_report:
    "Generate a new report version from the latest completed run, applying the PM's requested changes. Runs in the background.",
  record_guardrail_event:
    "Log that you declined, refused or paused a request (out of scope, inappropriate, risky, cap, approval conflict, missing input...). Call once, before explaining it to the PM.",
};

// Strict mode compiles every strict schema into one grammar, and the design and
// persona schemas together exceed the API's size limit. Those two run non-strict;
// every tool input is still validated with zod, and validation errors go back to
// the agent as an error tool_result so it corrects itself.
const NON_STRICT: ReadonlySet<ToolName> = new Set(["propose_study_design", "propose_personas"]);

const TOOLS: BetaTool[] = (Object.keys(TOOL_SCHEMAS) as ToolName[]).map((name) => ({
  name,
  description: TOOL_DESCRIPTIONS[name],
  input_schema: toInputSchema(TOOL_SCHEMAS[name]),
  ...(NON_STRICT.has(name) ? {} : { strict: true }),
}));

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

interface TurnContext {
  userId: string;
  projectId: string;
  usage: UsageTotals;
  actions: ChatMessage["actions"];
  guardrail: GuardrailCategory | null;
  toolsCalled: string[];
}

function formatZodError(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

async function executeTool(ctx: TurnContext, block: BetaToolUseBlock): Promise<{ content: string; isError?: boolean }> {
  const name = block.name as ToolName;
  const schema = TOOL_SCHEMAS[name];
  if (!schema) return { content: `Unknown tool ${block.name}`, isError: true };
  const parsed = schema.safeParse(block.input);
  if (!parsed.success) return { content: `Invalid input: ${formatZodError(parsed.error)}`, isError: true };
  ctx.toolsCalled.push(name);
  const base = `/projects/${ctx.projectId}`;

  try {
    switch (name) {
      case "update_study_brief": {
        const input = parsed.data as BriefUpdate;
        await updateProject(ctx.userId, ctx.projectId, (p) => {
          for (const [k, v] of Object.entries(input)) {
            if (v !== null) (p.brief as unknown as Record<string, unknown>)[k] = v;
          }
          audit(p, "agent", "brief_updated", Object.keys(input).filter((k) => input[k as keyof BriefUpdate] !== null).join(", "));
        });
        return { content: "Brief updated." };
      }

      case "propose_study_design": {
        const design = parsed.data as StudyDesignInput;
        const { result } = await updateProject(ctx.userId, ctx.projectId, (p) => {
          const check = checkDesign(design, p);
          const version = addDesignVersion(p, design, "agent", null);
          return { version, check };
        });
        ctx.actions.push({ label: "Review study design", href: `${base}/design` });
        return {
          content: JSON.stringify({
            created: `Study design v${result.version} (status: pending PM review on the Study design screen)`,
            blockingIssues: result.check.blocking,
            warnings: result.check.warnings,
          }),
        };
      }

      case "propose_personas": {
        const set = parsed.data as PersonaSetInput;
        const { result } = await updateProject(ctx.userId, ctx.projectId, (p) => {
          if (!p.design.versions.length) throw new UserFacingError("Propose a study design before personas.");
          const check = checkPersonas(set, p);
          const version = addPersonaVersion(p, set, "agent", null);
          return { version, check };
        });
        ctx.actions.push({ label: "Review personas", href: `${base}/personas` });
        return {
          content: JSON.stringify({
            created: `Personas v${result.version} (status: pending PM review on the Personas screen)`,
            blockingIssues: result.check.blocking,
            warnings: result.check.warnings,
          }),
        };
      }

      case "start_study_run": {
        const { pmRequest } = parsed.data as z.infer<typeof StartRunInput>;
        const outcome = await startRun(ctx.userId, ctx.projectId, `agent (PM asked: "${pmRequest.slice(0, 200)}")`);
        if (!outcome.started) return { content: JSON.stringify({ started: false, blockers: outcome.blockers }) };
        ctx.actions.push({ label: "Watch the run", href: `${base}/run` });
        return { content: JSON.stringify({ started: true, runId: outcome.runId }) };
      }

      case "regenerate_report": {
        const { instructions } = parsed.data as z.infer<typeof RegenerateReportInput>;
        const outcome = await startReportGeneration(ctx.userId, ctx.projectId, instructions, "agent");
        if (!outcome.started) return { content: JSON.stringify({ started: false, reason: outcome.reason }) };
        ctx.actions.push({ label: "Open report", href: `${base}/report` });
        return { content: JSON.stringify({ started: true }) };
      }

      case "record_guardrail_event": {
        const { category, summary } = parsed.data as z.infer<typeof GuardrailEventInput>;
        ctx.guardrail = category;
        await updateProject(ctx.userId, ctx.projectId, (p) => audit(p, "agent", `guardrail:${category}`, summary));
        return { content: "Logged." };
      }
    }
  } catch (e) {
    if (e instanceof UserFacingError) return { content: [e.message, ...e.details].join(" "), isError: true };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Chat turn
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { __activeTurns?: Set<string> };
const activeTurns = (g.__activeTurns ??= new Set());

export function isTurnActive(projectId: string) {
  return activeTurns.has(projectId);
}

function buildUserContent(project: Project, pmText: string, verdict: GuardVerdict, events: string[]): { text: string; hash: string } {
  const state = renderProjectState(project);
  const hash = stateHash(state);
  const parts: string[] = [];
  if (events.length) parts.push(`<app_events>\n${events.map((e) => `- ${e}`).join("\n")}\n</app_events>`);
  parts.push(hash === project.lastStateHash ? "<project_state>(unchanged since your last turn)</project_state>" : `<project_state>\n${state}\n</project_state>`);
  if (verdict.category !== "in_scope") parts.push(`<guardrail_note>${verdict.category}: ${verdict.reason}</guardrail_note>`);
  parts.push(`<pm_message>\n${pmText}\n</pm_message>`);
  return { text: parts.join("\n\n"), hash };
}

const BLOCKED_REPLY =
  "I can't help with that. It falls outside this tool's permitted use (illegal, abusive, profane or otherwise inappropriate content), so I won't use or analyse that material. If you'd like, rephrase the request as a safe, appropriate simulated usability study or focus group and I'll pick up from there.";

export interface TurnOutcome {
  message: ChatMessage;
  toolsCalled: string[];
  verdict: GuardVerdict;
}

/** Run one PM → agent turn. Persists the PM message, the agent reply and all side effects. */
export async function runMasterTurn(userId: string, projectId: string, pmText: string): Promise<TurnOutcome> {
  const text = pmText.trim();
  if (!text) throw new UserFacingError("Message is empty.");
  if (text.length > 8000) throw new UserFacingError("Message is too long (8,000 characters max).");
  if (activeTurns.has(projectId)) throw new UserFacingError("The agent is still replying to your previous message.", 409);
  activeTurns.add(projectId);

  const usage = emptyUsage();
  const pmMessageId = newId("m");
  try {
    await updateProject(userId, projectId, (p) => {
      p.chat.push({ id: pmMessageId, role: "pm", text, at: now(), guardrail: null, actions: [] });
    });

    // 1. Guard: block inappropriate content before the master agent sees it.
    const verdict = await classifyMessage(text, usage);
    if (verdict.block) {
      const message: ChatMessage = {
        id: newId("m"),
        role: "agent",
        text: BLOCKED_REPLY,
        at: now(),
        guardrail: "inappropriate_content",
        actions: [],
      };
      await updateProject(userId, projectId, (p) => {
        const pm = p.chat.find((m) => m.id === pmMessageId);
        if (pm) {
          pm.text = "[Message hidden: blocked by the content guardrail]";
          pm.guardrail = "inappropriate_content";
        }
        p.chat.push(message);
        p.pendingAgentEvents.push("A PM message was blocked by the content guardrail (inappropriate content) and withheld from you.");
        audit(p, "system", "guardrail:inappropriate_content", verdict.reason);
        mergeUsage(p.usage, usage);
      });
      return { message, toolsCalled: [], verdict };
    }

    // 2. Master agent tool loop.
    const project = await getProject(userId, projectId);
    const events = [...project.pendingAgentEvents];
    const { text: userText, hash } = buildUserContent(project, text, verdict, events);
    const system = masterSystemPrompt(await loadKnowledgeBase());
    const turnMessages: BetaMessageParam[] = [{ role: "user", content: userText }];
    const ctx: TurnContext = { userId, projectId, usage, actions: [], guardrail: null, toolsCalled: [] };

    let reply = "";
    for (let i = 0; i < 8; i++) {
      const msg = await createMessage(
        {
          model: MODELS.master,
          max_tokens: 16000,
          output_config: { effort: (process.env.MASTER_EFFORT as "low" | "medium" | "high" | undefined) ?? "medium" },
          // The history is append-only, but the system prompt changes whenever the
          // knowledge base or prompt is edited. Drop stale thinking blocks instead of failing.
          thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools: TOOLS,
          cache_control: { type: "ephemeral" },
          messages: [...project.agentHistory, ...turnMessages],
        },
        { usage, betas: ["thinking-binding-controls-2026-08-01"] },
      );
      turnMessages.push({ role: "assistant", content: msg.content as BetaContentBlockParam[] });

      if (msg.stop_reason === "refusal") {
        reply = BLOCKED_REPLY;
        ctx.guardrail = "inappropriate_content";
        break;
      }
      const toolUses = msg.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
      const textOut = msg.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n")
        .trim();
      if (msg.stop_reason !== "tool_use" || !toolUses.length) {
        reply = textOut || (msg.stop_reason === "max_tokens" ? "(My reply was cut off. Could you ask again?)" : "");
        break;
      }
      const results: BetaToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const r = await executeTool(ctx, tu);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
      }
      turnMessages.push({ role: "user", content: results });
      if (i === 7) reply = textOut || "I've made the updates. Let me know how you'd like to proceed.";
    }

    const message: ChatMessage = {
      id: newId("m"),
      role: "agent",
      text: reply || "Done.",
      at: now(),
      guardrail: ctx.guardrail,
      actions: dedupeActions(ctx.actions),
    };
    await updateProject(userId, projectId, (p) => {
      p.agentHistory.push(...turnMessages);
      p.pendingAgentEvents.splice(0, events.length);
      p.lastStateHash = hash;
      p.chat.push(message);
      mergeUsage(p.usage, usage);
    });
    return { message, toolsCalled: ctx.toolsCalled, verdict };
  } catch (e) {
    await updateProject(userId, projectId, (p) => {
      p.chat.push({
        id: newId("m"),
        role: "notice",
        text: "The agent couldn't respond to that message. Please try again.",
        at: now(),
        guardrail: null,
        actions: [],
      });
      mergeUsage(p.usage, usage);
    }).catch(() => {});
    throw e;
  } finally {
    activeTurns.delete(projectId);
  }
}

function dedupeActions(actions: ChatMessage["actions"]) {
  const seen = new Set<string>();
  return actions.filter((a) => (seen.has(a.href) ? false : (seen.add(a.href), true)));
}
