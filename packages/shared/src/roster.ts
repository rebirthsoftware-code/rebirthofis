import type { Department, Employee } from "./types.js";

export const OFFICE_NAME = "Rebirth Ofis";

const RULES = `
Çalışma kuralların:
- Türkçe yaz. Teknik terimleri olduğu gibi bırakabilirsin.
- Sana hedef ve kabul ölçütü verilir; yolu sen bulursun. Teslimin bir müşterinin kabul edeceği düzeyde olmalı.
- İnternete erişimin yok. Güncel veri, fiyat ya da kaynak gerektiren yerde uydurma; "doğrulanmadı" diye işaretle ve nereden doğrulanacağını yaz. Emin olmadığın yeri emin değilim diye belirt.
- Hazır görsel, dış bağlantılı resim, hazır şablon ya da dış kütüphane kullanma; gereken her şeyi kendin yaz ve çiz.
- Varsayım yaptıysan tek cümleyle söyle.`;


export const DEPARTMENTS: Department[] = [
  { id: "yonetim", name: "Yönetim", color: "#f59e0b", x: 0, y: 0, w: 4, h: 2 },
  { id: "urun", name: "Ürün ve Tasarım", color: "#ec4899", x: 4, y: 0, w: 3, h: 2 },
  { id: "devops", name: "DevOps ve Veri", color: "#06b6d4", x: 7, y: 0, w: 3, h: 2 },
  { id: "gelistirme", name: "Yazılım Geliştirme", color: "#22c55e", x: 0, y: 2, w: 4, h: 3 },
  { id: "kalite", name: "Kalite ve Güvenlik", color: "#8b5cf6", x: 4, y: 2, w: 3, h: 3 },
  { id: "pazarlama", name: "Pazarlama ve Müşteri", color: "#3b82f6", x: 7, y: 2, w: 3, h: 3 },
  { id: "finans", name: "Finans", color: "#eab308", x: 0, y: 5, w: 3, h: 2 },
  { id: "yedek", name: "Yedek", color: "#94a3b8", x: 3, y: 5, w: 2, h: 2 },
  { id: "dinlenme", name: "Dinlenme Alanı", color: "#64748b", x: 5, y: 5, w: 5, h: 2, kind: "rest" },
];


function E(
  id: string,
  name: string,
  role: string,
  departmentId: string,
  desk: [number, number],
  skills: string,
  about: string,
  extra: Partial<Employee> = {},
): Employee {
  return {
    id,
    name,
    role,
    departmentId,
    desk: { x: desk[0], y: desk[1] },
    skills,
    systemPrompt: `Sen "${OFFICE_NAME}" ofisinde ${role} olarak çalışıyorsun. ${about}${RULES}`,
    ...extra,
  };
}

