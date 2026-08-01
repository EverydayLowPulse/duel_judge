import { shouldRunManaPayment, validateManaPayment } from "./manaPayment";
import {
  shouldRunDestroyManaNotSwapBlocker,
  validateDestroyManaNotSwapBlocker,
} from "./destroyManaNotSwapBlocker";
import {
  shouldRunNoWrittenAbilitySummon,
  validateNoWrittenAbilitySummon,
} from "./noWrittenAbilitySummon";
import {
  shouldRunReplacementBreakHand,
  validateReplacementBreakHand,
} from "./replacementBreakHand";
import {
  shouldRunSwapLeaveReplacement,
  validateSwapLeaveReplacement,
} from "./swapLeaveReplacement";
import type {
  AggregateValidatorResult,
  ValidatorInput,
  ValidatorResult,
} from "./types";

/**
 * 登録済みの決定的 validator を実行し、結果を統合する。
 * not_allowed が1件でもあれば hardVerdict にする。
 */
export function runValidators(input: ValidatorInput): AggregateValidatorResult {
  const results: ValidatorResult[] = [];

  if (
    input.issues.matches.some((m) => m.validatorId === "mana_payment") ||
    shouldRunManaPayment(input.facts)
  ) {
    results.push(validateManaPayment(input));
  }

  if (
    input.issues.matches.some(
      (m) => m.validatorId === "swap_leave_replacement",
    ) ||
    shouldRunSwapLeaveReplacement(input)
  ) {
    results.push(validateSwapLeaveReplacement(input));
  }

  if (
    input.issues.matches.some(
      (m) => m.validatorId === "no_written_ability_summon",
    ) ||
    shouldRunNoWrittenAbilitySummon(input)
  ) {
    results.push(validateNoWrittenAbilitySummon(input));
  }

  if (shouldRunReplacementBreakHand(input)) {
    results.push(validateReplacementBreakHand(input));
  }

  if (shouldRunDestroyManaNotSwapBlocker(input)) {
    results.push(validateDestroyManaNotSwapBlocker(input));
  }

  const constraintsForAnswer = results.flatMap((r) => r.constraintsForAnswer);
  const requiredRuleRefs = unique(
    results.flatMap((r) => r.requiredRuleRefs),
  );
  const missingFacts = unique(results.flatMap((r) => r.missingFacts));

  const hardNotAllowed = results.find((r) => r.verdict === "not_allowed");
  const hardAllowed =
    results.length > 0 && results.every((r) => r.verdict === "allowed")
      ? "allowed"
      : undefined;

  return {
    results,
    hardVerdict: hardNotAllowed
      ? "not_allowed"
      : hardAllowed
        ? "allowed"
        : results.some((r) => r.verdict === "unknown")
          ? "unknown"
          : undefined,
    constraintsForAnswer,
    requiredRuleRefs,
    missingFacts,
  };
}

export function formatValidatorConstraints(
  aggregate: AggregateValidatorResult | null | undefined,
): string | undefined {
  if (!aggregate?.results.length) return undefined;
  const lines = [
    "【決定的validator結果（内部制約。evidenceには引用しない）】",
    ...aggregate.results.map(
      (r) =>
        `- [${r.validatorId}] verdict=${r.verdict}: ${r.reason}`,
    ),
    ...aggregate.constraintsForAnswer.map((c) => `- ${c}`),
  ];
  return lines.join("\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
