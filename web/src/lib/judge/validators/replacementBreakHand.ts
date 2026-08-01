import type { ValidatorInput, ValidatorResult } from "./types";

/**
 * 置換ブレイクでシールドが離れるとき、通常ブレイク向けの墓地置換は連鎖しない → 手札。
 * （RuleConcept replacement_effect / qa/48504 の決定的短絡）
 */
export function shouldRunReplacementBreakHand(input: {
  question: string;
  issues: ValidatorInput["issues"];
}): boolean {
  if (!input.issues.matches.some((m) => m.kind === "replacement_effect")) {
    return false;
  }
  const q = normalize(input.question);
  const asksDest =
    q.includes(normalize("手札")) ||
    q.includes(normalize("墓地")) ||
    q.includes(normalize("戻る")) ||
    q.includes(normalize("置か"));
  if (!asksDest) return false;

  return (
    q.includes(normalize("置換ブレイク")) ||
    (q.includes(normalize("置換")) && q.includes(normalize("ブレイク"))) ||
    (q.includes(normalize("かわりに")) &&
      q.includes(normalize("このシールド")) &&
      q.includes(normalize("ブレイク")))
  );
}

export function validateReplacementBreakHand(
  input: ValidatorInput,
): ValidatorResult {
  if (!shouldRunReplacementBreakHand(input)) {
    return {
      validatorId: "replacement_break_hand",
      verdict: "unknown",
      reason: "置換ブレイクの行き先を問う形ではなかった。",
      usedFacts: [],
      missingFacts: [],
      requiredRuleRefs: [],
      constraintsForAnswer: [],
    };
  }

  return {
    validatorId: "replacement_break_hand",
    verdict: "allowed",
    reason:
      "置換ブレイクでシールドが離れる場合、通常ブレイク向けの『シールドゾーンを離れる時、かわりに墓地へ』は置換の連鎖として適用されず、手札に加わる（qa/48504）。",
    usedFacts: ["actions"],
    missingFacts: [],
    requiredRuleRefs: ["101.5", "101.5a"],
    constraintsForAnswer: [
      "[置換ブレイク] 離れたカードは手札に加わる。墓地置換は連鎖しない。",
      "[禁止推論] カードに『離れる時かわりに墓地』とあるから置換ブレイクでも墓地へ行く、と考える。",
      "[禁止推論] 通常ブレイクの行き先だけで置換ブレイクを答える。",
    ],
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}
