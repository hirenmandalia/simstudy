"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectSummary } from "@/lib/store";
import { Badge, Button, Empty, inputClass } from "./ui";

export function ProjectList({ initial }: { initial: ProjectSummary[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Couldn't create the study.");
      setBusy(false);
      return;
    }
    router.push(`/projects/${body.id}`);
  }

  async function remove(id: string, projectName: string) {
    if (!confirm(`Delete "${projectName}"? Its inputs, transcript and reports will be permanently removed.`)) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) setProjects((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="mt-8 space-y-6">
      <form onSubmit={create} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
        <input
          className={inputClass}
          placeholder="Name a new study, e.g. “Checkout redesign: launch readiness”"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />
        <Button variant="primary" disabled={busy || !name.trim()} className="shrink-0">
          {busy ? "Creating…" : "New study"}
        </Button>
      </form>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {projects.length === 0 ? (
        <Empty title="No studies yet">Create one above. The study agent will interview you about the feature and the decision you need to make.</Empty>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
              <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">Updated {new Date(p.updatedAt).toLocaleString()}</p>
              </Link>
              <Badge tone={p.stage === "Report approved" ? "green" : "indigo"}>{p.stage}</Badge>
              <Button variant="ghost" size="sm" onClick={() => remove(p.id, p.name)} aria-label={`Delete ${p.name}`}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
