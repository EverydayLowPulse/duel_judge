/**
 * 総合ルール索引をビルドして data/rules/bundled-index.json に書く。
 * Vercel / ローカルの `npm run build` 前に実行し、実行時 PDF 抽出を避ける。
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
  RULE_PDF_FILENAME,
} from "../src/lib/rules/buildRuleIndex";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "rules", "bundled-index.json");

async function main() {
  const started = Date.now();
  console.log("[build-rules-index] start");

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "duel-rules-"));
  const pdf = path.join(workDir, RULE_PDF_FILENAME);
  try {
    console.log("[build-rules-index] download PDF…");
    await downloadRulePdf(pdf);
    console.log("[build-rules-index] extract + chunk…");
    const index = await buildRuleIndexFromPdf(pdf);
    await fs.mkdir(path.dirname(OUT), { recursive: true });
    await fs.writeFile(OUT, JSON.stringify(index), "utf8");
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
