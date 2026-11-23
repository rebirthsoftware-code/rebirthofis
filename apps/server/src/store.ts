import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEPARTMENTS,
  EMPLOYEES,
  OFFICE_NAME,
  STATUS_LABELS,
  type EmployeeState,
  type EmployeeStatus,
  type LogEntry,
  type OfficeEvent,
  type OfficeSnapshot,
  type Task,
} from "@rebirth/shared";

/**
 * Ofisin tüm durumu burada tutulur: çalışan durumları, görevler ve olay akışı.
 * Görevler data/office.json dosyasına yazılır; sunucu yeniden başlayınca geri yüklenir.
 */
export class OfficeStore {
  readonly events = new EventEmitter();
  private states = new Map<string, EmployeeState>();
  private tasks = new Map<string, Task>();
  private readonly file: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    dataDir: string,
    readonly mode: "live" | "mock",
    readonly model: string,
  ) {
    this.file = path.join(dataDir, "office.json");
    for (const e of EMPLOYEES) {
      this.states.set(e.id, {
        employeeId: e.id,
        status: "idle",
        note: STATUS_LABELS.idle,
        updatedAt: new Date().toISOString(),
      });
    }
    this.events.setMaxListeners(100);
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as { tasks?: Task[] };
      for (const t of parsed.tasks ?? []) {
        // Yarım kalmış görevler yeniden başlatılmaz; başarısız olarak işaretlenir.
        if (!["done", "failed"].includes(t.status)) {
          t.status = "failed";
          t.error = "Sunucu yeniden başlatıldığı için görev yarıda kaldı.";
        }
        this.tasks.set(t.id, t);
      }
    } catch {
      // dosya yoksa sorun değil
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 300);
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const payload = { savedAt: new Date().toISOString(), tasks: this.listTasks() };
    await writeFile(this.file, JSON.stringify(payload, null, 2), "utf8");
  }

  emit(event: OfficeEvent): void {
    this.events.emit("event", event);
  }

  snapshot(): OfficeSnapshot {
    return {
      name: OFFICE_NAME,
      mode: this.mode,
      model: this.model,
      departments: DEPARTMENTS,
      employees: EMPLOYEES.map(({ systemPrompt: _p, ...rest }) => rest),
      states: [...this.states.values()],
      tasks: this.listTasks(),
    };
  }

  setEmployee(employeeId: string, status: EmployeeStatus, note?: string, taskId?: string): void {
    const state: EmployeeState = {
      employeeId,
      status,
      note: note ?? STATUS_LABELS[status],
      taskId,
      updatedAt: new Date().toISOString(),
    };
    this.states.set(employeeId, state);
    this.emit({ type: "employee", state });
  }

  listTasks(): Task[] {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  createTask(title: string, brief: string): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      title,
      brief,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      results: [],
      log: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
    this.tasks.set(task.id, task);
    this.emit({ type: "task", task });
    this.scheduleSave();
    return task;
  }

  updateTask(id: string, patch: Partial<Task>): Task {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Görev bulunamadı: ${id}`);
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    this.emit({ type: "task", task });
    this.scheduleSave();
    return task;
  }

  log(taskId: string, message: string, employeeId?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const entry: LogEntry = { at: new Date().toISOString(), employeeId, message };
    task.log.push(entry);
    this.emit({ type: "log", taskId, entry });
    this.scheduleSave();
  }
}
