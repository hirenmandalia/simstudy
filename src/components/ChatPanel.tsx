"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useProject } from "./ProjectContext";
import { Button, cx } from "./ui";

const GUARDRAIL_LABELS: Record<string, string> = {
  out_of_scope: "Outside study scope",
  inappropriate_content: "Content not permitted",
  real_user_contact: "No real-user contact",
  incentives_or_payment: "No incentives or payments",
  private_data: "No private data",
  build_launch_decision: "Decision stays with you",
  external_sharing: "No external sharing",
  cross_project: "Project isolation",
  participant_cap: "Participant cap",
  approval_conflict: "Conflicts with approved plan",
  missing_input: "Missing input",
  ambiguous_request: "Needs clarification",
};

export function ChatPanel({ projectName, onClose }: { projectName: string; onClose: () => void }) {
  const { project, chatSending, pending, sendChat, agentBusy } = useProject();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const messages = project.chat;
  const busy = chatSending || agentBusy;
  // Hide the optimistic message once the server copy has arrived.
  const showPending = pending && !messages.slice(pending.after).some((m) => m.role === "pm");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending, busy]);

  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    await sendChat(t);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Study agent</p>
          <p className="truncate text-xs text-slate-500">{projectName}</p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 lg:hidden" aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => {
          if (m.role === "notice")
            return (
              <div key={m.id} className="text-center text-xs text-slate-500">
                <span className="inline-block rounded-full bg-slate-100 px-3 py-1">{m.text}</span>
                {m.actions.length > 0 && (
                  <div className="mt-1 flex justify-center gap-2">
                    {m.actions.map((a) => (
                      <Link key={a.href} href={a.href} className="font-medium text-accent hover:underline">
                        {a.label} →
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          const mine = m.role === "pm";
          return (
            <div key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cx(
                  "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  mine ? "rounded-br-sm bg-accent text-white" : "rounded-bl-sm border border-slate-200 bg-slate-50 text-slate-800",
                  m.guardrail && !mine && "border-l-4 border-l-amber-400",
                )}
              >
                {m.guardrail && !mine && (
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Guardrail · {GUARDRAIL_LABELS[m.guardrail] ?? m.guardrail}
                  </p>
                )}
                {mine ? (
                  <p className="whitespace-pre-wrap">{m.text}</p>
                ) : (
                  <div className="prose-chat">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                  </div>
                )}
                {m.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.actions.map((a) => (
                      <Link key={a.href} href={a.href} className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-indigo-200 hover:bg-indigo-50">
                        {a.label} →
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {showPending && (
          <div className="flex justify-end">
            <div className="max-w-[88%] rounded-2xl rounded-br-sm bg-accent/80 px-3.5 py-2.5 text-sm text-white">
              <p className="whitespace-pre-wrap">{pending?.text}</p>
            </div>
          </div>
        )}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
            </span>
            Agent is working…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-200 p-3">
        <textarea
          className="h-20 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-indigo-100"
          placeholder={busy ? "Waiting for the agent…" : "Reply to the agent…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          maxLength={8000}
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
          <Button variant="primary" size="sm" onClick={() => void submit()} disabled={busy || !text.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
