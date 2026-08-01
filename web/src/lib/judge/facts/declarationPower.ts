import type { OfficialCard } from "../../official/types";
import { normalizeCardNameKey } from "../../resolve/nameMatch";
import type { ScenarioCard } from "../scenarioCards";
import type { DeclarationPowerHint } from "./types";

/**
 * 攻撃開始（使用宣言）時点のパワー見積もり。
 *
 * - 印刷パワー + 「出す時に付与されるこのターン修正」は宣言時点に含める
 * - 「攻撃する時」誘発のパンプは含めない
 * - 常在型（パワーアタッカー等）は含める
 */
export function buildDeclarationPowerHints(input: {
  question: string;
  scenarioCards: ScenarioCard[];
}): DeclarationPowerHint[] {
  const attackers = pickAttackers(input.question, input.scenarioCards);
  if (attackers.length === 0) return [];

  const hints: DeclarationPowerHint[] = [];
  for (const attacker of attackers) {
    const printed = parsePower(attacker.card.power);
    const modifiers = [
      ...findPutBoosts(input.question, attacker, input.scenarioCards),
      ...findStaticPowerBonuses(attacker.card),
    ];
    const attackTriggerNote = detectAttackTriggerPump(attacker.card);

    let estimated: number | null = printed;
    if (estimated != null) {
      for (const mod of modifiers) estimated += mod.delta;
    } else if (modifiers.length > 0) {
      estimated = modifiers.reduce((sum, m) => sum + m.delta, 0);
    }

    const notes: string[] = [];
    if (modifiers.length > 0 && printed != null) {
      notes.push(
        `攻撃開始時点の見積もりパワー: 印刷${printed}` +
          modifiers.map((m) => `${m.delta >= 0 ? "+" : ""}${m.delta}`).join("") +
          ` = ${estimated}`,
      );
    }
    if (attackTriggerNote) notes.push(attackTriggerNote);
    notes.push(
      "攻撃開始後に誘発して上がるパワーは、使用宣言時点の条件に使えない。",
    );
    notes.push(
      "攻撃開始前から有効な修正（出す時のこのターン＋N、常在型など）は宣言時点に含める。",
    );

    if (printed == null && modifiers.length === 0) continue;

    hints.push({
      targetMention: attacker.mention,
      targetOfficialName: attacker.card.officialName,
      printedPower: printed,
      modifiers,
      estimatedPowerAtAttackStart: estimated,
      notes,
      source: modifiers.some((m) => m.source === "official_card")
        ? "official_card"
        : "user",
    });
  }
  return hints;
}

function pickAttackers(
  question: string,
  scenarioCards: ScenarioCard[],
): ScenarioCard[] {
  const q = normalize(question);
  const byRole = scenarioCards.filter((c) => c.role === "attacker");
  if (byRole.length > 0) return byRole;

  // 「Xが攻撃」「Xで攻撃」「Xを攻撃」っぽい言及
  return scenarioCards.filter((c) => {
    const names = [c.mention, c.card.officialName, ...shortAliases(c.card.officialName)];
    return names.some((name) => {
      const n = normalize(name);
      if (n.length < 2) return false;
      return (
        q.includes(n + normalize("が攻撃")) ||
        q.includes(n + normalize("で攻撃")) ||
        q.includes(n + normalize("を攻撃")) ||
        (q.includes(n) &&
          (q.includes(normalize("攻撃時")) ||
            q.includes(normalize("攻撃する時")) ||
            q.includes(normalize("革命チェンジ"))))
      );
    });
  });
}

/**
 * 「AからBを出し」「Aの能力でB」→ Aのテキストに「このターン…パワー＋N」があれば採用。
 */
function findPutBoosts(
  question: string,
  target: ScenarioCard,
  scenarioCards: ScenarioCard[],
): DeclarationPowerHint["modifiers"] {
  const q = normalize(question);
  const targetKeys = [
    normalize(target.mention),
    normalize(target.card.officialName),
    ...shortAliases(target.card.officialName).map(normalize),
  ].filter((k) => k.length >= 2);

  const out: DeclarationPowerHint["modifiers"] = [];
  for (const source of scenarioCards) {
    if (source.card.officialName === target.card.officialName) continue;
    const sourceKeys = [
      normalize(source.mention),
      normalize(source.card.officialName),
      ...shortAliases(source.card.officialName).map(normalize),
    ].filter((k) => k.length >= 2);

    if (!mentionsPutFrom(q, sourceKeys, targetKeys)) continue;

    const boost = extractTurnLongPutBoost(source.card.abilityText);
    if (!boost) continue;

    out.push({
      sourceMention: source.mention,
      sourceOfficialName: source.card.officialName,
      delta: boost.delta,
      kind: "turn_long_on_put",
      evidence: boost.evidence,
      source: "official_card",
    });
  }
  return out;
}

