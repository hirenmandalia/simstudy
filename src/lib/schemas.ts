import { z } from "zod";

/**
 * Domain schemas shared by the agent (tool inputs / structured outputs) and the UI.
 *
 * Every field the model fills is required; "optional" values are expressed as
 * nullable so the schemas stay valid for strict tool use and structured outputs.
 * Numeric limits (e.g. the 12-participant cap) are not enforced by the API's
 * schema compiler, so they are re-validated here with zod after every call.
 */

export const MAX_PARTICIPANTS = 12;

export const StudyMethod = z.enum(["usability_test", "focus_group"]);
export type StudyMethod = z.infer<typeof StudyMethod>;

export const Decision = z.enum(["build", "launch"]);
export type Decision = z.infer<typeof Decision>;

export const FeatureStage = z.enum(["idea", "partially_built"]);
export type FeatureStage = z.infer<typeof FeatureStage>;

// ---------------------------------------------------------------------------
// Study brief (collected during the interview)
// ---------------------------------------------------------------------------

export const BriefUpdate = z.object({
  productName: z.string().nullable().describe("Name of the app or product. null = no change."),
  productContext: z
    .string()
    .nullable()
    .describe("What the app does and who uses it today, in the PM's words. null = no change."),
  featureDescription: z
    .string()
    .nullable()
    .describe("The feature idea or partially built feature being validated. null = no change."),
  featureStage: FeatureStage.nullable().describe("idea or partially_built. null = no change."),
  decisionToSupport: Decision.nullable().describe("The decision this study informs. null = no change."),
  researchQuestions: z
    .array(z.string())
    .nullable()
    .describe(
      "Research questions exactly as the PM stated or confirmed them. Replaces the stored list. Never include questions the PM has not confirmed. null = no change.",
    ),
  targetUsers: z
    .string()
    .nullable()
    .describe("Who the target users are and what matters about them, per the PM. null = no change."),
  additionalContext: z
    .string()
    .nullable()
    .describe("Other relevant constraints or context the PM shared. null = no change."),
});
export type BriefUpdate = z.infer<typeof BriefUpdate>;

// ---------------------------------------------------------------------------
// Study design
// ---------------------------------------------------------------------------

export const ResearchQuestion = z.object({
  id: z.string().describe('Stable id like "RQ1".'),
  text: z.string(),
  origin: z
    .enum(["pm", "agent_suggested"])
    .describe("pm = stated or confirmed by the PM; agent_suggested = your suggestion awaiting PM confirmation."),
});
export type ResearchQuestion = z.infer<typeof ResearchQuestion>;

export const UsabilityTask = z.object({
  id: z.string().describe('Stable id like "TASK1".'),
  title: z.string(),
  scenario: z
    .string()
    .describe("Realistic, goal-based scenario read to the participant. Must not reveal the UI path or use on-screen labels."),
  successCriteria: z.string().describe("What counts as success, observable from the screens."),
  startScreen: z.string().nullable().describe('Screen code where the task starts, e.g. "S1".'),
  relatedQuestionIds: z.array(z.string()),
});
export type UsabilityTask = z.infer<typeof UsabilityTask>;

