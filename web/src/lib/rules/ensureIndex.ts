import { promises as fs } from "node:fs";
import path from "node:path";
import { rulesDir } from "../paths";
import {
  buildRuleIndexFromPdf,
  downloadRulePdf,
  parseRuleIndexJson,
  RULE_PDF_FILENAME,
} from "./buildRuleIndex";
import { RULE_INDEX_FILENAME } from "./constants";
import type { RuleIndex } from "./types";

let memory: RuleIndex | null = null;

function pdfPath(): string {
  return path.join(rulesDir(), RULE_PDF_FILENAME);
}

function indexPath(): string {
  return path.join(rulesDir(), RULE_INDEX_FILENAME);
}

/**
 * デプロイ同梱の索引（ビルド時に data/rules/bundled-index.json を生成）。
 * Vercel の /tmp が空でも、ここから読めば PDF 再抽出が不要。
 */
export function bundledRulesIndexPath(): string {
  return path.join(process.cwd(), "data", "rules", "bundled-index.json");
}

/**
 * 総合ルール索引を返す。
 * 優先順位: メモリ → 実行時キャッシュ → 同梱索引 → PDF取得・抽出
 */
export async function ensureRuleIndex(options?: {
  forceRebuild?: boolean;
}): Promise<RuleIndex> {
  if (!options?.forceRebuild && memory) return memory;

  if (!options?.forceRebuild) {
    const cached = await readIndexFile(indexPath());
    if (cached) {
      memory = cached;
      return cached;
    }
    const bundled = await readIndexFile(bundledRulesIndexPath());
    if (bundled) {
      memory = bundled;
      // 可能なら実行時キャッシュにもコピー（同一インスタンスの再読込用）
      await writeIndexFileBestEffort(bundled);
      return bundled;
    }
  }

  await fs.mkdir(rulesDir(), { recursive: true });
  const pdf = pdfPath();
  if (options?.forceRebuild || !(await fileExists(pdf))) {
    await downloadRulePdf(pdf);
  }

  const index = await buildRuleIndexFromPdf(pdf);
  await fs.writeFile(indexPath(), JSON.stringify(index), "utf8");
  memory = index;
  return index;
}

async function writeIndexFileBestEffort(index: RuleIndex): Promise<void> {
  try {
    await fs.mkdir(rulesDir(), { recursive: true });
    await fs.writeFile(indexPath(), JSON.stringify(index), "utf8");
  } catch {
    // /tmp 以外・読み取り専用などでは無視
  }
}

async function readIndexFile(file: string): Promise<RuleIndex | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return parseRuleIndexJson(raw);
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
