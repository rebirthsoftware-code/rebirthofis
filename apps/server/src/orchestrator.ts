import {
  EMPLOYEES,
  autoFindings,
  fixPrompt,
  getEmployee,
  getManager,
  getReviewer,
  planPrompt,
  reportFixPrompt,
  reportPrompt,
  reviewPrompt,
  stepPrompt,
  taskFiles,
  type Plan,
  type PlanStep,
  type Review,
  type StepOutput,
  type StepResult,
  type Task,
} from "@rebirth/shared";
import type { Backend, PlanInput, Usage } from "./llm.js";
import type { OfficeStore } from "./store.js";

type Job =
  | { id: string; stage: "plan"; note?: string }
  | { id: string; stage: "exec" }
  | { id: string; stage: "fix"; target: string; note: string };

/**
 * İş akışı:
 *   1. Genel Müdür işi beş parçalı brife göre planlar
 *   2. İş sahibi planı onaylar (istenirse)
 *   3. Adımlar faz faz çalışır; her çalışan teslimini kendi kontrol eder
 *   4. QA teslimi kabul ölçütüne göre denetler; gerekirse tek düzeltme turu
 *   5. Genel Müdür dürüst bir teslim raporu yazar
 *   Sonrasında iş sahibi noktasal düzeltme isteyebilir.
 */
export class Orchestrator {
  private queue: Job[] = [];
  private running = false;
  private static readonly BED_COUNT = 5;
  private static readonly REST_AFTER_MS = 5 * 60_000;

  constructor(
    private readonly store: OfficeStore,
    private readonly backend: Backend,
  ) {
    setInterval(() => this.restIdle(), 30_000).unref();
  }

