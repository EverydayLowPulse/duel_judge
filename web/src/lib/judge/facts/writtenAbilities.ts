import type { OfficialCard } from "../../official/types";
import type { ScenarioCard } from "../scenarioCards";
import type { FactSource, WrittenAbilityHint } from "./types";

/**
 * 総合ルール 205.2a: 注釈文はカッコ内の要約で、能力ではない。
 * 「カードに能力が書かれていない」判定では注釈だけを能力と数えない。
 */
export function stripReminderText(abilityText: string): string {
  return abilityText
    .normalize("NFKC")
    .replace(/【[^】]*】/g, " ")
    .replace(/（[^）]*）/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[・●■◇◆▶▷]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** クリーチャーとして参照する面の能力テキスト（ツインパクトはクリーチャー面優先） */
export function creatureAbilityText(card: OfficialCard): string {
  const faces = card.faces ?? [];
  const creatureFace = faces.find((face) =>
    (face.cardType ?? "").includes("クリーチャー"),
  );
  if (creatureFace) return creatureFace.abilityText;
  if (faces.length === 1) return faces[0]!.abilityText;
  return card.abilityText;
}

export function hasWrittenAbilities(abilityText: string): boolean {
  return stripReminderText(abilityText).length > 0;
}

/** 「カードに能力が書かれていない〜召喚した時」系の監視能力か */
export function watchesNoWrittenAbilities(abilityText: string): boolean {
  const t = abilityText.normalize("NFKC");
  return (
    t.includes("能力が書かれていない") ||
    t.includes("能力の書かれていない")
  );
}

/**
 * 監視カード＋召喚対象について、印刷テキスト上の能力有無を整理する。
 * カード名ハードコードはしない（能力文言と注釈除去の原則）。
 */
export function buildWrittenAbilityHints(input: {
  question: string;
  scenarioCards: ScenarioCard[];
}): WrittenAbilityHint[] {
  if (!isRelevantQuestion(input.question)) return [];

  const watchers = input.scenarioCards.filter((item) =>
    watchesNoWrittenAbilities(item.card.abilityText),
  );
  if (watchers.length === 0) return [];

  const hints: WrittenAbilityHint[] = [];
  for (const watcher of watchers) {
    for (const target of input.scenarioCards) {
      if (sameCard(watcher.card, target.card)) continue;
      if (!looksLikeCreature(target.card)) continue;

      const text = creatureAbilityText(target.card);
      const written = hasWrittenAbilities(text);
      hints.push({
        watcherMention: watcher.mention,
        watcherOfficialName: watcher.card.officialName,
        targetMention: target.mention,
        targetOfficialName: target.card.officialName,
        hasWrittenAbilities: written,
        countsAsNoWrittenAbilities: !written,
        evidence: summarizeEvidence(text, written),
        notes: written
          ? []
          : [
              "注釈文（カッコ書き）だけなら能力は書かれていない（総合ルール 205.2a）。",
            ],
        source: "official_card" satisfies FactSource,
      });
    }
  }
  return hints;
}

export function formatWrittenAbilityHints(
  hints: WrittenAbilityHint[],
): string | undefined {
  if (hints.length === 0) return undefined;
  const lines = [
    "【印刷能力の有無（内部。注釈文は能力に数えない）】",
    ...hints.map((h) => {
      const status = h.countsAsNoWrittenAbilities
        ? "能力なし（バニラ扱い）"
        : "能力あり";
      return `- 監視=${h.watcherOfficialName} / 対象=${h.targetOfficialName}: ${status} — ${h.evidence}`;
    }),
  ];
  return lines.join("\n");
}

function isRelevantQuestion(question: string): boolean {
  const q = normalize(question);
  return (
    q.includes(normalize("誘発")) ||
    q.includes(normalize("召喚")) ||
    q.includes(normalize("出す")) ||
    q.includes(normalize("能力が書かれていない")) ||
    q.includes(normalize("バニラ"))
  );
}

function looksLikeCreature(card: OfficialCard): boolean {
  const type = `${card.cardType ?? ""} ${(card.faces ?? [])
    .map((f) => f.cardType ?? "")
    .join(" ")}`;
  if (type.includes("呪文") && !type.includes("クリーチャー")) return false;
  return (
    type.includes("クリーチャー") ||
    card.power != null ||
    (card.races?.length ?? 0) > 0
  );
}

function sameCard(a: OfficialCard, b: OfficialCard): boolean {
  return a.cardId === b.cardId || a.officialName === b.officialName;
}

function summarizeEvidence(abilityText: string, hasAbility: boolean): string {
  const raw = abilityText.replace(/\s+/g, " ").trim();
  if (!raw) return "能力テキストなし";
  if (!hasAbility) {
    return `注釈のみ: ${raw.slice(0, 80)}`;
  }
  const stripped = stripReminderText(abilityText);
  return `能力あり: ${stripped.slice(0, 80)}`;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}