function mentionsPutFrom(
  qNorm: string,
  sourceKeys: string[],
  targetKeys: string[],
): boolean {
  // 「AからBを出し」「Aの能力でB」など
  for (const s of sourceKeys) {
    for (const t of targetKeys) {
      if (qNorm.includes(s) && qNorm.includes(t) && qNorm.includes(normalize("から"))) {
        return true;
      }
      if (
        qNorm.includes(s + normalize("から") + t) ||
        qNorm.includes(s + normalize("の能力で") + t) ||
        qNorm.includes(s + normalize("で") + t)
      ) {
        return true;
      }
    }
    // ソースだけ明示され、出し・射出がある
    if (
      qNorm.includes(s) &&
      (qNorm.includes(normalize("から出し")) ||
        qNorm.includes(normalize("から進化")) ||
        qNorm.includes(normalize("で出し")) ||
        qNorm.includes(normalize("射出")))
    ) {
      return true;
    }
  }
  return false;
}

function extractTurnLongPutBoost(
  abilityText: string,
): { delta: number; evidence: string } | null {
  const text = abilityText.normalize("NFKC");
  // 「このターン」＋「そのクリーチャー」系＋パワー＋N
  const turnLong =
    /このターン/.test(text) &&
    (/そのクリーチャー/.test(text) || /そのカード/.test(text));
  if (!turnLong) return null;

  const m = text.match(/パワーを\s*[＋+](\d+)/);
  if (!m) return null;
  const delta = Number(m[1]);
  if (!Number.isFinite(delta) || delta === 0) return null;

  const idx = text.indexOf(m[0]);
  const evidence = text.slice(Math.max(0, idx - 24), idx + m[0].length + 8).trim();
  return { delta, evidence };
}

/** 自身の常在型パワー修正（パワーアタッカー +N 等） */
function findStaticPowerBonuses(
  card: OfficialCard,
): DeclarationPowerHint["modifiers"] {
  const text = card.abilityText.normalize("NFKC");
  const out: DeclarationPowerHint["modifiers"] = [];

  // 「パワーアタッカー＋N」「パワーアタッカー +N」
  for (const m of text.matchAll(/パワーアタッカー\s*[＋+](\d+)/g)) {
    const delta = Number(m[1]);
    if (!Number.isFinite(delta)) continue;
    out.push({
      sourceMention: card.officialName,
      sourceOfficialName: card.officialName,
      delta,
      kind: "static",
      evidence: m[0],
      source: "official_card",
    });
  }
  return out;
}

function detectAttackTriggerPump(card: OfficialCard): string | undefined {
  const text = (card.abilityText ?? "").normalize("NFKC");
  // 攻撃開始後にパワーが動く余地がある（攻撃時そのもの／攻撃時からの連鎖）
  if (!/攻撃する時/.test(text)) return undefined;
  if (!/パワーを\s*[＋+]/.test(text) && !/パワー\s*[＋+]/.test(text)) {
    return undefined;
  }
  return `${card.officialName}: 攻撃開始後に上昇するパワー修正は宣言時点に含めない。`;
}

function parsePower(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.normalize("NFKC").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function shortAliases(officialName: string): string[] {
  const parts = officialName.split(/[\s　/／]+/).filter(Boolean);
  const aliases = [...parts];
  const noPrefix = officialName.replace(/^.*?の/, "");
  if (noPrefix && noPrefix !== officialName) aliases.push(noPrefix);
  return aliases;
}

function normalize(value: string): string {
  return normalizeCardNameKey(value);
}

export function formatDeclarationPowerHints(
  hints: DeclarationPowerHint[],
): string | undefined {
  if (hints.length === 0) return undefined;
  const lines = hints.flatMap((h) => {
    const mods =
      h.modifiers.length > 0
        ? h.modifiers
            .map(
              (m) =>
                `  - ${m.sourceOfficialName}: ${m.delta >= 0 ? "+" : ""}${m.delta} (${m.kind}) 「${m.evidence}」`,
            )
            .join("\n")
        : "  - （修正なし）";
    return [
      `【宣言時点パワー見積もり】${h.targetOfficialName ?? h.targetMention}`,
      `  印刷: ${h.printedPower ?? "不明"} / 見積もり: ${h.estimatedPowerAtAttackStart ?? "不明"}`,
      mods,
      ...h.notes.map((n) => `  ・${n}`),
    ];
  });
  return lines.join("\n");
}
