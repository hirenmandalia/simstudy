import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { getProject, NotFoundError } from "@/lib/store";
import { toClientProject } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { ProjectShell } from "@/components/ProjectShell";

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
  return (
    <div className="flex h-screen flex-col">
      <AppHeader user={user}>
        <span className="hidden truncate text-sm text-slate-500 md:block">/ {project.name}</span>
      </AppHeader>
      <ProjectShell initial={toClientProject(project)}>{children}</ProjectShell>
    </div>
  );
}