export const InterviewQuestion = z.object({
  id: z.string().describe('Stable id like "Q1".'),
  question: z.string().describe("Open, neutral, non-leading question."),
  probes: z.array(z.string()).describe("Neutral follow-up probes the moderator may use."),
  relatedQuestionIds: z.array(z.string()),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestion>;

export const SessionSection = z.object({
  title: z.string(),
  minutes: z.number().int(),
  description: z.string(),
});

export const StudyDesignInput = z.object({
  title: z.string().describe("Short study title."),
  featureUnderTest: z.string(),
  decisionToSupport: Decision,
  researchQuestions: z.array(ResearchQuestion).min(1),
  method: StudyMethod,
  methodRationale: z.string().describe("Why this method fits the research questions, grounded in the knowledge base."),
  participantCount: z.number().int().min(1).max(MAX_PARTICIPANTS).describe(`Number of simulated participants (1-${MAX_PARTICIPANTS}).`),
  sessionLengthMinutes: z.number().int(),
  sessionOutline: z.array(SessionSection),
  moderatorIntroduction: z.string().describe("What the moderator says to open the session."),
  warmUpQuestions: z.array(z.string()),
  tasks: z.array(UsabilityTask).describe("Usability tasks. Empty for a focus group."),
  interviewQuestions: z
    .array(InterviewQuestion)
    .describe("Debrief questions (usability test) or the discussion guide (focus group)."),
  closingRemarks: z.string(),
  targetUserAssumptions: z.array(z.string()),
  assumptions: z.array(z.string()).describe("Assumptions you made that the PM should check."),
  missingInputs: z.array(z.string()).describe("Inputs still missing that limit the study. Empty if none."),
  risks: z.array(z.string()).describe("Risks and limitations of this design, including simulated-research limits."),
});
export type StudyDesignInput = z.infer<typeof StudyDesignInput>;

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

export const TechSavviness = z.enum(["low", "medium", "high"]);
export const ProductFamiliarity = z.enum(["never_used", "occasional", "regular", "power_user"]);

export const Persona = z.object({
  id: z.string().describe('Stable id like "P1".'),
  name: z.string().describe("Fictional first name and last initial. Never a real or famous person."),
  label: z.string().describe('Short archetype label, e.g. "Budget-conscious first-time user".'),
  ageRange: z.string(),
  occupation: z.string(),
  lifeContext: z.string().describe("Relevant everyday context: when and where they would use the app."),
  goals: z.array(z.string()),
  needs: z.array(z.string()),
  painPoints: z.array(z.string()),
  constraints: z.array(z.string()).describe("Time, money, device, attention, accessibility or other constraints."),
  techSavviness: TechSavviness,
  productFamiliarity: ProductFamiliarity,
  accessibilityConsiderations: z.string().nullable(),
  behaviours: z.array(z.string()).describe("How they typically behave in apps like this."),
  communicationStyle: z.string().describe("How they talk: vocabulary, verbosity, tone."),
  relevance: z.string().describe("Which target-user requirement this persona covers and why it matters for the research questions."),
});
export type Persona = z.infer<typeof Persona>;

export const PersonaSetInput = z.object({
  personas: z.array(Persona).min(1).max(MAX_PARTICIPANTS),
  rationale: z.string().describe("Why this mix of personas answers the research questions."),
  coverageNotes: z.string().describe("What the set covers well and any gaps the PM should know about."),
});
export type PersonaSetInput = z.infer<typeof PersonaSetInput>;

// ---------------------------------------------------------------------------
// Simulated session outputs
// ---------------------------------------------------------------------------

export const TaskOutcome = z.enum(["completed", "completed_with_difficulty", "failed", "gave_up"]);
export type TaskOutcome = z.infer<typeof TaskOutcome>;

export const TaskAttempt = z.object({
  thinkAloud: z
    .string()
    .describe("First-person think-aloud narration as you work through the task on the screens, in your own voice."),
  stepsTaken: z.array(
    z.object({
      screen: z.string().describe('Screen code you were looking at, e.g. "S2".'),
      action: z.string().describe("What you tried to do (tap, scroll, read...)."),
      thought: z.string().describe("What you were thinking at that moment."),
    }),
  ),
  outcome: TaskOutcome,
  easeRating: z.number().int().describe("How easy was this task? 1 = very difficult, 7 = very easy."),
  confusionPoints: z.array(z.string()),
  expectationsNotMet: z.array(z.string()).describe("Things you expected to see or happen that the screens did not show."),
});
export type TaskAttempt = z.infer<typeof TaskAttempt>;

export const ModeratorProbe = z.object({
  probe: z.string().describe("One open, neutral follow-up question (max ~25 words)."),
  rationale: z.string().describe("Why this probe, in one sentence (not shown to participants)."),
  addressedTo: z
    .array(z.string())
    .describe("Persona ids the probe is directed to. Usability test: the single participant. Focus group: 1-3 participants."),
});
export type ModeratorProbe = z.infer<typeof ModeratorProbe>;

export const ConsistencyCheck = z.object({
  overallConsistent: z.boolean(),
  summary: z.string(),
  flags: z.array(
    z.object({
      lineId: z.string().describe('Transcript line id, e.g. "L014".'),
      type: z.enum([
        "out_of_character",
        "references_unseen_ui",
        "invented_feature",
        "contradicts_earlier_statement",
        "expert_jargon_inconsistent_with_persona",
        "other",
      ]),
      note: z.string(),
    }),
  ),
});
export type ConsistencyCheck = z.infer<typeof ConsistencyCheck>;

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export const Quote = z.object({
  text: z.string().describe("Verbatim excerpt copied exactly from the transcript line. Do not paraphrase."),
  personaId: z.string(),
  lineId: z.string().describe('Transcript line id the excerpt comes from, e.g. "L014".'),
});
export type Quote = z.infer<typeof Quote>;

export const Severity = z.enum(["critical", "major", "minor", "positive"]);
export type Severity = z.infer<typeof Severity>;

export const ReportDraft = z.object({
  executiveSummary: z.string(),
  researchQuestionAnswers: z.array(
    z.object({
      questionId: z.string(),
      answer: z.string(),
      confidence: z.enum(["low", "medium", "high"]),
      evidence: z.array(Quote),
    }),
  ),
  findings: z.array(
    z.object({
      id: z.string().describe('"F1", "F2", ...'),
      title: z.string(),
      observation: z.string().describe("What happened in the sessions (facts only)."),
      interpretation: z.string().describe("What it likely means and why (clearly an interpretation)."),
      severity: Severity,
      personaIds: z.array(z.string()),
      relatedQuestionIds: z.array(z.string()),
      evidence: z.array(Quote),
    }),
  ),
  patterns: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      personaIds: z.array(z.string()),
    }),
  ),
  contradictions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      personaIds: z.array(z.string()),
      evidence: z.array(Quote),
    }),
  ),
  recommendations: z.array(
    z.object({
      id: z.string().describe('"R1", "R2", ...'),
      title: z.string(),
      detail: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      type: z.enum(["design_change", "content_change", "further_research", "real_user_validation", "other"]),
      findingIds: z.array(z.string()),
    }),
  ),
  personaHighlights: z.array(z.object({ personaId: z.string(), summary: z.string() })),
  limitations: z.array(z.string()),
  realUserValidation: z.string().describe("What should be validated with real users before relying on these results, and how."),
});
export type ReportDraft = z.infer<typeof ReportDraft>;

