import type { z } from "zod";
import { resolveEnv } from "./env";
import { generateJsonWithDeepseek } from "./providers/deepseekJson";
import { generateJsonWithGemini } from "./providers/geminiJson";

export type LlmProvider = "auto" | "gemini" | "deepseek";

export type GenerateJsonInput<T> = {
  system: string;
  user: string;
  /** Gemini の responseJsonSchema / DeepSeek への案内用 */
  jsonSchema: object;
  /** DeepSeek 側の厳密検証用。Gemini でも最終ガードに使う */
  zodSchema: z.ZodType<T>;
  temperature?: number;
};

/**
 * LLM_PROVIDER に従って JSON を生成する。
 * - auto（既定）: Gemini → 429/quota なら DeepSeek へフォールバック
 * - gemini / deepseek: 指定プロバイダのみ
 */
export async function generateJson<T>(
  input: GenerateJsonInput<T>,
): Promise<T> {
  const provider = getLlmProvider();
  const hasDeepseek = Boolean(resolveEnv("DEEPSEEK_API_KEY"));
  const hasGemini = Boolean(resolveEnv("GEMINI_API_KEY"));

  if (provider === "deepseek") {
    if (!hasDeepseek) {
      throw new Error("LLM_PROVIDER=deepseek ですが DEEPSEEK_API_KEY が未設定です");
    }
    return parseWithZod(await generateJsonWithDeepseek(input), input.zodSchema);
  }

  if (provider === "gemini") {
    if (!hasGemini) {
      throw new Error("LLM_PROVIDER=gemini ですが GEMINI_API_KEY が未設定です");
    }
    return parseWithZod(await generateJsonWithGemini(input), input.zodSchema);
  }

  // auto
  if (hasGemini) {
    try {
      return parseWithZod(await generateJsonWithGemini(input), input.zodSchema);
    } catch (error) {
      if (hasDeepseek && isQuotaOrRateLimitError(error)) {
        console.warn(
          "[llm] Gemini quota/rate-limit → DeepSeek にフォールバック",
          error instanceof Error ? error.message.slice(0, 160) : error,
        );
        return parseWithZod(
          await generateJsonWithDeepseek(input),
          input.zodSchema,
        );
      }
      throw error;
    }
  }

  if (hasDeepseek) {
    return parseWithZod(await generateJsonWithDeepseek(input), input.zodSchema);
  }

  throw new Error(
    "GEMINI_API_KEY も DEEPSEEK_API_KEY も未設定です。web/.env.local を確認してください。",
  );
}

export function getLlmProvider(): LlmProvider {
  const raw = (resolveEnv("LLM_PROVIDER") || "auto").toLowerCase();
  if (raw === "gemini" || raw === "deepseek" || raw === "auto") return raw;
  return "auto";
}

export function isQuotaOrRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|RESOURCE_EXHAUSTED|quota|rate.?limit|Too Many Requests/i.test(
    message,
  );
}

function parseWithZod<T>(text: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonObject(text));
  } catch (error) {
    throw new Error(
      `LLM JSON の parse に失敗: ${error instanceof Error ? error.message : error}\n${text.slice(0, 240)}`,
    );
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `LLM JSON がスキーマ不合: ${result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

/** markdown fence や前後の説明文が付いても JSON 本体を取り出す */
function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
