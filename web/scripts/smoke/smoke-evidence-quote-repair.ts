/**
 * 回帰: 言い換えた quote をチャンク原文へ寄せて Evidence Gate を通す。
 */
import { runEvidenceGate } from "../../src/lib/answer/evidenceGate";
import { repairEvidenceQuotes } from "../../src/lib/answer/repairEvidenceQuotes";
import type { AnswerPayload, EvidenceChunk } from "../../src/lib/answer/types";
import { classifyIssues } from "../../src/lib/judge/issues/classifyIssues";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const chunks: EvidenceChunk[] = [
  {
    id: "qa:46492",
    type: "qa",
    label: "公式Q&A",
    url: "https://dm.takaratomy.co.jp/rule/qa/46492/",
    text: `Q: ジャストダイバーは進化先に引き継がれますか？
A: はい、進化元のクリーチャーが受けていた効果は、進化クリーチャーにも引き継がれます。`,
  },
  {
    id: "qa:46491",
    type: "qa",
    label: "公式Q&A",
    url: "https://dm.takaratomy.co.jp/rule/qa/46491/",
    text: `Q: マッハファイターは進化先に引き継がれますか？
A: いいえ、引き継いでおらず、クリーチャーを攻撃できません。「マッハファイター」は常在型能力です。常在型能力は、進化元になるなどしてそのクリーチャーの能力が無視されたり、そのクリーチャーが離れた場合、効果を失います。`,
  },
];

const paraphrased: AnswerPayload = {
  kind: "answer",
  resolved_cards: [],
  evidence: [
    {
      type: "qa",
      label: "公式Q&A",
      url: "https://dm.takaratomy.co.jp/rule/qa/46492/",
      // 言い換え（「はい、」欠落・語順変更気味）
      quote: "進化元が受けていた効果は進化クリーチャーにも引き継がれます",
    },
    {
      type: "qa",
      label: "公式Q&A",
      url: "https://dm.takaratomy.co.jp/rule/qa/46491/",
      quote: "マッハファイターは常在型なので進化では引き継がれません",
    },
  ],
  conclusion: "継続的効果は残り、常在型は残らない",
  confidence: "high",
  confidence_note: "対応Q&Aあり",
};

const before = runEvidenceGate(paraphrased, chunks);
assert(!before.ok, "paraphrased quotes should fail gate");

const repaired = repairEvidenceQuotes({ answer: paraphrased, chunks });
assert(repaired.adjustments.length >= 1, "should snap at least one quote");
const after = runEvidenceGate(repaired.answer, chunks);
assert(after.ok, `repaired should pass gate: ${!after.ok ? after.failures.join("; ") : ""}`);

const q =
  "ジャストダイバーが進化先に引き継がれ、マッハファイターが引き継がれない理由は";
const issues = classifyIssues({
  question: q,
  facts: {
    question: q,
    entities: [],
    actions: [],
    manaZone: [],
    timelineNotes: [],
  },
});
assert(
  issues.matches.some((m) => m.kind === "evolution_effect_carry"),
  "should open evolution_effect_carry",
);
assert(issues.seedQaIds.includes("46491"), "46491 should be seeded");
assert(issues.seedQaIds.includes("46492"), "46492 should be seeded");

console.log("OK repair + seeds", repaired.adjustments);
