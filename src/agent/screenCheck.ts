import { completeStructured, imageBlock, MODELS, RefusalError } from "./llm";
import { SCREEN_CHECK_SYSTEM } from "./prompts";
import { ScreenCheck } from "@/lib/schemas";
import type { Screen, UsageTotals } from "@/lib/types";

export type ScreenCheckResult = ScreenCheck & { status: Screen["screenCheck"] };

/** Describe an uploaded screen and flag possible PII or inappropriate content. */
export async function checkScreen(
  data: Buffer,
  mediaType: Screen["mediaType"],
  label: string,
  usage?: UsageTotals,
): Promise<ScreenCheckResult> {
  try {
    const { data: result } = await completeStructured(
      {
        model: MODELS.utility,
        max_tokens: 3000,
        output_config: { effort: "low" },
        system: SCREEN_CHECK_SYSTEM,
        messages: [
          {
            role: "user",
            content: [imageBlock(data, mediaType), { type: "text", text: `PM's label for this screen: "${label}"` }],
          },
        ],
      },
      ScreenCheck,
      { usage, fallbacks: false },
    );
    return { ...result, status: result.piiConcerns.length || result.inappropriate ? "flagged" : "passed" };
  } catch (e) {
    if (e instanceof RefusalError)
      return {
        description: "",
        piiConcerns: [],
        inappropriate: true,
        inappropriateReason: "The image was declined by the model's safety system.",
        status: "flagged",
      };
    // AI unavailable (no key, network): keep the upload but require PM review.
    console.warn("screen check unavailable:", (e as Error).message);
    return {
      description: "",
      piiConcerns: ["Automatic screen check was unavailable. Please confirm this screen contains no real personal data."],
      inappropriate: false,
      inappropriateReason: null,
      status: "unavailable",
    };
  }
}
