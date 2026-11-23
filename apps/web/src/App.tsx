import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  DEPTH_LABELS,
  STATUS_LABELS,
  TASK_STATUS_LABELS,
  TEMPLATES,
  taskFiles,
  type DeliveredFile,
  type Task,
  type TaskDepth,
} from "@rebirth/shared";
import { approvePlan, createTask, deleteTask, replan, requestFix } from "./api";
import { Office } from "./Office";
import { useOffice } from "./useOffice";

const md = (text?: string) => (text ? DOMPurify.sanitize(marked.parse(text, { async: false }) as string) : "");
const EMPTY = { title: "", audience: "", material: "", format: "", acceptance: "" };
type Tab = "plan" | "log" | "files" | "report";

export function App() {
  const { snapshot, connected } = useOffice();
  const [selectedEmployee, setSelectedEmployee] = useState<string | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [form, setForm] = useState(EMPTY);
  const [depth, setDepth] = useState<TaskDepth>("teslim");
  const [planFirst, setPlanFirst] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasks = snapshot?.tasks ?? [];
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? tasks[0];

  const employee = snapshot?.employees.find((e) => e.id === selectedEmployee);
  const employeeState = snapshot?.states.find((s) => s.employeeId === selectedEmployee);
  const employeeDept = snapshot?.departments.find((d) => d.id === employee?.departmentId);
  const activeCount = snapshot?.states.filter((s) => !["idle", "resting"].includes(s.status)).length ?? 0;
  const open = tasks.filter((t) => !["done", "failed"].includes(t.status)).length;
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const all = Object.values(form).join("\n");
    if (!form.title.trim()) return setError("İşi tek cümleyle yaz: ne teslim edilecek?");
    if (/\[[^\]\n]{2,}\]/.test(all)) return setError("Köşeli parantezli yerleri kendi işinle doldur; doldurmazsan sonuç da sıradan çıkar.");
    setSending(true);
    try {
      const t = await createTask({ ...form, depth, planFirst });
      setSelectedTaskId(t.id);
      setForm(EMPTY);
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
            <span className={`badge ${snapshot?.mode ?? ""}`}>{snapshot?.mode === "live" ? "CANLI · Claude" : "SİMÜLASYON"}</span>
            <span className="stat">{snapshot?.employees.length ?? 0} çalışan</span>
            <span className="stat">{activeCount} aktif</span>
            <span className="stat">{open} açık iş</span>
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
          <h2>Yeni iş ver</h2>
          <div className="examples">
            {TEMPLATES.map((t) => (
              <button type="button" key={t.name} className="chip" onClick={() => { const { name: _n, ...rest } = t; setForm(rest); setError(null); }}>
                {t.name}
              </button>
            ))}
          </div>
          <Field n={1} label="İş">
            <input value={form.title} onChange={set("title")} placeholder="Ne teslim edilecek, tek cümle" maxLength={300} required />
          </Field>
          <Field n={2} label="Kim için">
            <input value={form.audience} onChange={set("audience")} placeholder="Müşteri ya da izleyici kim?" maxLength={300} />
          </Field>
          <Field n={3} label="Malzeme">
            <textarea value={form.material} onChange={set("material")} placeholder="Elindeki metin, not, tablo, örnek. Anlatmak yerine yapıştır." rows={4} />
          </Field>
          <Field n={4} label="Teslim biçimi">
            <input value={form.format} onChange={set("format")} placeholder="Dosya türü, ölçü, adet. Örn: tek HTML dosyası" maxLength={300} />
          </Field>
          <Field n={5} label="Kabul ölçütü">
            <input value={form.acceptance} onChange={set("acceptance")} placeholder="İşin bittiğini neye bakarak anlayacaksın?" maxLength={600} />
          </Field>
          <div className="row">
            <label className="tier">
              Model
              <select value={depth} onChange={(e) => setDepth(e.target.value as TaskDepth)}>
                {(Object.keys(DEPTH_LABELS) as TaskDepth[]).map((d) => (
                  <option key={d} value={d}>
                    {DEPTH_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="primary" disabled={sending}>
              {sending ? "Gönderiliyor…" : "Ofise gönder"}
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={planFirst} onChange={(e) => setPlanFirst(e.target.checked)} /> Başlamadan önce planı bana göster
          </label>
          {error && <div className="error">{error}</div>}
        </form>

        <div className="tasks">
          <h2>İşler</h2>
          {tasks.length === 0 && <div className="muted">Henüz iş yok. Yukarıdan ilk işi ver.</div>}
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

        {selectedTask && snapshot && (
          <TaskDetail key={selectedTask.id} task={selectedTask} nameOf={(id) => snapshot.employees.find((e) => e.id === id)?.name ?? id} />
        )}
      </section>
    </div>
  );
}

function Field({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>
        <b>{n}</b>
        {label}
      </span>
      {children}
    </label>
  );
}

const Mark = ({ ok }: { ok: boolean | null }) =>
  ok === true ? <span className="mark-ok">✓</span> : ok === false ? <span className="mark-bad">✗</span> : <span className="mark-q">•</span>;

function TaskDetail({ task, nameOf }: { task: Task; nameOf: (id: string) => string }) {
  const [tab, setTab] = useState<Tab>("plan");
  const [planNote, setPlanNote] = useState("");
  const [fixNote, setFixNote] = useState("");
  const [fixTarget, setFixTarget] = useState("report");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const files = useMemo(() => taskFiles(task), [task]);

  useEffect(() => {
    if (task.status === "done") setTab(files.length ? "files" : "report");
    if (task.status === "awaiting") setTab("plan");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.status]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const sp = task.spec;
  const pl = task.plan;
  const acceptance = pl?.acceptance.length ? pl.acceptance.join("\n") : sp.acceptance;
  const rv = task.review;

  return (
    <div className="detail">
      <div className="detail-head">
        <h2>{task.title}</h2>
        <span className={`status ${task.status}`}>{TASK_STATUS_LABELS[task.status]}</span>
      </div>
      <dl className="spec">
        <SpecRow k="Kim için" v={sp.audience || pl?.audience} proposed={!sp.audience && !!pl?.audience} />
        <SpecRow k="Malzeme" v={sp.material.length > 220 ? sp.material.slice(0, 220) + "…" : sp.material} />
        <SpecRow k="Teslim biçimi" v={sp.format || pl?.format} proposed={!sp.format && !!pl?.format} />
        <SpecRow k="Kabul ölçütü" v={acceptance} proposed={!sp.acceptance && !!acceptance} />
      </dl>
      <div className="muted small">Model: {DEPTH_LABELS[task.depth]}</div>
      {err && <div className="error">{err}</div>}
      <div className="tabs">
        <button className={tab === "plan" ? "on" : ""} onClick={() => setTab("plan")}>
          Plan {pl ? `(${pl.steps.length})` : ""}
        </button>
        <button className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>
          Akış
        </button>
        <button className={tab === "files" ? "on" : ""} onClick={() => setTab("files")}>
          Teslimler {files.length ? `(${files.length})` : ""}
        </button>
        <button className={tab === "report" ? "on" : ""} onClick={() => setTab("report")} disabled={!task.report && !task.error && !rv}>
          Rapor
        </button>
      </div>

      {tab === "plan" && (
        <div className="plan">
          {!pl && <div className="muted">Genel Müdür planı hazırlıyor…</div>}
          {pl && <p className="muted">{pl.summary}</p>}
          {pl?.steps.map((s) => {
            const r = task.results.find((x) => x.stepId === s.id);
            const label = r?.status === "running" ? "çalışıyor" : r?.status === "done" ? (r.revised ? "düzeltildi" : "teslim") : r?.status === "failed" ? "hata" : "bekliyor";
            return (
              <details key={s.id} className={`step ${r?.status ?? "pending"}`}>
                <summary>
                  <span className="phase">F{s.phase}</span>
                  <span className="who">{nameOf(s.employeeId)}</span>
                  <span className="what">{s.title}</span>
                  <span className={`pill ${r?.status ?? "pending"}`}>{label}</span>
                </summary>
                <div className="instruction">
                  <b>Teslim:</b> {s.deliverable || s.title}
                  <br />
                  <b>Hedef:</b> {s.instruction}
                  {s.format && (<><br /><b>Biçim:</b> {s.format}</>)}
                  {s.acceptance.length > 0 && (<><br /><b>Kabul ölçütü:</b> {s.acceptance.join("; ")}</>)}
                </div>
                {r?.output && <div className="md" dangerouslySetInnerHTML={{ __html: md(r.output) }} />}
              </details>
            );
          })}
          {task.status === "awaiting" && (
            <div className="card">
              <h4>Plan onayı</h4>
              <div className="muted">Yanlış anlaşılma varsa şimdi düzelt; çalışanlar onayından sonra başlar. "(öneri)" yazan brif parçalarını Genel Müdür önerdi.</div>
              <textarea value={planNote} onChange={(e) => setPlanNote(e.target.value)} rows={2} placeholder="Değişmesini istediğin yeri söyle." />
              <div className="actions">
                <button className="primary" disabled={busy} onClick={() => run(() => approvePlan(task.id))}>
                  Planı onayla ve başlat
                </button>
                <button className="ghost" disabled={busy || !planNote.trim()} onClick={() => run(async () => { await replan(task.id, planNote); setPlanNote(""); })}>
                  Planı düzelt
                </button>
                <button className="ghost" disabled={busy} onClick={() => run(() => deleteTask(task.id))}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}
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

      {tab === "files" && (
        <div>
          {files.length === 0 && <div className="muted">Bu işte dosya teslimi yok. Metin teslimleri Plan ve Rapor sekmelerinde.</div>}
          {files.map((f) => (
            <FileCard key={f.name} file={f} by={f.by ? nameOf(f.by) : ""} />
          ))}
        </div>
      )}

      {tab === "report" && (
        <div>
          {task.error && <div className="error">{task.error}</div>}
          {rv && (
            <div className="card">
              <h4>Teslim kontrolü · {rv.passed ? "kabul edilebilir" : "eksik bulundu"}</h4>
              <ul>
                {rv.checks.map((c, i) => (
                  <li key={i}>
                    <Mark ok={c.ok} />
                    <span>
                      <b>{c.criterion}</b>
                      {c.note ? ` · ${c.note}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {rv.fixes.length > 0 && (
                <>
                  <h4 style={{ marginTop: 10 }}>Kontrolün istediği düzeltmeler</h4>
                  <ul>
                    {rv.fixes.map((f, i) => (
                      <li key={i}>
                        <Mark ok={f.applied ? true : null} />
                        <span>
                          {f.note} <span className="muted">({f.applied ? "uygulandı" : "bekliyor"})</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="muted small">Düzeltmelerden sonra ikinci bir kontrol yapılmadı; teslimi kendin de aç.</div>
                </>
              )}
            </div>
          )}
          <div className="md report" dangerouslySetInnerHTML={{ __html: md(task.report) }} />
          {task.status === "done" && pl && (
            <div className="card">
              <h4>Düzeltme iste</h4>
              <div className="muted">Beğenmediğin yeri söyle; baştan yazılmaz, yalnızca orası değişir.</div>
              <label className="tier" style={{ marginTop: 8 }}>
                Nerede
                <select value={fixTarget} onChange={(e) => setFixTarget(e.target.value)}>
                  <option value="report">Rapor</option>
                  {pl.steps.map((s) => (
                    <option key={s.id} value={s.id}>
                      {nameOf(s.employeeId)} · {s.title.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </label>
              <textarea value={fixNote} onChange={(e) => setFixNote(e.target.value)} rows={2} placeholder="Örn: Başlık küçük kalmış, ikinci bölüm uzun." />
              <div className="actions">
                <button className="primary" disabled={busy || !fixNote.trim()} onClick={() => run(async () => { await requestFix(task.id, fixTarget, fixNote); setFixNote(""); })}>
                  Sadece bunu düzelt
                </button>
              </div>
            </div>
          )}
          {(task.usage.inputTokens > 0 || task.usage.outputTokens > 0) && (
            <div className="muted small">
              Token: giriş {task.usage.inputTokens.toLocaleString("tr-TR")} · çıkış {task.usage.outputTokens.toLocaleString("tr-TR")}
            </div>
          )}
        </div>
      )}

      {["done", "failed"].includes(task.status) && (
        <div className="actions">
          <button className="ghost" disabled={busy} onClick={() => run(() => createTask({ title: task.title, ...task.spec, depth: task.depth, planFirst: task.planFirst }))}>
            Yeniden çalıştır
          </button>
          <button className="ghost" disabled={busy} onClick={() => run(() => deleteTask(task.id))}>
            Sil
          </button>
        </div>
      )}
    </div>
  );
}

function SpecRow({ k, v, proposed }: { k: string; v?: string; proposed?: boolean }) {
  if (!v) return null;
  return (
    <>
      <dt>{k}</dt>
      <dd>
        {v}
        {proposed && <span className="warnline"> (öneri)</span>}
      </dd>
    </>
  );
}

function FileCard({ file, by }: { file: DeliveredFile; by: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const canPreview = file.ext === "html" || file.ext === "svg";
  const size = new Blob([file.content]).size;
  const svg = useMemo(
    () => (file.ext === "svg" ? DOMPurify.sanitize(file.content, { USE_PROFILES: { svg: true, svgFilters: true } }) : ""),
    [file],
  );
  const download = () => {
    const url = URL.createObjectURL(new Blob([file.content], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="file">
      <div className="row">
        <div>
          <div className="name">{file.name}</div>
          <div className="meta">
            {by} · {size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`}
          </div>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          {canPreview && (
            <button className="ghost" onClick={() => setOpen((o) => !o)}>
              {open ? "Kapat" : "Önizle"}
            </button>
          )}
          <button className="ghost" onClick={download}>
            İndir
          </button>
          <button
            className="ghost"
            onClick={() => navigator.clipboard.writeText(file.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => undefined)}
          >
            {copied ? "Kopyalandı" : "Kopyala"}
          </button>
        </div>
      </div>
      {open && file.ext === "svg" && (
        <div className="preview">
          <div className="svgprev">
            <div className="big" dangerouslySetInnerHTML={{ __html: svg }} />
            <div>
              <div className="small" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="cap">32 px</div>
            </div>
          </div>
        </div>
      )}
      {open && file.ext === "html" && (
        <div className="preview">
          {/* Çalışanın ürettiği sayfa, ana sayfaya erişemeyen yalıtılmış bir çerçevede açılır */}
          <iframe sandbox="allow-scripts" title={`${file.name} önizleme`} srcDoc={file.content} />
        </div>
      )}
    </div>
  );
}
