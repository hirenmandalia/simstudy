import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { updateProject } from "@/lib/store";
import { addDesignVersion, agentEvent, approveDesign, notice, rejectDesign } from "@/lib/review";
import { StudyDesignInput } from "@/lib/schemas";
import { checkDesign } from "@/lib/gates";
import { toClientProject } from "@/lib/types";

/** PM edit: saves a new design version (pending review). */
export async function PUT(req: Request, ctx: RouteContext<"/api/projects/[id]/design">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { data: unknown; note?: string };
    const parsed = StudyDesignInput.safeParse(body.data);
    if (!parsed.success)
      throw new UserFacingError("The design has invalid fields.", 400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    const { project, result } = await updateProject(user.id, id, (p) => {
      const version = addDesignVersion(p, parsed.data, "pm", body.note?.trim() || null);
      notice(p, `You saved study design v${version}. Review and approve it when ready.`);
      agentEvent(p, `PM edited the study design, creating v${version}${body.note ? ` (note: ${body.note})` : ""}.`);
      return checkDesign(parsed.data, p);
    });
    return Response.json({ project: toClientProject(project), check: result });
  });
}

/** Review actions: approve | reject. */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/design">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { action?: string; reason?: string };
    const { project } = await updateProject(user.id, id, (p) => {
      if (body.action === "approve") approveDesign(p);
      else if (body.action === "reject") rejectDesign(p, (body.reason ?? "").trim());
      else throw new UserFacingError("Unknown action.");
    });
    return Response.json({ project: toClientProject(project) });
  });
}
