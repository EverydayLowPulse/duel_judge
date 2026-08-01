import { z } from "zod";
import { resolveEnv } from "../llm/env";
import { generateJsonWithDeepseek } from "../llm/providers/deepseekJson";

const rewriteSchema = z.object({
  queries: z.array(z.string()).max(5).default([]),
});

/**
 * 読み仮名・略称から wiki/公式向け検索語を最大3件。
 * DEEPSEEK_API_KEY が無い／失敗時は空（呼び出し側が元クエリを使う）。
 * Gemini は使わない。
 */
export async function rewriteCardSearchQueries(
  query: string,
): Promise<string[]> {
  if (!resolveEnv("DEEPSEEK_API_KEY")) return [];

  const q = query.normalize("NFKC").trim();
  if (q.length < 2) return [];

  try {
    const raw = await generateJsonWithDeepseek({
      system: `あなたはデュエル・マスターズのカード名検索アシスタントです。
ユーザー入力（読み仮名・略称・崩した表記）から、wiki/公式DB検索に効く短い検索語を最大3件出してください。
存在しないカード名を捏造しないでください。正式名が分かるときはそれを優先。
出力は JSON のみ: { "queries": string[] }`,
      user: `入力: ${q}`,
      jsonSchema: {
        type: "object",
        properties: {
          queries: { type: "array", items: { type: "string" } },
        },
        required: ["queries"],
      },
      temperature: 0,
    });
    const parsed = rewriteSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return unique(
      parsed.data.queries
        .map((s) => s.normalize("NFKC").trim())
        .filter((s) => s.length >= 2)
        .slice(0, 3),
    );
  } catch {
    return [];
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
