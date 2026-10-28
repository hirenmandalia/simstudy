import { promises as fs } from "fs";
import path from "path";
import type { Project } from "../types";
import { assertId, assertToken, ID_RE, NotFoundError, stageLabel, type ProjectSummary, type ShareRecord, type StoreBackend } from "./shared";

/**
 * File-backed store for local development.
 *
 * Isolation: every project lives in its own folder under its owner's folder:
 *   data/users/<userId>/projects/<projectId>/{project.json, uploads/}
 * Deleting a project removes the folder, so its context is gone for good.
 */

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

function userDir(userId: string) {
  assertId(userId, "user");
  return path.join(DATA_DIR, "users", userId);
}

function projectDir(userId: string, projectId: string) {
  assertId(projectId, "project");
  return path.join(userDir(userId), "projects", projectId);
}

function uploadsDir(userId: string, projectId: string) {
  return path.join(projectDir(userId, projectId), "uploads");
}

function shareFile(token: string) {
  assertToken(token);
  return path.join(DATA_DIR, "shares", `${token}.json`);
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

async function read(userId: string, projectId: string): Promise<Project> {
  const p = await readJson<Project>(path.join(projectDir(userId, projectId), "project.json"));
  if (p.ownerId !== userId || p.id !== projectId) throw new NotFoundError("Not found");
  return p;
}

export const fileBackend: StoreBackend = {
  async insert(project) {
    await fs.mkdir(uploadsDir(project.ownerId, project.id), { recursive: true });
    await writeJsonAtomic(path.join(projectDir(project.ownerId, project.id), "project.json"), project);
  },

  read,

  async update(userId, projectId, mutate) {
    const dir = projectDir(userId, projectId);
    return withLock(dir, async () => {
      const p = await read(userId, projectId);
      const result = await mutate(p);
      await writeJsonAtomic(path.join(dir, "project.json"), p);
      return { project: p, result };
    });
  },

  async list(userId) {
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
        const p = await read(userId, id);
        out.push({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, stage: stageLabel(p) });
      } catch {
        // skip unreadable projects
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async remove(userId, projectId) {
    await fs.rm(projectDir(userId, projectId), { recursive: true, force: true });
  },

  async saveUpload(userId, projectId, fileName, data) {
    const dir = uploadsDir(userId, projectId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, path.basename(fileName)), data);
  },

  async readUpload(userId, projectId, fileName) {
    return fs.readFile(path.join(uploadsDir(userId, projectId), path.basename(fileName)));
  },

  async deleteUpload(userId, projectId, fileName) {
    await fs.rm(path.join(uploadsDir(userId, projectId), path.basename(fileName)), { force: true });
  },

  async saveShare(token, record) {
    await writeJsonAtomic(shareFile(token), record satisfies ShareRecord);
  },

  async readShare(token) {
    return readJson<ShareRecord>(shareFile(token));
  },

  async deleteShare(token) {
    await fs.rm(shareFile(token), { force: true });
  },
};
