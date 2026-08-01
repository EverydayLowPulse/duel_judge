import type { LeaveReplacementHint } from "../facts/types";
import type { ValidatorInput, ValidatorResult } from "./types";

/**
 * 革命チェンジの入れ替え失敗（701.26b）。
 * 進化専用ではなく、移動が正常にできないすべてのケースを対象にする。
 */
export function shouldRunSwapLeaveReplacement(input: {
  question?: string;
  facts: ValidatorInput["facts"];
}): boolean {
  const q = normalize(input.question ?? input.facts.question ?? "");
  if (!q) return false;
  const hasSwap =
    q.includes(normalize("革命チェンジ")) || q.includes(normalize("入れ替え"));
  if (!hasSwap) return false;
  return (input.facts.leaveReplacement ?? []).some((h) => h.blocksSwap);
}

export function validateSwapLeaveReplacement(
  input: ValidatorInput,
): ValidatorResult {
  const blockers = (input.facts.leaveReplacement ?? []).filter(
    (h) => h.blocksSwap,
  );
  if (blockers.length === 0) {
    return {
      validatorId: "swap_leave_replacement",
      verdict: "unknown",
      reason: "入れ替えを阻害する置換・移動不能は検出されなかった。",
      usedFacts: [],
      missingFacts: [],
      requiredRuleRefs: [],
      constraintsForAnswer: [],
    };
  }

  const names = blockers
    .map((h) => h.targetOfficialName ?? h.targetMention)
    .join("、");
  const ruleRefs = unique(blockers.flatMap(ruleRefsFor));
  const why = blockers.map((h) => explainBlocker(h)).join(" / ");

  return {
    validatorId: "swap_leave_replacement",
    verdict: "not_allowed",
    reason:
      `${why} 入れ替えはカード移動が正常にできないと失敗する（総合ルール 701.26b）。対象: ${names}。`,
    usedFacts: ["leaveReplacement", "actions"],
    missingFacts: [],
    requiredRuleRefs: ruleRefs,
    constraintsForAnswer: [
      `[入れ替え阻害] ${names}: ${why}`,
      "[禁止推論] 条件を満たせば入れ替えも成功する、と考える。",
      "[禁止推論] 入れ替え失敗は進化だけの話だ、と考える。",
      "[禁止推論] 使用宣言できた＝入れ替えも成功する、と混同する。",
    ],
  };
}

function explainBlocker(h: LeaveReplacementHint): string {
  switch (h.kind) {
    case "g_neo_evolved":
      return `${h.targetOfficialName ?? h.targetMention} はG-NEO進化中で、離れる時に下のカードだけが離れる`;
    case "star_evolution":
      return `${h.targetOfficialName ?? h.targetMention} はスター進化中で、トップだけが離れる`;
    case "ex_life":
      return `${h.targetOfficialName ?? h.targetMention} はEXライフにより本体がバトルゾーンから離れない`;
    case "g_link":
      return `${h.targetOfficialName ?? h.targetMention} はG・リンク中で構成カードすべてが手札に戻れない`;
    case "cannot_leave":
      return `${h.targetOfficialName ?? h.targetMention} は離れない効果で移動できない`;
    case "external_field":
      return `${h.targetOfficialName ?? h.targetMention} の場効果により移動が正常にできない`;
    default:
      return `${h.targetOfficialName ?? h.targetMention} の離脱置換により移動が正常にできない`;
  }
}

function ruleRefsFor(h: LeaveReplacementHint): string[] {
  switch (h.kind) {
    case "g_neo_evolved":
      return ["701.26b", "803.2", "803.2a"];
    case "star_evolution":
    case "ex_life":
    case "g_link":
    case "cannot_leave":
    case "leave_replace_text":
    case "external_field":
      return ["701.26b", "701.26a"];
    default:
      return ["701.26b"];
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}
