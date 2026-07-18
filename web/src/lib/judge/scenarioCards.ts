import type { SearchPlan } from "../llm/searchPlanner";
import type { OfficialCard } from "../official/types";
import { nameKeyMatches, normalizeCardNameKey } from "../resolve/nameMatch";
import { resolveCardName } from "../resolve/resolveCardName";

export type ScenarioCard = {
  mention: string;
  role: SearchPlan["cardMentions"][number]["role"];
  relevantAbility: string;
  card: OfficialCard;
};

/**
 * 検索プランが抽出したカード名を公式DBで解決する。
 * 曖昧候補は、質問で明示された能力名を公式能力テキストに持つものへ絞る。
 */
export async function resolveScenarioCards(input: {
  plan: SearchPlan;
  primaryCard?: OfficialCard;
}): Promise<ScenarioCard[]> {
  const resolved: ScenarioCard[] = [];

  if (input.primaryCard) {
    resolved.push({
      mention: input.primaryCard.officialName,
      role: "other",
      relevantAbility: "",
      card: input.primaryCard,
    });
  }

  for (const mention of input.plan.cardMentions.slice(0, 5)) {
    if (
      resolved.some(
        (r) =>
          normalize(r.mention) === normalize(mention.mention) ||
          normalize(r.card.officialName) === normalize(mention.mention),
      )
    ) {
      continue;
    }

    // ユーザー指定の主カードが略称と一致するなら、公式検索を飛ばして紐づける
    if (
      input.primaryCard &&
      looksLikeCardMention(mention.mention, input.primaryCard.officialName)
    ) {
      resolved.push({ ...mention, card: input.primaryCard });
      continue;
    }

    let result = await resolveCardName(mention.mention, { maxDetails: 8 });
    let candidates =
      result.kind === "resolved"
        ? [result.card]
        : result.kind === "clarify"
          ? result.candidates
          : [];

    // 公式検索は部分一致かつ新着順に近いため、先頭8件に完全なカード名がないことがある。
    // 名前の対応が1件もなければ範囲を広げ、誤った近似カードは採用しない。
    if (!candidates.some((card) => nameMatches(card, mention.mention))) {
      result = await resolveCardName(mention.mention, {
        maxDetails: 24,
        skipAlias: true,
      });
      candidates =
        result.kind === "resolved"
          ? [result.card]
          : result.kind === "clarify"
            ? result.candidates
            : [];
    }
    candidates = candidates.filter((card) =>
      nameMatches(card, mention.mention),
    );
    if (candidates.length === 0) continue;

    const ranked = rankCandidates(
      candidates,
      mention.mention,
      mention.relevantAbility,
    );

    // 能力名が明示されているときは、その能力を持たない同名候補を除く。
    const matchingAbility = mention.relevantAbility
      ? ranked.filter((c) =>
          normalize(c.abilityText).includes(
            normalize(mention.relevantAbility),
          ),
        )
      : ranked;
    const selected = (matchingAbility.length ? matchingAbility : ranked).slice(
      0,
      3,
    );

    for (const card of selected) {
      if (resolved.some((r) => r.card.officialName === card.officialName)) {
        continue;
      }
      resolved.push({ ...mention, card });
    }
  }

  return resolved;
}

function rankCandidates(
  cards: OfficialCard[],
  mention: string,
  ability: string,
): OfficialCard[] {
  const mentionN = normalize(mention);
  const abilityN = normalize(ability);
  const score = (card: OfficialCard) => {
    let value = 0;
    const name = normalize(card.officialName);
    const text = normalize(card.abilityText);
    if (name === mentionN) value += 100;
    if (name.includes(mentionN)) value += 30;
    if (abilityN && text.includes(abilityN)) value += 50;
    return value;
  };
  return [...cards].sort((a, b) => score(b) - score(a));
}

function normalize(value: string): string {
  return normalizeCardNameKey(value);
}

function nameMatches(card: OfficialCard, mention: string): boolean {
  return nameKeyMatches(card.officialName, mention);
}

/** 略称（例: ワルプリS）が正式名の部分列になっているかも見る */
function looksLikeCardMention(mention: string, officialName: string): boolean {
  if (nameKeyMatches(officialName, mention)) return true;
  const m = normalize(mention);
  const n = normalize(officialName);
  if (m.length < 3) return false;
  let i = 0;
  for (const ch of n) {
    if (ch === m[i]) i += 1;
    if (i >= m.length) return true;
  }
  return false;
}
