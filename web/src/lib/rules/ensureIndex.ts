import { promises as fs } from "node:fs";
import path from "node:path";
import { withOfficialRateLimit } from "../official/rateLimit";
import { rulesDir } from "../paths";
import { chunkRuleText } from "./chunk";
import {
  RULE_INDEX_FILENAME,
  RULE_PDF_FILENAME,
  RULE_PDF_URL,
  RULE_VERSION,
} from "./constants";
import { extractPdfText } from "./extract";
import type { RuleIndex } from "./types";

let memory: RuleIndex | null = null;

function pdfPath(): string {
  return path.join(rulesDir(), RULE_PDF_FILENAME);
}

function indexPath(): string {
  return path.join(rulesDir(), RULE_INDEX_FILENAME);
}

/**
 * 総合ルール索引を返す。無ければ PDF 取得 → 抽出 → チャンクして保存。
 */
export async function ensureRuleIndex(options?: {
  forceRebuild?: boolean;
}): Promise<RuleIndex> {
  if (!options?.forceRebuild && memory) return memory;

  if (!options?.forceRebuild) {
    const cached = await readIndexFile();
    if (cached) {
      memory = cached;
      return cached;
    }
  }

  await fs.mkdir(rulesDir(), { recursive: true });
  const pdf = pdfPath();
  if (options?.forceRebuild || !(await fileExists(pdf))) {
    await downloadRulePdf(pdf);
  }

  const text = await extractPdfText(pdf);
  const chunks = chunkRuleText(text);
  if (chunks.length === 0) {
    throw new Error("ルールPDFからチャンクを抽出できませんでした");
  }

  const index: RuleIndex = {
    version: RULE_VERSION,
    sourceUrl: RULE_PDF_URL,
    sourceFile: RULE_PDF_FILENAME,
    builtAt: new Date().toISOString(),
    chunkCount: chunks.length,
    chunks,
  };

  await fs.writeFile(indexPath(), JSON.stringify(index), "utf8");
  memory = index;
  return index;
}

async function readIndexFile(): Promise<RuleIndex | null> {
  try {
    const raw = await fs.readFile(indexPath(), "utf8");
    const parsed = JSON.parse(raw) as RuleIndex;
    if (!parsed.chunks?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function downloadRulePdf(dest: string): Promise<void> {
  const buf = await withOfficialRateLimit(async () => {
    const res = await fetch(RULE_PDF_URL, {
      headers: {
        "User-Agent": "duel_judge/0.1 (personal research; respectful rate limit)",
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
