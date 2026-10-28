"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { checkCodeEntry } from "@/lib/codes";

/** Landing page: check an activation code (rate-limited), then sign in with it. */
export async function enterCode(formData: FormData) {
  const input = String(formData.get("code") ?? "").slice(0, 64);
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const result = await checkCodeEntry(input, `ip:${ip}`);
  if (!result.ok) redirect(`/?error=${result.reason}`);
  try {
    await signIn("code", { code: input, redirectTo: "/projects" });
  } catch (e) {
    if (e instanceof AuthError) redirect("/?error=invalid");
    throw e;
  }
}
