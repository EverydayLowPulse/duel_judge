import { ensureSeedAliases } from "../aliases/seed";
import { getAliasEntry, upsertAlias } from "../aliases/store";
import type { AliasCandidate } from "../aliases/types";
import {
  fetchCardDetail,
  resolveCardCandidates,
} from "../official/card";
import type { OfficialCard } from "../official/types";
import { cleanCardQuery } from "./cleanCardQuery";
import { buildOfficialSearchVariants, nameKeyMatches } from "./nameMatch";
import type { ClarifyCandidate, ResolveCardNameResult } from "./types";
import { assistCardNamesFromWeb } from "./webAssistCardNames";

export type { ClarifyCandidate, ResolveCardNameResult } from "./types";

type ResolveSource = "alias" | "official_search" | "web_assist";

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
    cost: c.cost,
    civilizations: c.civilizations,
    card_type: c.cardType,
  }));
}

/**
 * 中黒の有無を無視して名前が合う候補を優先。
 * 一致0件でも公式ヒットが残っていれば clarify 用に返す（捨てない）。
 */
function preferMatchingNames(
  query: string,
  cards: OfficialCard[],
): { matched: OfficialCard[]; soft: OfficialCard[] } {
  const matched = cards.filter((c) => nameKeyMatches(c.officialName, query));
  if (matched.length > 0) return { matched, soft: [] };
  return { matched: [], soft: cards };
}

function clarifyResult(
  query: string,
  source: ResolveSource,
  cards: OfficialCard[],
  note?: string,
): ResolveCardNameResult {
  return {
    kind: "clarify",
    query,
    source,
    note:
      note ??
      "複数候補があるため、どれを指すか選んでください。",
    questions: [
      {
        about: query,
        candidates: toClarifyCandidates(cards),
      },
    ],
    candidates: cards,
  };
}

function decideFromCards(
  query: string,
  source: ResolveSource,
  cards: OfficialCard[],
  options?: { softMatchNote?: string },
): ResolveCardNameResult {
  const unique = dedupeByOfficialName(cards);
  if (unique.length === 0) {
    return {
      kind: "not_found",
      query,
      note: "公式DBで該当カードが見つかりませんでした。正式名称を確認してください。",
    };
  }
  if (unique.length === 1 && !options?.softMatchNote) {
    return {
      kind: "resolved",
      query,
      source,
      card: unique[0]!,
    };
  }
  // soft match（名前キー不一致の公式ヒット）は常に clarify
  if (options?.softMatchNote || unique.length > 1) {
    return clarifyResult(
      query,
      source,
      unique.slice(0, 12),
      options?.softMatchNote,
    );
  }
  return {
    kind: "resolved",
    query,
    source,
    card: unique[0]!,
  };
}

/**
 * カード名解決: 略称辞書 → 公式検索 →（0件なら）dmwiki補助→公式再検索。
 * 候補1件なら resolved、複数／ソフト一致なら clarify（推測しない）。
 */
export async function resolveCardName(
  query: string,
  options?: { maxDetails?: number; skipAlias?: boolean },
): Promise<ResolveCardNameResult> {
  const raw = query.trim();
  if (!raw) {
    return { kind: "not_found", query: raw, note: "クエリが空です。" };
  }

  const { cleaned } = cleanCardQuery(raw);
  const lookupKey = cleaned || raw;
  const triedQueries: string[] = [];

  await ensureSeedAliases();

  if (!options?.skipAlias) {
    const entry = await getAliasEntry(lookupKey);
    if (entry && entry.candidates.length > 0) {
      const cards: OfficialCard[] = [];
      for (const c of entry.candidates) {
        cards.push(await fetchCardDetail(c.cardId));
      }
      const decided = decideFromCards(
        raw,
        "alias",
        dedupeByOfficialName(cards),
      );
      if (decided.kind !== "not_found") return decided;
    }
  }

  const searched = await resolveCardCandidates(lookupKey, {
    maxDetails: options?.maxDetails,
  });
  triedQueries.push(lookupKey, ...buildOfficialSearchVariants(lookupKey).slice(0, 4));

  const { matched, soft } = preferMatchingNames(lookupKey, searched.candidates);

  // 名前キー一致があるときだけ公式ヒットで確定／clarify（ソフト一致は wiki 補助の後回し）
  if (matched.length > 0) {
    await upsertAlias(
      lookupKey,
      toAliasCandidates(dedupeByOfficialName(matched)),
    );
    return decideFromCards(raw, "official_search", matched);
  }

  // 公式0件 or 名前不一致のみ: dmwiki で正式名ヒント → 公式再検索（論拠には使わない）
  const webCards = await resolveViaWebAssist(lookupKey, triedQueries, {
    maxDetails: options?.maxDetails,
  });
  if (webCards.length > 0) {
    await upsertAlias(lookupKey, toAliasCandidates(webCards));
    return decideFromCards(raw, "web_assist", webCards);
  }

  // wiki でも取れなければ、ソフト一致を clarify 候補として残す
  if (soft.length > 0) {
    return decideFromCards(raw, "official_search", soft, {
      softMatchNote:
        "名前の完全一致はありません。近い公式検索結果から選んでください（読み仮名と正式名が違うことがあります）。",
    });
  }

  // not_found: 短い断片で suggestions を拾う（確定はしない）
  const suggestions = await collectSuggestions(lookupKey, triedQueries);

  return {
    kind: "not_found",
    query: raw,
    cleanedQuery: cleaned !== raw ? cleaned : undefined,
    triedQueries: [...new Set(triedQueries.map((t) => t.trim()).filter(Boolean))],
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    note:
      suggestions.length > 0
        ? "公式DBで名前が確定できませんでした。下の候補に該当があれば選ぶか、正式名を「カード語句」に入れて再送してください。"
        : "公式DBで該当カードが見つかりませんでした（wiki補助も試行）。読み仮名だけの場合は正式名を試してください。",
  };
}

