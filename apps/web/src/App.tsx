import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  STATUS_LABELS,
  TASK_STATUS_LABELS,
  type Task,
} from "@rebirth/shared";
import { createTask } from "./api";
import { Office } from "./Office";
import { useOffice } from "./useOffice";

const EXAMPLES = [
  {
    title: "Berber randevu uygulaması",
    brief:
      "Berberler için online randevu alma web uygulaması. Müşteri kaydı, takvim, SMS hatırlatma ve kartla ödeme olsun. Güvenlik, test planı ve ilk 3 aylık maliyet tahmini de istiyorum.",
  },
  {
    title: "SaaS açılış sayfası",
    brief:
      "Küçük işletmeler için stok takip SaaS ürünümüzün açılış sayfası: değer önerisi, fiyatlandırma bölümü, SSS ve React ile bileşen yapısı. Pazarlama metinleri Türkçe olsun.",
  },
  {
    title: "Kullanıcı girişi ve yetkilendirme",
    brief:
      "Mevcut Node.js API'mize e-posta/şifre + Google ile giriş, rol tabanlı yetkilendirme ve KVKK uyumlu oturum yönetimi ekle. Test senaryoları ve güvenlik incelemesi dahil.",
  },
];

export function App() {
  const { snapshot, connected } = useOffice();
  const [selectedEmployee, setSelectedEmployee] = useState<string | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasks = snapshot?.tasks ?? [];
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? tasks[0];

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) setSelectedTaskId(tasks[0].id);
  }, [tasks, selectedTaskId]);

  const employee = snapshot?.employees.find((e) => e.id === selectedEmployee);
  const employeeState = snapshot?.states.find((s) => s.employeeId === selectedEmployee);
  const employeeDept = snapshot?.departments.find((d) => d.id === employee?.departmentId);

  const activeCount = snapshot?.states.filter((s) => !["idle", "resting"].includes(s.status)).length ?? 0;
  const queued = tasks.filter((t) => !["done", "failed"].includes(t.status)).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const t = await createTask(title, brief);
      setSelectedTaskId(t.id);
      setTitle("");
      setBrief("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="layout">
      <main className="stage">
        <header className="stage-head">
          <div>
            <div className="eyebrow">YAPAY ZEKA YAZILIM OFİSİ</div>
            <h1>{snapshot?.name ?? "Rebirth Ofis"}</h1>
          </div>
          <div className="stats">
            <span className={`dot ${connected ? "on" : "off"}`} title={connected ? "Bağlı" : "Bağlantı yok"} />
            <span className={`badge ${snapshot?.mode ?? ""}`}>
              {snapshot?.mode === "live" ? `CANLI · ${snapshot.model}` : "SİMÜLASYON"}
            </span>
            <span className="stat">{snapshot?.employees.length ?? 0} çalışan</span>
            <span className="stat">{activeCount} aktif</span>
            <span className="stat">{queued} açık görev</span>
          </div>
        </header>
        {snapshot ? (
          <Office
            departments={snapshot.departments}
            employees={snapshot.employees}
            states={snapshot.states}
            selectedId={selectedEmployee}
            onSelect={(id) => setSelectedEmployee((cur) => (cur === id ? undefined : id))}
          />
        ) : (
          <div className="loading">Ofis açılıyor…</div>
        )}
        {employee && (
          <aside className="employee-card">
            <div className="card-head">
              <span className="swatch" style={{ background: employeeDept?.color }} />
              <div>
                <strong>{employee.name}</strong>
                <div className="muted">
                  {employee.role} · {employeeDept?.name}
                </div>
              </div>
              <button className="icon" onClick={() => setSelectedEmployee(undefined)} aria-label="Kapat">
                ×
              </button>
            </div>
            <p>{employee.skills}</p>
            <div className="muted">
              Durum: <b>{STATUS_LABELS[employeeState?.status ?? "idle"]}</b>
              {employeeState?.note && employeeState.note !== STATUS_LABELS[employeeState.status] ? ` · ${employeeState.note}` : ""}
            </div>
          </aside>
        )}
      </main>

      <section className="panel">
        <form className="new-task" onSubmit={submit}>
          <h2>Yeni görev ver</h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Başlık (örn. Berber randevu uygulaması)"
            maxLength={200}
            required
          />
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Ne istediğini ekibe anlatır gibi yaz. Genel Müdür işi bölüp doğru çalışanlara dağıtacak."
            rows={5}
            required
          />
          <div className="row">
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button
                  type="button"
                  key={ex.title}
                  className="chip"
                  onClick={() => {
                    setTitle(ex.title);
                    setBrief(ex.brief);
                  }}
                >
                  {ex.title}
                </button>
              ))}
            </div>
            <button type="submit" className="primary" disabled={sending || !title.trim() || !brief.trim()}>
              {sending ? "Gönderiliyor…" : "Ofise gönder"}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>

        <div className="tasks">
          <h2>Görevler</h2>
          {tasks.length === 0 && <div className="muted">Henüz görev yok. Yukarıdan ilk işi ver.</div>}
          <ul>
            {tasks.map((t) => (
              <li key={t.id} className={t.id === selectedTask?.id ? "active" : ""} onClick={() => setSelectedTaskId(t.id)}>
                <span className={`status ${t.status}`}>{TASK_STATUS_LABELS[t.status]}</span>
                <span className="title">{t.title}</span>
                <span className="time">{new Date(t.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </div>

        {selectedTask && snapshot && <TaskDetail task={selectedTask} nameOf={(id) => snapshot.employees.find((e) => e.id === id)?.name ?? id} />}
      </section>
    </div>
  );
}

function TaskDetail({ task, nameOf }: { task: Task; nameOf: (id: string) => string }) {
  const [tab, setTab] = useState<"plan" | "log" | "report">("plan");
  useEffect(() => {
    if (task.status === "done") setTab("report");
  }, [task.status, task.id]);

  const reportHtml = useMemo(
    () => (task.report ? DOMPurify.sanitize(marked.parse(task.report, { async: false }) as string) : ""),
    [task.report],
  );

  return (
    <div className="detail">
      <div className="detail-head">
        <h2>{task.title}</h2>
        <span className={`status ${task.status}`}>{TASK_STATUS_LABELS[task.status]}</span>
      </div>
      <p className="brief">{task.brief}</p>
      <div className="tabs">
        <button className={tab === "plan" ? "on" : ""} onClick={() => setTab("plan")}>
          Plan {task.plan ? `(${task.plan.steps.length})` : ""}
        </button>
        <button className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>
          Akış ({task.log.length})
        </button>
        <button className={tab === "report" ? "on" : ""} onClick={() => setTab("report")} disabled={!task.report}>
          Rapor
        </button>
      </div>

      {tab === "plan" && (
        <div className="plan">
          {!task.plan && <div className="muted">Genel Müdür planı hazırlıyor…</div>}
          {task.plan && <p className="muted">{task.plan.summary}</p>}
          {task.plan?.steps.map((s) => {
            const r = task.results.find((x) => x.stepId === s.id);
            return (
              <details key={s.id} className={`step ${r?.status ?? "pending"}`}>
                <summary>
                  <span className="phase">F{s.phase}</span>
                  <span className="who">{nameOf(s.employeeId)}</span>
                  <span className="what">{s.title}</span>
                  <span className={`pill ${r?.status ?? "pending"}`}>{stepLabel(r?.status)}</span>
                </summary>
                <div className="instruction">
                  <b>Talimat:</b> {s.instruction}
                </div>
                {r?.output && (
                  <div
                    className="md"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(r.output, { async: false }) as string) }}
                  />
                )}
              </details>
            );
          })}
        </div>
      )}

      {tab === "log" && (
        <ul className="log">
          {task.log.map((l, i) => (
            <li key={i}>
              <span className="time">{new Date(l.at).toLocaleTimeString("tr-TR")}</span>
              {l.employeeId && <span className="who">{nameOf(l.employeeId)}</span>}
              <span>{l.message}</span>
            </li>
          ))}
        </ul>
      )}

      {tab === "report" && (
        <div>
          {task.error && <div className="error">{task.error}</div>}
          <div className="md report" dangerouslySetInnerHTML={{ __html: reportHtml }} />
          {(task.usage.inputTokens > 0 || task.usage.outputTokens > 0) && (
            <div className="muted small">
              Token: giriş {task.usage.inputTokens.toLocaleString("tr-TR")} · çıkış {task.usage.outputTokens.toLocaleString("tr-TR")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function stepLabel(s?: string) {
  switch (s) {
    case "running":
      return "çalışıyor";
    case "done":
      return "bitti";
    case "failed":
      return "hata";
    default:
      return "bekliyor";
  }
}
