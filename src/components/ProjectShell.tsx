"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ClientProject } from "@/lib/types";
import { ProjectProvider, useProject } from "./ProjectContext";
import { ChatPanel } from "./ChatPanel";
import { cx } from "./ui";

export function ProjectShell({ initial, children }: { initial: ClientProject; children: React.ReactNode }) {
  return (
    <ProjectProvider initial={initial}>
      <Shell>{children}</Shell>
    </ProjectProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { project, chatOpen, setChatOpen } = useProject();
  return (
    <div className="print-flow flex min-h-0 flex-1">
      <div className="print-flow flex min-w-0 flex-1 flex-col">
        <StepNav />
        <main className="print-flow min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</div>
        </main>
      </div>
      <aside
        className={cx(
          "no-print flex-col border-l border-slate-200 bg-white",
          "fixed inset-y-0 right-0 z-40 w-full max-w-md shadow-xl lg:static lg:z-auto lg:flex lg:w-[400px] lg:max-w-none lg:shadow-none",
          chatOpen ? "flex" : "hidden",
        )}
      >
        <ChatPanel projectName={project.name} onClose={() => setChatOpen(false)} />
      </aside>
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="no-print fixed bottom-5 right-5 z-30 rounded-full bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-accent-strong lg:hidden"
        >
          Chat with the study agent
        </button>
      )}
    </div>
  );
}

function StepNav() {
  const { project } = useProject();
  const pathname = usePathname();
  const base = `/projects/${project.id}`;
  const run = project.runs[project.runs.length - 1];
  const reviewTone = (s: string, has: boolean) => (!has ? "idle" : s === "approved" ? "done" : s === "rejected" ? "warn" : "todo");

  const steps = [
    { href: base, label: "Brief & screens", state: project.screens.length && project.brief.featureDescription ? "done" : "idle", meta: `${project.screens.length} screen${project.screens.length === 1 ? "" : "s"}` },
    { href: `${base}/design`, label: "Study design", state: reviewTone(project.design.status, project.design.versions.length > 0), meta: project.design.versions.length ? `v${project.design.versions.length}` : "—" },
    { href: `${base}/personas`, label: "Personas", state: reviewTone(project.personas.status, project.personas.versions.length > 0), meta: project.personas.versions.length ? `v${project.personas.versions.length}` : "—" },
    { href: `${base}/run`, label: "Run", state: !run ? "idle" : run.status === "completed" ? "done" : run.status === "running" ? "todo" : "warn", meta: run ? run.status : "—" },
    { href: `${base}/report`, label: "Report", state: project.report.job.status === "generating" ? "todo" : reviewTone(project.report.status, project.report.versions.length > 0), meta: project.report.job.status === "generating" ? "generating" : project.report.versions.length ? `v${project.report.versions.length}` : "—" },
  ];

  const dot = { done: "bg-emerald-500", todo: "bg-amber-400", warn: "bg-rose-500", idle: "bg-slate-300" } as Record<string, string>;
  return (
    <nav className="no-print border-b border-slate-200 bg-white">
      <ol className="flex gap-1 overflow-x-auto px-3 sm:px-5">
        {steps.map((s, i) => {
          const active = pathname === s.href;
          return (
            <li key={s.href} className="shrink-0">
              <Link
                href={s.href}
                className={cx(
                  "flex items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors",
                  active ? "border-accent text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                <span className={cx("h-2 w-2 rounded-full", dot[s.state])} />
                <span className="font-medium">
                  {i + 1}. {s.label}
                </span>
                <span className="text-xs text-slate-400">{s.meta}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
