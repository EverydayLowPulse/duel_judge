/**
 * 回帰: ジャストダイバー等の「進化で効果が残るか」で
 * 総合ルール 801.2 が根拠に入り、推論が Q&A言い換えだけで終わらないこと。
 */
import { enrichPrincipleEvidence } from "../src/lib/answer/enrichPrincipleEvidence";
import type { AnswerPayload, EvidenceChunk } from "../src/lib/answer/types";
import { classifyIssues } from "../src/lib/judge/issues/classifyIssues";
import { runJudge } from "../src/lib/judge/runJudge";
import { RULE_PDF_URL } from "../src/lib/rules/constants";
import { lookupRuleChunksByRefs } from "../src/lib/rules/lookupByRefs";
import type { RuleSearchHit } from "../src/lib/rules/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const issues = classifyIssues({
    question: "ジャストダイバーは進化先に引き継がれるか",
    facts: {
      question: "ジャストダイバーは進化先に引き継がれるか",
      entities: [],
      actions: [],
      manaZone: [],
      timelineNotes: [],
    },
  });
  assert(
    issues.matches.some((m) => m.kind === "evolution_effect_carry"),
    "issue evolution_effect_carry should match",
  );
  assert(issues.ruleRefs.includes("801.2"), "801.2 should be seeded");
  console.log("OK classifyIssues", issues.ruleRefs);

  // 侵略＋2度目攻撃でも同一クリーチャー論点が立つ（レッドゾーンF型）
  const invasionQ =
    "ダーバンデ攻撃時にカリスマゾーンに侵略しつつアンタップ、そのうえで2度目の攻撃でレッドゾーンFに侵略したとして、攻撃の終わりにFの効果でアンタップは可能か";
  const invasionIssues = classifyIssues({
    question: invasionQ,
    facts: {
      question: invasionQ,
      entities: [],
      actions: [{ kind: "attack", source: "user" }],
      manaZone: [],
      timelineNotes: [],
    },
  });
  assert(
    invasionIssues.matches.some((m) => m.kind === "evolution_effect_carry"),
    "invasion + second attack should open evolution_effect_carry",
  );
  assert(
    invasionIssues.seedQaIds.includes("42363"),
    "qa/42363 should be seeded for first-attack identity",
  );
  console.log("OK invasion identity", invasionIssues.seedQaIds);

  // 侵略で出す／マナ枚数メタは「効果引き継ぎ」ではない（801.2 を載せない）
  const metaQ =
    "5マナしかない状態でレッドマッドをマナから侵略で出した際、クイかぼのメタに引っかかってマナ送りになるか";
  const metaIssues = classifyIssues({
    question: metaQ,
    facts: {
      question: metaQ,
      entities: [],
      actions: [],
      manaZone: [],
      timelineNotes: [],
    },
  });
  assert(
    !metaIssues.matches.some((m) => m.kind === "evolution_effect_carry"),
    "mana meta + invasion should NOT open evolution_effect_carry",
  );
  assert(
    !metaIssues.ruleRefs.includes("801.2") &&
      !metaIssues.ruleRefs.includes("801.4c"),
    "801.2/801.4c must not be seeded for mana meta question",
  );
  console.log("OK no evo-carry on mana meta");

  const ruleChunks: RuleSearchHit[] = await lookupRuleChunksByRefs(["801.2"]);
  assert(ruleChunks.length > 0, "rule chunk 801.2 missing from index");

  const fakeAnswer: AnswerPayload = {
    kind: "answer",
    resolved_cards: [],
    evidence: [
      {
        type: "qa",
        label: "公式Q&A",
        url: "https://dm.takaratomy.co.jp/rule/qa/46492/",
        quote: "進化元のクリーチャーが受けていた効果は、進化クリーチャーにも引き継がれます。",
      },
    ],
    reasoning:
      "公式Q&Aに基づき、進化元のクリーチャーが受けていた効果は進化後にも引き継がれます。",
    conclusion: "はい、引き継がれます。",
    confidence: "high",
    confidence_note: "直接Q&Aあり",
  };

  const chunks: EvidenceChunk[] = [
    {
      id: "qa:46492",
      type: "qa",
      label: "公式Q&A",
      url: "https://dm.takaratomy.co.jp/rule/qa/46492/",
      text: fakeAnswer.evidence[0]!.quote,
    },
    ...ruleChunks.map((r) => ({
      id: `rule:${r.ruleRef}`,
      type: "rule" as const,
      label: `総合ルール ${r.ruleRef}`,
      url: RULE_PDF_URL,
      text: r.text,
    })),
  ];

  const enriched = enrichPrincipleEvidence({
    answer: fakeAnswer,
    chunks,
    requiredRuleRefs: ["801.2"],
    principleHints: [
      "総合ルール 801.2 により、進化後も同一クリーチャーとして扱われ、適用されていた効果は継続する（能力テキストの転写ではない）。",
    ],
  });
  assert(
    enriched.answer.evidence.some((e) => e.rule_ref === "801.2"),
    "801.2 should be injected into evidence",
  );
  assert(
    /801\.2/.test(enriched.answer.reasoning ?? ""),
    `reasoning should mention 801.2, got: ${enriched.answer.reasoning}`,
  );
  console.log("OK enrich", enriched.adjustments);

  const result = await runJudge({
    question: "ジャストダイバーは進化先に引き継がれるか",
  });
  console.log("kind", result.kind);
  assert(result.kind === "answer", `expected answer, got ${result.kind}`);
  const hasRule801 = result.answer.evidence.some(
    (e) => e.type === "rule" && (e.rule_ref === "801.2" || /801\.2/.test(e.quote)),
  );
  assert(hasRule801, `expected rule 801.2 in evidence: ${JSON.stringify(result.answer.evidence)}`);
  assert(
    /801\.2|同一|継続|転写/.test(result.answer.reasoning ?? ""),
    `reasoning should bridge principle: ${result.answer.reasoning}`,
  );
  console.log("conclusion", result.answer.conclusion);
  console.log("reasoning", result.answer.reasoning);
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
