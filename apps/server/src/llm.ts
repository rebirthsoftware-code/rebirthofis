import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { EMPLOYEES, type TaskDepth } from "@rebirth/shared";

/**
 * Claude ile konuşan ince katman.
 * - live: Anthropic SDK (streaming, adaptive thinking, sunucu taraflı fallback)
 * - mock: API anahtarı yokken ofisi simüle eden sahte çalışanlar
 *
 * Model seçimi işin büyüklüğüne göre yapılır: küçük işte Opus 5.5,
 * baştan sona teslim istenen işte Fable 5.2 (uzun işte high efor).
 */

export const PlanSchema = z.object({
  summary: z.string(),
  audience: z.string(),
  format: z.string(),
  acceptance: z.array(z.string()),
  steps: z
    .array(
      z.object({
        employeeId: z.string(),
        title: z.string(),
        deliverable: z.string(),
        instruction: z.string(),
        format: z.string(),
        acceptance: z.array(z.string()),
        phase: z.number(),
      }),
    )
    .min(1),
});
export type PlanInput = z.infer<typeof PlanSchema>;

export const ReviewSchema = z.object({
  passed: z.boolean(),
  checks: z.array(z.object({ criterion: z.string(), ok: z.boolean(), note: z.string() })),
  fixes: z.array(z.object({ stepId: z.string(), note: z.string() })),
});
export type ReviewInput = z.infer<typeof ReviewSchema>;

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;
const PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "audience", "format", "acceptance", "steps"],
  properties: {
    summary: str,
    audience: str,
    format: str,
    acceptance: strArr,
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["employeeId", "title", "deliverable", "instruction", "format", "acceptance", "phase"],
        properties: { employeeId: str, title: str, deliverable: str, instruction: str, format: str, acceptance: strArr, phase: { type: "integer" } },
      },
    },
  },
} satisfies Record<string, unknown>;
const REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["passed", "checks", "fixes"],
  properties: {
    passed: { type: "boolean" },
    checks: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["criterion", "ok", "note"], properties: { criterion: str, ok: { type: "boolean" }, note: str } },
    },
    fixes: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["stepId", "note"], properties: { stepId: str, note: str } },
    },
  },
} satisfies Record<string, unknown>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface CallOpts {
  system: string;
  prompt: string;
  depth: TaskDepth;
  /** Simülasyonun hangi tür çıktı üreteceğini bilmesi için */
  meta?: { kind: "plan" | "step" | "review" | "report"; employeeId?: string; acceptance?: string[] };
}

export interface CompletionResult {
  text: string;
  usage: Usage;
  truncated: boolean;
}

export interface Backend {
  readonly mode: "live" | "mock";
  readonly models: Record<TaskDepth, string>;
  complete(opts: CallOpts): Promise<CompletionResult>;
  plan(opts: CallOpts): Promise<{ plan: PlanInput; usage: Usage }>;
  review(opts: CallOpts): Promise<{ review: ReviewInput; usage: Usage }>;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export class LiveBackend implements Backend {
  readonly mode = "live" as const;
  private client = new Anthropic();
  readonly models: Record<TaskDepth, string>;
  private readonly efforts: Record<TaskDepth, Effort>;

  constructor(deliveryModel: string, lightModel: string) {
    this.models = { kucuk: lightModel, teslim: deliveryModel, uzun: deliveryModel };
    this.efforts = { kucuk: "medium", teslim: "medium", uzun: "high" };
  }

  private async run(opts: CallOpts, maxTokens: number, schema?: Record<string, unknown>) {
    const stream = this.client.beta.messages.stream({
      model: this.models[opts.depth],
      max_tokens: maxTokens,
      // Model politika gereği reddederse API aynı isteği uygun yedek modelde sürdürür.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: this.efforts[opts.depth],
        ...(schema ? { format: { type: "json_schema" as const, schema } } : {}),
      },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.prompt }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      const why = message.stop_details?.type === "refusal" ? message.stop_details.explanation : undefined;
      throw new Error(`Model bu isteği reddetti${why ? `: ${why}` : "."}`);
    }
    const text = message.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      text,
      truncated: message.stop_reason === "max_tokens",
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  }

  async complete(opts: CallOpts): Promise<CompletionResult> {
    const res = await this.run(opts, 64000);
    return res.truncated ? { ...res, text: res.text + "\n\n> Not: Yanıt uzunluk sınırına takıldı; teslim yarım kalmış olabilir." } : res;
  }

  async plan(opts: CallOpts) {
    const res = await this.run(opts, 16000, PLAN_JSON_SCHEMA);
    return { plan: PlanSchema.parse(JSON.parse(res.text)), usage: res.usage };
  }

  async review(opts: CallOpts) {
    const res = await this.run(opts, 16000, REVIEW_JSON_SCHEMA);
    return { review: ReviewSchema.parse(JSON.parse(res.text)), usage: res.usage };
  }
}

