/**
 * 小さな評価セットのランナー。
 *
 * 使い方:
 *   npx tsx scripts/run-eval.ts              # 一覧＋JSON検証のみ
 *   npx tsx scripts/run-eval.ts --full       # runJudge まで実行して自動採点
 *   npx tsx scripts/run-eval.ts --id=xxx     # 1件だけ（--full と併用可）
 *
 * 自動採点は補助。最終の正誤は docs/evaluation.md どおり人手。
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runJudge } from "../src/lib/judge/runJudge";
import type { JudgeResponse } from "../src/lib/judge/types";

type EvalCase = {
  id: string;
  set: "A" | "B";
  question: string;
  gold: {
    conclusion_summary: string;
    must_cite_urls: string[];
    must_rule_refs: string[];
    must_conclusion_contains?: string[];
    must_not_conclusion_contains?: string[];
    allowed_confidence: Array<"high" | "medium" | "low">;
  };
  notes?: string;
};

type AutoScore = {
  id: string;
  ok: boolean;
  kind: string;
  failures: string[];
  conclusionPreview?: string;
  llm?: string;
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EVAL_DIR = path.join(ROOT, "docs", "eval");

async function loadCases(filterId?: string): Promise<EvalCase[]> {
  const files = (await readdir(EVAL_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const cases: EvalCase[] = [];
  for (const file of files) {
    const raw = JSON.parse(
      await readFile(path.join(EVAL_DIR, file), "utf8"),
    ) as EvalCase;
    if (!raw.id || !raw.question || !raw.gold) {
      throw new Error(`${file}: id/question/gold が必須`);
    }
    if (filterId && raw.id !== filterId) continue;
    cases.push(raw);
  }
  return cases;
}

function scoreAnswer(c: EvalCase, result: JudgeResponse): AutoScore {
  const failures: string[] = [];
  if (result.kind !== "answer") {
    return {
      id: c.id,
      ok: false,
      kind: result.kind,
      failures: [`kind=${result.kind}（answer 期待）`],
      llm: result.kind === "withhold" ? result.debug?.llm : undefined,
    };
  }

  const a = result.answer;
  const conclusion = a.conclusion ?? "";
  const urls = (a.evidence ?? []).map((e) => e.url);
  const ruleRefs = (a.evidence ?? [])
    .map((e) => e.rule_ref)
    .filter(Boolean) as string[];
  const blob = `${conclusion}\n${a.reasoning ?? ""}\n${(a.evidence ?? [])
    .map((e) => e.quote)
    .join("\n")}`;

  for (const url of c.gold.must_cite_urls) {
    if (!urls.some((u) => u.includes(url) || url.includes(u))) {
      // qa id だけでも拾う
      const qaId = url.match(/\/qa\/(\d+)/)?.[1];
      const hit =
        qaId &&
        (urls.some((u) => u.includes(qaId)) || blob.includes(qaId));
      if (!hit) failures.push(`must_cite_urls 不足: ${url}`);
    }
  }

  for (const ref of c.gold.must_rule_refs) {
    if (
      !ruleRefs.includes(ref) &&
      !blob.includes(ref) &&
      !(a.evidence ?? []).some((e) => e.quote?.includes(ref))
    ) {
      failures.push(`must_rule_refs 不足: ${ref}`);
    }
  }

  if (
    c.gold.allowed_confidence.length > 0 &&
    !c.gold.allowed_confidence.includes(a.confidence)
  ) {
    failures.push(
      `confidence=${a.confidence} が許容外 [${c.gold.allowed_confidence.join(",")}]`,
    );
  }

  for (const needle of c.gold.must_conclusion_contains ?? []) {
    if (!includesPhrase(conclusion, needle) && !includesPhrase(blob, needle)) {
      failures.push(`結論に「${needle}」が無い`);
    }
  }

  for (const needle of c.gold.must_not_conclusion_contains ?? []) {
    if (includesPhrase(conclusion, needle)) {
      failures.push(`結論に禁止句「${needle}」がある`);
    }
  }

  return {
    id: c.id,
    ok: failures.length === 0,
    kind: result.kind,
    failures,
    conclusionPreview: conclusion.slice(0, 120),
    llm: result.debug?.llm,
  };
}

/** 「不可能です」に「可能です」が部分一致しないように境界付きで見る */
function includesPhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (!haystack.includes(needle)) return false;
  // 否定接頭「不／非／無」直後の同じ語はヒット扱いにしない
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![不非無])${escaped}`);
  return re.test(haystack);
}

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const idArg = args.find((a) => a.startsWith("--id="));
  const filterId = idArg?.slice("--id=".length);

  const cases = await loadCases(filterId);
  if (cases.length === 0) {
    console.error(filterId ? `no case id=${filterId}` : "no eval cases");
    process.exit(1);
  }

  console.log(`eval cases: ${cases.length} under docs/eval/`);
  for (const c of cases) {
    console.log(
      `  [${c.set}] ${c.id} — ${c.question.slice(0, 40)}${c.question.length > 40 ? "…" : ""}`,
    );
  }

  if (!full) {
    console.log("\nJSON OK. 全文判定は: npx tsx scripts/run-eval.ts --full");
    return;
  }

  // PowerShell Tee-Object は UTF-16 になりがちなので、ランナー側でも UTF-8 ログを残す
  const logPath = path.join(ROOT, "temp", "eval-full-run.txt");
  const logLines: string[] = [];
  const log = (line: string) => {
    console.log(line);
    logLines.push(line);
  };

  log("\n--full: runJudge …");
  const scores: AutoScore[] = [];
  for (const c of cases) {
    process.stdout.write(`→ ${c.id} … `);
    try {
      const result = await runJudge({ question: c.question });
      const score = scoreAnswer(c, result);
      scores.push(score);
      const status = score.ok ? "PASS" : `FAIL (${score.failures.join("; ")})`;
      console.log(status);
      logLines.push(`→ ${c.id} … ${status}`);
      if (score.conclusionPreview) {
        const line = `   結論: ${score.conclusionPreview}`;
        console.log(line);
        logLines.push(line);
      }
      if (score.llm) {
        const line = `   モデル: ${score.llm}`;
        console.log(line);
        logLines.push(line);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      scores.push({
        id: c.id,
        ok: false,
        kind: "error",
        failures: [message.slice(0, 200)],
      });
      console.log(`ERROR ${message.slice(0, 120)}`);
      logLines.push(`→ ${c.id} … ERROR ${message.slice(0, 120)}`);
    }
  }

  const passed = scores.filter((s) => s.ok).length;
  log(`\n自動採点: ${passed}/${scores.length} PASS`);
  log("※ 最終判定は人手。自動は出典・禁止句などの機械チェックのみ。");
  await writeFile(logPath, logLines.join("\n") + "\n", "utf8");
  console.log(`log: ${logPath}`);
  if (passed < scores.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
