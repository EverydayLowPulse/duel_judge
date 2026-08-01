import type { ValidatorInput, ValidatorResult } from "./types";

/**
 * 「破壊される時、かわりにマナへ」が侵略／入れ替えを失敗させるかという誤解を潰す。
 * 破壊置換は入れ替え阻害ではない。侵略は重ね置きであり入れ替えではない。
 */
export function shouldRunDestroyManaNotSwapBlocker(input: {
  question: string;
  facts: ValidatorInput["facts"];
}): boolean {
  const q = normalize(input.question);
  const asksFailure =
    q.includes(normalize("失敗")) ||
    q.includes(normalize("できない")) ||
    q.includes(normalize("阻害"));
  const asksSwapOrInvasion =
    q.includes(normalize("入れ替え")) ||
    q.includes(normalize("革命チェンジ")) ||
    q.includes(normalize("侵略"));
  const mentionsDestroyMana =
    (q.includes(normalize("破壊")) &&
      q.includes(normalize("かわり")) &&
      (q.includes(normalize("マナ")) || q.includes(normalize("置く")))) ||
    (input.facts.leaveReplacement ?? []).some(
      (h) =>
        !h.blocksSwap &&
        /破壊/.test(h.evidence) &&
        /かわりに/.test(h.evidence),
    );
  if (!asksFailure || !asksSwapOrInvasion || !mentionsDestroyMana) {
    return false;
  }
  // 本物の入れ替え阻害があるならそちらを優先（この短絡はしない）
  if ((input.facts.leaveReplacement ?? []).some((h) => h.blocksSwap)) {
    return false;
  }
  return true;
}

export function validateDestroyManaNotSwapBlocker(
  input: ValidatorInput,
): ValidatorResult {
  if (!shouldRunDestroyManaNotSwapBlocker(input)) {
    return {
      validatorId: "destroy_mana_not_swap_blocker",
      verdict: "unknown",
      reason: "破壊→マナ置換と侵略／入れ替え失敗の問いではなかった。",
      usedFacts: [],
      missingFacts: [],
      requiredRuleRefs: [],
      constraintsForAnswer: [],
    };
  }

  return {
    validatorId: "destroy_mana_not_swap_blocker",
    verdict: "allowed",
    reason:
      "破壊される時にかわりにマナゾーンへ置く置換は、入れ替え（手札に戻す移動）を阻害しない。侵略は重ね置きであり入れ替えではないため、この効果だけでは侵略も失敗しない。",
    usedFacts: ["leaveReplacement"],
    missingFacts: [],
    requiredRuleRefs: [],
    constraintsForAnswer: [
      "[破壊置換] 破壊→マナは入れ替え阻害ではない。",
      "[禁止推論] 破壊時かわりにマナへ置くから侵略や入れ替えが失敗する、と考える。",
      "[禁止推論] 侵略＝入れ替え、と混同する。",
    ],
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}
