import { notFound } from "next/navigation";
import { getProject, NotFoundError, resolveShare } from "@/lib/store";
import { approvedVersion } from "@/lib/types";
import { ReportDocument } from "@/components/ReportDocument";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

async function loadSharedReport(token: string) {
  try {
    const share = await resolveShare(token);
    const project = await getProject(share.userId, share.projectId);
    const v = approvedVersion(project.report);
    if (!v || project.report.shareToken !== token) return null;
    return { version: v, approvedAt: project.report.approvedAt };
  } catch (e) {
    if (e instanceof NotFoundError) return null;
    throw e;
  }
}

/** Read-only view of an approved report, for teammates with the link. */
export default async function SharedReportPage({ params }: PageProps<"/share/[token]">) {
  const { token } = await params;
  const shared = await loadSharedReport(token);
  if (!shared) notFound();
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="no-print mb-4 text-xs text-slate-500">Shared read-only from {APP_NAME}</p>
      <ReportDocument report={shared.version.data} version={shared.version.version} approvedAt={shared.approvedAt} />
    </main>
  );
}
