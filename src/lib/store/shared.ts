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
  /** Removes the project and its uploads. */
  remove(userId: string, projectId: string): Promise<void>;

  saveUpload(userId: string, projectId: string, fileName: string, data: Buffer): Promise<void>;
  readUpload(userId: string, projectId: string, fileName: string): Promise<Buffer>;
  deleteUpload(userId: string, projectId: string, fileName: string): Promise<void>;

  saveShare(token: string, record: ShareRecord): Promise<void>;
  readShare(token: string): Promise<ShareRecord>;
  deleteShare(token: string): Promise<void>;
}
