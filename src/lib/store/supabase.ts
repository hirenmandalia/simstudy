import path from "path";
import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "../types";
import { assertId, assertToken, NotFoundError, stageLabel, type AccessCode, type AppEvent, type StoreBackend } from "./shared";

/**
 * Supabase-backed store for the hosted pilot.
 *
 * Deleting a study only sets deleted_at: every user-facing read skips it, and
 * its row and screenshots are kept for the operator.
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
  // Percent-encode the password: dashboard strings carry it raw, and characters like # or / break URL parsing.
  const m = /^(postgres(?:ql)?:\/\/[^:/@]+:)(.*)@([^@]+)$/.exec(raw);
  const u = new URL(m ? `${m[1]}${encodeURIComponent(safeDecode(m[2]))}@${m[3]}` : raw);
  u.search = "";
  return u.toString();
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
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

interface CodeRow {
  id: string;
  hash: string;
  label: string | null;
  cap_usd: string;
  created_at: Date;
  expires_at: Date;
  disabled_at: Date | null;
  last_used_at: Date | null;
  project_id: string | null;
  study_deleted_at: Date | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toCode(r: CodeRow): AccessCode {
  return {
    id: r.id,
    hash: r.hash,
    label: r.label,
    capUsd: Number(r.cap_usd),
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    disabledAt: iso(r.disabled_at),
    lastUsedAt: iso(r.last_used_at),
    projectId: r.project_id,
    studyDeletedAt: iso(r.study_deleted_at),
  };
}

const CODE_COLUMNS: Record<string, string> = {
  label: "label",
  capUsd: "cap_usd",
  expiresAt: "expires_at",
  disabledAt: "disabled_at",
  lastUsedAt: "last_used_at",
  studyDeletedAt: "study_deleted_at",
};

async function read(userId: string, projectId: string): Promise<Project> {
  assertId(userId, "user");
  assertId(projectId, "project");
  const [row] = await db()<{ data: Project }[]>`
    select data from projects where id = ${projectId} and owner_id = ${userId} and deleted_at is null`;
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
        select data from projects where id = ${projectId} and owner_id = ${userId} and deleted_at is null for update`;
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
      select id, name, stage, created_at, updated_at from projects
      where owner_id = ${userId} and deleted_at is null order by updated_at desc`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      stage: r.stage,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  },

  async markDeleted(userId, projectId, at) {
    assertId(userId, "user");
    assertId(projectId, "project");
    await db()`
      update projects
      set deleted_at = ${at}, data = jsonb_set(data, '{deletedAt}', to_jsonb(${at}::text))
      where id = ${projectId} and owner_id = ${userId}`;
  },

  async readIncludingDeleted(userId, projectId) {
    assertId(userId, "user");
    assertId(projectId, "project");
    const [row] = await db()<{ data: Project }[]>`select data from projects where id = ${projectId} and owner_id = ${userId}`;
    if (!row) throw new NotFoundError("Not found");
    return row.data;
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

  async insertCode(c) {
    await db()`
      insert into access_codes (id, hash, label, cap_usd, created_at, expires_at, disabled_at, last_used_at, project_id, study_deleted_at)
      values (${c.id}, ${c.hash}, ${c.label}, ${c.capUsd}, ${c.createdAt}, ${c.expiresAt}, ${c.disabledAt}, ${c.lastUsedAt}, ${c.projectId}, ${c.studyDeletedAt})`;
  },

  async findCodeByHash(hash) {
    const [row] = await db()<CodeRow[]>`select * from access_codes where hash = ${hash}`;
    return row ? toCode(row) : null;
  },

  async getCode(id) {
    const [row] = await db()<CodeRow[]>`select * from access_codes where id = ${id}`;
    return row ? toCode(row) : null;
  },

  async listCodes() {
    return (await db()<CodeRow[]>`select * from access_codes order by created_at desc`).map(toCode);
  },

  async updateCode(id, patch) {
    const sql = db();
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) values[CODE_COLUMNS[k]] = v;
    if (!Object.keys(values).length) return this.getCode(id);
    const [row] = await sql<CodeRow[]>`update access_codes set ${sql(values)} where id = ${id} returning *`;
    return row ? toCode(row) : null;
  },

  async claimCodeStudy(id, projectId) {
    const rows = await db()`update access_codes set project_id = ${projectId} where id = ${id} and project_id is null returning id`;
    return rows.length === 1;
  },

  async deleteCode(id) {
    await db()`delete from access_codes where id = ${id}`;
  },

  async recordFailedAttempt(key) {
    const sql = db();
    await sql`insert into code_attempts (key) values (${key})`;
    await sql`delete from code_attempts where at < now() - interval '1 day'`;
  },

  async logEvent(e) {
    const sql = db();
    await sql`
      insert into events (at, kind, code_id, project_id, detail)
      values (${e.at}, ${e.kind}, ${e.codeId}, ${e.projectId}, ${sql.json(e.detail)})`;
  },

  async listEvents(sinceIso) {
    const rows = await db()<{ at: Date; kind: string; code_id: string | null; project_id: string | null; detail: AppEvent["detail"] }[]>`
      select at, kind, code_id, project_id, detail from events where at >= ${sinceIso} order by at`;
    return rows.map((r) => ({ at: r.at.toISOString(), kind: r.kind, codeId: r.code_id, projectId: r.project_id, detail: r.detail }));
  },

  async addSpend(month, usd) {
    await db()`
      insert into app_spend (month, usd) values (${month}, ${usd})
      on conflict (month) do update set usd = app_spend.usd + excluded.usd, updated_at = now()`;
  },

  async getSpend(month) {
    const [row] = await db()<{ usd: string }[]>`select usd from app_spend where month = ${month}`;
    return row ? Number(row.usd) : 0;
  },

  async countFailedAttempts(key, sinceIso) {
    const sql = db();
    const [row] = key === null
      ? await sql<{ n: number }[]>`select count(*)::int as n from code_attempts where at > ${sinceIso}`
      : await sql<{ n: number }[]>`select count(*)::int as n from code_attempts where key = ${key} and at > ${sinceIso}`;
    return row.n;
  },
};
