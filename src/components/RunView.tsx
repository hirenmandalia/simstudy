"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { runGate } from "@/lib/gates";
import { approvedVersion, type Run, type TranscriptLine } from "@/lib/types";
import { estimateCost as estimateUsageCost } from "@/lib/pricing";
import { useProject } from "./ProjectContext";
import { Badge, Button, Callout, Card, cx, Empty, SectionTitle, SimLabel } from "./ui";

const OUTCOME: Record<string, { label: string; tone: "green" | "amber" | "rose" }> = {
  completed: { label: "Completed", tone: "green" },
  completed_with_difficulty: { label: "Completed with difficulty", tone: "amber" },
  failed: { label: "Failed", tone: "rose" },
  gave_up: { label: "Gave up", tone: "rose" },
};

export function RunView() {
  const { project, api } = useProject();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string[]>([]);
  const blockers = runGate(project);
  const run = project.runs[project.runs.length - 1] ?? null;
  const design = approvedVersion(project.design);
  const personas = approvedVersion(project.personas);

  async function start() {
    if (!confirm("Start the simulated study with the approved design and personas? This uses AI credits and takes a few minutes.")) return;
    setStarting(true);
    setError([]);
    const res = await api("/run", { method: "POST" });
    setStarting(false);
    if (!res.ok) setError([res.body.error ?? "Couldn't start", ...(res.body.details ?? [])]);
  }

  const checklist = [
    { ok: !!design, label: design ? `Study design v${design.version} approved` : "Study design approved" },
    { ok: !!personas && project.personas.approvedForDesignVersion === design?.version, label: personas ? `Personas v${personas.version} approved for this design` : "Personas approved" },
    { ok: design?.data.method !== "usability_test" || project.screens.length > 0, label: `Screens available (${project.screens.length})` },
    { ok: !project.screens.some((s) => s.piiConcerns.length && !s.piiAcknowledged), label: "Screen privacy checks reviewed" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Run the simulated study</h1>
        <p className="mt-1 text-sm text-slate-500">The study only runs the approved plan, and only when you start it, here or by asking the agent.</p>
      </div>
      <SimLabel />

      <Card>
        <SectionTitle>Ready to run?</SectionTitle>
        <ul className="space-y-1.5">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-sm">
              <span className={cx("flex h-5 w-5 items-center justify-center rounded-full text-xs", c.ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")}>
                {c.ok ? "✓" : "•"}
              </span>
              <span className={c.ok ? "text-slate-800" : "text-slate-500"}>{c.label}</span>
            </li>
          ))}
        </ul>
        {blockers.length > 0 && <div className="mt-4"><Callout tone="rose" title="Blocked" items={blockers} /></div>}
        <Callout tone="rose" title="Couldn't start" items={error} />
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" disabled={blockers.length > 0 || starting} onClick={() => void start()}>
            {starting ? "Starting…" : run?.status === "completed" ? "Run again" : "Run simulated study"}
          </Button>
          {design && personas && (
            <span className="text-xs text-slate-500">
              {design.data.method === "usability_test" ? "Usability test" : "Focus group"} · {personas.data.personas.length} AI personas · {design.data.tasks.length} task(s) ·{" "}
              {design.data.interviewQuestions.length} question(s)
            </span>
          )}
        </div>
      </Card>

      {run ? <RunDetail run={run} /> : <Empty title="No runs yet">Approve the design and personas, then start the run.</Empty>}
    </div>
  );
}

