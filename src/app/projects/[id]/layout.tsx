import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { getProject, NotFoundError } from "@/lib/store";
import { toClientProject } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { ProjectShell } from "@/components/ProjectShell";
import { DeleteStudyButton } from "@/components/DeleteStudyButton";
import { budgetCapFor, projectSpendUsd } from "@/lib/budget";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;
  let project;
  try {
    project = await getProject(user.id, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const cap = await budgetCapFor(user.id);
  return (
    <div className="print-flow flex h-screen flex-col">
      <AppHeader user={user}>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden min-w-0 truncate text-slate-500 md:block">/ {project.name}</span>
          {cap !== null && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600" title="AI cost of this study so far, at list prices">
              AI budget: ${projectSpendUsd(project).toFixed(2)} of ${cap.toFixed(2)}
            </span>
          )}
          {user.codeId && <DeleteStudyButton projectId={project.id} name={project.name} />}
        </div>
      </AppHeader>
      <ProjectShell initial={toClientProject(project)}>{children}</ProjectShell>
    </div>
  );
}
