/**
 * 回帰: 封印後のメタは「誘発しない」ではない。
 * - 出た時点で誘発し待機する（110.5a）
 * - 発生源にバトルさせる効果は、封印で無視されるとバトル不能で不発
 * - 手札に戻す等は発生源が封印されても残る
 * 具体カード名は smoke のみ（検出・結論分岐には載せない）。
 */
import { classifyIssues } from "../src/lib/judge/issues/classifyIssues";
import { matchPendingAbilityHints } from "../src/lib/judge/pendingAbilities";
import { matchKeywordRules } from "../src/lib/rules/keywordDictionary";

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
  assert(
    hints.constraints.some((c) => c.includes("バトル")),
    "constraints should mention battle fizzle",
  );
  assert(
    hints.constraints.some((c) => c.includes("誘発")),
    "constraints should keep trigger/independent wording",
  );
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
  assert(
    issues.seedQaIds.includes("44824"),
    "qa/44824 (enter triggers pending battle meta) should be seeded",
  );
  assert(
    issues.constraints.some((c) => /誘発しない/.test(c)),
    "fallacy about no-trigger-on-seal should be constrained",
  );
  assert(
    issues.constraints.some((c) => /バトル不能|不発/.test(c)),
    "battle-unable fizzle should be constrained",
  );
  console.log("OK classifyIssues", issues.ruleRefs);

  // 手札戻し系: 発生源の行動を要しない → 残る、という制約も同じ論点に載る
  const bounceQ =
    "相手のオニカマスを踏み倒しで出た時に封印した場合、オニカマスの手札に戻すメタは解決できますか";
  const bounceIssues = classifyIssues({
    question: bounceQ,
    facts: emptyFacts(bounceQ),
    cardTexts: [
      "相手のターン中、相手が召喚以外の方法でクリーチャーをバトルゾーンに出した時、そのクリーチャーを持ち主の手札に戻してもよい。",
    ],
  });
  assert(
    bounceIssues.matches.some((m) => m.kind === "pending_abilities"),
    "bounce meta + seal should open pending_abilities",
  );
  assert(
    bounceIssues.constraints.some((c) => /手札に戻す/.test(c)),
    "non-battle pending resolve constraint required",
  );
  console.log("OK bounce-vs-battle distinction in constraints");

  // 偽陽性: マナ枚数メタ＋侵略だけなら待機論点を立てない
  const manaMetaQ =
    "5マナしかない状態でレッドマッドをマナから侵略で出した際、クイかぼのメタに引っかかってマナ送りになるか";
  const manaHints = matchPendingAbilityHints({ question: manaMetaQ });
  assert(!manaHints, "mana-count meta must not open pending hints");
  console.log("OK no false positive on mana meta");

  // キーワード辞書: 封印 → 116.2 / 110.5a
  const kw = matchKeywordRules([battleMetaQ]);
  assert(
    kw.ruleRefs.includes("116.2") && kw.ruleRefs.includes("110.5a"),
    "封印 keyword should inject 116.2 and 110.5a",
  );
  console.log("OK keyword 封印", kw.ruleRefs);

  // 既存: 革命チェンジ後の解決順は引き続きマッチ
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
