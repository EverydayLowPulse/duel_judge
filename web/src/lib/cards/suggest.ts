import { ensureSeedAliases } from "../aliases/seed";
import { getAliasEntry, listAliasEntries } from "../aliases/store";
import { KEYWORD_RULE_DICTIONARY } from "../rules/keywordDictionary";
import { loadCardMirror } from "./mirror";
import {
  searchCardNames,
  suggestCardsFromQuestion,
  type CardIndexEntry,
  type QuestionSuggestionGroup,
} from "./nameSearch";

export type QuerySuggestResult = {
  /** 全件ミラーがあるか。false なら公式検索（検索ボタン）に頼る */
  available: boolean;
  total: number;
  cards: CardIndexEntry[];
};

export type QuestionSuggestResult = {
  available: boolean;
  groups: QuestionSuggestionGroup[];
};

/**
 * 入力中の候補。略称辞書の候補を先頭に、続けてローカル名前検索。
 * 公式へは行かない（キー入力ごとに呼ばれるため）。
 */
export async function suggestForQuery(
  query: string,
  options?: { limit?: number },
): Promise<QuerySuggestResult> {
  const limit = options?.limit ?? 30;
  const mirror = await loadCardMirror();
  await ensureSeedAliases();
  const alias = await getAliasEntry(query);

  const aliasCards: CardIndexEntry[] = (alias?.candidates ?? []).map(
    (c) =>
      mirror?.nameIndex.byId.get(c.cardId) ?? {
        cardId: c.cardId,
        officialName: c.officialName,
        civilizations: [],
        cost: null,
        cardType: null,
      },
  );
  const local = mirror
    ? searchCardNames(mirror.nameIndex, query, { limit })
    : { total: 0, cards: [] };

  const seen = new Set<string>();
  const cards = [...aliasCards, ...local.cards].filter((c) => {
    if (seen.has(c.officialName)) return false;
    seen.add(c.officialName);
    return true;
  });
  const extraAlias = aliasCards.filter(
    (a) => !local.cards.some((c) => c.officialName === a.officialName),
  ).length;

  return {
    available: mirror != null,
    total: local.total + extraAlias,
    cards: cards.slice(0, limit),
  };
}

/** キーワード能力名（カード名の一部と紛らわしいので部分名として拾わない） */
const KEYWORD_TERMS = KEYWORD_RULE_DICTIONARY.flatMap((k) => [
  k.label,
  ...k.aliases,
]);

/** 質問文から、関係しそうなカードを語句ごとにまとめて返す */
export async function suggestForQuestion(
  question: string,
): Promise<QuestionSuggestResult> {
  const mirror = await loadCardMirror();
  if (!mirror) return { available: false, groups: [] };
  await ensureSeedAliases();
  const aliases = (await listAliasEntries()).map((entry) => ({
    alias: entry.alias,
    candidates: entry.candidates,
  }));
  return {
    available: true,
    groups: suggestCardsFromQuestion(mirror.nameIndex, question, {
      aliases,
      reservedTerms: KEYWORD_TERMS,
    }),
  };
}
