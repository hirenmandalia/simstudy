import { z } from "zod";
import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { now, updateProject } from "@/lib/store";
import { audit } from "@/lib/review";
import { toClientProject } from "@/lib/types";

const Feedback = z.object({
  usefulness: z.number().int().min(1).max(5),
  trust: z.number().int().min(1).max(5),
  realUsers: z.enum(["yes", "no", "already"]).nullable(),
  comment: z.string().max(4000).nullable(),
});

/** The PM rates the approved report. Each submission is kept; the newest is current. */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/feedback">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const parsed = Feedback.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new UserFacingError("Rate both questions from 1 to 5.");
    const { project } = await updateProject(user.id, id, (p) => {
      if (p.report.status !== "approved" || p.report.approvedVersion === null)
        throw new UserFacingError("Approve the report before rating it.", 409);
      const f = { ...parsed.data, comment: parsed.data.comment?.trim() || null };
      (p.feedback ??= []).push({ at: now(), reportVersion: p.report.approvedVersion, ...f });
      audit(p, "pm", "feedback_given", `usefulness ${f.usefulness}/5, trust ${f.trust}/5, real users: ${f.realUsers ?? "n/a"}`);
    });
    return Response.json({ project: toClientProject(project) });
  });
}
