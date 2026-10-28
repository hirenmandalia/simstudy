"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** For activation-code users, who never see the study list. Deleting uses the code up. */
export function DeleteStudyButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (
      !confirm(
        `Delete "${name}"? Its inputs, transcript and reports will be permanently removed, and your activation code will stop working.`,
      )
    )
      return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    if (res.ok) router.replace("/?deleted=1");
    else {
      setBusy(false);
      alert("Couldn't delete the study. Try again.");
    }
  }

  return (
    <button onClick={remove} disabled={busy} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">
      {busy ? "Deleting…" : "Delete study"}
    </button>
  );
}
