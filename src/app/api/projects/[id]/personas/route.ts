import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { updateProject } from "@/lib/store";
import { addPersonaVersion, agentEvent, approvePersonas, notice, rejectPersonas } from "@/lib/review";
import { PersonaSetInput } from "@/lib/schemas";
import { checkPersonas } from "@/lib/gates";
import { toClientProject } from "@/lib/types";

/** PM edit: saves a new persona-set version (pending review). */
export async function PUT(req: Request, ctx: RouteContext<"/api/projects/[id]/personas">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { data: unknown; note?: string };
    const parsed = PersonaSetInput.safeParse(body.data);
    if (!parsed.success)
      throw new UserFacingError("The personas have invalid fields.", 400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    const { project, result } = await updateProject(user.id, id, (p) => {
      if (!p.design.versions.length) throw new UserFacingError("Create a study design before personas.");
      const version = addPersonaVersion(p, parsed.data, "pm", body.note?.trim() || null);
      notice(p, `You saved personas v${version}. Review and approve them when ready.`);
      agentEvent(p, `PM edited the personas, creating v${version}${body.note ? ` (note: ${body.note})` : ""}.`);
      return checkPersonas(parsed.data, p);
    });
    return Response.json({ project: toClientProject(project), check: result });
  });
}

/** Review actions: approve | reject. */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/personas">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { action?: string; reason?: string };
    const { project } = await updateProject(user.id, id, (p) => {
      if (body.action === "approve") approvePersonas(p);
      else if (body.action === "reject") rejectPersonas(p, (body.reason ?? "").trim());
      else throw new UserFacingError("Unknown action.");
    });
    return Response.json({ project: toClientProject(project) });
  });
}
