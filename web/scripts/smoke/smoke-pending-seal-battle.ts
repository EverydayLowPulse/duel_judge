/**
 * 回帰: 封印後のメタは「誘発しない」ではない。
 * - 出た時点で誘発し待機する（110.5a）
 * - 発生源にバトルさせる効果は、封印で無視されるとバトル不能で不発
 * - 手札に戻す等は発生源が封印されても残る
 * - LLM を介さず決定的 validator が結論を組み立てる
 * 具体カード名は smoke のみ（検出・結論分岐には載せない）。
 */
import type { EvidenceChunk } from "../../src/lib/answer/types";
import { classifyIssues } from "../../src/lib/judge/issues/classifyIssues";
import { matchPendingAbilityHints } from "../../src/lib/judge/pendingAbilities";
import { buildDeterministicAnswer } from "../../src/lib/judge/validators/buildDeterministicAnswer";
import {
  detectSealPendingEffectKind,
  shouldRunSealPendingResolve,
  validateSealPendingResolve,
} from "../../src/lib/judge/validators/sealPendingResolve";
import { RULE_PDF_URL } from "../../src/lib/rules/constants";
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
  assert(
    issues.matches.some((m) => m.validatorId === "seal_pending_resolve"),
    "seal_pending_resolve validatorId should be attached",
  );
  assert(issues.ruleRefs.includes("110.5a"), "110.5a should be seeded");
  assert(issues.ruleRefs.includes("116.2a"), "116.2a should be seeded");
  console.log("OK classifyIssues", issues.ruleRefs);

  assert(
    detectSealPendingEffectKind([battleText]) === "source_battle",
    "battle meta text should be source_battle",
  );
  assert(
    shouldRunSealPendingResolve({ question: battleMetaQ, issues }),
    "seal_pending_resolve should run",
  );

  const battleVerdict = validateSealPendingResolve({
    question: battleMetaQ,
    facts: emptyFacts(battleMetaQ),
    issues,
    cardAbilityTexts: [battleText],
  });
  assert(
    battleVerdict.verdict === "allowed",
    `expected allowed, got ${battleVerdict.verdict}`,
  );
  assert(
    battleVerdict.craftedConclusion,
    "craftedConclusion required (LLM bypass)",
  );
  assert(
    /誘発はする/.test(battleVerdict.craftedConclusion!),
    `conclusion must affirm trigger: ${battleVerdict.craftedConclusion}`,
  );
  assert(
    /不発|バトルできず/.test(battleVerdict.craftedConclusion!),
    `conclusion must mention battle fizzle: ${battleVerdict.craftedConclusion}`,
  );
  assert(
    !/誘発しない/.test(battleVerdict.craftedConclusion!),
    "must not say 誘発しない",
  );
  console.log("OK validator battle", battleVerdict.craftedConclusion);

  const ruleChunks: EvidenceChunk[] = [
    {
      id: "rule:110.5a",
      type: "rule",
      label: "総合ルール 110.5a",
      url: RULE_PDF_URL,
      text: "110.5a いったん誘発したら、効果はその発生源とは独立して待機状態の効果となります。その後、その効果の発生源となる能力を持つカードが別のゾーンに移動しても、効果がなくなることはありません。",
    },
    {
      id: "rule:116.2a",
      type: "rule",
      label: "総合ルール 116.2a",
      url: RULE_PDF_URL,
      text: "116.2a 無視されたクリーチャーはバトルゾーンにないものとして扱います。それは攻撃やブロックができず、いかなる能力も発揮することはなく、選ばれることもなく、タップもアンタップもしません。",
    },
    {
      id: "rule:116.2",
      type: "rule",
      label: "総合ルール 116.2",
      url: RULE_PDF_URL,
      text: "116.2. 封印の付いたクリーチャーは無視されます。",
    },
  ];

  const crafted = buildDeterministicAnswer({
    question: battleMetaQ,
    cards: [],
    chunks: ruleChunks,
    aggregate: {
      results: [battleVerdict],
      hardVerdict: "allowed",
      constraintsForAnswer: battleVerdict.constraintsForAnswer,
      requiredRuleRefs: battleVerdict.requiredRuleRefs,
      missingFacts: [],
    },
  });
  assert(crafted, "deterministic crafted answer required");
  assert(
    /誘発はする/.test(crafted!.conclusion) &&
      !/誘発しない/.test(crafted!.conclusion),
    `bad crafted conclusion: ${crafted!.conclusion}`,
  );
  assert(
    crafted!.evidence.some((e) => e.type === "rule" && e.rule_ref === "110.5a"),
    "110.5a must be in evidence",
  );
  console.log("OK crafted answer", crafted!.conclusion);

  // 手札戻し系
  const bounceQ =
    "相手のオニカマスを踏み倒しで出た時に封印した場合、オニカマスの手札に戻すメタは解決できますか";
  const bounceText =
    "相手のターン中、相手が召喚以外の方法でクリーチャーをバトルゾーンに出した時、そのクリーチャーを持ち主の手札に戻してもよい。";
  const bounceIssues = classifyIssues({
    question: bounceQ,
    facts: emptyFacts(bounceQ),
    cardTexts: [bounceText],
  });
  const bounceVerdict = validateSealPendingResolve({
    question: bounceQ,
    facts: emptyFacts(bounceQ),
    issues: bounceIssues,
    cardAbilityTexts: [bounceText],
  });
  assert(
    detectSealPendingEffectKind([bounceText]) === "independent",
    "bounce should be independent",
  );
  assert(
    /誘発し/.test(bounceVerdict.craftedConclusion ?? "") &&
      /解決はできる|残る/.test(bounceVerdict.craftedConclusion ?? ""),
    `bounce conclusion: ${bounceVerdict.craftedConclusion}`,
  );
  console.log("OK bounce", bounceVerdict.craftedConclusion);

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
