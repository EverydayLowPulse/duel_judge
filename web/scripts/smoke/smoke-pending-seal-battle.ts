/**
 * 回帰: 封印×メタの質問で、待機の論点と原則（110.5a / 116.2a）が検索に入ること。
 * 結論（誘発はする／バトルは不発、など）の判断は LLM に任せる。
 * 具体カード名は smoke のみ（検出・結論分岐には載せない）。
 */
import { classifyIssues } from "../../src/lib/judge/issues/classifyIssues";
import { matchPendingAbilityHints } from "../../src/lib/judge/pendingAbilities";
import { matchKeywordRules } from "../../src/lib/rules/keywordDictionary";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function emptyFacts(question: string) {
  return {
    question,
    entities: [] as string[],
    actions: [] as [],
    manaZone: [] as [],
    timelineNotes: [] as string[],
  };
}

function main() {
  const battleMetaQ =
    "相手の場にデスマッチ・ビートルがあり、3マナしかない状態でブラックゾーンをS級侵略で出してデスマッチを封印した場合、デスマッチのメタ効果は発動しますか？";
  const battleText =
    "相手のターン中、相手のクリーチャーがコストを支払わずに出た時、このクリーチャーとそのクリーチャーをバトルさせてもよい。";

  const hints = matchPendingAbilityHints({
    question: battleMetaQ,
    cardTexts: [battleText],
  });
  assert(hints, "seal + meta should match pending hints");
  console.log("OK matchPendingAbilityHints (battle meta)");

  const issues = classifyIssues({
    question: battleMetaQ,
    facts: emptyFacts(battleMetaQ),
    cardTexts: [battleText],
  });
  assert(
    issues.matches.some((m) => m.kind === "pending_abilities"),
    "pending_abilities issue should open",
  );
  assert(issues.ruleRefs.includes("110.5a"), "110.5a should be seeded");
  assert(issues.ruleRefs.includes("116.2a"), "116.2a should be seeded");
  console.log("OK classifyIssues", issues.ruleRefs);

  // 偽陽性: マナ枚数メタ
  const manaMetaQ =
    "5マナしかない状態でレッドマッドをマナから侵略で出した際、クイかぼのメタに引っかかってマナ送りになるか";
  assert(
    !matchPendingAbilityHints({ question: manaMetaQ }),
    "mana-count meta must not open pending hints",
  );
  console.log("OK no false positive on mana meta");

  const kw = matchKeywordRules([battleMetaQ]);
  assert(
    kw.ruleRefs.includes("116.2") && kw.ruleRefs.includes("110.5a"),
    "封印 keyword should inject 116.2 and 110.5a",
  );
  console.log("OK keyword 封印");

  const revQ =
    "ペトローバからドランゴルゲルスに革命チェンジする際、ドランの出たとき効果を使ってから、ペトローバの攻撃時効果を使うことは可能か";
  assert(
    matchPendingAbilityHints({ question: revQ }),
    "revolution pending order should still match",
  );
  console.log("OK revolution regression");

  console.log("OK");
}

main();
