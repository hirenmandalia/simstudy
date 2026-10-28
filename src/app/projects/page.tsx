import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { listProjects } from "@/lib/store";
import { getCode } from "@/lib/codes";
import { AppHeader } from "@/components/AppHeader";
import { ProjectList } from "@/components/ProjectList";

export default async function ProjectsPage() {
  const user = await requirePageUser();
  if (user.codeId) {
    // One code, one study: go straight to it once it exists.
    const code = await getCode(user.codeId);
    if (code?.projectId) redirect(`/projects/${code.projectId}`);
  }
  const projects = await listProjects(user.id);
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {user.codeId ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Start your study</h1>
            <p className="mt-1 text-sm text-slate-500">
              Your code gives you one study. Read the notes below, then name it; the study agent will interview you about your
              feature and the decision you need to make.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Your studies</h1>
            <p className="mt-1 text-sm text-slate-500">One project per simulated study. Each project keeps its inputs, approvals, transcript and report together, separate from your other projects.</p>
          </>
        )}
        <ProjectList initial={projects} pilot={Boolean(user.codeId)} />
      </main>
    </>
  );
}
