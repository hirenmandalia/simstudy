import path from "path";
import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "../types";
import { assertId, assertToken, NotFoundError, stageLabel, type StoreBackend } from "./shared";

/**
 * Supabase-backed store for the hosted pilot.
 *
 * Projects are one JSONB document per row (the same shape as project.json), so
 * the app code is unchanged. `update` locks the row (SELECT … FOR UPDATE) for
 * the read-modify-write, which serialises writes across serverless instances.
 * Screenshots live in the private `screens` Storage bucket under
 * <userId>/<projectId>/<fileName>. Tables have RLS on with no policies and the
 * bucket is private, so only this server (database role / secret key) can reach
 * them. Schema: supabase/migrations.
 */

const BUCKET = "screens";

const g = globalThis as unknown as { __sql?: postgres.Sql; __supabase?: SupabaseClient };

/** Connection string with its query string dropped: Supabase adds params (e.g. `supa=`) Postgres rejects. */
export function postgresUrl(name = "POSTGRES_URL"): string {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set. Link the Supabase project in Vercel, or set STORE_BACKEND=file.`);
  const u = new URL(raw);
  u.search = "";
  return u.toString();
}

function db(): postgres.Sql {
  // prepare: false — the Supabase pooler runs in transaction mode.
  return (g.__sql ??= postgres(postgresUrl(), { ssl: "require", prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 }));
}

function storage() {
  if (!g.__supabase) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for screen storage.");
    g.__supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return g.__supabase.storage.from(BUCKET);
}

function objectPath(userId: string, projectId: string, fileName?: string) {
  assertId(userId, "user");
  assertId(projectId, "project");
  return fileName === undefined ? `${userId}/${projectId}` : `${userId}/${projectId}/${path.basename(fileName)}`;
}

const CONTENT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

async function read(userId: string, projectId: string): Promise<Project> {
  assertId(userId, "user");
  assertId(projectId, "project");
  const [row] = await db()<{ data: Project }[]>`select data from projects where id = ${projectId} and owner_id = ${userId}`;
  if (!row) throw new NotFoundError("Not found");
  return row.data;
}

export const supabaseBackend: StoreBackend = {
  async insert(p) {
    assertId(p.ownerId, "user");
    assertId(p.id, "project");
    const sql = db();
    await sql`
      insert into projects (id, owner_id, name, stage, created_at, updated_at, data)
      values (${p.id}, ${p.ownerId}, ${p.name}, ${stageLabel(p)}, ${p.createdAt}, ${p.updatedAt}, ${sql.json(p as never)})`;
  },

  read,

  async update<T>(userId: string, projectId: string, mutate: (p: Project) => Promise<T>) {
    assertId(userId, "user");
    assertId(projectId, "project");
    const out = await db().begin(async (tx) => {
      const [row] = await tx<{ data: Project }[]>`
        select data from projects where id = ${projectId} and owner_id = ${userId} for update`;
      if (!row) throw new NotFoundError("Not found");
      const p = row.data;
      const result = await mutate(p);
      await tx`
        update projects
        set data = ${tx.json(p as never)}, name = ${p.name}, stage = ${stageLabel(p)}, updated_at = ${p.updatedAt}
        where id = ${projectId}`;
      return { project: p, result };
    });
    return out as { project: Project; result: T };
  },

  async list(userId) {
    assertId(userId, "user");
    const rows = await db()<{ id: string; name: string; stage: string; created_at: Date; updated_at: Date }[]>`
      select id, name, stage, created_at, updated_at from projects where owner_id = ${userId} order by updated_at desc`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      stage: r.stage,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  },

  async remove(userId, projectId) {
    const prefix = objectPath(userId, projectId);
    // Shares go with the row (ON DELETE CASCADE).
    await db()`delete from projects where id = ${projectId} and owner_id = ${userId}`;
    const { data: objects, error } = await storage().list(prefix, { limit: 1000 });
    if (error) throw error;
    if (objects?.length) {
      const { error: rmError } = await storage().remove(objects.map((o) => `${prefix}/${o.name}`));
      if (rmError) throw rmError;
    }
  },

  async saveUpload(userId, projectId, fileName, data) {
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const { error } = await storage().upload(objectPath(userId, projectId, fileName), data, {
      contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
      upsert: true,
    });
    if (error) throw error;
  },

  async readUpload(userId, projectId, fileName) {
    const { data, error } = await storage().download(objectPath(userId, projectId, fileName));
    if (error || !data) throw new NotFoundError("Not found");
    return Buffer.from(await data.arrayBuffer());
  },

  async deleteUpload(userId, projectId, fileName) {
    const { error } = await storage().remove([objectPath(userId, projectId, fileName)]);
    if (error) throw error;
  },

  async saveShare(token, { userId, projectId }) {
    assertToken(token);
    await db()`insert into shares (token, owner_id, project_id) values (${token}, ${userId}, ${projectId})`;
  },

  async readShare(token) {
    assertToken(token);
    const [row] = await db()<{ owner_id: string; project_id: string }[]>`
      select owner_id, project_id from shares where token = ${token}`;
    if (!row) throw new NotFoundError("Not found");
    return { userId: row.owner_id, projectId: row.project_id };
  },

  async deleteShare(token) {
    assertToken(token);
    await db()`delete from shares where token = ${token}`;
  },
};
