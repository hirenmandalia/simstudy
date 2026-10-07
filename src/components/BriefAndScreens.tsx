"use client";

import { useState } from "react";
import type { StudyBrief } from "@/lib/types";
import { useProject } from "./ProjectContext";
import { Badge, Button, Callout, Card, Field, inputClass, SectionTitle, SimLabel } from "./ui";

export function BriefAndScreens() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Brief & screens</h1>
        <p className="mt-1 text-sm text-slate-500">
          The study agent fills in the brief as you chat. You can also edit it directly. Upload demo-safe screenshots for the agent and the
          AI personas to work from.
        </p>
      </div>
      <SimLabel />
      <BriefCard />
      <ScreensCard />
    </div>
  );
}

const STAGES = { idea: "New idea", partially_built: "Partially built" } as const;

function BriefCard() {
  const { project, api } = useProject();
  const b = project.brief;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StudyBrief>(b);
  const [rqText, setRqText] = useState(b.researchQuestions.join("\n"));
  const [saving, setSaving] = useState(false);

  function start() {
    setDraft(b);
    setRqText(b.researchQuestions.join("\n"));
    setEditing(true);
  }
  async function save() {
    setSaving(true);
    const res = await api("", {
      method: "PATCH",
      json: { brief: { ...draft, researchQuestions: rqText.split("\n").map((s) => s.trim()).filter(Boolean) } },
    });
    setSaving(false);
    if (res.ok) setEditing(false);
    else alert(res.body.error);
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="grid gap-1 py-2 sm:grid-cols-[180px_1fr]">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{value || <span className="text-slate-400">Not provided yet</span>}</dd>
    </div>
  );

  return (
    <Card>
      <SectionTitle
        aside={
          editing ? (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save brief"}
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={start}>
              Edit
            </Button>
          )
        }
      >
        Study brief
      </SectionTitle>
      {!editing ? (
        <dl className="divide-y divide-slate-100">
          {row("Product", b.productName)}
          {row("Product context", b.productContext)}
          {row("Feature", b.featureDescription)}
          {row("Feature stage", b.featureStage ? STAGES[b.featureStage] : null)}
          {row("Decision to support", b.decisionToSupport ? <Badge tone="indigo">{b.decisionToSupport === "build" ? "Build?" : "Launch?"}</Badge> : null)}
          {row(
            "Research questions",
            b.researchQuestions.length ? (
              <ol className="list-decimal space-y-1 pl-5">
                {b.researchQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            ) : null,
          )}
          {row("Target users", b.targetUsers)}
          {b.additionalContext && row("Additional context", b.additionalContext)}
        </dl>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product">
              <input className={inputClass} value={draft.productName ?? ""} onChange={(e) => setDraft({ ...draft, productName: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Feature stage">
                <select className={inputClass} value={draft.featureStage ?? ""} onChange={(e) => setDraft({ ...draft, featureStage: (e.target.value || null) as StudyBrief["featureStage"] })}>
                  <option value="">—</option>
                  <option value="idea">New idea</option>
                  <option value="partially_built">Partially built</option>
                </select>
              </Field>
              <Field label="Decision">
                <select className={inputClass} value={draft.decisionToSupport ?? ""} onChange={(e) => setDraft({ ...draft, decisionToSupport: (e.target.value || null) as StudyBrief["decisionToSupport"] })}>
                  <option value="">—</option>
                  <option value="build">Build</option>
                  <option value="launch">Launch</option>
                </select>
              </Field>
            </div>
          </div>
          <Field label="Product context">
            <textarea className={inputClass} rows={2} value={draft.productContext ?? ""} onChange={(e) => setDraft({ ...draft, productContext: e.target.value })} />
          </Field>
          <Field label="Feature">
            <textarea className={inputClass} rows={3} value={draft.featureDescription ?? ""} onChange={(e) => setDraft({ ...draft, featureDescription: e.target.value })} />
          </Field>
          <Field label="Research questions" hint="One per line. These are yours; the agent may suggest others but can't confirm them.">
            <textarea className={inputClass} rows={4} value={rqText} onChange={(e) => setRqText(e.target.value)} />
          </Field>
          <Field label="Target users">
            <textarea className={inputClass} rows={2} value={draft.targetUsers ?? ""} onChange={(e) => setDraft({ ...draft, targetUsers: e.target.value })} />
          </Field>
          <Field label="Additional context">
            <textarea className={inputClass} rows={2} value={draft.additionalContext ?? ""} onChange={(e) => setDraft({ ...draft, additionalContext: e.target.value })} />
          </Field>
        </div>
      )}
    </Card>
  );
}

function ScreensCard() {
  const { project, api } = useProject();
  const [files, setFiles] = useState<FileList | null>(null);
  const [attested, setAttested] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [flow, setFlow] = useState(project.flowNotes);
  const [flowDirty, setFlowDirty] = useState(false);
  const run = project.runs[project.runs.length - 1];
  const locked = run?.status === "running";
  const screens = [...project.screens].sort((a, b) => a.order - b.order);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!files?.length) return;
    setUploading(true);
    setMessages([]);
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    form.append("attested", String(attested));
    const res = await api<{ rejected?: string[] }>("/screens", { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) setMessages([res.body.error ?? "Upload failed", ...(res.body.details ?? [])]);
    else {
      setMessages(res.body.rejected ?? []);
      setFiles(null);
      (e.target as HTMLFormElement).reset();
    }
  }

  async function patch(code: string, changes: Record<string, unknown>) {
    const res = await api("/screens", { method: "PATCH", json: { screens: [{ code, ...changes }] } });
    if (!res.ok) alert(res.body.error);
  }

  async function move(code: string, dir: -1 | 1) {
    const i = screens.findIndex((s) => s.code === code);
    const j = i + dir;
    if (j < 0 || j >= screens.length) return;
    const a = screens[i];
    const b = screens[j];
    await api("/screens", { method: "PATCH", json: { screens: [{ code: a.code, order: b.order }, { code: b.code, order: a.order }] } });
  }

  async function remove(code: string) {
    if (!confirm(`Remove screen ${code}?`)) return;
    const res = await api(`/screens/${code}`, { method: "DELETE" });
    if (!res.ok) alert(res.body.error);
  }

  async function saveFlow() {
    const res = await api("/screens", { method: "PATCH", json: { flowNotes: flow } });
    if (res.ok) setFlowDirty(false);
    else alert(res.body.error);
  }

  return (
    <Card>
      <SectionTitle>Screens & navigation flow</SectionTitle>
      <form onSubmit={upload} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={(e) => setFiles(e.target.files)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 file:ring-1 file:ring-slate-300"
          disabled={locked}
        />
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
          <span>
            These screenshots come from a <strong>publicly available</strong> app, and I&apos;ve <strong>redacted personal data</strong> (names,
            photos, usernames, contact details, user posts) or replaced it with fictional data. They contain no private company material.
          </span>
        </label>
        <div className="mt-3 flex items-center gap-3">
          <Button variant="primary" disabled={!files?.length || !attested || uploading || locked}>
            {uploading ? "Uploading & checking…" : "Upload screens"}
          </Button>
          <span className="text-xs text-slate-500">PNG, JPEG, WebP or GIF, up to 25 MB each and 20 per study. Large images are resized automatically, and each upload is checked for personal data.</span>
        </div>
        {messages.length > 0 && <div className="mt-3"><Callout tone="rose" title="Some files weren't accepted" items={messages} /></div>}
      </form>

      {screens.length > 0 && (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {screens.map((s, i) => (
            <li key={s.code} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="relative flex h-64 items-center justify-center bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/projects/${project.id}/screens/${s.code}`} alt={s.label} className="max-h-full max-w-full object-contain" />
                <span className="absolute left-2 top-2 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-xs font-semibold text-white">{s.code}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <input
                  className={inputClass}
                  defaultValue={s.label}
                  disabled={locked}
                  onBlur={(e) => e.target.value.trim() !== s.label && void patch(s.code, { label: e.target.value })}
                  aria-label={`Label for ${s.code}`}
                />
                <textarea
                  className={`${inputClass} text-xs`}
                  rows={3}
                  defaultValue={s.description}
                  placeholder="Short neutral description of the screen"
                  disabled={locked}
                  onBlur={(e) => e.target.value !== s.description && void patch(s.code, { description: e.target.value })}
                  aria-label={`Description for ${s.code}`}
                />
                {s.piiConcerns.length > 0 && (
                  <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                    <p className="font-medium">{s.screenCheck === "unavailable" ? "Please review" : "Possible personal data"}</p>
                    <ul className="list-disc pl-4">
                      {s.piiConcerns.map((c, n) => (
                        <li key={n}>{c}</li>
                      ))}
                    </ul>
                    <label className="mt-1 flex items-center gap-1.5">
                      <input type="checkbox" checked={s.piiAcknowledged} disabled={locked} onChange={(e) => void patch(s.code, { piiAcknowledged: e.target.checked })} />
                      I&apos;ve checked: no real personal data
                    </label>
                  </div>
                )}
                {s.piiConcerns.length === 0 && <Badge tone="green">Screen check passed</Badge>}
                <div className="mt-auto flex items-center justify-between pt-1">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0 || locked} onClick={() => void move(s.code, -1)} aria-label="Move earlier">
                      ←
                    </Button>
                    <Button size="sm" variant="ghost" disabled={i === screens.length - 1 || locked} onClick={() => void move(s.code, 1)} aria-label="Move later">
                      →
                    </Button>
                  </div>
                  <Button size="sm" variant="ghost" disabled={locked} onClick={() => void remove(s.code)}>
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Field label="Navigation flow" hint='How the screens connect, e.g. "S1 Home → tap the search bar → S2 Results → tap a product → S3 Product detail".'>
          <textarea
            className={inputClass}
            rows={3}
            value={flow}
            disabled={locked}
            onChange={(e) => {
              setFlow(e.target.value);
              setFlowDirty(true);
            }}
          />
        </Field>
        {flowDirty && (
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="primary" onClick={() => void saveFlow()}>
              Save flow
            </Button>
          </div>
        )}
      </div>
      {project.design.status === "approved" && (
        <p className="mt-4 text-xs text-slate-500">Changing screens, labels, order or the flow after the design is approved withdraws the approval, because the screens are part of the approved plan.</p>
      )}
    </Card>
  );
}
