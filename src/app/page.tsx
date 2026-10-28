import { redirect } from "next/navigation";
import { signIn, googleConfigured, devLoginEnabled } from "@/auth";
import { currentUser } from "@/lib/session";
import { APP_NAME } from "@/lib/brand";
import { DEFAULT_CAP_USD, DEFAULT_VALID_DAYS } from "@/lib/codes";
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
    <div className="bg-paper text-slate-900">
      <Nav />
      <main>
        <Hero errorText={errorText} deleted={deleted === "1"} />
        <ProductPreview />
        <HowItWorks />
        <WhatYouGet />
        <HonestLimits />
        <YourPilot />
        <Faq />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  );
}

// --- layout pieces -------------------------------------------------------------

function Logo() {
  return (
    <span className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-white">S</span>
      {APP_NAME}
    </span>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-900/5 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <a href="#top" aria-label={`${APP_NAME} home`}>
          <Logo />
        </a>
        <nav className="hidden flex-1 items-center gap-6 text-sm text-slate-600 md:flex" aria-label="Sections">
          <a href="#how" className="hover:text-slate-900">How it works</a>
          <a href="#report" className="hover:text-slate-900">The report</a>
          <a href="#limits" className="hover:text-slate-900">What it isn&apos;t</a>
          <a href="#pilot" className="hover:text-slate-900">Your pilot</a>
          <a href="#faq" className="hover:text-slate-900">FAQ</a>
        </nav>
        <a
          href="#start"
          className="ml-auto rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 md:ml-0"
        >
          Enter your code
        </a>
      </div>
    </header>
  );
}

function Section({ id, eyebrow, title, intro, children, className = "" }: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 px-4 py-20 sm:px-6 md:py-28 ${className}`}>
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        <h2 className="mt-3 max-w-3xl font-display text-4xl leading-[1.08] tracking-tight md:text-5xl">{title}</h2>
        {intro && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{intro}</p>}
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

// --- hero + code entry -----------------------------------------------------------

function Hero({ errorText, deleted }: { errorText?: string; deleted: boolean }) {
  return (
    <section id="top" className="relative overflow-hidden px-4 pb-16 pt-14 sm:px-6 md:pb-24 md:pt-20">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(79,70,229,0.13),transparent)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Private pilot · by invitation
          </p>
          <h1 className="mt-6 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Hear users react to your feature <em className="text-accent">before</em> you build it.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            {APP_NAME} runs a simulated focus group on your concept and screens. AI personas who match your target users discuss
            it, push back and disagree; you get a decision-ready report the same day, not two weeks later.
          </p>
          <ul className="mt-8 grid max-w-xl gap-3 text-sm text-slate-700 sm:grid-cols-3">
            {["You approve every step", "Quotes checked against the transcript", "The decision stays yours"].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <CodeCard errorText={errorText} deleted={deleted} />
      </div>
    </section>
  );
}

function CodeCard({ errorText, deleted }: { errorText?: string; deleted: boolean }) {
  return (
    <div id="start" className="scroll-mt-24 rounded-3xl border border-slate-900/10 bg-white p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight">Start my study</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Enter the activation code you were given. It opens your own private study. Enter it again any time, on any device, to
        pick up where you left off.
      </p>
      {deleted && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Your study was deleted.</p>}
      <form action={enterCode} className="mt-6 space-y-3">
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
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono text-base tracking-[0.12em] uppercase placeholder:tracking-[0.12em] placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
        />
        {errorText && (
          <p id="code-error" role="alert" className="text-sm text-rose-600">
            {errorText}
          </p>
        )}
        <button className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/30">
          Start my study →
        </button>
      </form>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        No code? This is a small invite-only pilot. Ask the person who shared this page with you.
      </p>
      <OtherSignIn />
    </div>
  );
}

/** Development and optional Google sign-in; neither appears on the hosted pilot. */
function OtherSignIn() {
  if (!googleConfigured && !devLoginEnabled) return null;
  return (
    <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
      {googleConfigured && (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/projects" });
          }}
        >
          <button className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">
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
          <button className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700">
            Continue as Demo PM
          </button>
          <p className="mt-2 text-xs text-slate-400">Local development only.</p>
        </form>
      )}
    </div>
  );
}

// --- product preview -----------------------------------------------------------------

const TRANSCRIPT = [
  { who: "Moderator", tag: "Q2", text: "What would make you trust a trip summary the app writes for you?", moderator: true },
  { who: "Dana · frequent flyer", text: "If it pulls my bookings in automatically, great. If I have to type anything, I'm out." },
  { who: "Marco · sceptic", text: "I'd need to see where every line came from. One wrong hotel and I stop trusting all of it." },
  { who: "Ana · plans for family", text: "Marco's right about accuracy, but I'd forgive a mistake if I could fix it in one tap." },
];

function ProductPreview() {
  return (
    <section aria-label="Example of a study" className="px-4 sm:px-6">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-slate-900/10 bg-paper-deep p-3 sm:p-5">
        <div className="grid gap-3 sm:gap-5 lg:grid-cols-[1.3fr_1fr]">
          <figure className="rounded-2xl border border-slate-900/5 bg-white p-5 sm:p-6">
            <figcaption className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium text-slate-700">Focus group</span>
              <span className="whitespace-nowrap rounded-full bg-sim-soft px-2 py-0.5 font-medium text-sim">Simulated · 6 AI personas</span>
            </figcaption>
            <ol className="mt-5 space-y-4">
              {TRANSCRIPT.map((l) => (
                <li key={l.who} className="flex gap-3">
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${l.moderator ? "bg-slate-900 text-white" : "bg-accent-soft text-accent"}`}
                  >
                    {l.who[0]}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">
                      {l.who}
                      {l.tag && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{l.tag}</span>}
                    </p>
                    <p className={`mt-1 text-[15px] leading-relaxed ${l.moderator ? "font-medium text-slate-900" : "text-slate-700"}`}>{l.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </figure>
          <figure className="flex flex-col rounded-2xl border border-slate-900/5 bg-white p-5 sm:p-6">
            <figcaption className="text-xs font-medium text-slate-700">Report · finding for RQ2</figcaption>
            <p className="mt-4 font-display text-2xl leading-snug">Accuracy decides trust, and one visible error undoes it.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">Medium confidence</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">4 of 6 personas</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">1 disagreed</span>
            </div>
            <blockquote className="mt-5 border-l-2 border-accent pl-4 text-sm leading-relaxed text-slate-700">
              “One wrong hotel and I stop trusting all of it.”
              <footer className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                <Check small /> Found word for word in the transcript
              </footer>
            </blockquote>
            <p className="mt-auto pt-5 text-xs text-slate-500">
              Recommendation: show the source of every itinerary line. <span className="text-slate-400">Validate with real users.</span>
            </p>
          </figure>
        </div>
      </div>
      <p className="mx-auto mt-3 max-w-6xl px-2 text-xs text-slate-500">Illustration of a study with fictional personas.</p>
    </section>
  );
}

