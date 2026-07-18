/**
 * 「自分／相手」の指示語は、能力を持つカードのコントローラー視点。
 * LLMが「自分のクリーチャーを選ぶ＝相手ではない」と誤読するのを防ぐための決定的ヒント。
 */

export type PerspectiveMatch = {
  label: string;
  /** 追加で走らせる Q&A 検索語 */
  qaQueries: string[];
  /** 必ず候補に残したい公式Q&A ID（類似判例の錨） */
  seedQaIds: string[];
  /** 回答生成・検証へ渡す論理制約（出典ではない） */
  constraints: string[];
};

const FORCED_SELECTION_CARDS: Array<{
  key: string;
  aliases: string[];
  seedQaIds: string[];
  qaQueries: string[];
}> = [
  {
    key: "同期の妖精",
    aliases: ["同期の妖精", "シンクロフェアリー", "ド浮きの動悸"],
    // 自分クリーチャーを選びたいが妖精に吸われる典型判例
    seedQaIds: ["43917", "43918", "44101"],
    qaQueries: [
      "同期の妖精 選ぶ",
      "同期の妖精 スパイラル",
      "同期の妖精 自分のクリーチャー",
    ],
  },
];

const PERSPECTIVE_CONSTRAINTS = [
  "カードテキストの「自分」「相手」は、その能力を持つカードのコントローラー視点である。質問者視点ではない。",
  "質問者が自分のクリーチャーを選びたい場合でも、相手の「相手がクリーチャーを選ぶ時」能力の「相手」に該当しうる。",
  "「自分のカードを選ぶから相手の強制選択は発動しない」という推論は禁止。公式Q&A（例: スパイラル・ゲートと同期の妖精 = qa/43917）を優先する。",
  "バトルゾーンのクリーチャーを選ぶ効果（「クリーチャーを1体選び〜」など、自分のみに限定されていない選択）には、同期の妖精の強制選択が適用される。",
  "ツインパクトカードは表（クリーチャー側）と裏（呪文側）を混同しない。質問が「〜の術」「唱える」「アンタップしたい」なら呪文側の選択効果を見る。",
];

/**
 * 質問・カード能力から、視点誤読リスクと強制選択カードを検出する。
 */
export function matchPerspectiveHints(input: {
  question: string;
  cardTexts?: string[];
  entities?: string[];
}): PerspectiveMatch | null {
  const haystack = normalize(
    [input.question, ...(input.cardTexts ?? []), ...(input.entities ?? [])].join(
      "\n",
    ),
  );

  const matchedCards = FORCED_SELECTION_CARDS.filter((card) =>
    [card.key, ...card.aliases].some((alias) =>
      haystack.includes(normalize(alias)),
    ),
  );

  const hasDeixis =
    haystack.includes(normalize("相手が")) ||
    haystack.includes(normalize("相手の")) ||
    haystack.includes(normalize("自分の")) ||
    haystack.includes(normalize("選ぶ"));

  if (matchedCards.length === 0 && !hasDeixis) return null;
  // 強制選択カードが無いのに「選ぶ」だけの一般質問までは広げすぎない
  if (matchedCards.length === 0) return null;

  const qaQueries = unique(matchedCards.flatMap((c) => c.qaQueries));
  const seedQaIds = unique(matchedCards.flatMap((c) => c.seedQaIds));
  const labels = matchedCards.map((c) => c.key).join("・");

  return {
    label: labels,
    qaQueries,
    seedQaIds,
    constraints: [
      ...PERSPECTIVE_CONSTRAINTS,
      `本件では次の強制選択系カードが関与しうる: ${labels}`,
      "自分のクリーチャーへ効果を向けたい場合でも、可能なら強制選択対象を選ぶ必要があるかを先に判定すること。",
      "perspectiveChecks では強制選択カード側の「相手」を必ず検証し、相対ToController=yes であること。",
      "結論が「吸われない／自分を選べる」なら、なぜ qa/43917 と矛盾しないかを constraints で説明できない限り not_allowed 側へ倒す。",
    ],
  };
}

export function formatPerspectiveConstraints(
  match: PerspectiveMatch | null,
): string | undefined {
  if (!match?.constraints.length) return undefined;
  return `【視点・強制選択の固定（内部制約。evidenceには引用しない）】\n${match.constraints
    .map((c) => `- ${c}`)
    .join("\n")}`;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
