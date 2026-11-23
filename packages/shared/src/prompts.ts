import { EMPLOYEES, getEmployee, getManager, getReviewer } from "./roster.js";
import type { DeliveredFile, StepOutput } from "./files.js";
import type { Plan, PlanStep, Review, Task } from "./types.js";

/**
 * İstemlerin kullanıcı tarafı. Rol istemi (systemPrompt) ayrı gönderilir.
 * İlkeler: beş parçalı brif, adım değil hedef, bitince öz kontrol, noktasal düzeltme.
 */

const nameOf = (id: string) => getEmployee(id)?.name ?? id;
const list = (arr?: string[]) => (arr?.length ? arr.map((x) => "- " + x).join("\n") : "- (belirtilmedi)");
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "\n…(devamı kısaltıldı)" : s);

export function briefBlock(task: Task, withPlan = true): string {
  const sp = task.spec;
  const pl = withPlan ? task.plan : undefined;
  return `## İşin brifi
1. İş (ne teslim edilecek): ${task.title}
2. Kim için: ${sp.audience || pl?.audience || "(iş sahibi belirtmedi)"}
3. Malzeme:
${sp.material || "(ek malzeme verilmedi)"}
4. Teslim biçimi: ${sp.format || pl?.format || "(iş sahibi belirtmedi)"}
5. Kabul ölçütü:
${pl?.acceptance.length ? list(pl.acceptance) : "- " + (sp.acceptance || "(iş sahibi belirtmedi)")}`;
}

const roster = () =>
  EMPLOYEES.filter((e) => !e.isManager)
    .map((e) => `- id: ${e.id} | ${e.name} | ${e.skills}`)
    .join("\n");

export function planPrompt(task: Task, note?: string): string {
  const previous =
    task.plan && note
      ? `
## Önceki planın
${JSON.stringify({ ...task.plan, steps: task.plan.steps.map(({ id: _id, ...r }) => r) })}

## İş sahibinin düzeltme notu
${note}

Yalnızca notun gerektirdiği yerleri değiştir; planın geri kalanını aynen koru.`
      : "";
  return `Yeni bir iş geldi. İşi ekibe dağıt.

${briefBlock(task, false)}

## Kadro (yalnızca bu id'leri kullan)
${roster()}

## Nasıl planlayacaksın
- İş sahibinin yazdığı brif parçalarını aynen koru. Boş bıraktığı parçayı (kim için, teslim biçimi, kabul ölçütü) sen öner; önerin planda görünecek ve iş sahibi onaylayacak.
- Kabul ölçütleri denetlenebilir olsun: "güzel olsun" değil, "telefon genişliğinde taşan yer yok" gibi. İstenen teslimleri adetleriyle say.
- Her adım için çalışana adım adım komut verme; hedefi, bağlamı, teslim biçimini ve kabul ölçütünü ver, yolu o bulsun.
- En az 1, en fazla 5 adım. Küçük iş için 1-2 çalışan yeter; gereksiz adım ekleme.
- Tek dosya olarak istenen bir teslimi (site, oyun, animasyon, logo) tek bir çalışana ver; parçalara bölme. Ona girdi hazırlayacak çalışan varsa önceki faza koy.
- "phase": bağımsız adımlar aynı fazda, önceki çıktıya ihtiyaç duyan sonraki fazda. Fazlar 1'den başlar.
- Teslim kontrolünü plana adım olarak ekleme; ofis bunu sonunda kendiliğinden yapar.
${previous}
Yalnızca şemaya uygun JSON döndür.`;
}

const FILE_RULE = `Teslimin bir dosyaysa (HTML, SVG, CSV, Markdown) her dosyanın tamamını kısaltmadan tek bir kod bloğunda ver ve bloğun hemen üstündeki satıra dosya adını şöyle yaz: Dosya: ad.uzanti
HTML dosyası tek başına açılabilmeli: stil ve kod içinde olsun, dışarıdan hiçbir şey yüklemesin, telefon genişliğinde de düzgün görünsün.`;

const SELF_CHECK = `Bitirince teslimini baştan sona bir kez daha kontrol et ve yanıtın sonuna "## Kendi kontrolüm" başlığı aç: her kabul ölçütü için geçti ya da kaldı yaz, eksik kalan ne varsa açıkça söyle.`;

const priorBlock = (prior: StepOutput[]) =>
  prior.length ? prior.map((p) => `### ${nameOf(p.step.employeeId)} - ${p.step.title}\n${p.output}`).join("\n\n") : "(henüz başka teslim yok)";

export function stepPrompt(task: Task, step: PlanStep, prior: StepOutput[]): string {
  return `${briefBlock(task)}

## Senin teslimin: ${step.title}
Teslim edilecek: ${step.deliverable || step.title}
Hedef ve bağlam: ${step.instruction}
Teslim biçimi: ${step.format || "Markdown"}
Bu teslimin kabul ölçütü:
${list(step.acceptance)}

## Ekip arkadaşlarının önceki teslimleri
${priorBlock(prior)}

${FILE_RULE}

Yalnızca kendi teslimini üret; önceki teslimleri tekrar etme, gerekirse onlara dayan.
${SELF_CHECK}`;
}

