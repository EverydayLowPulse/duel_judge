/**
 * 回帰: 大集合はマナに光/水/自然があれば無色2で召喚可能。
 * （通常の多色支払いだけ見て「不可能」にしない）
 */
import { runJudge } from "../../src/lib/judge/runJudge";

async function main() {
  const question =
    "マナに大集合、5000vt,5000vtの3枚が存在するとき、大集合の召喚は可能か";

  const result = await runJudge({
    question,
    cardQuery: "大集合",
  });

  if (result.kind !== "answer") {
    console.log(JSON.stringify(result, null, 2));
    throw new Error(`expected answer, got ${result.kind}`);
  }

  const conclusion = result.answer.conclusion;
  console.log("conclusion", conclusion);
  console.log(
    "evidence types",
    result.answer.evidence.map((e) => e.type),
  );

  if (!/可能/.test(conclusion) || /不可能/.test(conclusion)) {
    throw new Error(`expected positive conclusion: ${conclusion}`);
  }
  if (!/無色|代替|各文明/.test(conclusion + (result.answer.reasoning ?? ""))) {
    console.warn("warning: expected alternate-cost wording in conclusion/reasoning");
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
