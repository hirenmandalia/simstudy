"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectSummary } from "@/lib/store";
import { Badge, Button, Empty, inputClass } from "./ui";

/** `pilot`: activation-code users get one study and must accept the pilot notice first. */
export function ProjectList({ initial, pilot = false }: { initial: ProjectSummary[]; pilot?: boolean }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, acceptedNotice: pilot ? accepted : undefined }) });
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

  if (pilot) {
    return (
      <form onSubmit={create} className="mt-8 space-y-6">
        <PilotNotice />
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
          <span>I understand the findings are simulated, and I won&apos;t upload confidential material or anyone&apos;s personal data.</span>
        </label>
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
          <input
            className={inputClass}
            placeholder="Name your study, e.g. “Trip summaries: build or not?”"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            aria-label="Study name"
          />
          <Button variant="primary" disabled={busy || !name.trim() || !accepted} className="shrink-0">
            {busy ? "Creating…" : "Start the study"}
          </Button>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    );
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

function PilotNotice() {
  const points = [
    ["The participants are AI personas, not real people.", "Treat the report as an early signal to test with real users, not as evidence on its own."],
    ["Use public or demo-safe material only.", "No confidential company documents, unreleased financials or real customers' details, in chat or in screenshots. Uploads are checked for personal data."],
    ["The pilot's organiser can see your study.", "That's so they can support you and fix problems. Nobody else can, unless you approve the report and share a link."],
    ["Your study has a fixed AI budget.", "The header shows how much is used. When it runs out the study stops doing new AI work; what's already done stays."],
  ];
  return (
    <section aria-labelledby="pilot-notice" className="rounded-xl border border-amber-200 bg-sim-soft p-5">
      <h2 id="pilot-notice" className="font-semibold text-amber-950">Before you start</h2>
      <ul className="mt-3 space-y-3 text-sm leading-relaxed text-amber-950/80">
        {points.map(([t, d]) => (
          <li key={t}>
            <span className="font-medium text-amber-950">{t}</span> {d}
          </li>
        ))}
      </ul>
    </section>
  );
}