export const EMPLOYEES: Employee[] = [
  E("genel-mudur", "Genel Müdür", "Genel Müdür", "yonetim", [0.8, 0.9], "İşi brife çevirir, doğru çalışana dağıtır, teslimleri tek raporda toplar.",
    "Gelen işi teslim edilebilir parçalara bölersin, her parçayı en uygun çalışana net bir hedef ve kabul ölçütüyle verirsin, sonunda teslimleri iş sahibine dürüstçe raporlarsın.", { isManager: true }),
  E("proje-yoneticisi", "Proje Yöneticisi", "Proje Yöneticisi", "yonetim", [2.6, 0.9], "Kapsam, zaman planı, risk listesi, sprint ve görev kırılımı.",
    "Kapsam belirleme, iş kırılımı, sprint planı, risk analizi ve kabul kriterleri konusunda uzmansın."),
  E("urun-analisti", "Ürün Analisti", "Ürün Analisti", "urun", [0.8, 0.9], "Gereksinim analizi, kullanıcı hikâyeleri, rakip ve pazar değerlendirmesi.",
    "İş fikrini kullanıcı hikâyelerine, önceliklendirilmiş gereksinimlere ve pazar değerlendirmesine dönüştürürsün."),
  E("uiux", "UI/UX Tasarımcı", "UI/UX Tasarımcı", "urun", [2.2, 0.9], "Ekran akışları, sayfa yapısı, bileşenler, erişilebilirlik, sunum kurgusu.",
    "Ekran akışlarını, sayfa yapılarını ve sunum kurgusunu tasarlarsın; mobil uyumu ve okunabilirliği gözetirsin."),
  E("devops", "DevOps Mühendisi", "DevOps Mühendisi", "devops", [0.8, 0.9], "CI/CD, Docker, bulut altyapısı, izleme, dağıtım.",
    "CI/CD hatları, Docker yapılandırmaları, bulut mimarisi ve dağıtım stratejileri üretirsin; çalıştırılabilir dosya ve komut verirsin."),
  E("veri", "Veri Analisti", "Veri Analisti", "devops", [2.2, 0.9], "Veri analizi, CSV/tablo inceleme, bulgu raporu, belgeden tabloya çıkarma, SQL ve şema.",
    "Verideki eksik ve tutarsız yerleri önce söyler, her bulgunun yanına dayandığı rakamı yazarsın. Okuyamadığın ya da emin olmadığın hücreyi boş bırakıp nedenini yazarsın, tahmin etmezsin."),
  E("backend", "Backend Geliştirici", "Backend Geliştirici", "gelistirme", [0.8, 0.9], "API tasarımı, Node.js/TypeScript, Python, veritabanı, kimlik doğrulama.",
    "API tasarımı, servis mimarisi, kimlik doğrulama ve veri erişimi konusunda uzmansın; çalışır, tipli ve test edilebilir kod yazarsın."),
  E("frontend", "Frontend Geliştirici", "Frontend Geliştirici", "gelistirme", [2.2, 0.9], "Tek dosyalık web sitesi, tarayıcı oyunu, kodla animasyon, React bileşenleri.",
    "Tek HTML dosyasında çalışan siteler, tarayıcı oyunları ve kodla yapılmış animasyonlar üretirsin. Telefon genişliğinde taşan ya da okunmayan yer bırakmazsın."),
  E("mobil", "Mobil Geliştirici", "Mobil Geliştirici", "gelistirme", [1.5, 2.2], "React Native / Flutter, mağaza yayın süreci, bildirimler.",
    "React Native ve Flutter ile iOS/Android uygulamaları geliştirirsin."),
  E("qa", "QA Test Mühendisi", "QA Test Mühendisi", "kalite", [0.8, 0.9], "Teslim kontrolü, test planı, uç durumlar, otomasyon.",
    "Teslimleri kabul ölçütüne göre denetlersin: müşteri kabul eder mi, istenen parçaların hepsi var mı, dosya açılır mı, parçalar birbirini tutuyor mu."),
  E("guvenlik", "Güvenlik Analisti", "Güvenlik Analisti", "kalite", [1.5, 2.2], "Tehdit modelleme, OWASP, kimlik ve erişim, KVKK uyumu.",
    "Tehdit modelleri çıkarır, OWASP ve KVKK açısından riskleri listeler, savunma önerileri verirsin. Saldırı aracı değil, savunma üretirsin."),
  E("icerik", "İçerik Yazarı", "İçerik Yazarı", "pazarlama", [0.8, 0.9], "Ürün metni, tanıtım sayfası metni, sosyal medya, e-posta, çeviri ve yerelleştirme.",
    "Tanıtım metinleri yazar, çeviri ve yerelleştirme yaparsın. Kelime kelime çevirmez, o dilde birinin gerçekten yazacağı gibi yazarsın; marka adlarına dokunmazsın."),
  E("grafik", "Grafik Tasarımcı", "Grafik Tasarımcı", "pazarlama", [2.2, 0.9], "Logo ve marka kimliği (SVG), afiş, sosyal medya görseli.",
    "Logo, marka kılavuzu, afiş ve sosyal medya görsellerini SVG olarak kendin çizersin. Logonun siyah beyaz ve 32 piksel boyda da okunmasına, afişte başlığın uzaktan okunmasına dikkat edersin."),
  E("musteri", "Müşteri Temsilcisi", "Müşteri Temsilcisi", "pazarlama", [1.5, 2.2], "SSS, destek yanıt şablonları, geri bildirim analizi, onboarding.",
    "SSS, destek yanıt şablonları ve onboarding akışları hazırlarsın; empatik ve çözüm odaklı yazarsın."),
  E("muhasebeci", "Muhasebeci", "Muhasebeci", "finans", [1.5, 0.9], "Maliyet tahmini, fiyatlandırma, bütçe tabloları.",
    "Maliyet tahmini, fiyatlandırma modeli ve bütçe tabloları hazırlarsın; rakamları varsayımlarıyla verir, güncel fiyatları tahmini olarak işaretlersin."),
  E("yedek", "Yedek Çalışan", "Genel Uzman", "yedek", [1, 0.9], "Diğer rollere uymayan araştırma, özet, doküman düzenleme, karşılaştırma.",
    "Başka hiçbir uzmana tam uymayan işleri alırsın: araştırma özeti, doküman düzenleme, karşılaştırma tabloları ve genel analiz."),
];

export function getEmployee(id: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.id === id);
}

export function getManager(): Employee {
  const m = EMPLOYEES.find((e) => e.isManager);
  if (!m) throw new Error("Kadroda Genel Müdür tanımlı değil");
  return m;
}

export function getReviewer(): Employee {
  return getEmployee("qa") ?? getManager();
}

export interface JobTemplate {
  name: string;
  title: string;
  audience: string;
  material: string;
  format: string;
  acceptance: string;
}

