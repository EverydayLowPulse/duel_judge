import type { z } from "zod";
import { resolveEnv } from "./env";
import {
  getLlmProviderOverride,
  type LlmProvider,
} from "./providerContext";
import { generateJsonWithDeepseek, getDeepseekModelName } from "./providers/deepseekJson";
import { generateJsonWithGemini, getGeminiModelName } from "./providers/geminiJson";
import { recordLlmCall } from "./usage";

export type { LlmProvider };
export type GenerateJsonInput<T> = {
  system: string;
  user: string;
  /** Gemini の responseJsonSchema / DeepSeek への案内用 */
  jsonSchema: object;
  /** DeepSeek 側の厳密検証用。Gemini でも最終ガードに使う */
  zodSchema: z.ZodType<T>;
  temperature?: number;
  /** 利用ログ用のラベル（例: answer / plan / verify） */
  purpose?: string;
};

/**
 * LLM_PROVIDER に従って JSON を生成する。
 * - auto（既定）: Gemini → 一時障害（429/503/quota 等）なら DeepSeek へフォールバック
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
    try {
      const text = await generateJsonWithDeepseek(input);
      recordLlmCall({
        provider: "deepseek",
        model: getDeepseekModelName(),
        purpose: input.purpose,
      });
      return parseWithZod(text, input.zodSchema);
    } catch (error) {
      throw new Error(formatUserFacingLlmError(error));
    }
  }

  if (provider === "gemini") {
    if (!hasGemini) {
      throw new Error("LLM_PROVIDER=gemini ですが GEMINI_API_KEY が未設定です");
    }
    try {
      const text = await generateJsonWithGemini(input);
      recordLlmCall({
        provider: "gemini",
        model: getGeminiModelName(),
        purpose: input.purpose,
      });
      return parseWithZod(text, input.zodSchema);
    } catch (error) {
      throw new Error(formatUserFacingLlmError(error));
    }
  }

  // auto
  if (hasGemini) {
    try {
      const text = await generateJsonWithGemini(input);
      recordLlmCall({
        provider: "gemini",
        model: getGeminiModelName(),
        purpose: input.purpose,
      });
      return parseWithZod(text, input.zodSchema);
    } catch (error) {
      if (hasDeepseek && isTransientGeminiError(error)) {
        console.warn(
          "[llm] Gemini 一時障害 → DeepSeek にフォールバック",
          error instanceof Error ? error.message.slice(0, 160) : error,
        );
        try {
          const text = await generateJsonWithDeepseek(input);
          recordLlmCall({
            provider: "deepseek",
            model: getDeepseekModelName(),
            purpose: input.purpose,
          });
          return parseWithZod(text, input.zodSchema);
        } catch (deepseekError) {
          throw new Error(formatUserFacingLlmError(deepseekError, { geminiAlsoFailed: true }));
        }
      }
      throw new Error(formatUserFacingLlmError(error));
    }
  }

  if (hasDeepseek) {
    const text = await generateJsonWithDeepseek(input);
    recordLlmCall({
      provider: "deepseek",
      model: getDeepseekModelName(),
      purpose: input.purpose,
    });
    return parseWithZod(text, input.zodSchema);
  }

  throw new Error(
    "GEMINI_API_KEY も DEEPSEEK_API_KEY も未設定です。web/.env.local を確認してください。",
  );
}

export function getLlmProvider(): LlmProvider {
  const override = getLlmProviderOverride();
  if (override) return override;
  const raw = (resolveEnv("LLM_PROVIDER") || "auto").toLowerCase();
  if (raw === "gemini" || raw === "deepseek" || raw === "auto") return raw;
  return "auto";
}

/** @deprecated 互換用。isTransientGeminiError を使う */
export function isQuotaOrRateLimitError(error: unknown): boolean {
  return isTransientGeminiError(error);
}

/**
 * Gemini が一時的に使えない系（レート制限・混雑・過負荷）。
 * auto モードでは DeepSeek へ切り替える判定に使う。
 */
export function isTransientGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|503|RESOURCE_EXHAUSTED|UNAVAILABLE|quota|rate.?limit|Too Many Requests|high demand|try again later|overloaded/i.test(
    message,
  );
}

/**
 * API / UI 向けに生 JSON や SDK 文言を読みやすい日本語へ整える。
 */
export function formatUserFacingLlmError(
  error: unknown,
  options?: { geminiAlsoFailed?: boolean },
): string {
  const raw = error instanceof Error ? error.message : String(error);
  const extracted = extractProviderMessage(raw) ?? raw;
  const hasDeepseek = Boolean(resolveEnv("DEEPSEEK_API_KEY"));

  if (/503|UNAVAILABLE|high demand|overloaded/i.test(raw)) {
    if (!hasDeepseek) {
      return "Gemini が混み合っています（503）。しばらく再試行するか、DEEPSEEK_API_KEY を設定すると自動で切り替えます。";
    }
    if (options?.geminiAlsoFailed) {
      return "Gemini が混み合い、DeepSeek でも失敗しました。しばらくしてから再試行してください。";
    }
    return "Gemini が混み合っています（503）。しばらくしてから再試行してください。";
  }

  if (/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(raw)) {
    if (!hasDeepseek) {
      return "Gemini の利用上限に達しています。しばらく待つか、DEEPSEEK_API_KEY を設定してください。";
    }
    return "Gemini の利用上限に達しました。フォールバックに失敗したときは再試行してください。";
  }

  // 生 JSON 丸出しを避ける
  if (/^\s*\{/.test(raw.trim())) {
    return `判定に失敗しました: ${extracted.slice(0, 200)}`;
  }

  return extracted.length > 280 ? `${extracted.slice(0, 280)}…` : extracted;
}

function extractProviderMessage(raw: string): string | null {
  try {
    const jsonStart = raw.indexOf("{");
    if (jsonStart < 0) return null;
    const parsed = JSON.parse(raw.slice(jsonStart)) as {
      error?: { message?: string };
      message?: string;
    };
    const msg = parsed.error?.message ?? parsed.message;
    return typeof msg === "string" ? msg : null;
  } catch {
    const m = raw.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
    return m?.[1]?.replace(/\\"/g, '"') ?? null;
  }
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
