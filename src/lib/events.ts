import { backend, now } from "./store";
import type { AppEvent } from "./store/shared";

/**
 * Product events for learning from the pilot: what happens outside a study's
 * own record (its audit log covers the study itself). Never stores code text,
 * IP addresses or study content. Best effort: tracking never fails a request.
 */
export async function track(
  kind: string,
  ctx: { codeId?: string | null; projectId?: string | null; detail?: AppEvent["detail"] } = {},
) {
  try {
    await backend().logEvent({ at: now(), kind, codeId: ctx.codeId ?? null, projectId: ctx.projectId ?? null, detail: ctx.detail ?? {} });
  } catch (e) {
    console.error("couldn't record event", kind, e);
  }
}
