import {
  EMPLOYEES,
  getEmployee,
  getManager,
  type Plan,
  type PlanStep,
  type StepResult,
  type Task,
} from "@rebirth/shared";
import type { Backend, PlanInput, Usage } from "./llm.js";
import type { OfficeStore } from "./store.js";

/**
 * Görev akışı:
 *   1. Genel Müdür görevi planlar (JSON plan)
 *   2. Adımlar faz faz çalışır; aynı fazdakiler paralel
 *   3. Genel Müdür tüm çıktılardan tek rapor çıkarır
 */
export class Orchestrator {
  private queue: string[] = [];
  private running = false;

  /** Yatakhanedeki yatak sayısı: aynı anda en fazla bu kadar çalışan dinlenir */
  private static readonly BED_COUNT = 5;
  private static readonly REST_AFTER_MS = 5 * 60_000;

  constructor(
    private readonly store: OfficeStore,
    private readonly backend: Backend,
  ) {
    setInterval(() => this.restIdle(), 30_000).unref();
  }

  enqueue(taskId: string): void {
    this.queue.push(taskId);
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        await this.runTask(id).catch((err) => {
          console.error(`[ofis] görev ${id} hata:`, err);
        });
      }
    } finally {
      this.running = false;
    }
  }

  private addUsage(task: Task, usage: Usage): void {
    task.usage.inputTokens += usage.inputTokens;
    task.usage.outputTokens += usage.outputTokens;
  }

  private async runTask(taskId: string): Promise<void> {
    const task = this.store.getTask(taskId);
    if (!task) return;
    const manager = getManager();

    try {
      // 1) Planlama
      this.store.updateTask(taskId, { status: "planning" });
      this.store.setEmployee(manager.id, "planning", "Görevi planlıyor", taskId);
      this.store.log(taskId, `Görev alındı: "${task.title}"`, manager.id);

      const { plan: rawPlan, usage: planUsage } = await this.backend.plan({
        system: manager.systemPrompt,
        prompt: buildPlanPrompt(task),
      });
      this.addUsage(task, planUsage);
      const plan = normalizePlan(rawPlan);
      this.store.updateTask(taskId, {
        plan,
        status: "running",
        results: plan.steps.map<StepResult>((s) => ({
          stepId: s.id,
          employeeId: s.employeeId,
          status: "pending",
        })),
      });
      this.store.log(
        taskId,
        `Plan hazır: ${plan.steps.length} adım, ${new Set(plan.steps.map((s) => s.phase)).size} faz. ${plan.summary}`,
        manager.id,
      );
      this.store.setEmployee(manager.id, "reviewing", "Ekibi takip ediyor", taskId);

      // 2) Fazlar
      const phases = [...new Set(plan.steps.map((s) => s.phase))].sort((a, b) => a - b);
      const outputs: Array<{ step: PlanStep; output: string }> = [];
      for (const phase of phases) {
        const steps = plan.steps.filter((s) => s.phase === phase);
        this.store.log(taskId, `Faz ${phase} başladı: ${steps.map((s) => getEmployee(s.employeeId)?.name).join(", ")}`);
        await Promise.all(
          steps.map(async (step) => {
            const emp = getEmployee(step.employeeId)!;
            this.markStep(taskId, step.id, { status: "running", startedAt: new Date().toISOString() });
            this.store.setEmployee(emp.id, "working", step.title, taskId);
            this.store.log(taskId, `${step.title} üzerinde çalışıyor`, emp.id);
            try {
              const res = await this.backend.complete({
                system: emp.systemPrompt,
                prompt: buildStepPrompt(task, step, outputs),
              });
              this.addUsage(task, res.usage);
              outputs.push({ step, output: res.text });
              this.markStep(taskId, step.id, {
                status: "done",
                output: res.text,
                finishedAt: new Date().toISOString(),
              });
              this.store.setEmployee(emp.id, "idle", "Sonucu teslim etti");
              this.store.log(taskId, `${step.title} tamamlandı`, emp.id);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              this.markStep(taskId, step.id, {
                status: "failed",
                output: `Hata: ${msg}`,
                finishedAt: new Date().toISOString(),
              });
              outputs.push({ step, output: `(Bu adım başarısız oldu: ${msg})` });
              this.store.setEmployee(emp.id, "idle", "Hata bildirdi");
              this.store.log(taskId, `${step.title} başarısız: ${msg}`, emp.id);
            }
          }),
        );
      }

      // 3) Rapor
      this.store.updateTask(taskId, { status: "collecting" });
      this.store.setEmployee(manager.id, "collecting", "Sonucu topluyor", taskId);
      const report = await this.backend.complete({
        system: manager.systemPrompt,
        prompt: buildReportPrompt(task, plan, outputs),
      });
      this.addUsage(task, report.usage);
      this.store.updateTask(taskId, { status: "done", report: report.text });
      this.store.setEmployee(manager.id, "idle", "Raporu teslim etti");
      this.store.log(taskId, "Yönetici raporu hazır", manager.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.store.updateTask(taskId, { status: "failed", error: msg });
      this.store.setEmployee(manager.id, "idle", "Görev başarısız");
      this.store.log(taskId, `Görev başarısız: ${msg}`, manager.id);
      // çalışan takılı kalmasın
      for (const e of EMPLOYEES) {
        const s = this.store.snapshot().states.find((x) => x.employeeId === e.id);
        if (s?.taskId === taskId && s.status !== "idle") this.store.setEmployee(e.id, "idle");
      }
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

  private markStep(taskId: string, stepId: string, patch: Partial<StepResult>): void {
    const task = this.store.getTask(taskId);
    if (!task) return;
    const results = task.results.map((r) => (r.stepId === stepId ? { ...r, ...patch } : r));
    this.store.updateTask(taskId, { results });
  }
}

function normalizePlan(input: PlanInput): Plan {
  const manager = getManager();
  const steps: PlanStep[] = input.steps
    .map((s, i) => {
      let employeeId = s.employeeId;
      if (!getEmployee(employeeId) || employeeId === manager.id) {
        // Bilinmeyen çalışan: isme göre eşleştirmeyi dene, olmazsa Yedek'e ver
        const byName = EMPLOYEES.find(
          (e) => !e.isManager && (e.name.toLowerCase() === s.employeeId.toLowerCase() || e.role.toLowerCase() === s.employeeId.toLowerCase()),
        );
        employeeId = byName?.id ?? "yedek";
      }
      return {
        id: `s${i + 1}`,
        employeeId,
        title: s.title.trim() || `Adım ${i + 1}`,
        instruction: s.instruction,
        phase: Math.max(1, Math.round(s.phase)),
      };
    });
  // Fazları 1..n sıkıştır
  const uniq = [...new Set(steps.map((s) => s.phase))].sort((a, b) => a - b);
  for (const s of steps) s.phase = uniq.indexOf(s.phase) + 1;
  return { summary: input.summary, steps };
}

function rosterText(): string {
  return EMPLOYEES.filter((e) => !e.isManager)
    .map((e) => `- id: ${e.id} | ${e.name} (${e.role}) | ${e.skills}`)
    .join("\n");
}

function buildPlanPrompt(task: Task): string {
  return `Yeni bir iş geldi. Bunu ekibe dağıtılacak adımlara böl.

## İş
Başlık: ${task.title}
Açıklama:
${task.brief}

## Kadro (yalnızca bu id'leri kullan)
${rosterText()}

## Kurallar
- En az 1, en fazla 8 adım. İş küçükse az adım kullan.
- Her adım tek bir çalışana atanır; aynı çalışana birden fazla adım verilebilir.
- "phase" alanı: bağımsız adımlar aynı fazda (paralel), önceki çıktıya ihtiyaç duyanlar sonraki fazda.
- "instruction" alanına çalışanın bağlamı bilmeden de işi yapabileceği kadar ayrıntılı talimat yaz.
- Yalnızca şemaya uygun JSON döndür.`;
}

function buildStepPrompt(task: Task, step: PlanStep, prior: Array<{ step: PlanStep; output: string }>): string {
  const priorText = prior.length
    ? prior
        .map(
          ({ step: s, output }) =>
            `### ${getEmployee(s.employeeId)?.name ?? s.employeeId} - ${s.title}\n${output}`,
        )
        .join("\n\n")
    : "(henüz başka çıktı yok)";
  return `## Genel iş
Başlık: ${task.title}
Açıklama:
${task.brief}

## Senin adımın: ${step.title}
${step.instruction}

## Ekip arkadaşlarının önceki çıktıları
${priorText}

Şimdi kendi adımını tamamla. Yalnızca kendi sorumluluğundaki çıktıyı üret; önceki çıktıları tekrar etme, gerekirse onlara atıf yap.`;
}

function buildReportPrompt(task: Task, plan: Plan, outputs: Array<{ step: PlanStep; output: string }>): string {
  const body = outputs
    .map(({ step, output }) => `### ${getEmployee(step.employeeId)?.name ?? step.employeeId} - ${step.title}\n${output}`)
    .join("\n\n");
  return `Ekip işi tamamladı. Aşağıdaki çıktılardan iş sahibine sunulacak tek bir yönetici raporu hazırla.

## İş
Başlık: ${task.title}
Açıklama:
${task.brief}

## Plan özeti
${plan.summary}

## Ekip çıktıları
${body}

## Rapor formatı
1. **Özet** (3-5 cümle)
2. **Teslim edilenler** (her çalışanın katkısı, kısa)
3. **Birleştirilmiş sonuç**: çıktıların çelişen yerlerini uzlaştır, kritik kod/yapılandırmaları koru
4. **Riskler ve açık sorular**
5. **Sonraki adımlar**

Ekip çıktılarının tamamını kopyalama; iş sahibinin karar vermesi için gerekli olanı aktar.`;
}