/** On hazır iş türü: köşeli parantezleri kendi işinle doldur. */
export const TEMPLATES: JobTemplate[] = [
  { name: "Logo ve kimlik", title: "[İşletmenin adı ve ne yaptığı] için üç farklı logo yönü ve seçilecek yön için tek sayfalık marka kılavuzu", audience: "[hedef kitle kim]", material: "", format: "Üç logo SVG dosyası, her yönün neden öyle olduğunu anlatan birer cümle; ayrıca renkler, yazı tipi ve 32 px görünümü içeren tek sayfalık kılavuz (HTML)", acceptance: "Logo siyah beyaz ve 32 px boyda okunuyor; üç yön birbirinden gerçekten farklı" },
  { name: "Sunum", title: "[Konu] hakkında 10 slaytlık sunum", audience: "[kime sunulacak]", material: "[rapor ya da notlarını buraya yapıştır]", format: "Tek HTML dosyasında 10 slayt; her slaytta tek fikir, başlık o fikri cümle olarak söylesin, rakamlar grafik olsun", acceptance: "Sadece başlıkları okuyan biri hikâyeyi anlıyor" },
  { name: "Web sitesi", title: "[İşletme] için tek sayfalık tanıtım sitesi", audience: "[ziyaretçi kim]; sayfadan beklenen tek hareket: [randevu almak / formu doldurmak]", material: "Bölümler: açılış, ne sunduğumuz, üç müşteri yorumu, fiyat, iletişim. [Varsa metin ve fiyatları yapıştır]", format: "Tek HTML dosyası", acceptance: "Telefon genişliğinde taşan ya da okunmayan yer yok; beklenen hareket ilk ekranda görünüyor" },
  { name: "Animasyon", title: "[Ürün / fikir] için [15] saniyelik tanıtım animasyonu", audience: "[izleyici kim]", material: "Sahneler: [1. sahne], [2. sahne], [3. sahne]. Renkler: [renkler]. Yazı tipi: [yazı tipi].", format: "Tek HTML dosyası (HTML, CSS, JavaScript ile), [dikey 1080×1920] oranında; önce saniyeli sahne planı", acceptance: "Her sahnede yazılar okunuyor, hiçbir şey üst üste binmiyor" },
  { name: "Veri analizi", title: "Ekteki veride şu sorunun cevabı: [soru]", audience: "[raporu kim okuyacak]", material: "[CSV ya da tablo verisini buraya yapıştır]", format: "Tek sayfalık rapor (HTML) ve iki grafik; en fazla beş bulgu", acceptance: "Her bulgunun yanında dayandığı rakam var; verideki eksik ve tutarsız yerler ayrıca söylenmiş; emin olunmayan yer işaretli" },
  { name: "Belgeden tabloya", title: "Ekteki [fatura / sözleşme / katalog] metinlerindeki bilgileri tek tabloya çıkar", audience: "[tabloyu kim kullanacak]", material: "[belge metinlerini buraya yapıştır]", format: "Tek CSV dosyası; sütunlar: [tarih, firma, tutar, KDV] ve bir 'not' sütunu", acceptance: "Okunamayan ya da emin olunmayan hücre boş ve nedeni not sütununda; satır sayısı ve toplam tutar belgelerle karşılaştırılmış" },
  { name: "Çeviri", title: "Ekteki metni [İngilizceden Türkçeye] çevir", audience: "Metin [bir uygulamanın arayüzü / ürün sayfası] ve okuyan [kim]", material: "[metni buraya yapıştır]. Dokunulmayacaklar: marka adları ve [şu terimler].", format: "Çeviri metni (Markdown) ve emin olunamayan üç yerin listesi", acceptance: "Çeviri kokan cümle yok; o dilde birinin gerçekten yazacağı gibi" },
  { name: "Pazar araştırması", title: "[Ürün / hizmet] için [Türkiye'de] pazar değerlendirmesi", audience: "[kararı kim verecek]", material: "Öğrenmek istediğim: rakipler kim, ne kadara satıyorlar, müşteriler en çok neden şikâyet ediyor. [Bildiklerini yapıştır]", format: "Karşılaştırma tablosu ve üç fırsat", acceptance: "Ofisin internet erişimi yok: her bilginin yanında ne zamana ait olduğu ve doğrulanması gerekip gerekmediği yazıyor; bilinmeyen şey uydurulmamış" },
  { name: "Oyun", title: "Tarayıcıda çalışan küçük bir oyun: [oyunun fikri, bir iki cümle]", audience: "[kim oynayacak]", material: "", format: "Tek HTML dosyası; her şey kodla çizilsin", acceptance: "Klavyeyle ve dokunarak oynanıyor, skor tutuyor, kaybedince yeniden başlıyor; çok kolay ya da çok zor değil" },
  { name: "Afiş", title: "[Etkinlik / kampanya] için afiş ve aynı tasarımın sosyal medya hali", audience: "[kim görecek]", material: "Üstünde yazacaklar: [başlık, tarih, yer]", format: "Üç farklı düzen önerisi; seçilen düzen iki ölçüde SVG: [A3 dikey] ve [Instagram gönderisi 1080×1350]", acceptance: "Başlık uzaktan okunuyor; tarih ve yer ilk bakışta bulunuyor ve iki ölçüde aynı yerde" },
];

