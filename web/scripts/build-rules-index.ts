/**
 * 総合ルール索引をビルドして data/rules/bundled-index.json に書く。
 * Vercel / ローカルの `npm run build` 前に実行し、実行時 PDF 抽出を避ける。
 *
 * 同じ版のPDF（RULE_PDF_URL）から作った索引が手元か .next/cache にあれば、
 * ダウンロードせずに使い回す。.next/cache は Vercel が次のビルドへ引き継ぐ。
 * ルールが改訂されたら constants.ts の RULE_PDF_URL を新しい版に変えれば作り直される。
 *
 *   npx tsx scripts/build-rules-index.ts
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRuleIndexFromPdf,
  downloadRulePdf,
  parseRuleIndexJson,
  RULE_PDF_FILENAME,
} from "../src/lib/rules/buildRuleIndex";
import { RULE_PDF_URL } from "../src/lib/rules/constants";
import { canReuseRuleIndex } from "../src/lib/rules/reuseIndex";
import type { RuleIndex } from "../src/lib/rules/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "rules", "bundled-index.json");
const CACHE = path.join(ROOT, ".next", "cache", "duel-rules", "bundled-index.json");

async function readIndex(file: string): Promise<RuleIndex | null> {
  try {
    return parseRuleIndexJson(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeIndex(file: string, raw: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, raw, "utf8");
}

async function main() {
  const started = Date.now();
  console.log("[build-rules-index] start");

  if (canReuseRuleIndex(await readIndex(OUT), RULE_PDF_URL)) {
    // 次のビルド（Vercel）でも使えるよう、キャッシュにも置いておく
    await writeIndex(CACHE, await fs.readFile(OUT, "utf8"));
    console.log("[build-rules-index] same PDF version; reuse existing index");
    return;
  }
  if (canReuseRuleIndex(await readIndex(CACHE), RULE_PDF_URL)) {
    await writeIndex(OUT, await fs.readFile(CACHE, "utf8"));
    console.log("[build-rules-index] same PDF version; restored from build cache");
    return;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "duel-rules-"));
  const pdf = path.join(workDir, RULE_PDF_FILENAME);
  try {
    console.log("[build-rules-index] download PDF…");
    await downloadRulePdf(pdf);
    console.log("[build-rules-index] extract + chunk…");
    const index = await buildRuleIndexFromPdf(pdf);
    const raw = JSON.stringify(index);
    await writeIndex(OUT, raw);
    await writeIndex(CACHE, raw);
    const sizeMb = ((await fs.stat(OUT)).size / (1024 * 1024)).toFixed(2);
    console.log(
      `[build-rules-index] wrote ${OUT} (chunks=${index.chunkCount}, ${sizeMb} MB, ${Date.now() - started}ms)`,
    );
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
