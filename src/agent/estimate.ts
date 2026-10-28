import { MODELS } from "./llm";
import { priceFor } from "@/lib/pricing";

/**
 * Rough, deliberately cautious cost of one focus-group run plus its report, at
 * list prices for the configured models. It mirrors how executeRun makes its
 * calls (see run.ts): persona replies carry the cached persona instructions and
 * screens plus the growing discussion; the moderator's probes and summary, and
 * one consistency check per persona, use the utility model; the report is one
 * long call on the master model. Token sizes are estimates; recalibrate them
 * against real runs (`npm run codes -- list` shows real spend per study).
 */

const T = {
  screen: 1800, // one resized screenshot
  personaSystem: 2500, // persona card and focus-group instructions
  line: 110, // one transcript line, with speaker label
  personaOutput: 600, // a short reply plus low-effort thinking
  probeInput: 6000, // moderator instructions + guidance + recent lines
  probeOutput: 800,
  checkOutput: 2000, // consistency check per persona
  summaryOutput: 1200,
  reportInput: 12000, // synthesis instructions, knowledge base, design, personas
  reportOutput: 24000, // report JSON plus high-effort thinking
};

/** Cache writes per persona across a run: the first call, plus re-writes after the 5-minute cache expires. */
const CACHE_WRITES_PER_PERSONA = 3;
/** Headroom for everything the token sizes above don't capture. */
const SAFETY = 1.3;

export interface RunEstimate {
  runUsd: number;
  reportUsd: number;
  totalUsd: number;
  calls: number;
}

function usd(model: string, t: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }) {
  const p = priceFor(model) ?? priceFor("claude-opus-5-5")!;
  return ((t.input ?? 0) * p.input + (t.output ?? 0) * p.output + (t.cacheRead ?? 0) * p.cacheRead + (t.cacheWrite ?? 0) * p.cacheWrite) / 1_000_000;
}

export function estimateRunCost({ participants: n, questions: q, screens: s }: { participants: number; questions: number; screens: number }): RunEstimate {
  // Persona calls: opening, per question (everyone + up to 3 probe replies + 1 cross-talk reply), ending, summary check.
  const personaCalls = 3 * n + q * (n + 4);
  const utilityCalls = 2 * q + 1 + n; // probes and cross-talk, moderator summary, consistency checks
  const lines = personaCalls + 3 * q + 3; // persona replies, moderator lines, intro and closing
  const transcript = lines * T.line;
  const cached = T.personaSystem + s * T.screen;

  const persona = usd(MODELS.persona, {
    input: personaCalls * (transcript / 2 + 300), // the discussion so far, on average half the final transcript
    cacheRead: personaCalls * cached,
    cacheWrite: n * CACHE_WRITES_PER_PERSONA * cached,
    output: personaCalls * T.personaOutput,
  });
  const utility =
    usd(MODELS.utility, { input: 2 * q * T.probeInput, output: 2 * q * T.probeOutput }) +
    usd(MODELS.utility, { input: n * (transcript + s * T.screen + 2000), output: n * T.checkOutput }) +
    usd(MODELS.utility, { input: transcript + 2000, output: T.summaryOutput });
  const report = usd(MODELS.master, { input: T.reportInput + transcript + s * T.screen, output: T.reportOutput });

  const runUsd = (persona + utility) * SAFETY;
  const reportUsd = report * SAFETY;
  return { runUsd, reportUsd, totalUsd: runUsd + reportUsd, calls: personaCalls + utilityCalls + 1 };
}
