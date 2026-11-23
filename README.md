# Rebirth Ofis

Yapay zeka çalışanlarından oluşan sanal bir **yazılım ofisi**. İzometrik bir ofis planında departmanlar ve masalarının başında çalışan ajanlar görünür. Sen işi beş parçalı bir brifle verirsin; **Genel Müdür** planlar, sen planı onaylarsın, ekip çalışır, **QA** teslimi kabul ölçütüne göre denetler ve sonunda açıp indirebileceğin dosyalarla birlikte dürüst bir teslim raporu gelir.

Her çalışan bir Claude ajanıdır. API anahtarı tanımlı değilse ofis **simülasyon modunda** açılır ve akışı sahte çalışanlarla izleyebilirsin.

## Çalışma biçimi

Ofis, modele "gerçek iş" teslim ettirmenin bilinen alışkanlıklarını akışın içine gömer:

| Alışkanlık | Ofiste karşılığı |
|---|---|
| Beş parçalı brif | Form: iş, kim için, malzeme, teslim biçimi, kabul ölçütü. Boş bıraktığını Genel Müdür önerir ve plan onayında "(öneri)" diye gösterir. |
| Önce planı gör | Plan hazır olunca iş "Plan onayı bekliyor" durumunda durur. Onaylar ya da notla düzelttirirsin. |
| Hedefi ver, adımı değil | Genel Müdür çalışana adım adım komut vermez; teslimi, bağlamı, biçimi ve kabul ölçütünü verir. |
| Bitirince kendin kontrol et | Her çalışan teslimini "Kendi kontrolüm" bölümüyle bitirir; ardından QA dört yerden bakar: kalite, eksik teslim, bozuk dosya, tutarsızlık. Gerekirse tek düzeltme turu yapılır. |
| Kurgucuya söyler gibi düzelt | "Düzeltme iste": raporu ya da tek bir çalışanın teslimini seçip not yazarsın; yalnızca orası değişir. |
| Her işte büyük modeli kullanma | Küçük iş Opus 5.5, teslimlik iş Fable 5.2 (medium), uzun iş Fable 5.2 (high). |

Formun üstündeki on hazır iş türü (logo, sunum, web sitesi, animasyon, veri analizi, belgeden tabloya, çeviri, pazar araştırması, oyun, afiş) brifi köşeli parantezlerle doldurur; parantezleri kendi işinle doldurmadan gönderilmez.

Çalışanların internet erişimi yoktur. Güncel veri gerektiren yerde uydurmak yerine "doğrulanmadı" diye işaretlemeleri istenir.

## Kadro

| Departman | Çalışanlar |
|---|---|
| Yönetim | Genel Müdür (planlar ve raporlar), Proje Yöneticisi |
| Ürün ve Tasarım | Ürün Analisti, UI/UX Tasarımcı |
| Yazılım Geliştirme | Backend, Frontend (tek dosyalık site, oyun, animasyon), Mobil Geliştirici |
| Kalite ve Güvenlik | QA Test Mühendisi (teslim kontrolü), Güvenlik Analisti |
| DevOps ve Veri | DevOps Mühendisi, Veri Analisti |
| Pazarlama ve Müşteri | İçerik Yazarı (metin, çeviri), Grafik Tasarımcı (logo, afiş), Müşteri Temsilcisi |
| Finans | Muhasebeci |
| Yedek | Yedek Çalışan |
| Dinlenme Alanı | Uzun süre boşta kalanlar burada dinlenir |

Kadro, iş şablonları ve istemler `packages/shared/src` altındadır (`roster.ts`, `prompts.ts`). Yeni bir çalışan eklemek için `roster.ts` listesine bir kayıt eklemen yeterli.

## Kurulum

```bash
npm install
cp .env.example .env     # ANTHROPIC_API_KEY değerini gir
npm run dev              # sunucu :8787, arayüz :5173
```

Tarayıcıda `http://localhost:5173` adresini aç. Anahtar girmeden denemek için:

```bash
npm run dev:mock
```

Arayüz olmadan terminalden tek görev çalıştırmak için:

