"use client";

import { useState } from "react";
import { canApprovePersonas, checkPersonas } from "@/lib/gates";
import { MAX_PARTICIPANTS, type Persona, type PersonaSetInput } from "@/lib/schemas";
import { currentVersion } from "@/lib/types";
import { useProject } from "./ProjectContext";
import { ReviewBar, useReviewApi } from "./ReviewBar";
import { ListInput } from "./ListInput";
import { Badge, Button, Callout, Card, Empty, Field, inputClass, SectionTitle, SimLabel } from "./ui";

const FAMILIARITY: Record<Persona["productFamiliarity"], string> = {
  never_used: "Never used",
  occasional: "Occasional",
  regular: "Regular",
  power_user: "Power user",
};

export function PersonaReview() {
  const { project } = useProject();
  const cur = currentVersion(project.personas);
  const [editing, setEditing] = useState(false);
  const review = useReviewApi("/personas");
  const running = project.runs[project.runs.length - 1]?.status === "running";

  if (!cur)
    return (
      <Empty title="No personas yet">
        Once there&apos;s a study design, the agent proposes fictional personas from your target users. Each persona is one simulated
        participant (up to {MAX_PARTICIPANTS}).
      </Empty>
    );
  if (editing) return <PersonaEditor initial={cur.data} onDone={() => setEditing(false)} />;

  const blockers = project.personas.status === "approved" ? [] : canApprovePersonas(project);
  const { warnings } = checkPersonas(cur.data, project);

  return (
    <div>
      <ReviewBar
        artifact="Personas"
        status={project.personas.status}
        version={cur.version}
        createdBy={cur.createdBy}
        approvedVersion={project.personas.approvedVersion}
        blockers={blockers}
        onApprove={review.approve}
        onReject={review.reject}
        onEdit={() => setEditing(true)}
        locked={running}
      />
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Personas ({cur.data.personas.length})</h1>
          <p className="mt-1 text-sm text-slate-500">Fictional people. Each becomes an AI participant that sees only its own card, the approved tasks and the screens.</p>
        </div>
        {project.personas.reviewNote && <Callout tone="amber" title="Review note" items={[project.personas.reviewNote]} />}
        <Callout tone="amber" title="Check before approving" items={warnings} />
        <SimLabel />
        <Card>
          <SectionTitle>Why this mix</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">{cur.data.rationale}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            <span className="font-medium text-slate-600">Coverage:</span> {cur.data.coverageNotes}
          </p>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          {cur.data.personas.map((p) => (
            <PersonaCard key={p.id} p={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PersonaCard({ p }: { p: Persona }) {
  const list = (label: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <ul className="mt-0.5 list-disc pl-4 text-sm text-slate-700">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
          {p.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">
            {p.name} <span className="font-mono text-xs font-normal text-slate-400">{p.id}</span>
          </p>
          <p className="text-sm text-slate-600">{p.label}</p>
          <p className="text-xs text-slate-500">
            {p.ageRange} · {p.occupation}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="sky">Tech: {p.techSavviness}</Badge>
        <Badge tone="indigo">Familiarity: {FAMILIARITY[p.productFamiliarity]}</Badge>
        {p.accessibilityConsiderations && <Badge tone="amber">Accessibility: {p.accessibilityConsiderations}</Badge>}
      </div>
      <p className="text-sm text-slate-600">{p.lifeContext}</p>
      {list("Goals", p.goals)}
      {list("Needs", p.needs)}
      {list("Pain points", p.painPoints)}
      {list("Constraints", p.constraints)}
      {list("Behaviours", p.behaviours)}
      <p className="text-xs text-slate-500">
        <span className="font-medium">Voice:</span> {p.communicationStyle}
      </p>
      <p className="mt-auto rounded-md bg-slate-50 p-2 text-xs text-slate-600">
        <span className="font-medium">Why included:</span> {p.relevance}
      </p>
    </Card>
  );
}

function blankPersona(n: number): Persona {
  return {
    id: `P${n}`,
    name: "",
    label: "",
    ageRange: "",
    occupation: "",
    lifeContext: "",
    goals: [],
    needs: [],
    painPoints: [],
    constraints: [],
    techSavviness: "medium",
    productFamiliarity: "occasional",
    accessibilityConsiderations: null,
    behaviours: [],
    communicationStyle: "",
    relevance: "",
  };
}

function PersonaEditor({ initial, onDone }: { initial: PersonaSetInput; onDone: () => void }) {
  const { api } = useProject();
  const [set, setSet] = useState<PersonaSetInput>(structuredClone(initial));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const upd = (i: number, patch: Partial<Persona>) => setSet((s) => ({ ...s, personas: s.personas.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  async function save() {
    setSaving(true);
    const res = await api("/personas", { method: "PUT", json: { data: set, note } });
    setSaving(false);
    if (res.ok) onDone();
    else setErrors([res.body.error ?? "Couldn't save", ...(res.body.details ?? [])]);
  }

  const nextId = () => {
    let n = set.personas.length + 1;
    while (set.personas.some((p) => p.id === `P${n}`)) n++;
    return n;
  };

  return (
    <div className="space-y-5">
      <div className="no-print sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-[#f6f7f9]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <p className="flex-1 text-sm text-slate-600">Editing creates a new version for you to approve. The persona count must match the design&apos;s participant count.</p>
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
        <div className="grid gap-4">
          <Field label="Rationale">
            <textarea className={inputClass} rows={2} value={set.rationale} onChange={(e) => setSet({ ...set, rationale: e.target.value })} />
          </Field>
          <Field label="Coverage notes">
            <textarea className={inputClass} rows={2} value={set.coverageNotes} onChange={(e) => setSet({ ...set, coverageNotes: e.target.value })} />
          </Field>
        </div>
      </Card>
      {set.personas.map((p, i) => (
        <Card key={i}>
          <SectionTitle
            aside={
              <Button size="sm" variant="ghost" onClick={() => setSet({ ...set, personas: set.personas.filter((_, j) => j !== i) })}>
                Remove
              </Button>
            }
          >
            {p.id} {p.name || "New persona"}
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name (fictional)">
              <input className={inputClass} value={p.name} onChange={(e) => upd(i, { name: e.target.value })} />
            </Field>
            <Field label="Label">
              <input className={inputClass} value={p.label} onChange={(e) => upd(i, { label: e.target.value })} />
            </Field>
            <Field label="Age range">
              <input className={inputClass} value={p.ageRange} onChange={(e) => upd(i, { ageRange: e.target.value })} />
            </Field>
            <Field label="Occupation">
              <input className={inputClass} value={p.occupation} onChange={(e) => upd(i, { occupation: e.target.value })} />
            </Field>
            <Field label="Tech savviness">
              <select className={inputClass} value={p.techSavviness} onChange={(e) => upd(i, { techSavviness: e.target.value as Persona["techSavviness"] })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Product familiarity">
              <select className={inputClass} value={p.productFamiliarity} onChange={(e) => upd(i, { productFamiliarity: e.target.value as Persona["productFamiliarity"] })}>
                {Object.entries(FAMILIARITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Life context">
              <textarea className={inputClass} rows={2} value={p.lifeContext} onChange={(e) => upd(i, { lifeContext: e.target.value })} />
            </Field>
            <Field label="Accessibility considerations">
              <input className={inputClass} value={p.accessibilityConsiderations ?? ""} onChange={(e) => upd(i, { accessibilityConsiderations: e.target.value.trim() || null })} />
            </Field>
            <Field label="Goals">
              <ListInput value={p.goals} onChange={(v) => upd(i, { goals: v })} />
            </Field>
            <Field label="Needs">
              <ListInput value={p.needs} onChange={(v) => upd(i, { needs: v })} />
            </Field>
            <Field label="Pain points">
              <ListInput value={p.painPoints} onChange={(v) => upd(i, { painPoints: v })} />
            </Field>
            <Field label="Constraints">
              <ListInput value={p.constraints} onChange={(v) => upd(i, { constraints: v })} />
            </Field>
            <Field label="Behaviours">
              <ListInput value={p.behaviours} onChange={(v) => upd(i, { behaviours: v })} />
            </Field>
            <Field label="Communication style">
              <textarea className={inputClass} rows={3} value={p.communicationStyle} onChange={(e) => upd(i, { communicationStyle: e.target.value })} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Why included (relevance to target users)">
              <textarea className={inputClass} rows={2} value={p.relevance} onChange={(e) => upd(i, { relevance: e.target.value })} />
            </Field>
          </div>
        </Card>
      ))}
      <Button disabled={set.personas.length >= MAX_PARTICIPANTS} onClick={() => setSet({ ...set, personas: [...set.personas, blankPersona(nextId())] })}>
        Add persona {set.personas.length >= MAX_PARTICIPANTS ? `(max ${MAX_PARTICIPANTS})` : ""}
      </Button>
    </div>
  );
}
