import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { EMPLOYEES, getManager } from "@rebirth/shared";

/**
 * Claude ile konuşan ince katman.
 * - live: Anthropic SDK (streaming, adaptive thinking, sunucu taraflı fallback)
 * - mock: API anahtarı yokken ofisi simüle eden sahte çalışanlar
 */

export const PlanSchema = z.object({
  summary: z.string().describe("Görevin 1-2 cümlelik özeti"),
  steps: z
    .array(
      z.object({
        employeeId: z.string().describe("Kadrodaki çalışan kimliği"),
        title: z.string().describe("Adımın kısa başlığı"),
        instruction: z.string().describe("Çalışana verilen ayrıntılı talimat"),
        phase: z.number().int().min(1).describe("Aynı fazdaki adımlar paralel çalışır"),
      }),
    )
    .min(1)
    .max(8),
});
export type PlanInput = z.infer<typeof PlanSchema>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionResult {
  text: string;
  usage: Usage;
  stopReason: string | null;
}

export interface Backend {
  readonly mode: "live" | "mock";
  readonly model: string;
  complete(opts: { system: string; prompt: string; maxTokens?: number }): Promise<CompletionResult>;
  plan(opts: { system: string; prompt: string }): Promise<{ plan: PlanInput; usage: Usage }>;
}

const PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "steps"],
  properties: {
    summary: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["employeeId", "title", "instruction", "phase"],
        properties: {
          employeeId: { type: "string" },
          title: { type: "string" },
          instruction: { type: "string" },
          phase: { type: "integer" },
        },
      },
    },
  },
} as const;

export class LiveBackend implements Backend {
  readonly mode = "live" as const;
  private client = new Anthropic();

  constructor(readonly model: string) {}

  async complete({
    system,
    prompt,
    maxTokens = 64000,
  }: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<CompletionResult> {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
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
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
      stopReason: message.stop_reason,
    };
  }

  async plan({ system, prompt }: { system: string; prompt: string }) {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: PLAN_JSON_SCHEMA },
      },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new Error("Model planlama isteğini reddetti.");
    }
    const text = message.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");
    const plan = PlanSchema.parse(JSON.parse(text));
    return {
      plan,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  }
}

/** API anahtarı olmadan ofisi denemek için sahte çalışanlar. */
export class MockBackend implements Backend {
  readonly mode = "mock" as const;
  readonly model = "mock";

  constructor(private readonly delayMs = 2500) {}

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.6));
  }

  async plan({ prompt }: { system: string; prompt: string }) {
    await this.wait(this.delayMs * 0.6);
    const text = prompt.toLowerCase();
    const picks = new Set<string>();
    const rules: Array<[RegExp, string]> = [
      [/api|backend|sunucu|veritaban|auth|giriş|kayıt/, "backend"],
      [/arayüz|ekran|react|web|frontend|site|sayfa|panel/, "frontend"],
      [/mobil|ios|android|uygulama/, "mobil"],
      [/tasar|ux|ui|akış/, "uiux-tasarimci"],
      [/test|kalite|hata/, "qa"],
      [/güvenlik|kvkk|şifre|yetki/, "guvenlik"],
      [/deploy|docker|ci|yayın|altyapı|bulut|sunucuya/, "devops"],
      [/veri|rapor|sql|şema|tablo/, "veri-muhendisi"],
      [/pazarlama|tanıtım|metin|blog|sosyal/, "icerik"],
      [/müşteri|destek|sss|onboarding/, "musteri"],
      [/maliyet|fiyat|bütçe|gelir/, "muhasebeci"],
      [/plan|sprint|zaman|takvim|kapsam/, "proje-yoneticisi"],
    ];
    for (const [re, id] of rules) if (re.test(text)) picks.add(id);
    if (picks.size === 0) {
      picks.add("urun-analisti");
      picks.add("backend");
      picks.add("frontend");
    }
    const ids = [...picks].slice(0, 5);
    const steps = ids.map((employeeId, i) => {
      const emp = EMPLOYEES.find((e) => e.id === employeeId)!;
      return {
        employeeId,
        title: `${emp.role} çalışması`,
        instruction: `Görev kapsamında ${emp.skills.toLowerCase()} alanında katkı ver.`,
        phase: i < 2 ? 1 : 2,
      };
    });
    return {
      plan: { summary: "Simülasyon planı: görev anahtar kelimelere göre ekibe dağıtıldı.", steps },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  async complete({ system, prompt }: { system: string; prompt: string }): Promise<CompletionResult> {
    await this.wait(this.delayMs);
    const isManager = system.includes(getManager().name);
    const text = isManager
      ? `## Yönetici Raporu (simülasyon)\n\nBu rapor sahte modda üretildi. Gerçek çıktılar için \`.env\` dosyasına \`ANTHROPIC_API_KEY\` ekleyin.\n\n### Ekip çıktıları\n${prompt
          .split("\n")
          .filter((l) => l.startsWith("### ") && l.includes(" - "))
          .map((l) => `- ${l.replace("### ", "")}`)
          .join("\n")}\n\n### Sonraki adımlar\n1. API anahtarını tanımla\n2. Görevi yeniden gönder`
      : `### Çalışma özeti (simülasyon)\n\n- Talimat alındı ve incelendi.\n- Bu alanda örnek bir çıktı üretildi.\n- Gerçek modelde burada ayrıntılı analiz, kod ve öneriler yer alır.\n\n\`\`\`txt\n${prompt.slice(0, 160).replace(/\n+/g, " ")}...\n\`\`\``;
    return { text, usage: { inputTokens: 0, outputTokens: 0 }, stopReason: "end_turn" };
  }
}

export function createBackend(): Backend {
  const model = process.env.OFFICE_MODEL || "claude-opus-5-5";
  const forceMock = process.env.OFFICE_MOCK === "1";
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (forceMock || !hasKey) {
    if (!forceMock) {
      console.warn("[ofis] ANTHROPIC_API_KEY bulunamadı; ofis simülasyon (mock) modunda çalışıyor.");
    }
    return new MockBackend(Number(process.env.OFFICE_MOCK_DELAY_MS ?? 2500));
  }
  return new LiveBackend(model);
}
