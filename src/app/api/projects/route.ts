import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { createProject, deleteProject, listProjects, newId, now } from "@/lib/store";
import { claimCodeStudy, getCode } from "@/lib/codes";
import { GREETING } from "@/agent/prompts";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return Response.json({ projects: await listProjects(user.id) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { name?: string; acceptedNotice?: boolean };
    const name = (body.name ?? "").trim().slice(0, 120);
    if (!name) throw new UserFacingError("Give the study a name.");
    const alreadyUsed = new UserFacingError("Your code already has a study. Open it from the home page.", 409);
    if (user.codeId && (await getCode(user.codeId))?.projectId) throw alreadyUsed;
    if (user.codeId && body.acceptedNotice !== true) throw new UserFacingError("Read and accept the notes before starting your study.");
    const project = await createProject(user.id, name, (p) => {
      p.chat.push({ id: newId("m"), role: "agent", text: GREETING, at: now(), guardrail: null, actions: [] });
      if (user.codeId) p.audit.push({ at: now(), actor: "pm", type: "pilot_notice_accepted", detail: "simulated findings; no confidential or personal data; organiser can see the study; AI budget" });
    });
    // Two tabs creating at once: only one study sticks to the code.
    if (user.codeId && !(await claimCodeStudy(user.codeId, project.id))) {
      await deleteProject(user.id, project.id);
      throw alreadyUsed;
    }
    return Response.json({ id: project.id });
  });
}