```bash
npm run demo -- "Berberim için tek sayfalık randevu sitesi" "Mahalledeki müşteriler" "Tek HTML dosyası" "Telefonda taşan yer yok"
```

### Üretim

```bash
npm run build   # web arayüzünü derler (apps/web/dist)
npm start       # tek sunucu: API + arayüz, http://localhost:8787
```

## Akış

```
Brif ─▶ Genel Müdür (plan) ─▶ Plan onayı ─▶ Fazlar (paralel çalışanlar + öz kontrol)
     ─▶ QA teslim kontrolü ─▶ tek düzeltme turu ─▶ Teslim raporu ─▶ noktasal düzeltme
```

Plan ve teslim kontrolü yapılandırılmış JSON olarak alınır (`output_config.format`). Çalışan çıktısındaki `Dosya: ad.uzanti` satırı ve onu izleyen kod bloğu teslim dosyası sayılır; arayüzde "Teslimler" sekmesinde önizlenir (HTML yalıtılmış çerçevede, SVG 32 piksel görünümüyle birlikte), indirilir ve kopyalanır. Yarım kalmış kod bloğu, kapanmayan HTML ya da dışarıdan kaynak yükleyen dosya gibi belirtiler model çağrılmadan yakalanıp QA'ya bulgu olarak verilir.

Tüm durum değişiklikleri SSE (`/api/events`) ile arayüze akar. İşler `data/office.json` dosyasına yazılır; plan onayı bekleyen iş sunucu yeniden başlasa da kaldığı yerden sürer.

Model çağrılarında adaptive thinking, sistem istemi için prompt caching ve sunucu taraflı refusal fallback (`fallbacks: "default"`) açıktır.

## API

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/office` | Departmanlar, çalışanlar, durumlar ve işler |
| GET | `/api/tasks`, `/api/tasks/:id` | İş listesi ve ayrıntısı |
| POST | `/api/tasks` | `{ title, audience, material, format, acceptance, depth, planFirst }` |
| POST | `/api/tasks/:id/approve` | Planı onayla, çalışanları başlat |
| POST | `/api/tasks/:id/replan` | `{ note }` ile planı noktasal düzelt |
| POST | `/api/tasks/:id/fix` | `{ target: "report" \| adımKimliği, note }` ile noktasal düzeltme |
| DELETE | `/api/tasks/:id` | İşi sil |
| GET | `/api/events` | SSE canlı olay akışı |

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `ANTHROPIC_API_KEY` | - | Yoksa simülasyon modu |
| `OFFICE_MODEL` | `claude-fable-5-2` | Teslimlik ve uzun işlerin modeli |
| `OFFICE_LIGHT_MODEL` | `claude-opus-5-5` | Küçük işlerin modeli |
| `OFFICE_MOCK` | `0` | `1` ise anahtar olsa da simülasyon |
| `OFFICE_MOCK_DELAY_MS` | `2500` | Simülasyonda adım süresi |
| `PORT` | `8787` | Sunucu portu |
| `OFFICE_DATA_DIR` | `./data` | İş kayıtlarının yazıldığı klasör |

## Proje yapısı

```
packages/shared   ortak tipler, kadro, istemler, teslim dosyası ayıklama
apps/server       Hono API, orkestratör, Claude entegrasyonu, SSE
apps/web          Vite + React izometrik ofis arayüzü
```

## Yol haritası

- Çalışanlara araç verme (kod çalıştırma, dosya yazma, web araması)
- Görev geçmişi için gerçek veritabanı
- Çalışan başına model/efor seçimi ve maliyet paneli
- Çok kullanıcılı erişim ve yetkilendirme

## Telefondan kullanım (Artifact sürümü)

`artifact/rebirth-ofis.html` tek dosyalık, sunucusuz sürümdür ve sunucu sürümüyle aynı akışı izler. Claude içinde artifact olarak yayınlandığında çalışanlar Claude'u doğrudan sayfadan çağırır (`sample` yeteneği, kullanıcının kendi Claude hakkından harcanır), görevler artifact veritabanında saklanır (`db`). Claude dışında açılırsa simülasyon moduna düşer.