  enqueue(job: Job): void {
    this.queue.push(job);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!;
        const task = this.store.getTask(job.id);
        if (!task) continue;
        try {
          if (job.stage === "plan") await this.planStage(task, job.note);
          else if (job.stage === "exec") await this.execStage(task);
          else await this.userFixStage(task, job.target, job.note);
        } catch (err) {
          this.fail(task, err);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private fail(task: Task, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ofis] iş ${task.id} durdu:`, msg);
    this.store.updateTask(task.id, { status: "failed", error: msg });
    this.store.log(task.id, `İş durdu: ${msg}`, getManager().id);
    for (const s of this.store.snapshot().states) {
      if (s.taskId === task.id && !["idle", "resting"].includes(s.status)) this.store.setEmployee(s.employeeId, "idle");
    }
  }

  private addUsage(task: Task, usage: Usage): void {
    task.usage.inputTokens += usage.inputTokens;
    task.usage.outputTokens += usage.outputTokens;
  }

  private async planStage(task: Task, note?: string): Promise<void> {
    const manager = getManager();
    this.store.updateTask(task.id, { status: "planning", error: undefined });
    this.store.setEmployee(manager.id, "planning", note ? "Planı düzeltiyor" : "İşi planlıyor", task.id);
    this.store.log(task.id, note ? `Plan düzeltme notu: "${note}"` : `İş alındı: "${task.title}"`, manager.id);

    const { plan: raw, usage } = await this.backend.plan({
      system: manager.systemPrompt,
      prompt: planPrompt(task, note),
      depth: task.depth,
      meta: { kind: "plan" },
    });
    this.addUsage(task, usage);
    const plan = normalizePlan(raw, task);
    this.store.updateTask(task.id, {
      plan,
      review: undefined,
      report: undefined,
      results: plan.steps.map<StepResult>((s) => ({ stepId: s.id, employeeId: s.employeeId, status: "pending" })),
    });
    this.store.log(task.id, `Plan hazır: ${plan.steps.length} adım, ${new Set(plan.steps.map((s) => s.phase)).size} faz. ${plan.summary}`, manager.id);

    if (task.planFirst) {
      this.store.updateTask(task.id, { status: "awaiting" });
      this.store.setEmployee(manager.id, "idle", "Planı onaya sundu");
      return;
    }
    await this.execStage(task);
  }

  private markStep(task: Task, stepId: string, patch: Partial<StepResult>): void {
    const results = task.results.map((r) => (r.stepId === stepId ? { ...r, ...patch } : r));
    this.store.updateTask(task.id, { results });
  }

  private async runStep(task: Task, step: PlanStep, prompt: string, label: string) {
    const emp = getEmployee(step.employeeId)!;
    this.markStep(task, step.id, { status: "running", startedAt: new Date().toISOString() });
    this.store.setEmployee(emp.id, "working", step.title, task.id);
    this.store.log(task.id, label, emp.id);
    const res = await this.backend.complete({
      system: emp.systemPrompt,
      prompt,
      depth: task.depth,
      meta: { kind: "step", employeeId: emp.id },
    });
    this.addUsage(task, res.usage);
    this.markStep(task, step.id, { status: "done", output: res.text, truncated: res.truncated, finishedAt: new Date().toISOString() });
    this.store.setEmployee(emp.id, "idle", "Teslim etti");
    return res;
  }

  private async execStage(task: Task): Promise<void> {
    const manager = getManager();
    const reviewer = getReviewer();
    const plan = task.plan;
    if (!plan) throw new Error("Plan olmadan iş başlatılamaz");
    this.store.updateTask(task.id, { status: "running" });
    this.store.setEmployee(manager.id, "reviewing", "Ekibi takip ediyor", task.id);

    // Fazlar
    const phases = [...new Set(plan.steps.map((s) => s.phase))].sort((a, b) => a - b);
    const outputs: StepOutput[] = [];
    for (const phase of phases) {
      const steps = plan.steps.filter((s) => s.phase === phase);
      this.store.log(task.id, `Faz ${phase} başladı: ${steps.map((s) => getEmployee(s.employeeId)?.name).join(", ")}`);
      const prior = outputs.slice();
      await Promise.all(
        steps.map(async (step) => {
          try {
            const res = await this.runStep(task, step, stepPrompt(task, step, prior), `${step.title} üzerinde çalışıyor`);
            outputs.push({ step, output: res.text, truncated: res.truncated });
            this.store.log(task.id, `${step.title} teslim edildi`, step.employeeId);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.markStep(task, step.id, { status: "failed", output: `Hata: ${msg}`, finishedAt: new Date().toISOString() });
            outputs.push({ step, output: `(Bu teslim yapılamadı: ${msg})` });
            this.store.setEmployee(step.employeeId, "idle", "Hata bildirdi");
            this.store.log(task.id, `${step.title} yapılamadı: ${msg}`, step.employeeId);
          }
        }),
      );
    }

    // Teslim kontrolü: müşteri kabul eder mi?
    this.store.updateTask(task.id, { status: "checking" });
    this.store.setEmployee(reviewer.id, "reviewing", "Teslimi kontrol ediyor", task.id);
    this.store.log(task.id, "Teslim kontrolü başladı", reviewer.id);
    let review: Review | undefined;
    try {
      const { review: raw, usage } = await this.backend.review({
        system: reviewer.systemPrompt,
        prompt: reviewPrompt(task, plan, outputs, autoFindings(outputs, (id) => getEmployee(id)?.name ?? id)),
        depth: task.depth,
        meta: { kind: "review", acceptance: plan.acceptance },
      });
      this.addUsage(task, usage);
      const stepIds = new Set(plan.steps.map((s) => s.id));
      review = {
        passed: raw.passed,
        checks: raw.checks.slice(0, 12),
        fixes: raw.fixes.filter((f) => stepIds.has(f.stepId) && f.note).slice(0, 3).map((f) => ({ ...f, applied: false })),
      };
      this.store.updateTask(task.id, { review });
      this.store.log(task.id, review.passed && !review.fixes.length ? "Teslim kontrolü geçti" : `Teslim kontrolü ${review.fixes.length} düzeltme istedi`, reviewer.id);
    } catch (err) {
      this.store.log(task.id, `Teslim kontrolü yapılamadı: ${err instanceof Error ? err.message : String(err)}`, reviewer.id);
    }
    this.store.setEmployee(reviewer.id, "idle", "Kontrolü bitirdi");

    // Tek düzeltme turu: yalnızca istenen yer değişir.
    if (review?.fixes.length) {
      this.store.updateTask(task.id, { status: "revising" });
      await Promise.all(
        review.fixes.map(async (fix) => {
          const step = plan.steps.find((s) => s.id === fix.stepId)!;
          const entry = outputs.find((o) => o.step.id === step.id);
          const previous = entry?.output ?? "";
          try {
            const res = await this.runStep(task, step, fixPrompt(task, step, previous, fix.note, "Kalite kontrolün"), `Düzeltiyor: ${fix.note}`);
            if (entry) Object.assign(entry, { output: res.text, truncated: res.truncated });
            fix.applied = true;
            this.markStep(task, step.id, { revised: true });
            this.store.log(task.id, `${step.title} düzeltildi`, step.employeeId);
          } catch (err) {
            this.markStep(task, step.id, { status: "done", output: previous });
            this.store.setEmployee(step.employeeId, "idle", "Düzeltemedi");
            this.store.log(task.id, `${step.title} düzeltilemedi: ${err instanceof Error ? err.message : String(err)}`, step.employeeId);
          }
        }),
      );
      this.store.updateTask(task.id, { review });
    }

    // Rapor
    this.store.updateTask(task.id, { status: "collecting" });
    this.store.setEmployee(manager.id, "collecting", "Sonucu topluyor", task.id);
    const report = await this.backend.complete({
      system: manager.systemPrompt,
      prompt: reportPrompt(task, outputs, review, taskFiles(task)),
      depth: task.depth,
      meta: { kind: "report" },
    });
    this.addUsage(task, report.usage);
    this.store.updateTask(task.id, { status: "done", report: report.text });
    this.store.setEmployee(manager.id, "idle", "Raporu teslim etti");
    this.store.log(task.id, "Teslim raporu hazır", manager.id);
  }

  /** İş sahibinin noktasal düzeltmesi: yalnızca söylenen yer değişir. */
  private async userFixStage(task: Task, target: string, note: string): Promise<void> {
    const manager = getManager();
    if (!task.plan) throw new Error("Bu işin planı yok");
    this.store.updateTask(task.id, { status: "revising", error: undefined, fixes: [...task.fixes, { at: new Date().toISOString(), target, note }] });
    let changed: string | undefined;
    if (target !== "report") {
      const step = task.plan.steps.find((s) => s.id === target);
      const result = task.results.find((r) => r.stepId === target);
      if (!step || !result) throw new Error("Düzeltilecek adım bulunamadı");
      const previous = result.output ?? "";
      try {
        const res = await this.runStep(task, step, fixPrompt(task, step, previous, note, "İş sahibinin"), `Düzeltiyor: ${note}`);
        this.markStep(task, step.id, { revised: true });
        changed = `### ${getEmployee(step.employeeId)?.name} - ${step.title}\n${res.text}`;
        this.store.log(task.id, `${step.title} düzeltildi`, step.employeeId);
      } catch (err) {
        this.markStep(task, step.id, { status: "done", output: previous });
        this.store.setEmployee(step.employeeId, "idle");
        this.store.updateTask(task.id, { status: "done" });
        throw err;
      }
    }
    this.store.updateTask(task.id, { status: "collecting" });
    this.store.setEmployee(manager.id, "collecting", "Raporu güncelliyor", task.id);
    const previousReport = task.report ?? "";
    try {
      const rep = await this.backend.complete({
        system: manager.systemPrompt,
        prompt: reportFixPrompt(task, previousReport, note, changed),
        depth: task.depth,
        meta: { kind: "report" },
      });
      this.addUsage(task, rep.usage);
      this.store.updateTask(task.id, { status: "done", report: rep.text });
      this.store.log(task.id, "Rapor güncellendi", manager.id);
    } finally {
      this.store.setEmployee(manager.id, "idle", "Raporu teslim etti");
    }
  }

  /** Uzun süre boşta kalanlar yatakhaneye geçer (görsel tat); yatak kadar kişi dinlenir. */
  private restIdle(): void {
    const states = this.store.snapshot().states;
    let resting = states.filter((s) => s.status === "resting").length;
    for (const s of states) {
      if (resting >= Orchestrator.BED_COUNT) break;
      if (s.status === "idle" && Date.now() - Date.parse(s.updatedAt) > Orchestrator.REST_AFTER_MS) {
        this.store.setEmployee(s.employeeId, "resting");
        resting++;
      }
    }
  }
}

