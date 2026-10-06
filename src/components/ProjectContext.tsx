"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ClientProject } from "@/lib/types";

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  body: T & { error?: string; details?: string[] };
}

interface Ctx {
  project: ClientProject;
  agentBusy: boolean;
  chatSending: boolean;
  /** Optimistic PM message, shown until the server copy (after index `after`) arrives. */
  pending: { text: string; after: number } | null;
  refresh: () => Promise<void>;
  api: <T = Record<string, unknown>>(path: string, init?: RequestInit & { json?: unknown }) => Promise<ApiResult<T>>;
  sendChat: (text: string) => Promise<void>;
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
}

const ProjectCtx = createContext<Ctx | null>(null);

export function useProject(): Ctx {
  const c = useContext(ProjectCtx);
  if (!c) throw new Error("useProject outside ProjectProvider");
  return c;
}

export function ProjectProvider({ initial, children }: { initial: ClientProject; children: React.ReactNode }) {
  const [project, setProject] = useState(initial);
  const [agentBusy, setAgentBusy] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [pending, setPending] = useState<{ text: string; after: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const id = initial.id;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { project: ClientProject; agentBusy: boolean };
    setProject(body.project);
    setAgentBusy(body.agentBusy);
  }, [id]);

  const api = useCallback(
    async <T,>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<ApiResult<T>> => {
      const { json, ...rest } = init;
      const res = await fetch(`/api/projects/${id}${path}`, {
        ...rest,
        headers: json !== undefined ? { "content-type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
        body: json !== undefined ? JSON.stringify(json) : rest.body,
      });
      const body = await res.json().catch(() => ({ error: "Unexpected response" }));
      if (body && typeof body === "object" && "project" in body) setProject(body.project as ClientProject);
      return { ok: res.ok, body };
    },
    [id],
  );

  const sendChat = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || chatSending) return;
      setChatSending(true);
      setPending({ text: t, after: project.chat.length });
      setChatOpen(true);
      try {
        const res = await api(`/chat`, { method: "POST", json: { text: t } });
        if (!res.ok && res.body.error) alert(res.body.error);
      } finally {
        setPending(null);
        setChatSending(false);
        await refresh();
      }
    },
    [api, chatSending, refresh, project.chat.length],
  );

  // Poll quickly while background work is in flight, slowly otherwise.
  const run = project.runs[project.runs.length - 1];
  const active = agentBusy || chatSending || run?.status === "running" || project.report.job.status === "generating";
  useEffect(() => {
    const t = setInterval(() => void refresh(), active ? 2000 : 20000);
    return () => clearInterval(t);
  }, [active, refresh]);

  return (
    <ProjectCtx.Provider value={{ project, agentBusy, chatSending, pending, refresh, api, sendChat, chatOpen, setChatOpen }}>
      {children}
    </ProjectCtx.Provider>
  );
}
