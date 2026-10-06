import { handle, UserFacingError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { getProject } from "@/lib/store";
import { approvedVersion } from "@/lib/types";
import { reportToMarkdown } from "@/lib/exportReport";

/** Download the approved report as Markdown. */
export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/report/export">) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const project = await getProject(user.id, id);
    const v = approvedVersion(project.report);
    if (!v) throw new UserFacingError("Approve the report before downloading it.", 409);
    const md = reportToMarkdown(v.data, { version: v.version, approvedAt: project.report.approvedAt });
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
    return new Response(md, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${slug}-simulated-research-v${v.version}.md"`,
      },
    });
  });
}
