import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { deleteProject, getProject, updateProject } from "@/lib/store";
import { agentBusy, needsReconcile, reconcileJobs } from "@/agent/jobs";
import { toClientProject, type StudyBrief } from "@/lib/types";
import { audit, agentEvent } from "@/lib/review";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    let project = await getProject(user.id, id);
    if (needsReconcile(project)) project = (await updateProject(user.id, id, (p) => void reconcileJobs(p))).project;
    return Response.json({ project: toClientProject(project), agentBusy: agentBusy(id) });
  });
}

const BRIEF_KEYS: (keyof StudyBrief)[] = [
  "productName",
  "productContext",
  "featureDescription",
  "featureStage",
  "decisionToSupport",
  "researchQuestions",
  "targetUsers",
  "additionalContext",
];

export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { name?: string; brief?: Partial<StudyBrief> };
    const { project } = await updateProject(user.id, id, (p) => {
      if (typeof body.name === "string" && body.name.trim()) p.name = body.name.trim().slice(0, 120);
      if (body.brief) {
        const changed: string[] = [];
        for (const k of BRIEF_KEYS) {
          if (!(k in body.brief)) continue;
          const v = body.brief[k];
          if (k === "researchQuestions") {
            if (!Array.isArray(v)) throw new UserFacingError("Research questions must be a list.");
            p.brief.researchQuestions = (v as string[]).map((q) => String(q).trim()).filter(Boolean).slice(0, 12);
          } else if (k === "featureStage") {
            if (v !== null && v !== "idea" && v !== "partially_built") throw new UserFacingError("Invalid feature stage.");
            p.brief.featureStage = v as StudyBrief["featureStage"];
          } else if (k === "decisionToSupport") {
            if (v !== null && v !== "build" && v !== "launch") throw new UserFacingError("Invalid decision.");
            p.brief.decisionToSupport = v as StudyBrief["decisionToSupport"];
          } else {
            (p.brief as unknown as Record<string, unknown>)[k] = typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null;
          }
          changed.push(k);
        }
        if (changed.length) {
          audit(p, "pm", "brief_edited", changed.join(", "));
          agentEvent(p, `PM edited the brief directly (${changed.join(", ")}).`);
        }
      }
    });
    return Response.json({ project: toClientProject(project) });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    await deleteProject(user.id, id);
    return Response.json({ ok: true });
  });
}
