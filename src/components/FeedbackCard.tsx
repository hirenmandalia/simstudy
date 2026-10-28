"use client";

import { useState } from "react";
import { useProject } from "./ProjectContext";
import { Button, Card, inputClass, SectionTitle } from "./ui";
import type { StudyFeedback } from "@/lib/types";

const REAL_USERS: { value: NonNullable<StudyFeedback["realUsers"]>; label: string }[] = [
  { value: "yes", label: "Yes, I plan to" },
  { value: "already", label: "Already have" },
  { value: "no", label: "No" },
];

/** Shown once the report is approved; asks how useful and trustworthy it was. */
export function FeedbackCard() {
  const { project, api } = useProject();
  const given = (project.feedback ?? []).filter((f) => f.reportVersion === project.report.approvedVersion).at(-1);
  const [editing, setEditing] = useState(!given);
  const [usefulness, setUsefulness] = useState<number | null>(given?.usefulness ?? null);
  const [trust, setTrust] = useState<number | null>(given?.trust ?? null);
  const [realUsers, setRealUsers] = useState<StudyFeedback["realUsers"]>(given?.realUsers ?? null);
  const [comment, setComment] = useState(given?.comment ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!usefulness || !trust) return;
    setBusy(true);
    const res = await api("/feedback", { method: "POST", json: { usefulness, trust, realUsers, comment: comment.trim() || null } });
    setBusy(false);
    if (res.ok) setEditing(false);
    else alert(res.body.error);
  }

  if (!editing && given)
    return (
      <Card className="no-print">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-slate-600">
            Thanks for your feedback: usefulness {given.usefulness}/5, trust {given.trust}/5.
          </p>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change
          </Button>
        </div>
      </Card>
    );

  return (
    <Card className="no-print border-accent/30">
      <SectionTitle>How did this study do?</SectionTitle>
      <p className="-mt-2 mb-4 text-sm text-slate-500">Four quick questions. Your answers help improve SimStudy.</p>
      <form onSubmit={submit} className="space-y-5">
        <Scale label="How useful was this report for your decision?" low="Not useful" high="Very useful" value={usefulness} onChange={setUsefulness} />
        <Scale label="How much do you trust the findings?" low="Not at all" high="Completely" value={trust} onChange={setTrust} />
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">Will you test this with real users?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {REAL_USERS.map((o) => (
              <Choice key={o.value} selected={realUsers === o.value} onClick={() => setRealUsers(realUsers === o.value ? null : o.value)}>
                {o.label}
              </Choice>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="text-sm font-medium text-slate-800">What was wrong, missing or surprising? (optional)</span>
          <textarea className={`${inputClass} mt-2`} rows={3} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <Button variant="primary" disabled={busy || !usefulness || !trust}>
          {busy ? "Saving…" : "Send feedback"}
        </Button>
      </form>
    </Card>
  );
}

function Scale({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800">{label}</legend>
      <div className="mt-2 flex items-center gap-2">
        <span className="hidden w-20 text-right text-xs text-slate-400 sm:block">{low}</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <Choice key={n} selected={value === n} onClick={() => onChange(n)} aria-label={`${n} of 5`}>
            {n}
          </Choice>
        ))}
        <span className="hidden text-xs text-slate-400 sm:block">{high}</span>
      </div>
    </fieldset>
  );
}

function Choice({ selected, onClick, children, ...rest }: { selected: boolean; onClick: () => void; children: React.ReactNode; "aria-label"?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-w-10 rounded-lg border px-3 py-1.5 text-sm transition ${selected ? "border-accent bg-accent text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
      {...rest}
    >
      {children}
    </button>
  );
}
