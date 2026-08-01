import { promises as fs } from "node:fs";
import { withOfficialRateLimit } from "../official/rateLimit";
import { chunkRuleText } from "./chunk";
import {
  RULE_INDEX_FILENAME,
  RULE_PDF_FILENAME,
  RULE_PDF_URL,
  RULE_VERSION,
} from "./constants";
import { extractPdfText } from "./extract";
import type { RuleIndex } from "./types";

export async function downloadRulePdf(dest: string): Promise<void> {
  const buf = await withOfficialRateLimit(async () => {
    const res = await fetch(RULE_PDF_URL, {
      headers: {
        "User-Agent":
          "duel_judge/0.1 (personal research; respectful rate limit)",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`ルールPDF取得失敗: HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  });
  await fs.writeFile(dest, buf);
}

/** PDF パスから索引を組み立てる（保存は呼び出し側） */
export async function buildRuleIndexFromPdf(
  pdfPath: string,
): Promise<RuleIndex> {
  const text = await extractPdfText(pdfPath);
  const chunks = chunkRuleText(text);
  if (chunks.length === 0) {
    throw new Error("ルールPDFからチャンクを抽出できませんでした");
  }
  return {
    version: RULE_VERSION,
    sourceUrl: RULE_PDF_URL,
    sourceFile: RULE_PDF_FILENAME,
    builtAt: new Date().toISOString(),
    chunkCount: chunks.length,
    chunks,
  };
}

export function parseRuleIndexJson(raw: string): RuleIndex | null {
  try {
    const parsed = JSON.parse(raw) as RuleIndex;
    if (!parsed.chunks?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export { RULE_INDEX_FILENAME, RULE_PDF_FILENAME };