async function resolveViaWebAssist(
  lookupKey: string,
  triedQueries: string[],
  options?: { maxDetails?: number },
): Promise<OfficialCard[]> {
  let proposals;
  try {
    proposals = await assistCardNamesFromWeb(lookupKey);
  } catch (error) {
    console.warn(
      "[resolve] web assist failed",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
  if (proposals.length === 0) return [];

  const seen = new Set<string>();
  const found: OfficialCard[] = [];

  for (const proposal of proposals.slice(0, 6)) {
    const queries = unique([
      proposal.officialSearchQuery,
      proposal.proposedOfficialName,
    ]);
    for (const q of queries) {
      triedQueries.push(`web:${q}`);
      try {
        const searched = await resolveCardCandidates(q, {
          maxDetails: options?.maxDetails ?? 8,
        });
        for (const card of searched.candidates) {
          if (seen.has(card.officialName)) continue;
          const ok =
            nameKeyMatches(card.officialName, proposal.proposedOfficialName) ||
            nameKeyMatches(card.officialName, lookupKey) ||
            nameKeyMatches(card.officialName, q);
          if (!ok) continue;
          seen.add(card.officialName);
          found.push(card);
        }
      } catch {
        // 1語失敗で他を止めない
      }
      if (found.length >= 8) break;
    }
    if (found.length >= 8) break;
  }

  return dedupeByOfficialName(found);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

async function collectSuggestions(
  cleaned: string,
  triedQueries: string[],
): Promise<ClarifyCandidate[]> {
  const fragments = buildSuggestionFragments(cleaned);
  const seen = new Set<string>();
  const cards: OfficialCard[] = [];

  for (const frag of fragments.slice(0, 4)) {
    if (frag.length < 2) continue;
    triedQueries.push(frag);
    try {
      const searched = await resolveCardCandidates(frag, { maxDetails: 6 });
      for (const card of searched.candidates) {
        if (seen.has(card.officialName)) continue;
        seen.add(card.officialName);
        cards.push(card);
      }
    } catch {
      // 提案取得失敗は無視
    }
    if (cards.length >= 8) break;
  }

  return toClarifyCandidates(cards.slice(0, 8));
}

function buildSuggestionFragments(cleaned: string): string[] {
  const q = cleaned.normalize("NFKC").trim();
  if (!q) return [];
  const out: string[] = [q];
  // カタカナ塊が長いとき後半（「ダーバンデ」）も試す
  const kata = q.match(/[ァ-ヶー]{3,}/g) ?? [];
  for (const k of kata) {
    out.push(k);
    if (k.length >= 6) {
      out.push(k.slice(0, Math.ceil(k.length / 2)));
      out.push(k.slice(Math.floor(k.length / 2)));
    }
  }
  if (/[A-Za-z]/.test(q)) {
    out.push(...q.split(/\s+/).filter((p) => p.length >= 3));
  }
  return [...new Set(out)];
}

/** ユーザーが clarify で選んだ card_id から確定 */
export async function resolveCardById(
  query: string,
  cardId: string,
): Promise<ResolveCardNameResult> {
  const card = await fetchCardDetail(cardId);
  const { cleaned } = cleanCardQuery(query);
  const aliasKey = cleaned || query.trim();
  // 選択結果を「この略称の候補に含める」形で学習（1件に潰さない）
  const entry = await getAliasEntry(aliasKey);
  const existing = entry?.candidates ?? [];
  const merged = dedupeAliasCandidates([
    ...existing,
    {
      officialName: card.officialName,
      cardId: card.cardId,
      detailUrl: card.detailUrl,
    },
  ]);
  await upsertAlias(aliasKey, merged);
  // 生クエリでも引けるようにする
  if (aliasKey !== query.trim()) {
    await upsertAlias(query.trim(), merged);
  }

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
