import {
  foldHiraganaToKatakana,
  normalizeCardNameKey,
} from "../resolve/nameMatch";

/** 名前検索・サジェストに必要な最小限のカード情報（能力テキストは持たない） */
export type CardIndexEntry = {
  cardId: string;
  officialName: string;
  civilizations: string[];
  cost: string | null;
  cardType: string | null;
};

type IndexedCard = {
  entry: CardIndexEntry;
  fullKey: string;
  /** ツインパクトの各面（表示名とキー）。片面カードは空 */
  faces: Array<{ name: string; key: string }>;
  order: number;
};

export type CardNameIndex = {
  cards: IndexedCard[];
  byId: Map<string, CardIndexEntry>;
};

export type CardNameSearchResult = {
  /** 一致した総件数（limit 前） */
  total: number;
  cards: CardIndexEntry[];
};

export type QuestionSuggestionGroup = {
  /** 質問文中の該当語（正式名一致なら正式名、略称なら略称） */
  mention: string;
  kind: "name" | "alias" | "token";
  total: number;
  cards: CardIndexEntry[];
};

export type AliasHint = {
  alias: string;
  candidates: Array<{ cardId: string; officialName: string }>;
};

const MIN_QUERY_KEY_LENGTH = 2;
/** 質問文から正式名・語句を拾うときの最小長。短い名前は一般語と衝突しやすい */
const MIN_MENTION_KEY_LENGTH = 3;

/**
 * 質問文によく出るゲーム用語。カード名の一部でもあるが、単独で出たときは
 * カードを指していないので語句候補にしない（カード個別ではなく総合ルール上の語彙）。
 */
const GAME_TERMS = new Set(
  [
    "クリーチャー", "バトルゾーン", "マナゾーン", "シールドゾーン", "ゾーン",
    "シールド", "シールド・トリガー", "トリガー", "ブレイク", "ブレイカー",
    "W・ブレイカー", "ダブル・ブレイカー", "T・ブレイカー", "ターン",
    "ターン・プレイヤー", "プレイヤー", "タップ", "アンタップ", "コスト",
    "パワー", "カード", "デッキ", "ドロー", "ブロック", "ブロッカー",
    "アタック", "アタッカー", "スピードアタッカー", "バトル", "マナ",
    "ゲーム", "ルール", "フェイズ", "ステップ", "チャージ", "コマンド",
    "タマシード", "フィールド", "オーラ", "クロスギア", "ウエポン",
    "フォートレス", "ドラグハート", "エレメント", "ツインパクト", "サイキック",
    "ターンエンド", "エンド", "スタート", "メイン", "ゼロ", "ルーラー",
  ].map(cardSearchKey),
);

/** 名前照合キー。中黒・空白・括弧を落とし、ひらがなをカタカナに寄せる */
export function cardSearchKey(value: string): string {
  return foldHiraganaToKatakana(normalizeCardNameKey(value));
}

export function buildCardNameIndex(entries: CardIndexEntry[]): CardNameIndex {
  const cards = entries.map((entry, order) => {
    const faceNames = entry.officialName.split(/[/／]/).map((s) => s.trim());
    return {
      entry,
      fullKey: cardSearchKey(entry.officialName),
      faces:
        faceNames.length > 1
          ? faceNames.map((name) => ({ name, key: cardSearchKey(name) }))
          : [],
      order,
    };
  });
  return {
    cards,
    byId: new Map(entries.map((e) => [e.cardId, e])),
  };
}

/** 0: 完全一致 / 1: 面の完全一致 / 2: 前方一致 / 3: 部分一致 / null: 不一致 */
function matchRank(card: IndexedCard, q: string): number | null {
  if (card.fullKey === q) return 0;
  const keys = [card.fullKey, ...card.faces.map((f) => f.key)];
  if (card.faces.some((f) => f.key === q)) return 1;
  if (keys.some((k) => k.startsWith(q))) return 2;
  if (card.fullKey.includes(q)) return 3;
  return null;
}

/**
 * ローカル索引での名前検索（入力中の候補・公式検索の前段）。
 * 完全一致 → 前方一致 → 部分一致、同順位は短い名前を先にする。
 */
export function searchCardNames(
  index: CardNameIndex,
  query: string,
  options?: { limit?: number },
): CardNameSearchResult {
  const limit = options?.limit ?? 30;
  const q = cardSearchKey(query);
  if (q.length < MIN_QUERY_KEY_LENGTH) return { total: 0, cards: [] };

  const hits: Array<{ card: IndexedCard; rank: number }> = [];
  for (const card of index.cards) {
    const rank = matchRank(card, q);
    if (rank != null) hits.push({ card, rank });
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.card.fullKey.length - b.card.fullKey.length ||
      a.card.order - b.card.order,
  );
  return {
    total: hits.length,
    cards: hits.slice(0, limit).map((h) => h.card.entry),
  };
}

type Mention = {
  start: number;
  end: number;
  /** term: キーワード能力名など。範囲を押さえるだけで候補は出さない */
  kind: QuestionSuggestionGroup["kind"] | "term";
  label: string;
  key: string;
  aliasCards?: CardIndexEntry[];
};

const KIND_PRIORITY: Record<Mention["kind"], number> = {
  name: 0,
  term: 1,
  alias: 2,
  token: 3,
};

/**
 * 質問文から「どのカードの話か」の候補を出す（送信前のカード確定UI向け）。
 *
 * 1. 正式名（ツインパクトは各面も）が質問文に含まれる
 * 2. 略称辞書のキーが質問文に含まれる
 * 3. 括弧内の語・カタカナ／英字の連なりを部分名とみなし、それを含むカードを探す
 *
 * reservedTerms（キーワード能力名など）は範囲だけ押さえ、その内側の部分名を拾わない
 * （「革命チェンジ」の「チェンジ」でカードを出さない）。
 * 重なる一致は長いほうを採り、同じ範囲なら 正式名 → 予約語 → 略称 → 部分名 の順に優先する。
 * 確定はしない（ユーザーが選ぶ）。
 */
