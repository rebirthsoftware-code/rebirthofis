/** Ortak tipler: hem sunucu hem de web arayüzü bu dosyayı kullanır. */

export type EmployeeStatus =
  | "idle"
  | "planning"
  | "working"
  | "reviewing"
  | "collecting"
  | "resting";

export interface Department {
  id: string;
  name: string;
  /** Departman rengi (hex) */
  color: string;
  /** Izgara koordinatları (birim: kare) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Dinlenme alanı gibi masasız bölgeler */
  kind?: "office" | "rest";
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  /** Bu çalışanın yetkinliklerini anlatan kısa cümle (planlama için) */
  skills: string;
  /** Claude'a verilen sistem istemi */
  systemPrompt: string;
  /** Genel Müdür: görevleri planlar ve raporu toplar */
  isManager?: boolean;
  /** Masa konumu (departman içinde, kare cinsinden) */
  desk: { x: number; y: number };
}

export interface EmployeeState {
  employeeId: string;
  status: EmployeeStatus;
  /** Baloncukta gösterilen kısa not: "Görevi planlıyor" vb. */
  note: string;
  taskId?: string;
  updatedAt: string;
}

export type TaskStatus =
  | "queued"
  | "planning"
  | "running"
  | "collecting"
  | "done"
  | "failed";

export interface PlanStep {
  id: string;
  employeeId: string;
  title: string;
  instruction: string;
  /** Aynı fazdaki adımlar paralel çalışır */
  phase: number;
}

export interface Plan {
  summary: string;
  steps: PlanStep[];
}

export interface StepResult {
  stepId: string;
  employeeId: string;
  status: "pending" | "running" | "done" | "failed";
  output?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface LogEntry {
  at: string;
  employeeId?: string;
  message: string;
}

export interface Task {
  id: string;
  title: string;
  brief: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  plan?: Plan;
  results: StepResult[];
  report?: string;
  error?: string;
  log: LogEntry[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface OfficeSnapshot {
  name: string;
  mode: "live" | "mock";
  model: string;
  departments: Department[];
  employees: Omit<Employee, "systemPrompt">[];
  states: EmployeeState[];
  tasks: Task[];
}

export type OfficeEvent =
  | { type: "snapshot"; snapshot: OfficeSnapshot }
  | { type: "employee"; state: EmployeeState }
  | { type: "task"; task: Task }
  | { type: "log"; taskId: string; entry: LogEntry };

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  idle: "Boşta",
  planning: "Görevi planlıyor",
  working: "Çalışıyor",
  reviewing: "İnceliyor",
  collecting: "Sonucu topluyor",
  resting: "Dinleniyor",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: "Sırada",
  planning: "Planlanıyor",
  running: "Çalışılıyor",
  collecting: "Rapor hazırlanıyor",
  done: "Tamamlandı",
  failed: "Başarısız",
};
