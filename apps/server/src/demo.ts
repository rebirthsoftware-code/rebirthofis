/**
 * Arayüz olmadan ofisi terminalden denemek için:
 *   npm run demo -- "Ne teslim edilecek" "Kim için" "Teslim biçimi" "Kabul ölçütü"
 */
import { getEmployee, taskFiles } from "@rebirth/shared";
import { createBackend } from "./llm.js";
import { Orchestrator } from "./orchestrator.js";
import { OfficeStore } from "./store.js";

const [
  title = "Kavruk kahve dükkânı için tek sayfalık tanıtım sitesi",
  audience = "Kadıköy'de kahve meraklıları",
  format = "Tek HTML dosyası",
  acceptance = "Telefon genişliğinde taşan yer yok",
] = process.argv.slice(2);

const backend = createBackend();
const store = new OfficeStore(`/tmp/rebirthofis-demo-${process.pid}`, backend.mode, backend.models);
const orchestrator = new Orchestrator(store, backend);

store.events.on("event", (e) => {
  if (e.type === "employee") console.log(`[${getEmployee(e.state.employeeId)?.name}] ${e.state.note}`);
  if (e.type === "log") console.log(`  · ${e.entry.message}`);
  if (e.type === "task" && (e.task.status === "done" || e.task.status === "failed")) {
    console.log("\n==== RAPOR ====\n");
    console.log(e.task.report ?? e.task.error);
    console.log(`\nDosyalar: ${taskFiles(e.task).map((f) => f.name).join(", ") || "-"}`);
    console.log(`Token: giriş ${e.task.usage.inputTokens}, çıkış ${e.task.usage.outputTokens}`);
    process.exit(e.task.status === "done" ? 0 : 1);
  }
});

const task = store.createTask({ title, spec: { audience, material: "", format, acceptance }, depth: "teslim", planFirst: false });
orchestrator.enqueue({ id: task.id, stage: "plan" });
