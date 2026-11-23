/**
 * Arayüz olmadan ofisi terminalden denemek için:
 *   npm run demo -- "Başlık" "Görev açıklaması"
 */
import { getEmployee } from "@rebirth/shared";
import { createBackend } from "./llm.js";
import { Orchestrator } from "./orchestrator.js";
import { OfficeStore } from "./store.js";

const [title = "Örnek görev", brief = "Küçük bir yapılacaklar listesi uygulaması için API ve arayüz tasarla."] =
  process.argv.slice(2);

const backend = createBackend();
const store = new OfficeStore(`/tmp/rebirthofis-demo-${process.pid}`, backend.mode, backend.model);
const orchestrator = new Orchestrator(store, backend);

store.events.on("event", (e) => {
  if (e.type === "employee") console.log(`[${getEmployee(e.state.employeeId)?.name}] ${e.state.note}`);
  if (e.type === "log") console.log(`  · ${e.entry.message}`);
  if (e.type === "task" && (e.task.status === "done" || e.task.status === "failed")) {
    console.log("\n==== RAPOR ====\n");
    console.log(e.task.report ?? e.task.error);
    console.log(`\nToken: giriş ${e.task.usage.inputTokens}, çıkış ${e.task.usage.outputTokens}`);
    process.exit(e.task.status === "done" ? 0 : 1);
  }
});

const task = store.createTask(title, brief);
orchestrator.enqueue(task.id);
