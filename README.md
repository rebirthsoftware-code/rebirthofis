# Rebirth Ofis

Yapay zeka çalışanlarından oluşan sanal bir **yazılım ofisi**. İzometrik bir ofis planında departmanlar ve masalarının başında çalışan ajanlar görünür; sen bir iş verirsin, **Genel Müdür** işi adımlara böler, doğru çalışanlara dağıtır, ekip çalışır ve sonunda tek bir yönetici raporu teslim edilir.

Her çalışan bir Claude ajanıdır (varsayılan model `claude-opus-5-5`). API anahtarı tanımlı değilse ofis **simülasyon modunda** açılır ve akışı sahte çalışanlarla izleyebilirsin.

## Kadro

| Departman | Çalışanlar |
|---|---|
| Yönetim | Genel Müdür (planlar ve raporu toplar), Proje Yöneticisi |
| Ürün ve Tasarım | Ürün Analisti, UI/UX Tasarımcı |
| Yazılım Geliştirme | Backend, Frontend, Mobil Geliştirici |
| Kalite ve Güvenlik | QA Test Mühendisi, Güvenlik Analisti |
| DevOps ve Altyapı | DevOps Mühendisi, Veri Mühendisi |
| Pazarlama ve Müşteri | İçerik Yazarı, Müşteri Temsilcisi |
| Finans | Muhasebeci |
| Yedek | Yedek Çalışan (hiçbir role uymayan işler) |
| Dinlenme Alanı | Uzun süre boşta kalanlar burada dinlenir |

Kadro ve her çalışanın sistem istemi `packages/shared/src/roster.ts` dosyasındadır. Yeni bir çalışan eklemek için bu listeye bir kayıt eklemen yeterli; ofis planı ve planlayıcı otomatik olarak tanır.

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
npm run demo -- "Berber randevu uygulaması" "Online randevu, SMS hatırlatma, ödeme; güvenlik ve test planı da olsun."
```

### Üretim

```bash
npm run build   # web arayüzünü derler (apps/web/dist)
npm start       # tek sunucu: API + arayüz, http://localhost:8787
```

## Nasıl çalışır

```
İş  ──▶  Genel Müdür (plan, JSON)  ──▶  Faz 1: çalışanlar paralel  ──▶  Faz 2 ...  ──▶  Genel Müdür (rapor)
```

1. **Planlama**: Genel Müdür, kadro listesini görerek işi en fazla 8 adıma böler. Her adımın bir çalışanı ve bir fazı vardır. Çıktı yapılandırılmış JSON olarak alınır (`output_config.format`).
2. **Çalışma**: Aynı fazdaki adımlar paralel çalışır; sonraki fazdakiler önceki çıktıları görür. Her çalışan kendi rol istemiyle çağrılır.
3. **Rapor**: Genel Müdür tüm çıktıları uzlaştırıp özet, teslimatlar, riskler ve sonraki adımlardan oluşan raporu yazar.

Tüm durum değişiklikleri SSE (`/api/events`) ile arayüze anında akar; ofiste çalışanların baloncukları ("Görevi planlıyor", "Sonucu topluyor" gibi) bu olaylardan beslenir. Görevler `data/office.json` dosyasına yazılır.

Model çağrılarında adaptive thinking, prompt caching (sistem istemi) ve sunucu taraflı refusal fallback (`fallbacks: "default"`) açıktır.

## API

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/office` | Departmanlar, çalışanlar, durumlar ve görevler |
| GET | `/api/tasks` | Görev listesi |
| GET | `/api/tasks/:id` | Görev ayrıntısı (plan, adım çıktıları, rapor, akış) |
| POST | `/api/tasks` | `{ "title": "...", "brief": "..." }` ile yeni görev |
| GET | `/api/events` | SSE canlı olay akışı |

## Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `ANTHROPIC_API_KEY` | - | Yoksa simülasyon modu |
| `OFFICE_MODEL` | `claude-opus-5-5` | Çalışanların modeli |
| `OFFICE_MOCK` | `0` | `1` ise anahtar olsa da simülasyon |
| `OFFICE_MOCK_DELAY_MS` | `2500` | Simülasyonda adım süresi |
| `PORT` | `8787` | Sunucu portu |
| `OFFICE_DATA_DIR` | `./data` | Görev kayıtlarının yazıldığı klasör |

## Proje yapısı

```
packages/shared   ortak tipler + kadro (roster)
apps/server       Hono API, orkestratör, Claude entegrasyonu, SSE
apps/web          Vite + React izometrik ofis arayüzü
```

## Yol haritası

- Çalışanlara araç verme (kod çalıştırma, dosya yazma, web araması)
- Görev geçmişi için gerçek veritabanı
- Çalışan başına model/efor seçimi ve maliyet paneli
- Çok kullanıcılı erişim ve yetkilendirme

## Telefondan kullanım (Artifact sürümü)

`artifact/rebirth-ofis.html` tek dosyalık, sunucusuz sürümdür. Claude içinde artifact olarak yayınlandığında çalışanlar Claude'u doğrudan sayfadan çağırır (`sample` yeteneği, kullanıcının kendi Claude hakkından harcanır), görevler artifact veritabanında saklanır (`db`). Claude dışında açılırsa simülasyon moduna düşer.