function normalizePlan(input: PlanInput, task: Task): Plan {
  const steps: PlanStep[] = input.steps.slice(0, 5).map((s, i) => {
    let employeeId = s.employeeId;
    const found = getEmployee(employeeId);
    if (!found || found.isManager) {
      const byName = EMPLOYEES.find(
        (e) => !e.isManager && (e.name.toLowerCase() === s.employeeId.toLowerCase() || e.role.toLowerCase() === s.employeeId.toLowerCase()),
      );
      employeeId = byName?.id ?? "yedek";
    }
    return {
      id: `s${i + 1}`,
      employeeId,
      title: s.title.trim() || `Adım ${i + 1}`,
      deliverable: s.deliverable,
      instruction: s.instruction,
      format: s.format,
      acceptance: s.acceptance.filter(Boolean).slice(0, 8),
      phase: Math.max(1, Math.round(s.phase)),
    };
  });
  const uniq = [...new Set(steps.map((s) => s.phase))].sort((a, b) => a - b);
  for (const s of steps) s.phase = uniq.indexOf(s.phase) + 1;
  const acceptance = input.acceptance.filter(Boolean).slice(0, 8);
  return {
    summary: input.summary,
    audience: task.spec.audience || input.audience,
    format: task.spec.format || input.format,
    acceptance: acceptance.length ? acceptance : task.spec.acceptance ? [task.spec.acceptance] : [],
    steps,
  };
}
