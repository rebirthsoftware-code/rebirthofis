/** Ortak tipler: hem sunucu hem de web arayüzü bu dosyayı kullanır. */

export type EmployeeStatus = "idle" | "planning" | "working" | "reviewing" | "collecting" | "resting";

export interface Department {
  id: string;
  name: string;
  color: string;
  /** Izgara koordinatları (birim: kare) */
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: "office" | "rest";
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  /** Planlama sırasında Genel Müdür'ün gördüğü yetkinlik özeti */
  skills: string;
  /** Claude'a verilen sistem istemi */
  systemPrompt: string;
  isManager?: boolean;
  /** Masa konumu (departman içinde, kare cinsinden) */
  desk: { x: number; y: number };
}

export interface EmployeeState {
  employeeId: string;
  status: EmployeeStatus;
  note: string;
  taskId?: string;
  updatedAt: string;
}

export type TaskStatus =
  | "queued"
  | "planning"
  | "awaiting"
  | "running"
  | "checking"
  | "revising"
  | "collecting"
  | "done"
  | "failed";

/** Beş parçalı brifin iş başlığı dışındaki dört parçası. */
export interface TaskSpec {
  audience: string;
  material: string;
  format: string;
  acceptance: string;
}

/** kucuk: Opus 5.5 · teslim: Fable 5.2 medium · uzun: Fable 5.2 high */
export type TaskDepth = "kucuk" | "teslim" | "uzun";

export interface PlanStep {
  id: string;
  employeeId: string;
  title: string;
  /** Bu adımda ne teslim edilecek, adetleriyle */
  deliverable: string;
  /** Hedef ve bağlam (adım adım komut değil) */
  instruction: string;
  format: string;
  acceptance: string[];
  /** Aynı fazdaki adımlar paralel çalışır */
  phase: number;
}

export interface Plan {
  summary: string;
  audience: string;
  format: string;
  acceptance: string[];
  steps: PlanStep[];
}

export interface StepResult {
  stepId: string;
  employeeId: string;
  status: "pending" | "running" | "done" | "failed";
  output?: string;
  startedAt?: string;
  finishedAt?: string;
  truncated?: boolean;
  revised?: boolean;
}

export interface Review {
  passed: boolean;
  checks: Array<{ criterion: string; ok: boolean; note: string }>;
  fixes: Array<{ stepId: string; note: string; applied: boolean }>;
}

export interface LogEntry {
  at: string;
  employeeId?: string;
  message: string;
}

export interface Task {
  id: string;
  /** Brifin 1. parçası: ne teslim edilecek */
  title: string;
  spec: TaskSpec;
  depth: TaskDepth;
  planFirst: boolean;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  plan?: Plan;
  results: StepResult[];
  review?: Review;
  report?: string;
  error?: string;
  log: LogEntry[];
  fixes: Array<{ at: string; target: string; note: string }>;
  usage: { inputTokens: number; outputTokens: number };
}

export interface OfficeSnapshot {
  name: string;
  mode: "live" | "mock";
  models: Record<TaskDepth, string>;
  departments: Department[];
  employees: Omit<Employee, "systemPrompt">[];
  states: EmployeeState[];
  tasks: Task[];
}

export type OfficeEvent =
  | { type: "snapshot"; snapshot: OfficeSnapshot }
  | { type: "employee"; state: EmployeeState }
  | { type: "task"; task: Task }
  | { type: "task_deleted"; taskId: string }
  | { type: "log"; taskId: string; entry: LogEntry };

export const STATUS_LABELS: Record<EmployeeStatus, string> = {
  idle: "Boşta",
  planning: "İşi planlıyor",
  working: "Çalışıyor",
  reviewing: "Kontrol ediyor",
  collecting: "Sonucu topluyor",
  resting: "Dinleniyor",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  queued: "Sırada",
  planning: "Planlanıyor",
  awaiting: "Plan onayı bekliyor",
  running: "Çalışılıyor",
  checking: "Teslim kontrolü",
  revising: "Düzeltiliyor",
  collecting: "Rapor hazırlanıyor",
  done: "Tamamlandı",
  failed: "Başarısız",
};

export const DEPTH_LABELS: Record<TaskDepth, string> = {
  kucuk: "Küçük iş · Opus 5.5",
  teslim: "Teslimlik iş · Fable 5.2",
  uzun: "Uzun iş · Fable 5.2 High",
};
