import { requirePageUser } from "@/lib/session";
import { listProjects } from "@/lib/store";
import { AppHeader } from "@/components/AppHeader";
import { ProjectList } from "@/components/ProjectList";

export default async function ProjectsPage() {
  const user = await requirePageUser();
  const projects = await listProjects(user.id);
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your studies</h1>
        <p className="mt-1 text-sm text-slate-500">One project per simulated study. Each project keeps its inputs, approvals, transcript and report together, separate from your other projects.</p>
        <ProjectList initial={projects} />
      </main>
    </>
  );
}
