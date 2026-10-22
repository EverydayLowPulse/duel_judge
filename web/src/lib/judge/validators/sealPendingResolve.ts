import type { ValidatorInput, ValidatorResult } from "./types";

/**
 * 封印 × 出た時メタの「誘発しない」短絡を潰す応急の決定的 validator。
 *
 * ※ デュエマ解決のモデルではない。110.5a の一例を機械固定する対症療法。
 *   「バトル／手札」以外（山札下・破壊・TP順など）はカバーしない。
 *   根本はステップ駆動（docs.byAI/inference_approaches.md）側で試す。
 *
 * 原則のみ（カード名分岐なし）:
 * - 出た時点で誘発条件を満たせば誘発し待機する（110.5a）
 * - 封印は無視（116.2a）だが、それは解決時の行動可否の話
 * - 発生源にバトルさせる効果 → 解決時バトル不能で不発
 * - 手札戻し等 → 発生源が封印されても待機効果は残る
 */
export type SealPendingEffectKind =
  | "source_battle"
  | "independent"
  | "unknown";

export function shouldRunSealPendingResolve(input: {
  question: string;
  issues: ValidatorInput["issues"];
}): boolean {
  if (!input.issues.matches.some((m) => m.kind === "pending_abilities")) {
    return false;
  }
  const q = normalize(input.question);
  if (!q.includes(normalize("封印")) && !q.includes(normalize("無視"))) {
    return false;
  }
  return (
    q.includes(normalize("誘発")) ||
    q.includes(normalize("発動")) ||
    q.includes(normalize("メタ効果")) ||
    q.includes(normalize("メタは")) ||
    q.includes(normalize("効果は")) ||
    q.includes(normalize("解決")) ||
    q.includes(normalize("バトル"))
  );
}

export function detectSealPendingEffectKind(
  texts: string[],
): SealPendingEffectKind {
  const hay = normalize(texts.join("\n"));
  if (hay.includes(normalize("バトルさせ"))) {
    return "source_battle";
  }
  // 発生源の場での行動を要しない典型パターン
  if (
    hay.includes(normalize("手札に戻")) ||
    hay.includes(normalize("山札の下")) ||
    hay.includes(normalize("山札の上")) ||
    hay.includes(normalize("マナゾーンに置")) ||
    hay.includes(normalize("墓地に置"))
  ) {
    return "independent";
  }
  return "unknown";
}

export function validateSealPendingResolve(
  input: ValidatorInput,
): ValidatorResult {
  if (!shouldRunSealPendingResolve(input)) {
    return {
      validatorId: "seal_pending_resolve",
      verdict: "unknown",
      reason: "封印×待機メタの成否を問う形ではなかった。",
      usedFacts: [],
      missingFacts: [],
      requiredRuleRefs: [],
      constraintsForAnswer: [],
    };
  }

  const abilityTexts = collectAbilityTexts(input);
  const kind = detectSealPendingEffectKind(abilityTexts);

  const baseConstraints = [
    "[封印×待機] 出た時点で誘発条件を満たせば誘発する。『封印されたから誘発しない』は禁止。",
    "[封印×待機] いったん誘発した効果は発生源と独立して待機する（110.5a）。",
    "[封印×待機] 封印されたクリーチャーは無視され、攻撃・ブロック・能力発揮ができない（116.2a）。",
  ];

  if (kind === "source_battle") {
    return {
      validatorId: "seal_pending_resolve",
      verdict: "allowed",
      reason:
        "出た時点でメタは誘発して待機する。解決時には封印で無視されているため発生源はバトルできず、バトルは不発に終わる（110.5a / 116.2a）。",
      usedFacts: ["actions", "timelineNotes"],
      missingFacts: [],
      requiredRuleRefs: ["110.5a", "116.2", "116.2a"],
      constraintsForAnswer: [
        ...baseConstraints,
        "[封印×待機] 発生源にバトルさせる効果は、解決時点で無視／バトル不能なら不発。",
        "[禁止推論] 不発＝誘発しなかった、と書く。",
      ],
      craftedConclusion:
        "誘発はするが、解決時には封印で無視されているためバトルできず不発に終わる。",
      craftedReasoning:
        "踏み倒し等でクリーチャーが出た時点で、場のメタの誘発条件は満たされ待機する。いったん誘発した効果は発生源と独立する（総合ルール 110.5a）。その後の解決で発生源が封印されている場合、封印されたクリーチャーは無視されバトルできない（116.2 / 116.2a）。したがって『誘発しない』ではなく、『誘発したがバトル解決は不発』が正しい。",
    };
  }

  if (kind === "independent") {
    return {
      validatorId: "seal_pending_resolve",
      verdict: "allowed",
      reason:
        "出た時点でメタは誘発して待機する。手札に戻す等は発生源の行動を要しないため、発生源が封印されても解決できる（110.5a）。",
      usedFacts: ["actions", "timelineNotes"],
      missingFacts: [],
      requiredRuleRefs: ["110.5a", "116.2", "116.2a"],
      constraintsForAnswer: [
        ...baseConstraints,
        "[封印×待機] 手札に戻す等、発生源の行動を要しない待機効果は封印後も解決できる。",
        "[禁止推論] 封印された＝メタはすべて不発、と短絡する。",
      ],
      craftedConclusion:
        "誘発し、発生源が封印されても待機効果は残るため、手札に戻す等の解決はできる。",
      craftedReasoning:
        "出た時点で誘発条件を満たせばメタは誘発して待機する。いったん誘発した効果は発生源と独立する（総合ルール 110.5a）。手札に戻す等は発生源にバトル等をさせる効果ではないので、その後に発生源が封印・無視されても待機効果の解決自体は残る。『封印されたから誘発しない』は誤り。",
    };
  }

  // 効果種別が取れないときも「誘発しない」だけは機械的に否定する
  return {
    validatorId: "seal_pending_resolve",
    verdict: "allowed",
    reason:
      "出た時点で誘発条件を満たせば誘発して待機する。封印は『誘発しなかった』理由にならない（110.5a / 116.2a）。解決の成否は効果の種類による。",
    usedFacts: ["actions"],
    missingFacts: abilityTexts.length === 0 ? ["cardAbilityText"] : [],
    requiredRuleRefs: ["110.5a", "116.2", "116.2a"],
    constraintsForAnswer: [
      ...baseConstraints,
      "[封印×待機] 解決の成否は、効果が発生源にバトル等をさせるかで分岐する。",
      "[禁止推論] 封印された＝誘発しない、と短絡する。",
    ],
    craftedConclusion:
      "誘発はする。封印されたから誘発しない、ではない。解決時に発生源へバトル等をさせる効果ならバトル不能で不発、そうでなければ待機効果は残りうる。",
    craftedReasoning:
      "出た時点で誘発条件を満たせば待機する（110.5a）。封印（116.2a）は解決時点の無視・バトル不能の問題であり、誘発の有無と混同してはならない。本件は能力テキストから効果種別を特定しきれないため、分岐原則までを結論とする。",
  };
}

function collectAbilityTexts(input: ValidatorInput): string[] {
  const fromCards = input.cardAbilityTexts ?? [];
  const fromChunks = (input.chunks ?? [])
    .filter((c) => c.type === "card")
    .map((c) => c.text);
  return [...fromCards, ...fromChunks].filter(Boolean);
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}
