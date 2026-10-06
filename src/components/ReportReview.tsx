"use client";

import { useState } from "react";
import type { ReportDraft } from "@/lib/schemas";
import { currentVersion, type Report } from "@/lib/types";
import { useProject } from "./ProjectContext";
import { ReviewBar, useReviewApi } from "./ReviewBar";
import { ReportDocument } from "./ReportDocument";
import { ListInput } from "./ListInput";
import { Button, Callout, Card, Empty, Field, inputClass, SectionTitle } from "./ui";

export function ReportReview() {
  const { project, api } = useProject();
  const cur = currentVersion(project.report);
  const job = project.report.job;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const review = useReviewApi("/report");
  const approved = project.report.status === "approved";
  const generating = job.status === "generating";

  async function requestChanges() {
    const instructions = prompt("What should the agent change in the report? It will regenerate a new version grounded in the transcript.");
    if (!instructions?.trim()) return;
    setBusy(true);
    const res = await api("/report", { method: "POST", json: { action: "request_changes", instructions } });
    setBusy(false);
    if (!res.ok) alert(res.body.error);
  }

  async function share(action: "share" | "unshare") {
    const res = await api("/report", { method: "POST", json: { action } });
    if (!res.ok) alert(res.body.error);
  }

  if (!cur)
    return generating ? (
      <Empty title="Writing the report…">The agent is synthesising the simulated transcript. This usually takes a minute or two.</Empty>
    ) : (
      <Empty title="No report yet">
        {job.status === "failed" ? `Report generation failed: ${job.error}` : "Run the approved study. The report is generated automatically when the run finishes."}
      </Empty>
    );

  if (editing) return <ReportEditor report={cur.data} onDone={() => setEditing(false)} />;

  const shareUrl = project.report.shareToken && typeof window !== "undefined" ? `${window.location.origin}/share/${project.report.shareToken}` : null;

  return (
    <div>
      <ReviewBar
        artifact="Report"
        status={project.report.status}
        version={cur.version}
        createdBy={cur.createdBy}
        approvedVersion={project.report.approvedVersion}
        blockers={generating ? ["A new version is being generated."] : []}
        onApprove={review.approve}
        onReject={review.reject}
        onEdit={() => setEditing(true)}
        locked={generating}
        extraActions={
          <Button size="sm" onClick={() => void requestChanges()} disabled={busy || generating}>
            Request changes
          </Button>
        }
      />
      <div className="space-y-4">
        {generating && <Callout tone="sky" title="Generating a new version…" items={["You'll see it here when it's ready."]} />}
        {job.status === "failed" && <Callout tone="rose" title="The last report generation failed" items={[job.error ?? "Unknown error"]} />}
        {project.report.reviewNote && <Callout tone="amber" title="Review note" items={[project.report.reviewNote]} />}
        {cur.data.quoteCheck.verified < cur.data.quoteCheck.total && (
          <Callout
            tone="amber"
            title="Quote check"
            items={[`${cur.data.quoteCheck.total - cur.data.quoteCheck.verified} quote(s) couldn't be matched to the transcript. Remove them or request changes before approving.`]}
          />
        )}

        <Card className="no-print">
          <SectionTitle>Download & share</SectionTitle>
          {approved ? (
            <div className="flex flex-wrap items-center gap-2">
              <a href={`/api/projects/${project.id}/report/export`} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                Download Markdown
              </a>
              <Button size="sm" onClick={() => window.print()}>
                Print / save as PDF
              </Button>
              {project.report.shareToken ? (
                <>
                  <input readOnly value={shareUrl ?? ""} className={`${inputClass} max-w-md text-xs`} onFocus={(e) => e.target.select()} />
                  <Button size="sm" onClick={() => shareUrl && void navigator.clipboard.writeText(shareUrl)}>
                    Copy link
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void share("unshare")}>
                    Revoke link
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => void share("share")}>
                  Create read-only link
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Approve the report to download it or create a read-only link for teammates. Nothing is sent anywhere automatically.</p>
          )}
        </Card>

        <ReportDocument report={cur.data} version={cur.version} approvedAt={approved ? project.report.approvedAt : null} transcriptHref={`/projects/${project.id}/run`} />
      </div>
    </div>
  );
}

