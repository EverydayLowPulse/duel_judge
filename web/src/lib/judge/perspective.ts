/**
 * 「自分／相手」は能力コントローラー視点。
 * 強制選択はカード名ではなく、能力テキストのパターンで検出する。
 */
import { getConceptById } from "../rules/ontology/concepts";

export type PerspectiveMatch = {
  label: string;
  qaQueries: string[];
  seedQaIds: string[];
  constraints: string[];
};

/** 強制選択・視点ずらしに見える能力テキスト（カード名に依存しない） */
const FORCED_SELECTION_PATTERNS: RegExp[] = [
  /相手が.{0,24}を選ぶ時/,
  /相手が.{0,24}を選ぶなら/,
  /相手がクリーチャーを選ぶ/,
  /可能ならこのクリーチャーを選ぶ/,
  /このクリーチャーを選ばなければ/,
  /相手が.{0,16}選ぶ時[、,]?かわりに/,
  /かわりに.{0,16}選ぶ/,
];

const PERSPECTIVE_CONSTRAINTS = [
  "カードテキストの「自分」「相手」は、その能力を持つカードのコントローラー視点である。質問者視点ではない。",
  "質問者が自分のカードを選びたい場合でも、相手の「相手が〜を選ぶ時」能力の「相手」に該当しうる。",
  "「自分のカードを選ぶから相手の強制選択は発動しない」という推論は禁止。取得済みの類似公式Q&Aを優先する。",
  "バトルゾーンのクリーチャーを選ぶ効果（「クリーチャーを1体選び〜」など、自分のみに限定されていない選択）には、強制選択が適用されうる。",
  "『クリーチャー1体またはタマシード1枚』のように OR 選択でも、強制選択側のクリーチャーが選べるなら必ずそれを選ぶ。タマシード専用フェーズに分けて回避できない（qa/45555）。",
  "ツインパクトは表（クリーチャー側）と裏（呪文側）を混同しない。質問が「〜の術」「唱える」なら呪文側の選択効果を見る。",
];

/**
 * 質問・解決済みカード能力から、視点誤読リスクと強制選択を検出する。
 */
export function matchPerspectiveHints(input: {
  question: string;
  cardTexts?: string[];
  entities?: string[];
}): PerspectiveMatch | null {
  const cardTexts = input.cardTexts ?? [];
  const forcedFromText = cardTexts.filter((text) =>
    FORCED_SELECTION_PATTERNS.some((re) => re.test(text.normalize("NFKC"))),
  );

  // 能力テキストで強制選択が取れないときだけ、質問側の典型句で補助
  const questionSuggestsForced =
    /相手が.{0,12}選ぶ|強制選択|かわりに.{0,8}選/.test(
      input.question.normalize("NFKC"),
    );

  // 強制選択の兆候が無い一般の「自分／相手」質問までは広げない
  if (forcedFromText.length === 0 && !questionSuggestsForced) return null;

  const concept = getConceptById("perspective");
  const label =
    forcedFromText.length > 0
      ? "強制選択（能力テキスト）"
      : "強制選択（質問主張）";

  return {
    label,
    qaQueries: [
      "相手が 選ぶ時 かわりに",
      "クリーチャーを選ぶ 相手",
      "強制選択 自分のクリーチャー",
      "同期の妖精 タマシード 選ぶ",
      "クリーチャーもタマシードも選べる",
    ],
    seedQaIds: concept?.qaSeeds ?? [],
    constraints: [
      ...PERSPECTIVE_CONSTRAINTS,
      ...(concept?.invariants.map((i) => `[視点] ${i}`) ?? []),
      ...(concept?.commonFallacies.map((f) => `[視点・禁止推論] ${f}`) ?? []),
      "perspectiveChecks では強制選択側の「相手」を必ず検証し、relativeToController=yes であること。",
      "結論が「強制選択を回避できる／自分だけを選べる／タマシードだけ選べる」なら、取得済み類似Q&A（特に qa/45555）と矛盾しない説明が必要。",
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
