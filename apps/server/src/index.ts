import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OfficeEvent, TaskDepth } from "@rebirth/shared";
import { createBackend } from "./llm.js";
import { Orchestrator } from "./orchestrator.js";
import { OfficeStore } from "./store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../../..");
const dataDir = process.env.OFFICE_DATA_DIR ?? path.join(rootDir, "data");
const webDist = path.join(rootDir, "apps/web/dist");

const backend = createBackend();
const store = new OfficeStore(dataDir, backend.mode, backend.models);
await store.load();
const orchestrator = new Orchestrator(store, backend);

const app = new Hono();
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, mode: backend.mode, models: backend.models }));

app.get("/api/office", (c) => c.json(store.snapshot()));

app.get("/api/tasks", (c) => c.json(store.listTasks()));

app.get("/api/tasks/:id", (c) => {
  const task = store.getTask(c.req.param("id"));
  return task ? c.json(task) : c.json({ error: "İş bulunamadı" }, 404);
});

const DEPTHS: TaskDepth[] = ["kucuk", "teslim", "uzun"];
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

app.post("/api/tasks", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = text(body.title, 300);
  if (!title) return c.json({ error: "İşi tek cümleyle yaz: ne teslim edilecek?" }, 400);
  const spec = {
    audience: text(body.audience, 300),
    material: text(body.material, 60_000),
    format: text(body.format, 300),
    acceptance: text(body.acceptance, 600),
  };
  const depth = DEPTHS.includes(body.depth as TaskDepth) ? (body.depth as TaskDepth) : "teslim";
  const task = store.createTask({ title, spec, depth, planFirst: body.planFirst !== false });
  orchestrator.enqueue({ id: task.id, stage: "plan" });
  return c.json(task, 201);
});

// Plan onayı: çalışanlar ancak bundan sonra başlar
app.post("/api/tasks/:id/approve", (c) => {
  const task = store.getTask(c.req.param("id"));
  if (!task) return c.json({ error: "İş bulunamadı" }, 404);
  if (task.status !== "awaiting") return c.json({ error: "Bu iş plan onayı beklemiyor" }, 409);
  store.updateTask(task.id, { status: "queued" });
  store.log(task.id, "Plan onaylandı");
  orchestrator.enqueue({ id: task.id, stage: "exec" });
  return c.json(task);
});

// Planı noktasal düzelt: yalnızca notun gerektirdiği yer değişir
app.post("/api/tasks/:id/replan", async (c) => {
  const task = store.getTask(c.req.param("id"));
  if (!task) return c.json({ error: "İş bulunamadı" }, 404);
  if (task.status !== "awaiting") return c.json({ error: "Bu iş plan onayı beklemiyor" }, 409);
  const note = text(((await c.req.json().catch(() => ({}))) as Record<string, unknown>).note, 2000);
  if (!note) return c.json({ error: "Neyin değişeceğini yaz" }, 400);
  store.updateTask(task.id, { status: "queued" });
  orchestrator.enqueue({ id: task.id, stage: "plan", note });
  return c.json(task);
});

// Teslimden sonra noktasal düzeltme: target "report" ya da bir adım kimliği
app.post("/api/tasks/:id/fix", async (c) => {
  const task = store.getTask(c.req.param("id"));
  if (!task) return c.json({ error: "İş bulunamadı" }, 404);
  if (task.status !== "done") return c.json({ error: "Düzeltme yalnızca tamamlanan işte istenir" }, 409);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const note = text(body.note, 2000);
  const target = text(body.target, 40) || "report";
  if (!note) return c.json({ error: "Neyin değişeceğini yaz" }, 400);
  if (target !== "report" && !task.plan?.steps.some((s) => s.id === target)) return c.json({ error: "Adım bulunamadı" }, 400);
  store.updateTask(task.id, { status: "queued" });
  orchestrator.enqueue({ id: task.id, stage: "fix", target, note });
  return c.json(task);
});

app.delete("/api/tasks/:id", (c) => {
  const task = store.getTask(c.req.param("id"));
  if (!task) return c.json({ error: "İş bulunamadı" }, 404);
  if (!["done", "failed", "awaiting"].includes(task.status)) return c.json({ error: "Çalışan iş silinemez" }, 409);
  store.deleteTask(task.id);
  return c.json({ ok: true });
});

app.get("/api/events", (c) =>
  streamSSE(c, async (stream) => {
    let id = 0;
    const send = (event: OfficeEvent) =>
      stream.writeSSE({ id: String(id++), event: event.type, data: JSON.stringify(event) });
    await send({ type: "snapshot", snapshot: store.snapshot() });
    const onEvent = (e: OfficeEvent) => void send(e);
    store.events.on("event", onEvent);
    const ping = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000);
    stream.onAbort(() => {
      clearInterval(ping);
      store.events.off("event", onEvent);
    });
    // bağlantı kapanana kadar bekle
    await new Promise<void>((resolve) => stream.onAbort(resolve));
  }),
);

// Üretimde derlenmiş web arayüzünü de buradan sun
if (existsSync(webDist)) {
  const rel = path.relative(process.cwd(), webDist);
  app.use("/*", serveStatic({ root: rel }));
  app.get("*", serveStatic({ root: rel, path: "index.html" }));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[ofis] ${store.snapshot().name} hazır: http://localhost:${port}  (mod: ${backend.mode}, modeller: ${backend.models.kucuk} / ${backend.models.teslim})`);
});