function ReportEditor({ report, onDone }: { report: Report; onDone: () => void }) {
  const { api } = useProject();
  const [d, setD] = useState<ReportDraft>(structuredClone(report.draft));
  const [pmNotes, setPmNotes] = useState(report.pmNotes);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await api("/report", { method: "PUT", json: { draft: d, pmNotes, note } });
    setSaving(false);
    if (res.ok) onDone();
    else setErrors([res.body.error ?? "Couldn't save", ...(res.body.details ?? [])]);
  }

  return (
    <div className="space-y-5">
      <div className="no-print sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-[#f6f7f9]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <p className="flex-1 text-sm text-slate-600">Edit wording, remove items or quotes, and add your notes. Quotes can be removed but not rewritten.</p>
        <input className={`${inputClass} max-w-xs`} placeholder="Note about your change (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save as new version"}
        </Button>
      </div>
      <Callout tone="rose" title="Fix these to save" items={errors} />

      <Card>
        <Field label="Executive summary">
          <textarea className={inputClass} rows={6} value={d.executiveSummary} onChange={(e) => setD({ ...d, executiveSummary: e.target.value })} />
        </Field>
      </Card>

      <Card>
        <SectionTitle>Research question answers</SectionTitle>
        <div className="space-y-4">
          {d.researchQuestionAnswers.map((a, i) => (
            <div key={a.questionId} className="space-y-2">
              <Field label={`${a.questionId}: ${report.researchQuestions.find((q) => q.id === a.questionId)?.text ?? ""}`}>
                <textarea
                  className={inputClass}
                  rows={4}
                  value={a.answer}
                  onChange={(e) => setD({ ...d, researchQuestionAnswers: d.researchQuestionAnswers.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })}
                />
              </Field>
              <QuoteList
                quotes={a.evidence}
                onRemove={(qi) => setD({ ...d, researchQuestionAnswers: d.researchQuestionAnswers.map((x, j) => (j === i ? { ...x, evidence: x.evidence.filter((_, k) => k !== qi) } : x)) })}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Findings</SectionTitle>
        <div className="space-y-4">
          {d.findings.map((f, i) => {
            const upd = (patch: Partial<typeof f>) => setD({ ...d, findings: d.findings.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={f.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                  <input className={inputClass} value={f.title} onChange={(e) => upd({ title: e.target.value })} />
                  <select className={inputClass} value={f.severity} onChange={(e) => upd({ severity: e.target.value as typeof f.severity })}>
                    <option value="critical">Critical</option>
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                    <option value="positive">Positive</option>
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => setD({ ...d, findings: d.findings.filter((_, j) => j !== i) })}>
                    Remove
                  </Button>
                </div>
                <Field label="Observation">
                  <textarea className={inputClass} rows={2} value={f.observation} onChange={(e) => upd({ observation: e.target.value })} />
                </Field>
                <Field label="Interpretation">
                  <textarea className={inputClass} rows={2} value={f.interpretation} onChange={(e) => upd({ interpretation: e.target.value })} />
                </Field>
                <QuoteList quotes={f.evidence} onRemove={(qi) => upd({ evidence: f.evidence.filter((_, k) => k !== qi) })} />
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle>Recommendations</SectionTitle>
        <div className="space-y-3">
          {d.recommendations.map((r, i) => {
            const upd = (patch: Partial<typeof r>) => setD({ ...d, recommendations: d.recommendations.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={r.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <input className={inputClass} value={r.title} onChange={(e) => upd({ title: e.target.value })} />
                  <select className={inputClass} value={r.priority} onChange={(e) => upd({ priority: e.target.value as typeof r.priority })}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => setD({ ...d, recommendations: d.recommendations.filter((_, j) => j !== i) })}>
                    Remove
                  </Button>
                </div>
                <textarea className={inputClass} rows={2} value={r.detail} onChange={(e) => upd({ detail: e.target.value })} />
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="grid gap-4">
          <Field label="Limitations (one per line)">
            <ListInput value={d.limitations} onChange={(v) => setD({ ...d, limitations: v })} rows={5} />
          </Field>
          <Field label="What to validate with real users">
            <textarea className={inputClass} rows={3} value={d.realUserValidation} onChange={(e) => setD({ ...d, realUserValidation: e.target.value })} />
          </Field>
          <Field label="PM notes (shown in the report)">
            <textarea className={inputClass} rows={4} value={pmNotes} onChange={(e) => setPmNotes(e.target.value)} />
          </Field>
        </div>
      </Card>
    </div>
  );
}

function QuoteList({ quotes, onRemove }: { quotes: ReportDraft["findings"][number]["evidence"]; onRemove: (i: number) => void }) {
  if (!quotes.length) return null;
  return (
    <ul className="space-y-1">
      {quotes.map((q, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
          <span className="flex-1 border-l-2 border-amber-300 pl-2">
            “{q.text}” <span className="text-slate-400">({q.personaId}, {q.lineId})</span>
            {(q as { verified?: boolean }).verified === false && <span className="ml-1 text-rose-600">⚠ unverified</span>}
          </span>
          <button className="text-slate-400 hover:text-rose-600" onClick={() => onRemove(i)} aria-label="Remove quote">
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
