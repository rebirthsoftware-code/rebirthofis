import type { OfficeEvent, OfficeSnapshot, Task, TaskDepth, TaskSpec } from "@rebirth/shared";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "İstek başarısız oldu");
  }
  return r.json() as Promise<T>;
}

export const fetchOffice = () => call<OfficeSnapshot>("/api/office");

export const createTask = (input: { title: string; depth: TaskDepth; planFirst: boolean } & TaskSpec) =>
  call<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) });

export const approvePlan = (id: string) => call<Task>(`/api/tasks/${id}/approve`, { method: "POST" });

export const replan = (id: string, note: string) =>
  call<Task>(`/api/tasks/${id}/replan`, { method: "POST", body: JSON.stringify({ note }) });

export const requestFix = (id: string, target: string, note: string) =>
  call<Task>(`/api/tasks/${id}/fix`, { method: "POST", body: JSON.stringify({ target, note }) });

export const deleteTask = (id: string) => call<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" });

/** Sunucudan gelen canlı olay akışına bağlanır. */
export function subscribe(onEvent: (e: OfficeEvent) => void, onStatus: (ok: boolean) => void): () => void {
  const es = new EventSource("/api/events");
  const handler = (ev: MessageEvent) => {
    try {
      onEvent(JSON.parse(ev.data) as OfficeEvent);
    } catch {
      /* yoksay */
    }
  };
  for (const type of ["snapshot", "employee", "task", "task_deleted", "log"]) es.addEventListener(type, handler);
  es.onopen = () => onStatus(true);
  es.onerror = () => onStatus(false);
  return () => es.close();
}
