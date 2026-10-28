import crypto from "crypto";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { verifyCodeForSignIn } from "@/lib/codes";

/**
 * Activation codes are the way in for the hosted pilot: the code's id becomes
 * the user id, so the same code reaches the same study from any browser. The
 * landing page's server action rate-limits entries before calling signIn.
 * Google sign-in works when configured. When it isn't (or ENABLE_DEV_LOGIN=true)
 * a "Demo PM" login is available in development only.
 */
export const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
export const devLoginEnabled =
  process.env.NODE_ENV !== "production" &&
  (process.env.ENABLE_DEV_LOGIN === "true" || (!googleConfigured && process.env.ENABLE_DEV_LOGIN !== "false"));

const providers: NextAuthConfig["providers"] = [
  Credentials({
    id: "code",
    name: "Activation code",
    credentials: { code: {} },
    authorize: async (credentials) => {
      const code = await verifyCodeForSignIn(String(credentials?.code ?? ""));
      return code ? { id: code.id, name: "Your study" } : null;
    },
  }),
];
if (googleConfigured) providers.push(Google);
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Demo PM (local development only)",
      credentials: {},
      authorize: async () => ({ id: "demo-pm", name: "Demo PM", email: "demo-pm@example.test" }),
    }),
  );
}

/** Path-safe, stable storage id derived from the identity provider's account id. */
function storageId(provider: string, accountId: string) {
  return "u" + crypto.createHash("sha256").update(`${provider}:${accountId}`).digest("hex").slice(0, 24);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/" },
  callbacks: {
    jwt({ token, user, account }) {
      if (account?.provider === "code" && user?.id) {
        token.uid = user.id;
        token.codeId = user.id;
      } else if (account && user) {
        token.uid = storageId(account.provider, account.providerAccountId ?? user.id ?? "unknown");
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      if (session.user && typeof token.codeId === "string") (session.user as { codeId?: string }).codeId = token.codeId;
      return session;
    },
  },
});