// ---------------------------------------------------------------------------
// Guardrails
// ---------------------------------------------------------------------------

export const GuardrailCategory = z.enum([
  "out_of_scope",
  "inappropriate_content",
  "real_user_contact",
  "incentives_or_payment",
  "private_data",
  "build_launch_decision",
  "external_sharing",
  "cross_project",
  "participant_cap",
  "approval_conflict",
  "missing_input",
  "ambiguous_request",
]);
export type GuardrailCategory = z.infer<typeof GuardrailCategory>;

export const GuardVerdict = z.object({
  category: z.enum([
    "in_scope",
    "out_of_scope",
    "inappropriate_content",
    "risky_action",
    "fee_question",
    "cross_project",
  ]),
  block: z
    .boolean()
    .describe("true only for inappropriate_content: illegal, abusive, hateful, sexual, profane or otherwise harmful material."),
  reason: z.string().describe("One short sentence. Do not repeat harmful content."),
});
export type GuardVerdict = z.infer<typeof GuardVerdict>;

export const ScreenCheck = z.object({
  description: z
    .string()
    .describe("Neutral 1-3 sentence description of what the screen shows: screen type, key elements and visible labels."),
  piiConcerns: z
    .array(z.string())
    .describe("Anything that looks like real personal data (real names, faces, usernames, emails, phone numbers, addresses, user-generated posts). Empty if none."),
  inappropriate: z.boolean().describe("true if the screen contains illegal, sexual, violent, hateful or otherwise inappropriate content."),
  inappropriateReason: z.string().nullable(),
});
export type ScreenCheck = z.infer<typeof ScreenCheck>;
