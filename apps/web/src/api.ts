import type { OfficeEvent, OfficeSnapshot, Task } from "@rebirth/shared";

export async function fetchOffice(): Promise<OfficeSnapshot> {
  const r = await fetch("/api/office");
  if (!r.ok) throw new Error("Ofis bilgisi alınamadı");
  return r.json();
}

export async function createTask(title: string, brief: string): Promise<Task> {
  const r = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, brief }),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Görev oluşturulamadı");
  }
  return r.json();
}

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
  for (const type of ["snapshot", "employee", "task", "log"]) es.addEventListener(type, handler);
  es.onopen = () => onStatus(true);
  es.onerror = () => onStatus(false);
  return () => es.close();
}