function RunDetail({ run }: { run: Run }) {
  const { project } = useProject();
  const sessions = useMemo(() => {
    const ids = Array.from(new Set(run.transcript.map((l) => l.sessionId)));
    return ids.map((id) => ({ id, name: id === "group" ? "Group discussion" : run.personas.personas.find((p) => p.id === id)?.name ?? id }));
  }, [run]);
  const [tab, setTab] = useState<string | null>(null);
  const active = tab ?? sessions[0]?.id ?? null;
  const lines = run.transcript.filter((l) => l.sessionId === active);
  const flags = new Map(Object.values(run.consistency).flatMap((c) => c.flags.map((f) => [f.lineId, f] as const)));
  const pct = run.progress.total ? Math.round((run.progress.done / run.progress.total) * 100) : 0;
  const cost = estimateCost(run);

  return (
    <Card>
      <SectionTitle
        aside={
          <span className="text-xs text-slate-500">
            {run.usage.calls} AI calls
            {cost ? ` · ≈ $${cost.usd.toFixed(2)}${cost.exact ? "" : " (upper estimate, priced as Opus)"}` : ""}
          </span>
        }
      >
        Run {run.id} · design v{run.designVersion} · personas v{run.personaVersion}
      </SectionTitle>
      <div className="flex items-center gap-3">
        <Badge tone={run.status === "completed" ? "green" : run.status === "running" ? "indigo" : "rose"}>{run.status}</Badge>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className={cx("h-full rounded-full transition-all", run.status === "failed" || run.status === "interrupted" ? "bg-rose-400" : "bg-accent")} style={{ width: `${run.status === "completed" && run.progress.current === "Done" ? 100 : pct}%` }} />
        </div>
        <span className="w-48 truncate text-right text-xs text-slate-500">{run.progress.current}</span>
      </div>
      {run.error && <p className="mt-3 text-sm text-rose-600">{run.error}</p>}
      {run.status === "completed" && (
        <p className="mt-3 text-sm text-slate-600">
          {project.report.job.status === "generating" ? "Generating the report…" : (
            <Link href={`/projects/${project.id}/report`} className="font-medium text-accent hover:underline">
              Go to the report →
            </Link>
          )}
        </p>
      )}

      {sessions.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap gap-1 border-b border-slate-200">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setTab(s.id)}
                className={cx("border-b-2 px-3 py-2 text-sm", s.id === active ? "border-accent font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800")}
              >
                {s.name}
                {run.consistency[s.id]?.flags.length ? <span className="ml-1 text-xs text-amber-600">⚑{run.consistency[s.id].flags.length}</span> : null}
              </button>
            ))}
          </div>
          {active && run.consistency[active] && (
            <p className="mt-3 text-xs text-slate-500">
              <span className="font-medium">Consistency check:</span> {run.consistency[active].summary}
            </p>
          )}
          <ol className="mt-4 space-y-3">
            {lines.map((l) => (
              <TranscriptRow key={l.id} line={l} flag={flags.get(l.id)} />
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

function TranscriptRow({ line, flag }: { line: TranscriptLine; flag?: { type: string; note: string } }) {
  const isMod = line.speaker.kind === "moderator";
  return (
    <li id={line.id} className={cx("scroll-mt-24 rounded-lg p-3 text-sm", isMod ? "bg-slate-50" : "border border-slate-200 bg-white", flag && "ring-2 ring-amber-300")}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-slate-400">{line.id}</span>
        <span className={cx("font-semibold", isMod ? "text-slate-500" : "text-accent")}>{isMod ? "Moderator" : line.speaker.kind === "persona" ? line.speaker.name : ""}</span>
        {!isMod && <Badge tone="amber">simulated</Badge>}
        {line.taskId && <Badge>{line.taskId}</Badge>}
        {line.questionId && <Badge>{line.questionId}</Badge>}
        {line.attempt && <Badge tone={OUTCOME[line.attempt.outcome].tone}>{OUTCOME[line.attempt.outcome].label}</Badge>}
        {line.attempt && <Badge tone="sky">Ease {line.attempt.easeRating}/7</Badge>}
      </div>
      <p className={cx("whitespace-pre-wrap leading-relaxed", isMod ? "text-slate-600" : "text-slate-800")}>{line.text}</p>
      {line.attempt && (
        <details className="mt-2 text-xs text-slate-600">
          <summary className="cursor-pointer text-slate-500">Steps, confusion and unmet expectations</summary>
          <ol className="mt-2 space-y-1 pl-4">
            {line.attempt.stepsTaken.map((s, i) => (
              <li key={i}>
                <span className="font-mono text-slate-400">{s.screen}</span> {s.action} — <span className="italic">{s.thought}</span>
              </li>
            ))}
          </ol>
          {line.attempt.confusionPoints.length > 0 && <p className="mt-2"><span className="font-medium">Confusion:</span> {line.attempt.confusionPoints.join("; ")}</p>}
          {line.attempt.expectationsNotMet.length > 0 && <p className="mt-1"><span className="font-medium">Expected but missing:</span> {line.attempt.expectationsNotMet.join("; ")}</p>}
        </details>
      )}
      {flag && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
          ⚑ Consistency flag ({flag.type.replace(/_/g, " ")}): {flag.note}
        </p>
      )}
    </li>
  );
}

function estimateCost(run: Run) {
  return estimateUsageCost(run.usage);
}
