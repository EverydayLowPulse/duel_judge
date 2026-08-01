import type { ScenarioFacts } from "../facts/types";
import {
  manaZoneHasCivilizations,
  parseAlternateColorlessSummon,
} from "./alternateColorlessSummon";
import type { ValidatorInput, ValidatorResult } from "./types";

export type ManaPaymentCheckInput = {
  cost: number;
  requiredCivilizations: string[];
  manaZone: Array<{
    civilizations: string[];
    manaValue: number;
  }>;
};

export type ManaPaymentCheckResult = {
  canPay: boolean;
  missingCivilizations: string[];
  manaShortfall: number;
  reason: string;
};

/**
 * 多色コスト支払いの決定的判定（総合ルール 107.2 / 112.2a）。
 * 各マナカードは持つ文明のうち高々1つだけに割り当てる。
 */
export function checkManaPayment(
  input: ManaPaymentCheckInput,
): ManaPaymentCheckResult {
  const required = uniqueCivs(input.requiredCivilizations);
  const cards = input.manaZone.map((card) => ({
    civilizations: uniqueCivs(card.civilizations),
    manaValue: Math.max(0, card.manaValue || 0),
  }));

  const totalMana = cards.reduce((sum, card) => sum + card.manaValue, 0);
  const manaShortfall = Math.max(0, input.cost - totalMana);

  if (required.length === 0) {
    if (manaShortfall > 0) {
      return {
        canPay: false,
        missingCivilizations: [],
        manaShortfall,
        reason: `マナ合計が不足しています（必要 ${input.cost} / 所持 ${totalMana}）。`,
      };
    }
    return {
      canPay: true,
      missingCivilizations: [],
      manaShortfall: 0,
      reason: "文明指定がなく、マナ数値は足りています。",
    };
  }

  if (cards.length < required.length) {
    return {
      canPay: false,
      missingCivilizations: required,
      manaShortfall,
      reason:
        "必要文明の数よりマナカードが少なく、文明ごとに別カードをタップできません。",
    };
  }

  const assignment = assignCivilizations(required, cards);
  if (!assignment.ok) {
    return {
      canPay: false,
      missingCivilizations: assignment.missing,
      manaShortfall,
      reason:
        "多色カード1枚は支払い時に1文明分にしかならないため、必要な文明を別々のカードで揃えられません（107.2 / 112.2a）。",
    };
  }

  if (manaShortfall > 0) {
    return {
      canPay: false,
      missingCivilizations: [],
      manaShortfall,
      reason: `文明は揃えられますが、マナ合計が不足しています（必要 ${input.cost} / 所持 ${totalMana}）。`,
    };
  }

  return {
    canPay: true,
    missingCivilizations: [],
    manaShortfall: 0,
    reason: "マナ数値と必要文明の両方を満たせます。",
  };
}

