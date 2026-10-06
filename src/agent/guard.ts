import { completeStructured, MODELS, RefusalError } from "./llm";
import { GUARD_SYSTEM } from "./prompts";
import { GuardVerdict } from "@/lib/schemas";
import type { UsageTotals } from "@/lib/types";

/**
 * Pre-classifies a PM chat message before the master agent sees it.
 * Inappropriate content is blocked outright, so prohibited material never
 * reaches the master agent or persona agents. Other categories pass through
 * with a hint the master agent can use.
 */
export async function classifyMessage(text: string, usage?: UsageTotals): Promise<GuardVerdict> {
  if (process.env.DISABLE_GUARD === "true") return { category: "in_scope", block: false, reason: "guard disabled" };
  try {
    const { data } = await completeStructured(
      {
        model: MODELS.utility,
        max_tokens: 2000,
        output_config: { effort: "low" },
        system: GUARD_SYSTEM,
        messages: [{ role: "user", content: `<message>\n${text}\n</message>` }],
      },
      GuardVerdict,
      { usage, fallbacks: false },
    );
    // Only inappropriate content may block.
    return { ...data, block: data.category === "inappropriate_content" };
  } catch (e) {
    if (e instanceof RefusalError)
      return { category: "inappropriate_content", block: true, reason: "The message was declined by the model's safety system." };
    throw e;
  }
}
