import Anthropic from "@anthropic-ai/sdk";
import { NotFoundError } from "./store";
import { UnauthorizedError, UserFacingError } from "./errors";

export { UserFacingError };

export function describeLlmError(e: unknown): string | null {
  if (e instanceof Anthropic.AuthenticationError)
    return "The Anthropic API key is missing or invalid. Add ANTHROPIC_API_KEY to .env.local and restart the server.";
  if (e instanceof Anthropic.RateLimitError) return "The AI service is rate-limited right now. Please wait a moment and try again.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Check your network connection.";
  if (e instanceof Anthropic.APIError) return `AI service error (${e.status ?? "unknown"}): ${e.message}`;
  if (e instanceof Anthropic.AnthropicError && /api key|auth/i.test(e.message))
    return "No Anthropic credentials found. Add ANTHROPIC_API_KEY to .env.local and restart the server.";
  return null;
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: e.message }, { status: 401 });
    if (e instanceof NotFoundError) return Response.json({ error: "Not found" }, { status: 404 });
    if (e instanceof UserFacingError)
      return Response.json({ error: e.message, details: e.details }, { status: e.status });
    const llm = describeLlmError(e);
    if (llm) return Response.json({ error: llm }, { status: 502 });
    console.error(e);
    return Response.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