// --- how it works ------------------------------------------------------------------

const STEPS = [
  {
    title: "Interview",
    body: "The study agent asks about your product, the feature, the build-or-launch decision you face and who your users are. Add demo-safe screenshots if you have them.",
    you: "You answer",
  },
  {
    title: "Approve the plan",
    body: "It proposes research questions, a discussion guide and a set of fictional personas that match your users. Edit anything; nothing runs until you approve.",
    you: "You approve",
  },
  {
    title: "Run the focus group",
    body: "A moderator walks the personas through your guide. They answer in turn, follow up on each other, and disagree when their profiles would.",
    you: "You start it",
  },
  {
    title: "Review and decide",
    body: "The agent turns the transcript into a report. Request changes, edit, then approve it. Download or share it only after you approve.",
    you: "You decide",
  },
];

function HowItWorks() {
  return (
    <Section
      id="how"
      eyebrow="How it works"
      title="Four steps. You sign off on each one."
      intro="The agent does the research legwork. You stay in charge of what gets asked, who is in the room and what the findings mean."
    >
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col rounded-2xl border border-slate-900/10 bg-white p-6">
            <span className="font-display text-4xl text-accent">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{s.body}</p>
            <p className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
              <Check small /> {s.you}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// --- what you get ------------------------------------------------------------------

const REPORT_FEATURES = [
  ["An answer per research question", "Each with a confidence level and how many personas it rests on, so thin evidence looks thin."],
  ["Quotes you can check", "Every quote is matched word for word against the transcript. Anything that doesn't match is flagged."],
  ["Disagreement kept in", "Minority views and contradictions stay in the report instead of being averaged away."],
  ["Recommendations with a next step", "Design and content changes, plus what to validate with real users before you commit."],
  ["Limitations, stated plainly", "The report says it is simulated and where the method is weakest for your questions."],
  ["The full transcript", "Read the whole discussion, export the approved report, or share it with a read-only link."],
];

function WhatYouGet() {
  return (
    <Section
      id="report"
      eyebrow="The report"
      title={
        <>
          Written for a decision, <span className="italic text-slate-500">not a slide.</span>
        </>
      }
      intro="You get evidence you can trace, not a confident summary you have to take on faith."
      className="bg-white"
    >
      <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_FEATURES.map(([t, d]) => (
          <div key={t} className="border-t border-slate-200 pt-5">
            <dt className="font-semibold">{t}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-slate-600">{d}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

// --- honest limits -------------------------------------------------------------------

function HonestLimits() {
  return (
    <Section
      id="limits"
      eyebrow="What it isn't"
      title="A fast first read, not a replacement for real users."
      intro="AI personas are fictional. They can surface likely reactions, objections and confusion early and cheaply. They can't tell you what real people will actually do."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-900/10 bg-emerald-50/60 p-6 sm:p-8">
          <h3 className="font-semibold text-emerald-900">Good for</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-emerald-950/80">
            {[
              "Pressure-testing a concept before you spend design or engineering time",
              "Finding the objections and confusing moments worth testing with real users",
              "Sharpening your research questions and discussion guide",
              "Getting a structured second opinion when there's no time or budget for research",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Check /> <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-900/10 bg-white p-6 sm:p-8">
          <h3 className="font-semibold">Not for</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
            {[
              "Replacing interviews or tests with real users",
              "Measuring whether people can complete a task (usability testing)",
              "Numbers you'd quote as market evidence",
              "Making the build or launch call for you",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Cross /> <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

// --- the pilot -----------------------------------------------------------------------

function YourPilot() {
  const facts = [
    ["One code, one study", "Your code opens a single private study. Come back with the same code to continue."],
    [`$${DEFAULT_CAP_USD} of AI included`, "AI costs are covered by the pilot. The study shows how much of its budget it has used."],
    [`${DEFAULT_VALID_DAYS} days to use it`, "Codes expire after that. Delete your study whenever you like; that uses the code up."],
  ];
  return (
    <Section
      id="pilot"
      eyebrow="Your pilot"
      title="What to have ready."
      intro="Plan on about an hour of your time across the interview and reviews. The focus group itself runs on its own while you wait."
      className="bg-white"
    >
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
        <ul className="space-y-5">
          {[
            ["A feature you're deciding on", "A new idea or something partly built, and whether the decision is to build it or launch it."],
            ["Who it's for", "A sentence or two on your target users. The personas are built from this."],
            ["Screens, if you have them", "Up to 20 screenshots or mock-ups. They must be public or demo-safe, with any personal data removed. A concept described in words works too."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 text-sm font-medium text-slate-600">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{d}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
          <dl className="space-y-6">
            {facts.map(([t, d]) => (
              <div key={t}>
                <dt className="font-display text-2xl">{t}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-300">{d}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 border-t border-white/10 pt-5 text-xs leading-relaxed text-slate-400">
            Don&apos;t upload confidential company material or real people&apos;s data. The pilot&apos;s organiser can see studies in
            order to support you and fix problems.
          </p>
        </div>
      </div>
    </Section>
  );
}

// --- FAQ -------------------------------------------------------------------------------

const FAQ = [
  [
    "Are the participants real people?",
    "No. They are AI personas built from your description of your users, and everything they say is generated. The report labels itself as simulated research throughout.",
  ],
  [
    "Can I stop and come back later?",
    "Yes. Your study saves as you go. Enter the same code on any device to continue where you left off.",
  ],
  [
    "Do I need screenshots?",
    "No, but they help. Personas react to what's on the screens; without them they discuss the concept as you describe it.",
  ],
  [
    "Who can see my study?",
    "Only you, through your code, and the pilot's organiser. A report is shared further only if you approve it and create a read-only link.",
  ],
  [
    "What happens when the AI budget runs out?",
    "The study stops doing new AI work, and everything already produced stays available to read and download. If you need more, ask whoever gave you the code.",
  ],
  [
    "Why can't it run a usability test?",
    "In our own testing, AI personas wouldn't genuinely attempt tasks on static screens, so there was nothing trustworthy to report. When one of your questions needs a usability test, the plan says so and recommends testing it with real users.",
  ],
];

function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions you might have.">
      <div className="divide-y divide-slate-900/10 border-y border-slate-900/10">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left font-medium [&::-webkit-details-marker]:hidden">
              {q}
              <span aria-hidden className="text-xl leading-none text-slate-400 transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

// --- closing -------------------------------------------------------------------------

function ClosingCta() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-[2rem] bg-accent px-6 py-12 text-white sm:px-12 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-4xl leading-tight md:text-5xl">Have your code?</h2>
          <p className="mt-2 text-indigo-100">Your first study is about an hour away.</p>
        </div>
        <a href="#start" className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-accent transition hover:bg-indigo-50">
          Start my study →
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-900/10 px-4 py-8 text-xs text-slate-500 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <p>All study output is AI-generated simulated research. Use public, demo-safe screens only.</p>
      </div>
    </footer>
  );
}

// --- icons ---------------------------------------------------------------------------

function Check({ small = false }: { small?: boolean }) {
  const s = small ? 12 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden className={`${small ? "" : "mt-0.5"} shrink-0 text-emerald-600`}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="mt-0.5 shrink-0 text-slate-400">
      <path d="M4.5 4.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