export function validateManaPayment(input: ValidatorInput): ValidatorResult {
  const facts = input.facts;
  const missingFacts: string[] = [];
  if (!facts.paymentTarget) missingFacts.push("paymentTarget");
  if (facts.manaZone.length === 0) missingFacts.push("manaZone");

  if (missingFacts.length > 0) {
    return {
      validatorId: "mana_payment",
      verdict: "unknown",
      reason: "マナ支払い判定に必要な事実が不足しています。",
      usedFacts: [],
      missingFacts,
      requiredRuleRefs: ["107.2", "112.2a"],
      constraintsForAnswer: [
        "マナゾーンのカード構成または召喚対象が確定できないため、支払い可否を断定しない。",
      ],
    };
  }

  const target = facts.paymentTarget!;
  const manaZone = facts.manaZone.map((entry) => ({
    civilizations: entry.civilizations,
    manaValue: entry.manaValue,
  }));

  const usedFacts = [
    `paymentTarget=${target.card.officialName}`,
    `cost=${target.cost}`,
    `civs=${target.civilizations.join("/")}`,
    `manaCount=${facts.manaZone.length}`,
    ...facts.manaZone.map(
      (m, i) =>
        `mana[${i}]=${m.card?.officialName ?? m.mention}:${m.civilizations.join("/")}=${m.manaValue}`,
    ),
  ];

  // 1) 印刷コストでの通常支払い
  const normal = checkManaPayment({
    cost: target.cost,
    requiredCivilizations: target.civilizations,
    manaZone,
  });
  if (normal.canPay) {
    return {
      validatorId: "mana_payment",
      verdict: "allowed",
      reason: normal.reason,
      usedFacts,
      missingFacts: [],
      requiredRuleRefs: ["107.2", "112.2a"],
      constraintsForAnswer: [
        `決定的検証: 通常コストでのマナ支払いは可能。${normal.reason}`,
        "支払い時、多色カード1枚は1文明分にしかならない（存在判定と混同しない）。",
      ],
    };
  }

  // 2) 「各文明があれば無色Nで召喚」代替コスト（大集合など）
  const alternate = parseAlternateColorlessSummon(target.card.abilityText);
  if (alternate) {
    usedFacts.push(
      `alternateColorless=${alternate.colorlessCost}`,
      `alternatePresence=${alternate.presenceCivilizations.join("/")}`,
    );
    const presence = manaZoneHasCivilizations(
      manaZone,
      alternate.presenceCivilizations,
    );
    if (presence.ok) {
      const colorless = checkManaPayment({
        cost: alternate.colorlessCost,
        requiredCivilizations: [],
        manaZone,
      });
      if (colorless.canPay) {
        return {
          validatorId: "mana_payment",
          verdict: "allowed",
          reason: `カード能力により、マナゾーンに${alternate.presenceCivilizations.join("・")}があれば無色${alternate.colorlessCost}で召喚できる。本件では文明が揃っており、無色${alternate.colorlessCost}も支払える。`,
          usedFacts,
          missingFacts: [],
          // 能力テキストが主根拠。ルール番号は補助。
          requiredRuleRefs: ["107.2"],
          constraintsForAnswer: [
            "決定的検証: 代替コスト（無色）での召喚が可能。",
            "「各文明があれば」はマナゾーンの存在判定であり、支払い時の1文明割当とは別。多色1枚が複数文明の存在を同時に満たせる。",
            "結論は「可能」側。通常の多色支払い（112.2a）だけ見て不可能としないこと。",
            `能力根拠: ${alternate.abilitySnippet}`,
          ],
        };
      }
      return {
        validatorId: "mana_payment",
        verdict: "not_allowed",
        reason: `代替コストの文明条件は満たすが、無色${alternate.colorlessCost}を支払うマナが足りない（${colorless.reason}）。通常コストでも支払えない。`,
        usedFacts,
        missingFacts: [],
        requiredRuleRefs: ["107.2", "112.2a"],
        constraintsForAnswer: [
          "決定的検証: 代替コストの文明は揃うがマナ数値不足。通常支払いも不可。",
          "結論は「不可能」側。",
        ],
      };
    }

    return {
      validatorId: "mana_payment",
      verdict: "not_allowed",
      reason: `通常の多色支払いでは文明を揃えられず（${normal.reason}）、代替コストもマナゾーンに${presence.missing.join("・")}が無いため使えない。`,
      usedFacts,
      missingFacts: [],
      requiredRuleRefs: ["107.2", "112.2a", "112.2"],
      constraintsForAnswer: [
        "決定的検証: 通常支払い不可、かつ代替コストの文明存在条件も未達。",
        "結論は「不可能」側。",
        `不足文明（存在判定）: ${presence.missing.join("、")}`,
      ],
    };
  }

  return {
    validatorId: "mana_payment",
    verdict: "not_allowed",
    reason: normal.reason,
    usedFacts,
    missingFacts: [],
    requiredRuleRefs: ["107.2", "112.2a", "112.2"],
    constraintsForAnswer: [
      `決定的検証: マナ支払いは不可能。${normal.reason}`,
      "結論は「不可能／できない」側へ倒すこと。",
      "「マナゾーンに多色カードがあるので必要文明がそろっている」という支払い時の短絡は禁止（存在判定ではない）。",
      "根拠には総合ルール 112.2a（または 107.2）を引用すること。",
      normal.missingCivilizations.length > 0
        ? `不足しうる文明: ${normal.missingCivilizations.join("、")}`
        : "",
      normal.manaShortfall > 0
        ? `マナ不足: ${normal.manaShortfall}`
        : "",
    ].filter(Boolean),
  };
}

/** facts からマナ支払い論点が必要か（構造トリガー） */
export function shouldRunManaPayment(facts: ScenarioFacts): boolean {
  const q = normalize(facts.question);
  const asksSummon =
    q.includes(normalize("召喚")) ||
    q.includes(normalize("唱える")) ||
    facts.actions.some((a) => a.kind === "summon" || a.kind === "cast");
  const mentionsMana =
    q.includes(normalize("マナ")) ||
    q.includes(normalize("マナゾーン")) ||
    facts.manaZone.length > 0;
  const multiColorTarget =
    (facts.paymentTarget?.civilizations.length ?? 0) >= 2 ||
    facts.entities.some(
      (e) => (e.card?.civilizations.length ?? 0) >= 2,
    );
  return asksSummon && (mentionsMana || multiColorTarget);
}

function assignCivilizations(
  required: string[],
  cards: Array<{ civilizations: string[] }>,
): { ok: true } | { ok: false; missing: string[] } {
  const used = new Array(cards.length).fill(false);

  function cardHasCiv(
    card: { civilizations: string[] },
    civ: string,
  ): boolean {
    const target = normalizeCiv(civ);
    return card.civilizations.some((c) => normalizeCiv(c) === target);
  }

  // カバーしにくい文明から試す（最大5文明なので素朴DFSで十分）
  const ordered = [...required].sort((a, b) => {
    const ca = cards.filter((c) => cardHasCiv(c, a)).length;
    const cb = cards.filter((c) => cardHasCiv(c, b)).length;
    return ca - cb;
  });

  function dfs(index: number): boolean {
    if (index >= ordered.length) return true;
    const civ = ordered[index];
    for (let i = 0; i < cards.length; i += 1) {
      if (used[i]) continue;
      if (!cardHasCiv(cards[i], civ)) continue;
      used[i] = true;
      if (dfs(index + 1)) return true;
      used[i] = false;
    }
    return false;
  }

  if (dfs(0)) return { ok: true };

  const missing: string[] = [];
  for (const civ of ordered) {
    if (!cards.some((c) => cardHasCiv(c, civ))) {
      missing.push(civ);
    }
  }
  if (missing.length === 0) missing.push(...required);
  return { ok: false, missing: uniqueCivs(missing) };
}

function uniqueCivs(values: string[]): string[] {
  const map = new Map<string, string>();
  for (const value of values) {
    const key = normalizeCiv(value);
    if (!key) continue;
    if (!map.has(key)) map.set(key, value.trim());
  }
  return [...map.values()];
}

function normalizeCiv(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}
