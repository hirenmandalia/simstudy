import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { createProject, listProjects } from "@/lib/store";
import { GREETING } from "@/agent/prompts";
import { newId, now } from "@/lib/store";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return Response.json({ projects: await listProjects(user.id) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { name?: string };
    const name = (body.name ?? "").trim().slice(0, 120);
    if (!name) throw new UserFacingError("Give the study a name.");
    const project = await createProject(user.id, name, (p) => {
      p.chat.push({ id: newId("m"), role: "agent", text: GREETING, at: now(), guardrail: null, actions: [] });
    });
    return Response.json({ id: project.id });
  });
}
