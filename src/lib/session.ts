import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UnauthorizedError } from "./errors";
import { activeCodeFor } from "./codes";

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  /** Set when the user came in with an activation code (the code's id, also the user id). */
  codeId: string | null;
}

/**
 * The signed-in user. A code user stops being signed in as soon as their code
 * is disabled, expires or its study is deleted.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  const codeId = (u as { codeId?: string }).codeId ?? null;
  if (codeId && !(await activeCodeFor(codeId))) return null;
  return { id: u.id, name: u.name ?? "Product manager", email: u.email ?? null, image: u.image ?? null, codeId };
}

/** For route handlers: throws, mapped to 401 by `handle()`. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new UnauthorizedError("Sign in required");
  return u;
}

/** For pages: redirects to the landing page. */
export async function requirePageUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/");
  return u;
}
