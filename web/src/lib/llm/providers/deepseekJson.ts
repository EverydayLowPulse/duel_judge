import { requireEnv, resolveEnv } from "../env";
import { getLlmModelOverride } from "../providerContext";

export function getDeepseekModelName(): string {
  // 公式 API ID: deepseek-v4-pro（V4）/ deepseek-flash（V4.1）
  // 旧 ID の deepseek-v4-flash も V4.1 Flash に転送される
  return (
    getLlmModelOverride() ||
    resolveEnv("DEEPSEEK_MODEL") ||
    "deepseek-flash"
  );
}

/**
 * DeepSeek の OpenAI 互換 Chat Completions。
 * json_schema 厳密モードは無いので json_object + プロンプト内スキーマ案内。
 * 構造化出力では thinking を切る（content が空になる事故を避ける）。
 */
export async function generateJsonWithDeepseek(input: {
  system: string;
  user: string;
  jsonSchema: object;
  temperature?: number;
}): Promise<string> {
  const apiKey = requireEnv("DEEPSEEK_API_KEY");
  const base =
    resolveEnv("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";
  const schemaHint = JSON.stringify(input.jsonSchema, null, 2);
  const system = `${input.system}

出力は必ず1つの JSON オブジェクトだけにしてください。
次の JSON Schema に従ってください（追加フィールド禁止）:
${schemaHint}`;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getDeepseekModelName(),
      temperature: input.temperature ?? 0.2,
      response_format: { type: "json_object" },
      // v4-flash は thinking 既定ON。JSON専用呼び出しでは無効化する。
      thinking: { type: "disabled" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: input.user },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`DeepSeek API error: HTTP ${res.status} ${raw.slice(0, 500)}`);
  }

  let parsed: {
    choices?: Array<{
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
      };
    }>;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error(`DeepSeek 応答が JSON ではありません: ${raw.slice(0, 200)}`);
  }

  const message = parsed.choices?.[0]?.message;
  const content =
    message?.content?.trim() ||
    extractJsonFromText(message?.reasoning_content ?? "");
  if (!content) {
    throw new Error(
      `DeepSeek から空の応答が返りました: ${raw.slice(0, 300)}`,
    );
  }
  return content;
}

function extractJsonFromText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return "";
}
