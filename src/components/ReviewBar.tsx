"use client";

import { useState } from "react";
import { useProject } from "./ProjectContext";
import { Button, Callout, StatusBadge } from "./ui";

/**
 * Dedicated decision checkpoint: approve, reject (with reason), escalate an
 * uncertainty to the agent, or edit. Approval is disabled while blockers exist.
 */
export function ReviewBar({
  artifact,
  status,
  version,
  createdBy,
  approvedVersion,
  blockers,
  onApprove,
  onReject,
  onEdit,
  extraActions,
  locked,
}: {
  artifact: string;
  status: "pending_review" | "approved" | "rejected";
  version: number;
  createdBy: "agent" | "pm";
  approvedVersion: number | null;
  blockers: string[];
  onApprove: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onEdit?: () => void;
  extraActions?: React.ReactNode;
  locked?: boolean;
}) {
  const { sendChat, chatSending } = useProject();
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print sticky top-0 z-20 -mx-4 mb-6 border-b border-slate-200 bg-[#f6f7f9]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-sm text-slate-600">
            {artifact} v{version} · {createdBy === "agent" ? "proposed by the agent" : "edited by you"}
            {status === "approved" && approvedVersion ? ` · approved v${approvedVersion}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {extraActions}
          {onEdit && (
            <Button size="sm" onClick={onEdit} disabled={busy || locked}>
              Edit
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              const note = prompt(`What should the agent clarify or reconsider about this ${artifact.toLowerCase()}?`);
              if (note?.trim()) void sendChat(`[Question about ${artifact.toLowerCase()} v${version}] ${note.trim()}`);
            }}
            disabled={chatSending}
          >
            Ask the agent
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || locked || status === "rejected"}
            onClick={() => {
              const reason = prompt(`Why are you rejecting this ${artifact.toLowerCase()}? (The agent will see your reason.)`);
              if (reason !== null) void act(() => onReject(reason));
            }}
          >
            Reject
          </Button>
          <Button size="sm" variant="success" disabled={busy || locked || status === "approved" || blockers.length > 0} onClick={() => void act(onApprove)}>
            {status === "approved" ? "Approved" : "Approve"}
          </Button>
        </div>
      </div>
      {blockers.length > 0 && status !== "approved" && (
        <div className="mt-3">
          <Callout tone="rose" title="Can't approve yet" items={blockers} />
        </div>
      )}
    </div>
  );
}

export function useReviewApi(path: "/design" | "/personas" | "/report") {
  const { api } = useProject();
  const run = async (json: unknown) => {
    const res = await api(path, { method: "POST", json });
    if (!res.ok) alert([res.body.error, ...(res.body.details ?? [])].filter(Boolean).join("\n• "));
  };
  return {
    approve: () => run({ action: "approve" }),
    reject: (reason: string) => run({ action: "reject", reason }),
  };
}
