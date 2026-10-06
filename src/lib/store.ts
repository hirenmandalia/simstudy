import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { emptyUsage, type Project } from "./types";

/**
 * File-backed project store.
 *
 * Isolation: every project lives in its own folder under its owner's folder:
 *   data/users/<userId>/projects/<projectId>/{project.json, uploads/}
 * Every read goes through (userId, projectId), so one PM's request can never
 * resolve another user's or another project's files, and the agent is only
 * ever handed the single project it is working on. Deleting a project removes
 * the folder, so its context is gone for good.
 */

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const ID_RE = /^[a-z0-9][a-z0-9_-]{5,63}$/;

export class NotFoundError extends Error {}

function assertId(id: string, what: string) {
  if (!ID_RE.test(id)) throw new NotFoundError(`Invalid ${what}`);
}

export function newId(prefix = ""): string {
  return prefix + crypto.randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x");
}

export function now(): string {
  return new Date().toISOString();
}

function userDir(userId: string) {
  assertId(userId, "user");
  return path.join(DATA_DIR, "users", userId);
}

export function projectDir(userId: string, projectId: string) {
  assertId(projectId, "project");
  return path.join(userDir(userId), "projects", projectId);
}

export function uploadsDir(userId: string, projectId: string) {
  return path.join(projectDir(userId, projectId), "uploads");
}

// --- per-project write lock (single Node process) ----------------------------
// Kept on globalThis so route handlers, server components and background runs
// share one lock table even if Next bundles this module more than once.
const g = globalThis as unknown as { __projectLocks?: Map<string, Promise<unknown>> };
const locks = (g.__projectLocks ??= new Map());

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => next);
  locks.set(key, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}

async function readJson<T>(file: string): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new NotFoundError("Not found");
    throw e;
  }
}

async function writeJsonAtomic(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

// --- projects ----------------------------------------------------------------

export function blankProject(ownerId: string, id: string, name: string): Project {
  const t = now();
  return {
    id,
    ownerId,
    name,
    createdAt: t,
    updatedAt: t,
    brief: {
      productName: null,
      productContext: null,
      featureDescription: null,
      featureStage: null,
      decisionToSupport: null,
      researchQuestions: [],
      targetUsers: null,
      additionalContext: null,
    },
    screens: [],
    nextScreenNumber: 1,
    flowNotes: "",
    chat: [],
    agentHistory: [],
    pendingAgentEvents: [],
    lastStateHash: null,
    design: { versions: [], status: "pending_review", approvedVersion: null, approvedAt: null, reviewNote: null },
    personas: {
      versions: [],
      status: "pending_review",
      approvedVersion: null,
      approvedAt: null,
      reviewNote: null,
      approvedForDesignVersion: null,
    },
    runs: [],
    report: {
      versions: [],
      status: "pending_review",
      approvedVersion: null,
      approvedAt: null,
      reviewNote: null,
      shareToken: null,
      job: { status: "idle", error: null, startedAt: null },
    },
    audit: [{ at: t, actor: "pm", type: "project_created", detail: name }],
    usage: emptyUsage(),
  };
}

export async function createProject(ownerId: string, name: string, init?: (p: Project) => void): Promise<Project> {
  const id = newId("p");
  const project = blankProject(ownerId, id, name);
  init?.(project);
  await fs.mkdir(uploadsDir(ownerId, id), { recursive: true });
  await writeJsonAtomic(path.join(projectDir(ownerId, id), "project.json"), project);
  return project;
}

export async function getProject(userId: string, projectId: string): Promise<Project> {
  const p = await readJson<Project>(path.join(projectDir(userId, projectId), "project.json"));
  if (p.ownerId !== userId || p.id !== projectId) throw new NotFoundError("Not found");
  return p;
}

/** Read-modify-write under the project's lock. The mutator may be async. */
export async function updateProject<T = void>(
  userId: string,
  projectId: string,
  mutate: (p: Project) => T | Promise<T>,
): Promise<{ project: Project; result: T }> {
  const dir = projectDir(userId, projectId);
  return withLock(dir, async () => {
    const p = await getProject(userId, projectId);
    const result = await mutate(p);
    p.updatedAt = now();
    await writeJsonAtomic(path.join(dir, "project.json"), p);
    return { project: p, result };
  });
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: string;
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const root = path.join(userDir(userId), "projects");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: ProjectSummary[] = [];
  for (const id of entries) {
    if (!ID_RE.test(id)) continue;
    try {
      const p = await getProject(userId, id);
      out.push({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, stage: stageLabel(p) });
    } catch {
      // skip unreadable projects
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function stageLabel(p: Project): string {
  if (p.report.status === "approved") return "Report approved";
  if (p.report.versions.length) return "Report in review";
  const run = p.runs[p.runs.length - 1];
  if (run?.status === "running") return "Study running";
  if (p.personas.status === "approved" && p.design.status === "approved") return "Ready to run";
  if (p.personas.versions.length) return "Personas in review";
  if (p.design.versions.length) return "Design in review";
  return "Interview";
}

export async function deleteProject(userId: string, projectId: string) {
  const p = await getProject(userId, projectId);
  if (p.report.shareToken) await removeShare(p.report.shareToken);
  await fs.rm(projectDir(userId, projectId), { recursive: true, force: true });
}

// --- uploads -------------------------------------------------------------------

export async function saveUpload(userId: string, projectId: string, fileName: string, data: Buffer) {
  const dir = uploadsDir(userId, projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, path.basename(fileName)), data);
}

export async function readUpload(userId: string, projectId: string, fileName: string): Promise<Buffer> {
  return fs.readFile(path.join(uploadsDir(userId, projectId), path.basename(fileName)));
}

export async function deleteUpload(userId: string, projectId: string, fileName: string) {
  await fs.rm(path.join(uploadsDir(userId, projectId), path.basename(fileName)), { force: true });
}

// --- read-only share links (approved reports only) ----------------------------

interface ShareRecord {
  userId: string;
  projectId: string;
}

function shareFile(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundError("Not found");
  return path.join(DATA_DIR, "shares", `${token}.json`);
}

export async function createShare(userId: string, projectId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  await writeJsonAtomic(shareFile(token), { userId, projectId } satisfies ShareRecord);
  return token;
}

export async function resolveShare(token: string): Promise<ShareRecord> {
  return readJson<ShareRecord>(shareFile(token));
}

export async function removeShare(token: string) {
  await fs.rm(shareFile(token), { force: true });
}
