"use client";

import { useState } from "react";
import { checkDesign } from "@/lib/gates";
import { MAX_PARTICIPANTS, type StudyDesignInput } from "@/lib/schemas";
import { currentVersion } from "@/lib/types";
import { useProject } from "./ProjectContext";
import { ReviewBar, useReviewApi } from "./ReviewBar";
import { idsInput, ListInput } from "./ListInput";
import { Badge, Button, Callout, Card, Empty, Field, inputClass, SectionTitle, SimLabel } from "./ui";

export function DesignReview() {
  const { project } = useProject();
  const cur = currentVersion(project.design);
  const [editing, setEditing] = useState(false);
  const review = useReviewApi("/design");
  const running = project.runs[project.runs.length - 1]?.status === "running";

  if (!cur)
    return (
      <Empty title="No study design yet">
        Chat with the study agent about your feature, the decision you need to make, your research questions and target users. It will
        propose a design for you to review here.
      </Empty>
    );

  const check = checkDesign(cur.data, project);
  if (editing) return <DesignEditor initial={cur.data} onDone={() => setEditing(false)} />;

  const d = cur.data;
  return (
    <div>
      <ReviewBar
        artifact="Study design"
        status={project.design.status}
        version={cur.version}
        createdBy={cur.createdBy}
        approvedVersion={project.design.approvedVersion}
        blockers={check.blocking}
        onApprove={review.approve}
        onReject={review.reject}
        onEdit={() => setEditing(true)}
        locked={running}
      />
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{d.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {d.featureUnderTest} · informs the <strong>{d.decisionToSupport}</strong> decision (yours to make)
          </p>
        </div>
        {project.design.reviewNote && <Callout tone="amber" title="Review note" items={[project.design.reviewNote]} />}
        <Callout tone="amber" title="Check before approving" items={check.warnings} />
        <SimLabel />

        <Card>
          <SectionTitle>Research questions</SectionTitle>
          <ol className="space-y-2">
            {d.researchQuestions.map((q) => (
              <li key={q.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 font-mono text-xs text-slate-400">{q.id}</span>
                <span className="flex-1">{q.text}</span>
                {q.origin === "agent_suggested" ? <Badge tone="amber">Suggested by agent</Badge> : <Badge tone="slate">Yours</Badge>}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-500">Approving the design confirms these as your research questions.</p>
        </Card>

        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <SectionTitle>Method</SectionTitle>
            <p className="font-medium">{d.method === "usability_test" ? "Simulated usability test" : "Simulated focus group"}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{d.methodRationale}</p>
          </Card>
          <Card>
            <SectionTitle>Participants & session</SectionTitle>
            <p className="text-sm">
              <strong>{d.participantCount}</strong> simulated participant{d.participantCount === 1 ? "" : "s"} (max {MAX_PARTICIPANTS}) · ~{d.sessionLengthMinutes} min
              (nominal)
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {d.sessionOutline.map((s, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-800">{s.title}</span> · {s.minutes} min — {s.description}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card>
          <SectionTitle>Moderator script</SectionTitle>
          <p className="text-sm font-medium text-slate-700">Introduction</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{d.moderatorIntroduction}</p>
          {d.warmUpQuestions.length > 0 && (
            <>
              <p className="mt-4 text-sm font-medium text-slate-700">Warm-up</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
                {d.warmUpQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-sm font-medium text-slate-700">Closing</p>
          <p className="mt-1 text-sm text-slate-600">{d.closingRemarks}</p>
        </Card>

        {d.tasks.length > 0 && (
          <Card>
            <SectionTitle>Usability tasks</SectionTitle>
            <ol className="space-y-4">
              {d.tasks.map((t) => (
                <li key={t.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">{t.id}</span>
                    <span className="font-medium">{t.title}</span>
                    {t.startScreen && <Badge tone="sky">starts on {t.startScreen}</Badge>}
                    {t.relatedQuestionIds.map((id) => (
                      <Badge key={id}>{id}</Badge>
                    ))}
                  </div>
                  <p className="mt-2 text-sm text-slate-700">“{t.scenario}”</p>
                  <p className="mt-1 text-xs text-slate-500">Success: {t.successCriteria}</p>
                </li>
              ))}
            </ol>
          </Card>
        )}

        <Card>
          <SectionTitle>{d.method === "usability_test" ? "Debrief questions" : "Discussion guide"}</SectionTitle>
          <ol className="space-y-3">
            {d.interviewQuestions.map((q) => (
              <li key={q.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">{q.id}</span>
                  <span className="font-medium text-slate-800">{q.question}</span>
                  {q.relatedQuestionIds.map((id) => (
                    <Badge key={id}>{id}</Badge>
                  ))}
                </div>
                {q.probes.length > 0 && <p className="mt-1 pl-8 text-xs text-slate-500">Probes: {q.probes.join(" · ")}</p>}
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid gap-5 md:grid-cols-3">
          <ListCard title="Target-user assumptions" items={d.targetUserAssumptions} />
          <ListCard title="Assumptions to check" items={d.assumptions} />
          <ListCard title="Risks & limitations" items={d.risks} />
        </div>
        {d.missingInputs.length > 0 && <Callout tone="rose" title="Missing inputs" items={d.missingInputs} />}
        <VersionHistory />
      </div>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">None noted</p>
      )}
    </Card>
  );
}

function VersionHistory() {
  const { project } = useProject();
  if (project.design.versions.length < 2) return null;
  return (
    <p className="text-xs text-slate-500">
      History:{" "}
      {project.design.versions
        .map((v) => `v${v.version} (${v.createdBy === "agent" ? "agent" : "you"}, ${new Date(v.createdAt).toLocaleString()}${v.note ? `: ${v.note}` : ""})`)
        .join(" · ")}
    </p>
  );
}

// ---------------------------------------------------------------------------

function DesignEditor({ initial, onDone }: { initial: StudyDesignInput; onDone: () => void }) {
  const { api } = useProject();
  const [d, setD] = useState<StudyDesignInput>(structuredClone(initial));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof StudyDesignInput>(k: K, v: StudyDesignInput[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save() {
    setSaving(true);
    const res = await api("/design", { method: "PUT", json: { data: d, note } });
    setSaving(false);
    if (res.ok) onDone();
    else setErrors([res.body.error ?? "Couldn't save", ...(res.body.details ?? [])]);
  }

  return (
    <div className="space-y-5">
      <div className="no-print sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-[#f6f7f9]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <p className="flex-1 text-sm text-slate-600">Editing creates a new version that you then review and approve. It withdraws any current approval.</p>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <input className={inputClass} value={d.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Feature under test">
            <input className={inputClass} value={d.featureUnderTest} onChange={(e) => set("featureUnderTest", e.target.value)} />
          </Field>
          <Field label="Decision to support">
            <select className={inputClass} value={d.decisionToSupport} onChange={(e) => set("decisionToSupport", e.target.value as StudyDesignInput["decisionToSupport"])}>
              <option value="build">Build</option>
              <option value="launch">Launch</option>
            </select>
          </Field>
          <Field label="Method">
            <select className={inputClass} value={d.method} onChange={(e) => set("method", e.target.value as StudyDesignInput["method"])}>
              <option value="usability_test">Usability test</option>
              <option value="focus_group">Focus group</option>
            </select>
          </Field>
          <Field label={`Participants (1–${MAX_PARTICIPANTS})`} hint="Must match the number of personas.">
            <input type="number" min={1} max={MAX_PARTICIPANTS} className={inputClass} value={d.participantCount} onChange={(e) => set("participantCount", Number(e.target.value))} />
          </Field>
          <Field label="Session length (minutes, nominal)">
            <input type="number" min={5} className={inputClass} value={d.sessionLengthMinutes} onChange={(e) => set("sessionLengthMinutes", Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Method rationale">
            <textarea className={inputClass} rows={3} value={d.methodRationale} onChange={(e) => set("methodRationale", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle aside={<Button size="sm" onClick={() => set("researchQuestions", [...d.researchQuestions, { id: `RQ${d.researchQuestions.length + 1}`, text: "", origin: "pm" }])}>Add</Button>}>
          Research questions
        </SectionTitle>
        <div className="space-y-2">
          {d.researchQuestions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-10 font-mono text-xs text-slate-400">{q.id}</span>
              <input
                className={inputClass}
                value={q.text}
                onChange={(e) => set("researchQuestions", d.researchQuestions.map((x, j) => (j === i ? { ...x, text: e.target.value, origin: "pm" } : x)))}
              />
              <Button size="sm" variant="ghost" onClick={() => set("researchQuestions", d.researchQuestions.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>Moderator script</SectionTitle>
        <div className="grid gap-4">
          <Field label="Introduction">
            <textarea className={inputClass} rows={4} value={d.moderatorIntroduction} onChange={(e) => set("moderatorIntroduction", e.target.value)} />
          </Field>
          <Field label="Warm-up questions (one per line)">
            <ListInput value={d.warmUpQuestions} onChange={(v) => set("warmUpQuestions", v)} />
          </Field>
          <Field label="Closing remarks">
            <textarea className={inputClass} rows={2} value={d.closingRemarks} onChange={(e) => set("closingRemarks", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <SectionTitle
          aside={
            <Button
              size="sm"
              onClick={() => set("tasks", [...d.tasks, { id: `TASK${d.tasks.length + 1}`, title: "", scenario: "", successCriteria: "", startScreen: null, relatedQuestionIds: [] }])}
            >
              Add task
            </Button>
          }
        >
          Usability tasks
        </SectionTitle>
        <div className="space-y-4">
          {d.tasks.length === 0 && <p className="text-sm text-slate-400">No tasks (fine for a focus group).</p>}
          {d.tasks.map((t, i) => {
            const upd = (patch: Partial<typeof t>) => set("tasks", d.tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                <Field label={`${t.id} title`}>
                  <input className={inputClass} value={t.title} onChange={(e) => upd({ title: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Start screen">
                    <input className={inputClass} value={t.startScreen ?? ""} placeholder="S1" onChange={(e) => upd({ startScreen: e.target.value.trim() || null })} />
                  </Field>
                  <Field label="Research questions">{idsInput(t.relatedQuestionIds, (v) => upd({ relatedQuestionIds: v }))}</Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Scenario (goal-based; don't name UI labels)">
                    <textarea className={inputClass} rows={3} value={t.scenario} onChange={(e) => upd({ scenario: e.target.value })} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Success criteria">
                    <input className={inputClass} value={t.successCriteria} onChange={(e) => upd({ successCriteria: e.target.value })} />
                  </Field>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => set("tasks", d.tasks.filter((_, j) => j !== i))}>
                    Remove task
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle
          aside={
            <Button size="sm" onClick={() => set("interviewQuestions", [...d.interviewQuestions, { id: `Q${d.interviewQuestions.length + 1}`, question: "", probes: [], relatedQuestionIds: [] }])}>
              Add question
            </Button>
          }
        >
          {d.method === "usability_test" ? "Debrief questions" : "Discussion guide"}
        </SectionTitle>
        <div className="space-y-4">
          {d.interviewQuestions.map((q, i) => {
            const upd = (patch: Partial<typeof q>) => set("interviewQuestions", d.interviewQuestions.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_160px]">
                <Field label={`${q.id} question`}>
                  <input className={inputClass} value={q.question} onChange={(e) => upd({ question: e.target.value })} />
                </Field>
                <Field label="Research questions">{idsInput(q.relatedQuestionIds, (v) => upd({ relatedQuestionIds: v }))}</Field>
                <div className="sm:col-span-2">
                  <Field label="Probes (one per line)">
                    <ListInput value={q.probes} onChange={(v) => upd({ probes: v })} rows={2} />
                  </Field>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => set("interviewQuestions", d.interviewQuestions.filter((_, j) => j !== i))}>
                    Remove question
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Target-user assumptions">
            <ListInput value={d.targetUserAssumptions} onChange={(v) => set("targetUserAssumptions", v)} />
          </Field>
          <Field label="Assumptions to check">
            <ListInput value={d.assumptions} onChange={(v) => set("assumptions", v)} />
          </Field>
          <Field label="Missing inputs">
            <ListInput value={d.missingInputs} onChange={(v) => set("missingInputs", v)} />
          </Field>
          <Field label="Risks & limitations">
            <ListInput value={d.risks} onChange={(v) => set("risks", v)} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
