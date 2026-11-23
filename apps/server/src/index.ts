import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OfficeEvent } from "@rebirth/shared";
import { createBackend } from "./llm.js";
import { Orchestrator } from "./orchestrator.js";
import { OfficeStore } from "./store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../../..");
const dataDir = process.env.OFFICE_DATA_DIR ?? path.join(rootDir, "data");
const webDist = path.join(rootDir, "apps/web/dist");

const backend = createBackend();
const store = new OfficeStore(dataDir, backend.mode, backend.model);
await store.load();
const orchestrator = new Orchestrator(store, backend);

const app = new Hono();
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, mode: backend.mode, model: backend.model }));

app.get("/api/office", (c) => c.json(store.snapshot()));

app.get("/api/tasks", (c) => c.json(store.listTasks()));

app.get("/api/tasks/:id", (c) => {
  const task = store.getTask(c.req.param("id"));
  return task ? c.json(task) : c.json({ error: "Görev bulunamadı" }, 404);
});

app.post("/api/tasks", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { title?: string; brief?: string };
  const title = body.title?.trim();
  const brief = body.brief?.trim();
  if (!title || !brief) return c.json({ error: "title ve brief zorunlu" }, 400);
  if (title.length > 200 || brief.length > 20_000) return c.json({ error: "Metin çok uzun" }, 400);
  const task = store.createTask(title, brief);
  orchestrator.enqueue(task.id);
  return c.json(task, 201);
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
  console.log(`[ofis] ${store.snapshot().name} hazır: http://localhost:${port}  (mod: ${backend.mode}, model: ${backend.model})`);
});
