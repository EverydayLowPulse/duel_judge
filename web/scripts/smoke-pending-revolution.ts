/**
 * 回帰: 革命チェンジ後に「出た時→攻撃時」の順で解決できるか。
 * 誤答パターン「場を離れたから攻撃時は使えない」を防ぐ。
 */
import { runJudge } from "../src/lib/judge/runJudge";
import { matchPendingAbilityHints } from "../src/lib/judge/pendingAbilities";

async function main() {
  const question =
    "ペトローバからドランゴルゲルスに革命チェンジする際、ドランの出たとき効果を使ってから、ペトローバの攻撃時効果を使うことは可能か";

  const hints = matchPendingAbilityHints({ question });
  if (!hints) {
    throw new Error("pending ability hints should match this question");
  }
  console.log("hints", hints.seedQaIds);

  const result = await runJudge({
    question,
    cardQuery: "ドラン・ゴル・ゲルス",
  });

  if (result.kind !== "answer") {
    console.log(JSON.stringify(result, null, 2));
    throw new Error(`expected answer, got ${result.kind}`);
  }

  const conclusion = result.answer.conclusion;
  const qaUrls = result.answer.evidence
    .filter((e) => e.type === "qa")
    .map((e) => e.url);
  console.log(
    JSON.stringify(
      {
        conclusion,
        confidence: result.answer.confidence,
        qaUrls,
        chunkIds: result.debug?.chunkIds?.filter((id) => id.startsWith("qa:")),
      },
      null,
      2,
    ),
  );

  const negates =
    /不可能|できない|使えません|使用できない|解決できない/.test(conclusion) &&
    !/可能|できる/.test(conclusion);
  if (negates) {
    throw new Error(`wrong conclusion (negated): ${conclusion}`);
  }
  if (!/可能|できる/.test(conclusion)) {
    throw new Error(`expected affirmative conclusion: ${conclusion}`);
  }

  const seededHit = ["39355", "39067", "44747"].some((id) =>
    qaUrls.some((url) => url.includes(id)),
  );
  if (!seededHit) {
    console.warn(
      "warning: seeded QA not in evidence quotes (may still be in chunks)",
    );
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
