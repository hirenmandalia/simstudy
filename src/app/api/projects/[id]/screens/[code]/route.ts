import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { deleteUpload, getProject, readUpload, updateProject } from "@/lib/store";
import { agentEvent, assertNotRunning, audit, withdrawDesignApproval } from "@/lib/review";
import { toClientProject } from "@/lib/types";
import { NotFoundError } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/screens/[code]">) {
  return handle(async () => {
    const user = await requireUser();
    const { id, code } = await ctx.params;
    const project = await getProject(user.id, id);
    const screen = project.screens.find((s) => s.code === code);
    if (!screen) throw new NotFoundError("Not found");
    const data = await readUpload(user.id, id, screen.fileName);
    return new Response(new Uint8Array(data), {
      headers: { "content-type": screen.mediaType, "cache-control": "private, max-age=3600" },
    });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]/screens/[code]">) {
  return handle(async () => {
    const user = await requireUser();
    const { id, code } = await ctx.params;
    const { project, result: fileName } = await updateProject(user.id, id, (p) => {
      assertNotRunning(p);
      const idx = p.screens.findIndex((s) => s.code === code);
      if (idx < 0) throw new UserFacingError(`Unknown screen ${code}`, 404);
      const [removed] = p.screens.splice(idx, 1);
      audit(p, "pm", "screen_deleted", code);
      agentEvent(p, `PM deleted screen ${code}.`);
      withdrawDesignApproval(p, `Screen ${code} was removed after the design was approved.`);
      return removed.fileName;
    });
    await deleteUpload(user.id, id, fileName);
    return Response.json({ project: toClientProject(project) });
  });
}
