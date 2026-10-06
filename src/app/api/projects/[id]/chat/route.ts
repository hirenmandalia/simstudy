import { handle } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { runMasterTurn } from "@/agent/master";

export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/chat">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { text } = (await req.json()) as { text?: string };
    const outcome = await runMasterTurn(user.id, id, String(text ?? ""));
    return Response.json({ message: outcome.message });
  });
}
