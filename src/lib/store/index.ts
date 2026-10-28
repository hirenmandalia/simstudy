import crypto from "crypto";
import { emptyUsage, type Project } from "../types";
import { fileBackend } from "./file";
import { supabaseBackend } from "./supabase";
import { newId, now, type StoreBackend } from "./shared";

/**
 * Project store. Local development keeps everything in files under DATA_DIR;
 * the hosted app (Vercel) uses Supabase. Override with STORE_BACKEND=file|supabase.
 */

export { NotFoundError, newId, now, type ProjectSummary } from "./shared";

function backend(): StoreBackend {
  // `vercel env pull` copies VERCEL=1 into local env files, so also require a production build.
  const hosted = process.env.VERCEL && process.env.NODE_ENV === "production";
  const choice = process.env.STORE_BACKEND ?? (hosted ? "supabase" : "file");
  if (choice === "file") return fileBackend;
  if (choice === "supabase") return supabaseBackend;
  throw new Error(`Unknown STORE_BACKEND "${choice}" (use "file" or "supabase").`);
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
  const project = blankProject(ownerId, newId("p"), name);
  init?.(project);
  await backend().insert(project);
  return project;
}

export async function getProject(userId: string, projectId: string): Promise<Project> {
  return backend().read(userId, projectId);
}

/** Read-modify-write under the project's lock. The mutator may be async. */
export async function updateProject<T = void>(
  userId: string,
  projectId: string,
  mutate: (p: Project) => T | Promise<T>,
): Promise<{ project: Project; result: T }> {
  return backend().update(userId, projectId, async (p) => {
    const result = await mutate(p);
    p.updatedAt = now();
    return result;
  });
}

export async function listProjects(userId: string) {
  return backend().list(userId);
}

export async function deleteProject(userId: string, projectId: string) {
  const p = await getProject(userId, projectId);
  if (p.report.shareToken) await removeShare(p.report.shareToken);
  await backend().remove(userId, projectId);
}

// --- uploads -------------------------------------------------------------------

export async function saveUpload(userId: string, projectId: string, fileName: string, data: Buffer) {
  await backend().saveUpload(userId, projectId, fileName, data);
}

export async function readUpload(userId: string, projectId: string, fileName: string): Promise<Buffer> {
  return backend().readUpload(userId, projectId, fileName);
}

export async function deleteUpload(userId: string, projectId: string, fileName: string) {
  await backend().deleteUpload(userId, projectId, fileName);
}

// --- read-only share links (approved reports only) ----------------------------

export async function createShare(userId: string, projectId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  await backend().saveShare(token, { userId, projectId });
  return token;
}

export async function resolveShare(token: string) {
  return backend().readShare(token);
}

export async function removeShare(token: string) {
  await backend().deleteShare(token);
}
