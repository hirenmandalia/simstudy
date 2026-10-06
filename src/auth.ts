import crypto from "crypto";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

/**
 * Google sign-in for real use. When Google OAuth isn't configured (or
 * ENABLE_DEV_LOGIN=true) a "Demo PM" login is available in development only,
 * so the prototype can be run locally without OAuth credentials.
 */
export const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
export const devLoginEnabled =
  process.env.NODE_ENV !== "production" &&
  (process.env.ENABLE_DEV_LOGIN === "true" || (!googleConfigured && process.env.ENABLE_DEV_LOGIN !== "false"));

const providers: NextAuthConfig["providers"] = [];
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
      if (account && user) {
        token.uid = storageId(account.provider, account.providerAccountId ?? user.id ?? "unknown");
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
});
