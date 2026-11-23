import type { PlanStep, Task } from "./types.js";

/** Çalışan çıktısındaki "Dosya: ad.uzanti" + kod bloğu çiftlerinden teslim dosyalarını çıkarır. */
export interface DeliveredFile {
  name: string;
  ext: string;
  content: string;
  stepId?: string;
  by?: string;
}

const EXT: Record<string, string> = { html: "html", svg: "svg", csv: "csv", md: "md", markdown: "md", json: "json", txt: "txt", xml: "svg" };
const ALLOWED = ["html", "svg", "csv", "md", "json", "txt"];

export function extractFiles(text: string | undefined, prefix = "teslim"): DeliveredFile[] {
  const out: DeliveredFile[] = [];
  if (!text) return out;
  const re = /```([a-zA-Z0-9]+)[^\n]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    const lang = m[1].toLowerCase();
    const before = text.slice(Math.max(0, m.index - 200), m.index);
    const labels = [...before.matchAll(/Dosya:\s*[`*]*([\w\-.]+\.[a-zA-Z0-9]+)/g)];
    const label = labels.length ? labels[labels.length - 1][1] : null;
    let ext: string | undefined = EXT[lang];
    if (lang === "xml" && !/<svg[\s>]/.test(m[2])) ext = undefined;
    if (!label && !["html", "svg", "csv"].includes(ext ?? "")) continue;
    const labelExt = label ? label.split(".").pop()!.toLowerCase() : null;
    if (labelExt && !ALLOWED.includes(labelExt)) continue;
    n++;
    out.push({ name: label ?? `${prefix}-${n}.${ext}`, ext: labelExt ?? ext!, content: m[2].replace(/\s+$/, "") + "\n" });
  }
  return out;
}

export function taskFiles(task: Task): DeliveredFile[] {
  const byName = new Map<string, DeliveredFile>();
  for (const s of task.plan?.steps ?? []) {
    const r = task.results.find((x) => x.stepId === s.id);
    if (!r?.output || r.status === "running") continue;
    for (const f of extractFiles(r.output, s.employeeId)) byName.set(f.name, { ...f, stepId: s.id, by: s.employeeId });
  }
  return [...byName.values()];
}

export interface StepOutput {
  step: PlanStep;
  output: string;
  truncated?: boolean;
}

/** Model çağırmadan yakalanabilen bozuk dosya belirtileri. */
export function autoFindings(outputs: StepOutput[], nameOf: (employeeId: string) => string): string[] {
  const found: string[] = [];
  for (const p of outputs) {
    const who = `${p.step.id} (${nameOf(p.step.employeeId)})`;
    if ((p.output.match(/```/g) ?? []).length % 2 === 1) found.push(`${who}: bir kod bloğu kapanmamış, dosya yarım kalmış olabilir.`);
    if (p.truncated) found.push(`${who}: yanıt uzunluk sınırına takıldı.`);
    for (const f of extractFiles(p.output, p.step.employeeId)) {
      const body = f.content.trim();
      if (f.ext === "html" && /<html[\s>]/i.test(body) && !/<\/html>\s*$/i.test(body)) found.push(`${who}: ${f.name} </html> ile bitmiyor, yarım kalmış olabilir.`);
      if (f.ext === "html" && /(src|href)\s*=\s*["']https?:\/\//i.test(body)) found.push(`${who}: ${f.name} dışarıdan kaynak yüklüyor; tek başına açılmayabilir.`);
      if (f.ext === "svg" && !/<\/svg>\s*$/i.test(body)) found.push(`${who}: ${f.name} </svg> ile bitmiyor.`);
    }
  }
  return found;
}
