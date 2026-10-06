import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getProject } from "@/lib/store";
import { startRun } from "@/agent/run";
import { toClientProject } from "@/lib/types";

/** The PM explicitly starts the approved study from the Run screen. */
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/run">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const outcome = await startRun(user.id, id, "Run screen button");
    if (!outcome.started) throw new UserFacingError("The study can't start yet.", 409, outcome.blockers);
    return Response.json({ project: toClientProject(await getProject(user.id, id)) });
  });
}