export function fixPrompt(task: Task, step: PlanStep, previous: string, note: string, who: string): string {
  return `${briefBlock(task)}

## Senin teslimin: ${step.title}
Teslim edilecek: ${step.deliverable || step.title}
Teslim biçimi: ${step.format || "Markdown"}
Kabul ölçütü:
${list(step.acceptance)}

## Önceki teslimin
${previous}

## ${who} düzeltme notu
${note}

Yalnızca notta isteneni değiştir; geri kalan her şeyi aynen koru. Baştan yazma.
Dosya teslim ettiysen değişen dosyanın tamamını yine "Dosya: ad.uzanti" satırı ve tek kod bloğuyla ver; değişmeyen dosyaları da aynen tekrar ver ki teslim eksik kalmasın.
${SELF_CHECK}`;
}

export function reviewPrompt(task: Task, plan: Plan, outputs: StepOutput[], auto: string[]): string {
  return `Ekip işi bitirdi. Teslimleri iş sahibine gitmeden önce denetle. Tek soru şu: bu teslimi bir müşteri kabul eder mi?

${briefBlock(task)}

## Adımlar ve ölçütleri
${plan.steps.map((s) => `- ${s.id} | ${nameOf(s.employeeId)} | ${s.deliverable || s.title} | ölçüt: ${s.acceptance.join("; ") || "-"}`).join("\n")}

## Teslimler
${outputs.map((p) => `### ${p.step.id} - ${nameOf(p.step.employeeId)} - ${p.step.title}\n${clip(p.output, 60000)}`).join("\n\n")}

## Otomatik bulgular
${auto.length ? list(auto) : "- Dosya düzeyinde otomatik bir sorun bulunmadı."}

## Dört yerden bak
1. Kalite: müşterinin kabul edeceği düzeyde mi?
2. Eksik teslim: istenen parçaları say; eksik olan var mı?
3. Bozuk dosya: dosyalar tam mı, yarım kalmış ya da açılmayacak olan var mı?
4. Tutarsızlık: parçalar birbirini tutuyor mu (isim, renk, rakam, tarih)?

Çalışanın "Kendi kontrolüm" bölümüne güvenme; teslimin kendisine bak. Kusur uydurma: gerçekten kabulü engelleyen bir şey yoksa geçir.
Düzeltme gerekiyorsa en fazla 3 not yaz; her not tek bir adıma (stepId) gitsin ve tam olarak neyin değişeceğini söylesin.
Yalnızca şemaya uygun JSON döndür.`;
}

export function reportPrompt(task: Task, outputs: StepOutput[], review: Review | undefined, files: DeliveredFile[]): string {
  return `Ekip işi teslim etti. İş sahibine kısa ve dürüst bir teslim raporu yaz.

${briefBlock(task)}

## Teslimler
${outputs.map((p) => `### ${nameOf(p.step.employeeId)} - ${p.step.title}\n${clip(p.output, 40000)}`).join("\n\n")}

## Teslim dosyaları (iş sahibi bunları "Teslimler" sekmesinde açıp indirebiliyor)
${files.length ? list(files.map((f) => f.name)) : "- (dosya teslimi yok)"}

## Teslim kontrolünün sonucu
${review ? JSON.stringify(review) : "(kontrol yapılamadı)"}

## Rapor biçimi
1. **Sonuç**: iş kabul ölçütünü karşılıyor mu, tek paragraf. Karşılamıyorsa bunu ilk cümlede söyle.
2. **Teslim edilenler**: istenen parçaları tek tek say, her birinin yanına teslim edildi ya da eksik yaz.
3. **Kabul ölçütleri**: her ölçüt için geçti ya da kaldı ve tek cümle gerekçe.
4. **Eksik kalan ve doğrulanması gerekenler**: yoksa "yok" yaz.
5. **İş sahibi teslimi alınca neye baksın**: en fazla üç somut kontrol.

Dosyaların içeriğini rapora kopyalama; adlarıyla an. Metin teslimi varsa (çeviri, analiz gibi) sonucu raporda ver. Olmayan bir şeyi olmuş gibi yazma.`;
}

export function reportFixPrompt(task: Task, previous: string, note: string, changed?: string): string {
  return `${briefBlock(task)}

## Önceki raporun
${previous}
${changed ? `\n## Bu arada değişen teslim\n${clip(changed, 40000)}\n` : ""}
## İş sahibinin düzeltme notu
${note}

Raporu yalnızca notun ve değişen teslimin gerektirdiği yerlerde güncelle; geri kalanını aynen koru. Raporun tamamını yeniden ver.`;
}

export const systemFor = (employeeId: string) => getEmployee(employeeId)?.systemPrompt ?? "";
export const managerSystem = () => getManager().systemPrompt;
export const reviewerSystem = () => getReviewer().systemPrompt;
