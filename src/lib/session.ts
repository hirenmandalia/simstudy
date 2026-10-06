import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UnauthorizedError } from "./errors";

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return { id: u.id, name: u.name ?? "Product manager", email: u.email ?? null, image: u.image ?? null };
}

/** For route handlers: throws, mapped to 401 by `handle()`. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new UnauthorizedError("Sign in required");
  return u;
}

/** For pages: redirects to the sign-in page. */
export async function requirePageUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/");
  return u;
}
