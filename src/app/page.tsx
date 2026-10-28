import { redirect } from "next/navigation";
import { signIn, googleConfigured, devLoginEnabled } from "@/auth";
import { currentUser } from "@/lib/session";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { enterCode } from "./actions";

const CODE_ERRORS: Record<string, string> = {
  invalid: "That code isn't valid. Check it and try again.",
  rate_limited: "Too many attempts. Wait 15 minutes and try again.",
  expired: "This code has expired. Ask the person who gave it to you for a new one.",
  disabled: "This code has been switched off. Ask the person who gave it to you.",
  used: "This code's study was deleted, so the code is used up. Ask the person who gave it to you for a new one.",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  if (await currentUser()) redirect("/projects");
  const { error, deleted } = await searchParams;
  const errorText = typeof error === "string" ? CODE_ERRORS[error] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <div className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">{APP_NAME}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">{APP_TAGLINE}</h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Describe your feature, approve a study plan and AI personas, and get a decision-ready report in minutes instead of two
            weeks. You approve every step, and the build or launch decision stays yours.
          </p>
          <ol className="mt-8 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
            {[
              ["1", "Interview", "The agent asks about your feature, decision and users"],
              ["2", "Approve the plan", "Review the study design and personas"],
              ["3", "Run", "AI personas discuss your concept and screens in a focus group"],
              ["4", "Decide", "Review, edit and approve the report, then share it"],
            ].map(([n, t, d]) => (
              <li key={n} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{n}</span>
                <span>
                  <span className="block font-medium">{t}</span>
                  <span className="text-slate-500">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Start my study</h2>
          <p className="mt-1 text-sm text-slate-500">
            Enter your activation code. It opens your own private study; enter it again any time, on any device, to continue
            where you left off.
          </p>
          {deleted === "1" && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Your study was deleted.</p>}
          <form action={enterCode} className="mt-5 space-y-3">
            <label htmlFor="code" className="block text-sm font-medium text-slate-700">
              Activation code
            </label>
            <input
              id="code"
              name="code"
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="SIM-XXXX-XXXX"
              maxLength={20}
              aria-invalid={Boolean(errorText)}
              aria-describedby={errorText ? "code-error" : undefined}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-base tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {errorText && (
              <p id="code-error" role="alert" className="text-sm text-rose-600">
                {errorText}
              </p>
            )}
            <button className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">Start my study</button>
          </form>
          <div className="mt-6 space-y-3">
            {googleConfigured && (
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: "/projects" });
                }}
              >
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-slate-50">
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                  </svg>
                  Continue with Google
                </button>
              </form>
            )}
            {devLoginEnabled && (
              <form
                action={async () => {
                  "use server";
                  await signIn("dev", { redirectTo: "/projects" });
                }}
              >
                <button className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
                  Continue as Demo PM
                </button>
                <p className="mt-2 text-xs text-slate-400">Local development only. Configure Google OAuth to disable.</p>
              </form>
            )}
          </div>
          <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            All study output is AI-generated simulated research. Use public, redacted, demo-safe screens only. Never upload private
            company data or real user data.
          </p>
        </div>
      </div>
    </main>
  );
}
