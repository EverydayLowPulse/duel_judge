import { ensureSeedAliases } from "../aliases/seed";
import { getAliasEntry, upsertAlias } from "../aliases/store";
import type { AliasCandidate } from "../aliases/types";
import {
  fetchCardDetail,
  resolveCardCandidates,
} from "../official/card";
import type { OfficialCard } from "../official/types";
import { nameKeyMatches } from "./nameMatch";
import type { ClarifyCandidate, ResolveCardNameResult } from "./types";

export type { ClarifyCandidate, ResolveCardNameResult } from "./types";

function toAliasCandidates(cards: OfficialCard[]): AliasCandidate[] {
  return cards.map((c) => ({
    officialName: c.officialName,
    cardId: c.cardId,
    detailUrl: c.detailUrl,
  }));
}

function toClarifyCandidates(cards: OfficialCard[]): ClarifyCandidate[] {
  return cards.map((c) => ({
    official_name: c.officialName,
    card_id: c.cardId,
    detail_url: c.detailUrl,
  }));
}

/**
 * 中黒の有無を無視して名前が合う候補を優先。
 * 一致0件なら、短い汎用語のときだけ全候補を残す（clarify用）。
 */
function preferMatchingNames(
  query: string,
  cards: OfficialCard[],
): OfficialCard[] {
  const matched = cards.filter((c) => nameKeyMatches(c.officialName, query));
  if (matched.length > 0) return matched;

  const q = query.normalize("NFKC").trim();
  // 「ドラン」など短い語は接頭辞検索のノイズが多いので clarify に回す
  if (q.length <= 4) return cards;
  return [];
}

function clarifyResult(
  query: string,
  source: "alias" | "official_search",
  cards: OfficialCard[],
): ResolveCardNameResult {
  return {
    kind: "clarify",
    query,
    source,
    note: "複数候補があるため、どれを指すか選んでください。",
    questions: [
      {
        about: query,
        candidates: toClarifyCandidates(cards),
      },
    ],
    candidates: cards,
  };
}

/**
 * カード名解決: 略称辞書（1対N）→ なければ公式検索。
 * 候補1件なら resolved、複数なら clarify（推測しない）。
 */
export async function resolveCardName(
  query: string,
  options?: { maxDetails?: number; skipAlias?: boolean },
): Promise<ResolveCardNameResult> {
  const q = query.trim();
  if (!q) {
    return { kind: "not_found", query: q, note: "クエリが空です。" };
  }

  await ensureSeedAliases();

  if (!options?.skipAlias) {
    const entry = await getAliasEntry(q);
    if (entry && entry.candidates.length > 0) {
      const cards: OfficialCard[] = [];
      for (const c of entry.candidates) {
        cards.push(await fetchCardDetail(c.cardId));
      }
      const unique = dedupeByOfficialName(cards);
      if (unique.length === 1) {
        return {
          kind: "resolved",
          query: q,
          source: "alias",
          card: unique[0],
        };
      }
      return clarifyResult(q, "alias", unique);
    }
  }

  const searched = await resolveCardCandidates(q, {
    maxDetails: options?.maxDetails,
  });
  let cards = preferMatchingNames(q, searched.candidates);

  if (cards.length === 0) {
    return {
      kind: "not_found",
      query: q,
      note: "公式DBで該当カードが見つかりませんでした。正式名称を確認してください。",
    };
  }

  // 辞書に候補リストを蓄積（検索の省略用。確認は省略しない）
  await upsertAlias(q, toAliasCandidates(cards));

  if (cards.length === 1) {
    return {
      kind: "resolved",
      query: q,
      source: "official_search",
      card: cards[0],
    };
  }

  return clarifyResult(q, "official_search", cards);
}

/** ユーザーが clarify で選んだ card_id から確定 */
export async function resolveCardById(
  query: string,
  cardId: string,
): Promise<ResolveCardNameResult> {
  const card = await fetchCardDetail(cardId);
  // 選択結果を「この略称の候補に含める」形で学習（1件に潰さない）
  const entry = await getAliasEntry(query);
  const existing = entry?.candidates ?? [];
  const merged = dedupeAliasCandidates([
    ...existing,
    {
      officialName: card.officialName,
      cardId: card.cardId,
      detailUrl: card.detailUrl,
    },
  ]);
  await upsertAlias(query, merged);

  return {
    kind: "resolved",
    query,
    source: "alias",
    card,
  };
}

function dedupeByOfficialName(cards: OfficialCard[]): OfficialCard[] {
  const map = new Map<string, OfficialCard>();
  for (const c of cards) {
    if (!map.has(c.officialName)) map.set(c.officialName, c);
  }
  return [...map.values()];
}

function dedupeAliasCandidates(list: AliasCandidate[]): AliasCandidate[] {
  const map = new Map<string, AliasCandidate>();
  for (const c of list) {
    if (!map.has(c.officialName)) map.set(c.officialName, c);
  }
  return [...map.values()];
}
