import type { ValidatorInput, ValidatorResult } from "./types";

/**
 * 「カードに能力が書かれていないクリーチャーを召喚した時」系。
 * 注釈文のみのカードは能力なし（205.2a）。
 */
export function shouldRunNoWrittenAbilitySummon(input: {
  question: string;
  facts: ValidatorInput["facts"];
}): boolean {
  return (input.facts.writtenAbilities?.length ?? 0) > 0;
}

export function validateNoWrittenAbilitySummon(
  input: ValidatorInput,
): ValidatorResult {
  const hints = input.facts.writtenAbilities ?? [];
  if (hints.length === 0) {
    return {
      validatorId: "no_written_ability_summon",
      verdict: "unknown",
      reason: "印刷能力の有無を判定できる対象がなかった。",
      usedFacts: [],
      missingFacts: ["writtenAbilities"],
      requiredRuleRefs: ["205.2a"],
      constraintsForAnswer: [],
    };
  }

  const pair = pickPrimaryHint(hints, input.question);
  if (pair.countsAsNoWrittenAbilities) {
    return {
      validatorId: "no_written_ability_summon",
      verdict: "allowed",
      reason:
        `${pair.targetOfficialName} のテキストは注釈文のみで、カードに能力は書かれていない（総合ルール 205.2a）。` +
        `${pair.watcherOfficialName} の「能力が書かれていないクリーチャーを召喚した時」の条件を満たす。`,
      usedFacts: ["writtenAbilities"],
      missingFacts: [],
      requiredRuleRefs: ["205.2", "205.2a"],
      constraintsForAnswer: [
        `[印刷能力] ${pair.targetOfficialName}: 注釈のみ＝能力なし`,
        "[禁止推論] カッコ書きのルール要約をカード能力とみなす。",
        "[禁止推論] 注釈があるだけでバニラではない、とみなす。",
      ],
    };
  }

  return {
    validatorId: "no_written_ability_summon",
    verdict: "not_allowed",
    reason:
      `${pair.targetOfficialName} には注釈以外の能力が書かれているため、` +
      `${pair.watcherOfficialName} の「能力が書かれていない」条件を満たさない。`,
    usedFacts: ["writtenAbilities"],
    missingFacts: [],
    requiredRuleRefs: ["205.2a"],
    constraintsForAnswer: [
      `[印刷能力] ${pair.targetOfficialName}: 能力あり — ${pair.evidence}`,
      "[禁止推論] 注釈を除けば能力なし、と誤って判定する。",
    ],
  };
}

function pickPrimaryHint(
  hints: NonNullable<ValidatorInput["facts"]["writtenAbilities"]>,
  question: string,
) {
  const q = normalize(question);
  const mentioned = hints.find(
    (h) =>
      q.includes(normalize(h.targetMention)) ||
      q.includes(normalize(h.targetOfficialName)),
  );
  return mentioned ?? hints[0]!;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}