export function suggestCardsFromQuestion(
  index: CardNameIndex,
  question: string,
  options?: {
    aliases?: AliasHint[];
    /** カード名ではない既知の語（キーワード能力名など） */
    reservedTerms?: string[];
    /** 部分名のヒット数がこれを超えたら汎用語とみなして捨てる */
    maxTokenHits?: number;
    perGroupLimit?: number;
    maxGroups?: number;
  },
): QuestionSuggestionGroup[] {
  const maxTokenHits = options?.maxTokenHits ?? 60;
  const perGroupLimit = options?.perGroupLimit ?? 8;
  const maxGroups = options?.maxGroups ?? 6;
  const text = cardSearchKey(question);
  if (!text) return [];
  // ひらがな→カタカナの寄せは1文字対1文字なので位置は text と一致する。
  // 語の切れ目判定だけは寄せる前の文字種で見る（「赤ゾで」の「で」を語の続きにしない）
  const raw = normalizeCardNameKey(question);

  const mentions: Mention[] = [];
  const pushMention = (m: Omit<Mention, "start" | "end">) => {
    for (
      let start = text.indexOf(m.key);
      start >= 0;
      start = text.indexOf(m.key, start + 1)
    ) {
      const end = start + m.key.length;
      if (cutsThroughWord(raw, start, end)) continue;
      mentions.push({ ...m, start, end });
      return;
    }
  };

  for (const card of index.cards) {
    const named = [
      { name: card.entry.officialName, key: card.fullKey },
      ...card.faces,
    ];
    for (const { name, key } of named) {
      if (key.length < MIN_MENTION_KEY_LENGTH || GAME_TERMS.has(key)) continue;
      pushMention({ kind: "name", label: name, key });
    }
  }

  for (const hint of options?.aliases ?? []) {
    const key = cardSearchKey(hint.alias);
    if (key.length < MIN_QUERY_KEY_LENGTH) continue;
    pushMention({
      kind: "alias",
      label: hint.alias.trim(),
      key,
      aliasCards: hint.candidates.map(
        (c) =>
          index.byId.get(c.cardId) ?? {
            cardId: c.cardId,
            officialName: c.officialName,
            civilizations: [],
            cost: null,
            cardType: null,
          },
      ),
    });
  }

  for (const term of options?.reservedTerms ?? []) {
    const key = cardSearchKey(term);
    if (key.length < MIN_QUERY_KEY_LENGTH) continue;
    pushMention({ kind: "term", label: term, key });
  }

  for (const token of extractNameTokens(question)) {
    const key = cardSearchKey(token);
    if (key.length < MIN_MENTION_KEY_LENGTH || GAME_TERMS.has(key)) continue;
    pushMention({ kind: "token", label: token, key });
  }

  const accepted = pickNonOverlapping(mentions);
  const groups: QuestionSuggestionGroup[] = [];
  for (const m of accepted) {
    if (m.kind === "term") continue;
    if (m.kind === "alias") {
      const cards = m.aliasCards ?? [];
      if (cards.length === 0) continue;
      groups.push({
        mention: m.label,
        kind: m.kind,
        total: cards.length,
        cards: cards.slice(0, perGroupLimit),
      });
      continue;
    }
    const found = searchCardNames(index, m.key, { limit: perGroupLimit });
    if (found.total === 0) continue;
    if (m.kind === "token" && found.total > maxTokenHits) continue;
    groups.push({ mention: m.label, kind: m.kind, ...found });
    if (groups.length >= maxGroups) break;
  }
  return groups;
}

function scriptClass(ch: string | undefined): "kana" | "latin" | null {
  if (!ch) return null;
  if (/[ァ-ヴー]/.test(ch)) return "kana";
  if (/[a-z0-9]/.test(ch)) return "latin";
  return null;
}

/**
 * 一致範囲がカタカナ語・英単語の途中で切れているか。
 * 「ブレ」が「ブレイク」に、「ドラゴン」が「ボルシャック・ドラゴン」の後半に
 * 当たるような、語の一部だけの一致を捨てる。
 */
function cutsThroughWord(raw: string, start: number, end: number): boolean {
  const joins = (a: string | undefined, b: string | undefined) => {
    const cls = scriptClass(a);
    return cls != null && cls === scriptClass(b);
  };
  return joins(raw[start - 1], raw[start]) || joins(raw[end - 1], raw[end]);
}

/** 長い一致を優先して重ならないものだけ残し、質問文の出現順に並べる */
function pickNonOverlapping(mentions: Mention[]): Mention[] {
  const sorted = [...mentions].sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) ||
      KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] ||
      a.start - b.start,
  );
  const accepted: Mention[] = [];
  for (const m of sorted) {
    const overlaps = accepted.some((a) => m.start < a.end && a.start < m.end);
    if (!overlaps) accepted.push(m);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

/** 括弧内の語と、カタカナ・英字の連なり（カード名の一部である可能性が高い） */
function extractNameTokens(question: string): string[] {
  const text = question.normalize("NFKC");
  const tokens: string[] = [];
  for (const m of text.matchAll(/[《「『]([^》」』]{2,40})[》」』]/g)) {
    if (m[1]) tokens.push(m[1].trim());
  }
  for (const m of text.matchAll(/[ァ-ヴー・]{3,}|[A-Za-z][A-Za-z'’]{2,}/g)) {
    const token = m[0].replace(/^・+|・+$/g, "");
    if (token) tokens.push(token);
  }
  return [...new Set(tokens)];
}
