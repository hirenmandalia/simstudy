import crypto from "crypto";
import { backend, newId, now, type AccessCode } from "./store";

/**
 * Activation codes for the hosted pilot. A code (SIM-XXXX-XXXX) opens exactly
 * one study; entering it again on any browser resumes that study. Only a hash
 * is stored. Wrong entries are rate-limited per IP and overall.
 */

// 32 symbols without 0/O/1/I, so one random byte maps to one symbol without bias.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

export const DEFAULT_CAP_USD = 10;
export const DEFAULT_VALID_DAYS = 60;

const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_IP = 8;
const MAX_FAILURES_TOTAL = 200;

export type CodeStatus = "active" | "disabled" | "expired" | "used";
export type CodeLoginFailure = "invalid" | "rate_limited" | Exclude<CodeStatus, "active">;

export function generateCode(): string {
  const chars = [...crypto.randomBytes(CODE_LENGTH)].map((b) => ALPHABET[b & 31]).join("");
  return `SIM-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Accepts any case, spacing or dashes, with or without the SIM prefix. */
export function normalizeCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === CODE_LENGTH + 3 && s.startsWith("SIM")) s = s.slice(3);
  if (s.length !== CODE_LENGTH || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return s;
}

export function hashCode(normalized: string): string {
  return crypto.createHash("sha256").update(`simstudy-code-v1:${normalized}`).digest("hex");
}

export function codeStatus(c: AccessCode, at = new Date()): CodeStatus {
  if (c.disabledAt) return "disabled";
  if (c.studyDeletedAt) return "used";
  if (new Date(c.expiresAt) <= at) return "expired";
  return "active";
}

export async function createAccessCode(opts: { label?: string | null; capUsd?: number; days?: number } = {}) {
  const code = generateCode();
  const created = new Date();
  const record: AccessCode = {
    id: newId("k"),
    hash: hashCode(normalizeCode(code)!),
    label: opts.label?.trim() || null,
    capUsd: opts.capUsd ?? DEFAULT_CAP_USD,
    createdAt: created.toISOString(),
    expiresAt: new Date(created.getTime() + (opts.days ?? DEFAULT_VALID_DAYS) * 86_400_000).toISOString(),
    disabledAt: null,
    lastUsedAt: null,
    projectId: null,
    studyDeletedAt: null,
  };
  await backend().insertCode(record);
  return { code, record };
}

async function findActive(input: string): Promise<AccessCode | null> {
  const normalized = normalizeCode(input);
  const record = normalized ? await backend().findCodeByHash(hashCode(normalized)) : null;
  return record && codeStatus(record) === "active" ? record : null;
}

/**
 * Check a code typed on the landing page. Unknown codes count towards the rate
 * limit; known but unusable codes (expired, disabled, used) say why.
 */
export async function checkCodeEntry(
  input: string,
  clientKey: string,
): Promise<{ ok: true; code: AccessCode } | { ok: false; reason: CodeLoginFailure }> {
  const store = backend();
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
  const [mine, all] = await Promise.all([store.countFailedAttempts(clientKey, since), store.countFailedAttempts(null, since)]);
  if (mine >= MAX_FAILURES_PER_IP || all >= MAX_FAILURES_TOTAL) return { ok: false, reason: "rate_limited" };

  const normalized = normalizeCode(input);
  const record = normalized ? await store.findCodeByHash(hashCode(normalized)) : null;
  if (!record) {
    await store.recordFailedAttempt(clientKey);
    return { ok: false, reason: "invalid" };
  }
  const status = codeStatus(record);
  if (status !== "active") return { ok: false, reason: status };
  await store.updateCode(record.id, { lastUsedAt: now() });
  return { ok: true, code: record };
}

/** For the sign-in provider, after checkCodeEntry passed. */
export async function verifyCodeForSignIn(input: string): Promise<AccessCode | null> {
  return findActive(input);
}

/** The code behind a signed-in user, if it is still usable (null for non-code users). */
export async function activeCodeFor(userId: string): Promise<AccessCode | null> {
  if (!userId.startsWith("k")) return null;
  const record = await backend().getCode(userId);
  return record && codeStatus(record) === "active" ? record : null;
}

export async function getCode(id: string) {
  return backend().getCode(id);
}

export async function listCodes() {
  return backend().listCodes();
}

export async function updateCode(...args: Parameters<ReturnType<typeof backend>["updateCode"]>) {
  return backend().updateCode(...args);
}

export async function claimCodeStudy(id: string, projectId: string) {
  return backend().claimCodeStudy(id, projectId);
}
