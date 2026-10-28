import crypto from "crypto";
import type { Project } from "../types";

export const ID_RE = /^[a-z0-9][a-z0-9_-]{5,63}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export class NotFoundError extends Error {}

export function assertId(id: string, what: string) {
  if (!ID_RE.test(id)) throw new NotFoundError(`Invalid ${what}`);
}

export function assertToken(token: string) {
  if (!TOKEN_RE.test(token)) throw new NotFoundError("Not found");
}

export function newId(prefix = ""): string {
  return prefix + crypto.randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x");
}

export function now(): string {
  return new Date().toISOString();
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: string;
}

export interface ShareRecord {
  userId: string;
  projectId: string;
}

/**
 * An activation code. Its id is also the owner id of the one study the code
 * opens. Only a hash of the code is kept, so codes can't be read back.
 */
export interface AccessCode {
  id: string;
  hash: string;
  /** Operator's private note (who it was given to). Never shown in the app. */
  label: string | null;
  capUsd: number;
  createdAt: string;
  expiresAt: string;
  disabledAt: string | null;
  lastUsedAt: string | null;
  projectId: string | null;
  /** Set when the code's study is deleted; the code is then used up. */
  studyDeletedAt: string | null;
}

export interface AppEvent {
  at: string;
  kind: string;
  codeId: string | null;
  projectId: string | null;
  detail: Record<string, string | number | boolean | null>;
}

export type AccessCodePatch = Partial<Pick<AccessCode, "label" | "capUsd" | "expiresAt" | "disabledAt" | "lastUsedAt" | "studyDeletedAt">>;

export function stageLabel(p: Project): string {
  if (p.report.status === "approved") return "Report approved";
  if (p.report.versions.length) return "Report in review";
  const run = p.runs[p.runs.length - 1];
  if (run?.status === "running") return "Study running";
  if (p.personas.status === "approved" && p.design.status === "approved") return "Ready to run";
  if (p.personas.versions.length) return "Personas in review";
  if (p.design.versions.length) return "Design in review";
  return "Interview";
}

/**
 * Where projects, screenshots and share links are kept. Every call is scoped
 * by (userId, projectId), so one PM's request can never reach another user's
 * or another project's data.
 */
export interface StoreBackend {
  insert(project: Project): Promise<void>;
  /** Throws NotFoundError unless the project exists and belongs to userId. */
  read(userId: string, projectId: string): Promise<Project>;
  /** Read-modify-write, serialised per project. Nothing is written if `mutate` throws. */
  update<T>(userId: string, projectId: string, mutate: (p: Project) => Promise<T>): Promise<{ project: Project; result: T }>;
  list(userId: string): Promise<ProjectSummary[]>;
  /** Hide the project from users for good. Its data and uploads are kept. */
  markDeleted(userId: string, projectId: string, at: string): Promise<void>;
  /** Operator-only read that also returns deleted projects. */
  readIncludingDeleted(userId: string, projectId: string): Promise<Project>;

  saveUpload(userId: string, projectId: string, fileName: string, data: Buffer): Promise<void>;
  readUpload(userId: string, projectId: string, fileName: string): Promise<Buffer>;
  deleteUpload(userId: string, projectId: string, fileName: string): Promise<void>;

  saveShare(token: string, record: ShareRecord): Promise<void>;
  readShare(token: string): Promise<ShareRecord>;
  deleteShare(token: string): Promise<void>;

  insertCode(code: AccessCode): Promise<void>;
  findCodeByHash(hash: string): Promise<AccessCode | null>;
  getCode(id: string): Promise<AccessCode | null>;
  listCodes(): Promise<AccessCode[]>;
  updateCode(id: string, patch: AccessCodePatch): Promise<AccessCode | null>;
  /** Attach the code's study. False if the code already has one. */
  claimCodeStudy(id: string, projectId: string): Promise<boolean>;
  deleteCode(id: string): Promise<void>;
  recordFailedAttempt(key: string): Promise<void>;
  /** Failed code entries since `sinceIso`, for one key (e.g. an IP) or for all when key is null. */
  countFailedAttempts(key: string | null, sinceIso: string): Promise<number>;

  /** Product events outside a study's own record (code entries, visits, errors). Best effort. */
  logEvent(event: AppEvent): Promise<void>;
  listEvents(sinceIso: string): Promise<AppEvent[]>;

  /** App-wide AI spend ledger, one running total per calendar month ("2026-10"). */
  addSpend(month: string, usd: number): Promise<void>;
  getSpend(month: string): Promise<number>;
}