/** API anahtarı olmadan ofisi denemek için sahte çalışanlar. */
export class MockBackend implements Backend {
  readonly mode = "mock" as const;
  readonly models: Record<TaskDepth, string> = { kucuk: "mock", teslim: "mock", uzun: "mock" };
  private readonly zero: Usage = { inputTokens: 0, outputTokens: 0 };

  constructor(private readonly delayMs = 2500) {}

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.6));
  }

  async plan({ prompt }: CallOpts) {
    await this.wait(this.delayMs * 0.6);
    const text = prompt.toLowerCase();
    const picks: string[] = [];
    const rules: Array<[RegExp, string]> = [
      [/logo|afiş|kimlik|görsel/, "grafik"],
      [/site|sayfa|oyun|animasyon|html|sunum/, "frontend"],
      [/veri|csv|tablo|analiz/, "veri"],
      [/çevir|metin|tanıtım/, "icerik"],
      [/api|backend|giriş|veritaban/, "backend"],
      [/pazar|rakip|gereksinim/, "urun-analisti"],
      [/maliyet|fiyat|bütçe/, "muhasebeci"],
      [/tasar|akış|ekran/, "uiux"],
    ];
    for (const [re, id] of rules) if (re.test(text) && !picks.includes(id)) picks.push(id);
    if (!picks.length) picks.push("urun-analisti", "frontend");
    const steps = picks.slice(0, 3).map((employeeId, i) => {
      const emp = EMPLOYEES.find((e) => e.id === employeeId)!;
      return {
        employeeId,
        title: `${emp.role} teslimi`,
        deliverable: "Örnek teslim",
        instruction: `İşin ${emp.skills.toLowerCase()} kısmını teslim et.`,
        format: ["frontend", "grafik"].includes(employeeId) ? "Tek dosya" : "Markdown",
        acceptance: ["Kabul ölçütünü karşılıyor"],
        phase: i < 2 ? 1 : 2,
      };
    });
    return {
      plan: {
        summary: "Simülasyon planı: iş anahtar kelimelere göre ekibe dağıtıldı.",
        audience: "Belirtilmedi",
        format: "Markdown rapor",
        acceptance: ["İstenen her parça teslim edildi"],
        steps,
      },
      usage: this.zero,
    };
  }

  async review({ meta }: CallOpts) {
    await this.wait(this.delayMs * 0.5);
    return {
      review: {
        passed: true,
        checks: (meta?.acceptance?.length ? meta.acceptance : ["Teslim tamam"]).map((criterion) => ({ criterion, ok: true, note: "Simülasyonda geçti sayıldı." })),
        fixes: [],
      },
      usage: this.zero,
    };
  }

  async complete({ meta }: CallOpts): Promise<CompletionResult> {
    await this.wait(this.delayMs);
    const check = "\n\n## Kendi kontrolüm\n- Simülasyon: ölçütler denetlenmedi.";
    let text: string;
    if (meta?.kind === "report") {
      text = "## Teslim Raporu (simülasyon)\n\nBu rapor sahte modda üretildi. Gerçek teslimler için `.env` dosyasına `ANTHROPIC_API_KEY` ekleyin.";
    } else if (meta?.employeeId === "grafik") {
      text = `Örnek bir logo yönü (simülasyon).\n\nDosya: logo-ornek.svg\n\`\`\`svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#1c1917"/><circle cx="60" cy="60" r="30" fill="#f5a524"/></svg>\n\`\`\`${check}`;
    } else if (meta?.employeeId === "frontend") {
      text = `Örnek tek dosyalık sayfa (simülasyon).\n\nDosya: index.html\n\`\`\`html\n<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Örnek</title><body style="font-family:system-ui;padding:32px"><h1>Örnek teslim</h1><p>Gerçek modda burada çalışanın ürettiği dosya açılır.</p></body></html>\n\`\`\`${check}`;
    } else {
      text = `### Teslim (simülasyon)\n\n- Hedef alındı ve incelendi.\n- Gerçek modda burada ayrıntılı teslim yer alır.${check}`;
    }
    return { text, usage: this.zero, truncated: false };
  }
}

export function createBackend(): Backend {
  const deliveryModel = process.env.OFFICE_MODEL || "claude-fable-5-2";
  const lightModel = process.env.OFFICE_LIGHT_MODEL || "claude-opus-5-5";
  const forceMock = process.env.OFFICE_MOCK === "1";
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (forceMock || !hasKey) {
    if (!forceMock) console.warn("[ofis] ANTHROPIC_API_KEY bulunamadı; ofis simülasyon (mock) modunda çalışıyor.");
    return new MockBackend(Number(process.env.OFFICE_MOCK_DELAY_MS ?? 2500));
  }
  return new LiveBackend(deliveryModel, lightModel);
}
