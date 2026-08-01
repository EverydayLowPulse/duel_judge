/**
 * 回帰: 注釈文のみのクリーチャーは「能力が書かれていない」扱い。
 * カード固有の if ではなく、注釈除去＋監視能力検出の原則を確認する。
 */
import {
  hasWrittenAbilities,
  stripReminderText,
  watchesNoWrittenAbilities,
} from "../src/lib/judge/facts/writtenAbilities";
import { runJudge } from "../src/lib/judge/runJudge";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const reminderOnly = "（パワー0以下のクリーチャーは破壊される）";
  assert(
    stripReminderText(reminderOnly) === "",
    "reminder-only should strip to empty",
  );
  assert(!hasWrittenAbilities(reminderOnly), "reminder-only is not written ability");

  const blocker =
    "ブロッカー（このクリーチャーをタップして、相手クリーチャーの攻撃先をこのクリーチャーに変更してもよい）";
  assert(
    hasWrittenAbilities(blocker),
    "keyword outside paren still counts as written ability",
  );

  assert(
    watchesNoWrittenAbilities(
      "カードに能力が書かれていないクリーチャーを召喚した時、カードを1枚引いてもよい。",
    ),
    "watcher ability should be detected",
  );

  const result = await runJudge({
    question:
      "ゾンビポンの助を出すことでアクアティーチャーの能力を誘発することは可能か",
    cardQuery: "アクア・ティーチャー",
  });

  console.log("kind", result.kind);
  if (result.kind === "answer") {
    console.log("conclusion", result.answer.conclusion);
    assert(
      /可能/.test(result.answer.conclusion) &&
        !/不可能/.test(result.answer.conclusion),
      `expected allowed, got: ${result.answer.conclusion}`,
    );
  } else {
    console.log(JSON.stringify(result, null, 2));
    throw new Error(`expected answer, got ${result.kind}`);
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
