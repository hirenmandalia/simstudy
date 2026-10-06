import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { createShare, getProject, removeShare, updateProject } from "@/lib/store";
import { addReportVersion, agentEvent, approveReport, audit, notice, rejectReport } from "@/lib/review";
import { startReportGeneration } from "@/agent/synthesis";
import { ReportDraft } from "@/lib/schemas";
import { currentVersion, toClientProject, type Report } from "@/lib/types";

/** PM edit: saves a new report version (pending review). Quotes keep their verification status. */
export async function PUT(req: Request, ctx: RouteContext<"/api/projects/[id]/report">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { draft: unknown; pmNotes?: string; note?: string };
    const parsed = ReportDraft.safeParse(body.draft);
    if (!parsed.success)
      throw new UserFacingError("The report has invalid fields.", 400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    const { project } = await updateProject(user.id, id, (p) => {
      const cur = currentVersion(p.report);
      if (!cur) throw new UserFacingError("There is no report to edit yet.");
      if (p.report.job.status === "generating") throw new UserFacingError("A report revision is being generated; wait for it to finish.", 409);
      // Quotes can be removed but not rewritten: keep only quotes that exist in the current version.
      const known = new Map<string, boolean>();
      const collect = (d: ReportDraft) =>
        [...d.researchQuestionAnswers.flatMap((a) => a.evidence), ...d.findings.flatMap((f) => f.evidence), ...d.contradictions.flatMap((c) => c.evidence)];
      for (const q of collect(cur.data.draft)) known.set(`${q.lineId}|${q.text}`, (q as { verified?: boolean }).verified !== false);
      const keep = <T extends { evidence: { lineId: string; text: string; personaId: string }[] }>(items: T[]) =>
        items.map((it) => ({
          ...it,
          evidence: it.evidence
            .filter((q) => known.has(`${q.lineId}|${q.text}`))
            .map((q) => ({ ...q, verified: known.get(`${q.lineId}|${q.text}`) })),
        }));
      const draft: ReportDraft = {
        ...parsed.data,
        researchQuestionAnswers: keep(parsed.data.researchQuestionAnswers),
        findings: keep(parsed.data.findings),
        contradictions: keep(parsed.data.contradictions),
      };
      const all = collect(draft);
      const report: Report = {
        ...cur.data,
        draft,
        pmNotes: (body.pmNotes ?? cur.data.pmNotes).slice(0, 8000),
        quoteCheck: { total: all.length, verified: all.filter((q) => (q as { verified?: boolean }).verified !== false).length },
      };
      const version = addReportVersion(p, report, "pm", body.note?.trim() || null);
      notice(p, `You saved report v${version}. Approve it when you're happy with it.`);
      agentEvent(p, `PM edited the report, creating v${version}.`);
    });
    return Response.json({ project: toClientProject(project) });
  });
}

/** Review actions: approve | reject | request_changes | share | unshare. */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/report">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const body = (await req.json()) as { action?: string; reason?: string; instructions?: string };

    if (body.action === "request_changes") {
      const instructions = (body.instructions ?? "").trim();
      if (!instructions) throw new UserFacingError("Describe the changes you want.");
      await updateProject(user.id, id, (p) => {
        audit(p, "pm", "report_changes_requested", instructions);
        agentEvent(p, `PM requested report changes: ${instructions}`);
      });
      const outcome = await startReportGeneration(user.id, id, instructions, "pm");
      if (!outcome.started) throw new UserFacingError(outcome.reason ?? "Couldn't start the revision.", 409);
      return Response.json({ project: toClientProject(await getProject(user.id, id)) });
    }

    if (body.action === "share") {
      const p0 = await getProject(user.id, id);
      if (p0.report.status !== "approved") throw new UserFacingError("Approve the report before sharing it.", 409);
      const token = p0.report.shareToken ?? (await createShare(user.id, id));
      const { project } = await updateProject(user.id, id, (p) => {
        p.report.shareToken = token;
        audit(p, "pm", "report_shared", "read-only link created");
        notice(p, "Read-only share link created for the approved report.");
      });
      return Response.json({ project: toClientProject(project) });
    }

    if (body.action === "unshare") {
      const p0 = await getProject(user.id, id);
      if (p0.report.shareToken) await removeShare(p0.report.shareToken);
      const { project } = await updateProject(user.id, id, (p) => {
        p.report.shareToken = null;
        audit(p, "pm", "report_unshared", "share link revoked");
        notice(p, "Share link revoked.");
      });
      return Response.json({ project: toClientProject(project) });
    }

    const { project } = await updateProject(user.id, id, (p) => {
      if (p.report.job.status === "generating") throw new UserFacingError("A report revision is being generated; wait for it to finish.", 409);
      if (body.action === "approve") approveReport(p);
      else if (body.action === "reject") rejectReport(p, (body.reason ?? "").trim());
      else throw new UserFacingError("Unknown action.");
    });
    // Revoke any share link when the report is no longer approved.
    if (project.report.status !== "approved" && project.report.shareToken) {
      await removeShare(project.report.shareToken);
      const { project: p2 } = await updateProject(user.id, id, (p) => void (p.report.shareToken = null));
      return Response.json({ project: toClientProject(p2) });
    }
    return Response.json({ project: toClientProject(project) });
  });
}
