import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type {
  ConsistencyCheck,
  Decision,
  FeatureStage,
  GuardrailCategory,
  PersonaSetInput,
  Quote,
  ReportDraft,
  StudyDesignInput,
  TaskAttempt,
} from "./schemas";

export type ReviewStatus = "pending_review" | "approved" | "rejected";

export interface StudyBrief {
  productName: string | null;
  productContext: string | null;
  featureDescription: string | null;
  featureStage: FeatureStage | null;
  decisionToSupport: Decision | null;
  /** Research questions as stated or confirmed by the PM. */
  researchQuestions: string[];
  targetUsers: string | null;
  additionalContext: string | null;
}

export interface Screen {
  /** Stable code shown to the PM and the personas, e.g. "S3". Never reused. */
  code: string;
  label: string;
  /** AI-generated neutral description, editable by the PM. */
  description: string;
  fileName: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  order: number;
  uploadedAt: string;
  piiConcerns: string[];
  /** PM confirmed the screen is public and redacted (required for any screen with concerns). */
  piiAcknowledged: boolean;
  screenCheck: "passed" | "flagged" | "unavailable";
}

export interface Versioned<T> {
  version: number;
  createdAt: string;
  createdBy: "agent" | "pm";
  /** PM's note when they created this version by editing. */
  note: string | null;
  data: T;
}

export interface ReviewState<T> {
  versions: Versioned<T>[];
  status: ReviewStatus;
  /** Version number that is approved (only meaningful when status === "approved"). */
  approvedVersion: number | null;
  approvedAt: string | null;
  /** PM reason when rejected, or the latest escalation note. */
  reviewNote: string | null;
}

export interface PersonaReview extends ReviewState<PersonaSetInput> {
  /** Design version the personas were approved against. */
  approvedForDesignVersion: number | null;
}

export type Speaker = { kind: "moderator" } | { kind: "persona"; personaId: string; name: string };

export interface TranscriptLine {
  id: string; // "L001"
  sessionId: string; // persona id for usability tests, "group" for focus groups
  speaker: Speaker;
  kind:
    | "intro"
    | "warm_up"
    | "task_prompt"
    | "task_attempt"
    | "probe"
    | "answer"
    | "question"
    | "discussion"
    | "closing";
  taskId: string | null;
  questionId: string | null;
  text: string;
  attempt: TaskAttempt | null;
  at: string;
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface Run {
  id: string;
  status: "running" | "completed" | "failed" | "interrupted";
  startedAt: string;
  finishedAt: string | null;
  designVersion: number;
  personaVersion: number;
  /** Frozen copies of what was approved, so the run is reproducible and auditable. */
  design: StudyDesignInput;
  personas: PersonaSetInput;
  screens: Pick<Screen, "code" | "label" | "description">[];
  flowNotes: string;
  progress: { total: number; done: number; current: string };
  transcript: TranscriptLine[];
  consistency: Record<string, ConsistencyCheck>;
  error: string | null;
  usage: UsageTotals;
}

export interface VerifiedQuote extends Quote {
  verified: boolean;
}

export interface TaskMetric {
  taskId: string;
  title: string;
  attempts: number;
  completed: number;
  completedWithDifficulty: number;
  failed: number;
  gaveUp: number;
  averageEase: number | null;
}

/** ReportDraft with quotes checked against the transcript plus computed metadata. */
export interface Report {
  runId: string;
  generatedAt: string;
  title: string;
  scope: {
    featureUnderTest: string;
    decisionToSupport: Decision;
    method: StudyDesignInput["method"];
    participantCount: number;
    personas: { id: string; name: string; label: string }[];
    screens: { code: string; label: string }[];
    designVersion: number;
    personaVersion: number;
  };
  researchQuestions: { id: string; text: string }[];
  taskMetrics: TaskMetric[];
  draft: ReportDraft;
  quoteCheck: { total: number; verified: number };
  pmNotes: string;
}

export interface ReportReview extends ReviewState<Report> {
  shareToken: string | null;
  job: { status: "idle" | "generating" | "failed"; error: string | null; startedAt: string | null };
}

export interface ChatMessage {
  id: string;
  role: "pm" | "agent" | "notice";
  text: string;
  at: string;
  /** Guardrail category when this message was a refusal / pause. */
  guardrail: GuardrailCategory | null;
  actions: { label: string; href: string }[];
}

export interface AuditEvent {
  at: string;
  actor: "pm" | "agent" | "system";
  type: string;
  detail: string;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  brief: StudyBrief;
  screens: Screen[];
  nextScreenNumber: number;
  flowNotes: string;
  chat: ChatMessage[];
  /** Raw master-agent conversation (append-only; includes thinking blocks). Never sent to the browser. */
  agentHistory: BetaMessageParam[];
  /** UI actions not yet seen by the agent; delivered with the next PM message. */
  pendingAgentEvents: string[];
  /** Hash of the last project-state snapshot the agent saw. */
  lastStateHash: string | null;
  design: ReviewState<StudyDesignInput>;
  personas: PersonaReview;
  runs: Run[];
  report: ReportReview;
  audit: AuditEvent[];
  usage: UsageTotals;
}

/** Project as sent to the browser. */
export type ClientProject = Omit<Project, "agentHistory" | "pendingAgentEvents" | "lastStateHash">;

export function toClientProject(p: Project): ClientProject {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { agentHistory, pendingAgentEvents, lastStateHash, ...rest } = p;
  return rest;
}

export function mergeUsage(target: UsageTotals, add: UsageTotals) {
  target.calls += add.calls;
  target.inputTokens += add.inputTokens;
  target.outputTokens += add.outputTokens;
  target.cacheReadTokens += add.cacheReadTokens;
  target.cacheWriteTokens += add.cacheWriteTokens;
}

export function emptyUsage(): UsageTotals {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function currentVersion<T>(r: ReviewState<T>): Versioned<T> | null {
  return r.versions.length ? r.versions[r.versions.length - 1] : null;
}

export function approvedVersion<T>(r: ReviewState<T>): Versioned<T> | null {
  if (r.status !== "approved" || r.approvedVersion == null) return null;
  return r.versions.find((v) => v.version === r.approvedVersion) ?? null;
}

export function latestRun(p: Pick<Project, "runs">): Run | null {
  return p.runs.length ? p.runs[p.runs.length - 1] : null;
}
