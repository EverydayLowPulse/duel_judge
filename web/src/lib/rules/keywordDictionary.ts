/**
 * キーワード能力 → 総合ルール節番号の静的辞書。
 * 曖昧検索に頼らず、質問に能力名が出た時点で該当ルールを注入する（索引 v2 の萌芽）。
 *
 * 注: 「侵略」自体は総合ルールに定義見出しが無いカード能力名なので、
 * 使用宣言・攻撃時誘発の共通ルールへマッピングする。
 */
export type KeywordRuleMapping = {
  /** 正規化後の照合キー（中黒・空白除去後） */
  key: string;
  /** UI・デバッグ用の表示名 */
  label: string;
  /** 注入するルール番号（索引に存在するものを優先） */
  ruleRefs: string[];
  /** 質問・プランからの検出用エイリアス（正規化前でも可） */
  aliases: string[];
};

export const KEYWORD_RULE_DICTIONARY: KeywordRuleMapping[] = [
  {
    key: "侵略",
    label: "侵略",
    aliases: ["侵略"],
    ruleRefs: ["506.3a", "506.3b", "506.3c", "603.2e", "603.2f"],
  },
  {
    key: "革命チェンジ",
    label: "革命チェンジ",
    aliases: ["革命チェンジ", "革命・チェンジ"],
    ruleRefs: [
      "110.5a",
      "506.3a",
      "506.3b",
      "506.3c",
      "603.2",
      "603.2e",
      "603.2f",
      "701.26a",
      "701.26b",
      "803.2",
      "803.2a",
    ],
  },
  {
    key: "G-NEO",
    label: "G-NEO",
    aliases: ["G-NEO", "GNEO", "G-NEO進化", "GNEO進化"],
    ruleRefs: ["803.1", "803.2", "803.2a", "701.26b"],
  },
  {
    key: "スター進化",
    label: "スター進化",
    aliases: ["スター進化", "スター・進化"],
    ruleRefs: ["701.26a", "701.26b"],
  },
  {
    key: "ニンジャストライク",
    label: "ニンジャ・ストライク",
    aliases: ["ニンジャストライク", "ニンジャ・ストライク", "ニンジャ"],
    ruleRefs: ["112.3c", "110.4d", "603.2e", "603.2f", "506.3b"],
  },
  {
    key: "使用宣言",
    label: "使用宣言",
    aliases: ["使用宣言", "宣言タイミング"],
    ruleRefs: ["506.3b", "506.3c", "603.2e", "603.2f"],
  },
  {
    key: "Sトリガー",
    label: "S・トリガー",
    aliases: ["S・トリガー", "Sトリガー", "シールドトリガー"],
    ruleRefs: ["112.3a", "113.6", "113.6a"],
  },
  {
    key: "Zラッシュ",
    label: "Zラッシュ",
    aliases: ["Zラッシュ", "Z・ラッシュ", "Z-ラッシュ"],
    // 常在型（シールドが離れたときのハイパーモード解放）。詳細は公式Q&A 48466 系。
    ruleRefs: ["110.1", "110.3c"],
  },
  {
    key: "無月の門",
    label: "無月の門",
    aliases: ["無月の門"],
    ruleRefs: ["603.2e", "603.2f"],
  },
  {
    key: "ジャストダイバー",
    label: "ジャストダイバー",
    aliases: ["ジャストダイバー", "Just Diver"],
    ruleRefs: ["801.2"],
  },
  {
    key: "進化効果継続",
    label: "進化と効果の継続",
    aliases: ["進化先に引き継", "効果が引き継", "受けていた効果"],
    ruleRefs: ["801.2", "801.4c"],
  },
  {
    key: "置換効果",
    label: "置換効果",
    // 「かわりに」単体は日常語と衝突しやすいので使わない
    aliases: ["置換効果", "かわりに"],
    ruleRefs: ["101.5", "101.5a", "101.5b", "110.2d"],
  },
  {
    key: "誘発型能力",
    label: "誘発型能力",
    aliases: ["誘発型能力"],
    ruleRefs: ["110.3b", "603.2", "603.2e", "603.2f"],
  },
  {
    key: "封印",
    label: "封印",
    aliases: ["封印", "封印する"],
    ruleRefs: ["116.2", "116.2a", "110.5a"],
  },
];
export type MatchedKeyword = {
  label: string;
  ruleRefs: string[];
};

/**
 * 質問文・検索プランからキーワード能力を検出し、注入すべきルール番号を返す。
 */
export function matchKeywordRules(texts: string[]): {
  matches: MatchedKeyword[];
  ruleRefs: string[];
} {
  const haystack = normalize(texts.join("\n"));
  const matches: MatchedKeyword[] = [];
  const ruleRefs = new Set<string>();

  for (const entry of KEYWORD_RULE_DICTIONARY) {
    const needles = [entry.key, ...entry.aliases].map(normalize);
    if (!needles.some((needle) => needle.length >= 2 && haystack.includes(needle))) {
      continue;
    }
    matches.push({ label: entry.label, ruleRefs: [...entry.ruleRefs] });
    for (const ref of entry.ruleRefs) ruleRefs.add(ref);
  }

  return {
    matches,
    ruleRefs: [...ruleRefs],
  };
}

/**
 * 語句そのものがキーワード能力名か（カード名解決の対象外判定用）。
 * 部分一致は使わない（「轟く侵略 レッドゾーン」を誤除外しないため）。
 */
export function isKnownKeywordAbilityName(mention: string): boolean {
  const key = normalize(mention);
  if (key.length < 2) return false;
  return KEYWORD_RULE_DICTIONARY.some((entry) =>
    [entry.key, ...entry.aliases].some((alias) => normalize(alias) === key),
  );
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫\-－]/g, "")
    .toLowerCase();
}
