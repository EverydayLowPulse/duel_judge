/**
 * 待機中能力の誤読を防ぐヒント。
 * 「場を離れた＝もう解決できない」という短絡を止め、原則（110.5a）を固定する。
 * 代表Q&A ID は ontology の qaSeeds 経由で注入し、ここには書かない。
 */
import { getConceptById } from "../rules/ontology/concepts";

export type PendingAbilityMatch = {
  label: string;
  qaQueries: string[];
  seedQaIds: string[];
  constraints: string[];
};

const PENDING_CONSTRAINTS = [
  "誘発して待機した能力は、その後にソースがバトルゾーンを離れても解決できる（総合ルール 110.5a）。「場にいないから使えない」は原則誤り。",
  "入れ替えやゾーン移動のあとも、すでに待機した「攻撃する時」「出た時」等は解決順の対象になりうる。",
  "使用宣言・誘発と、その後の解決を混同しない。",
  "「離れたあとに攻撃時効果は使えない」という結論は、取得済み公式根拠と矛盾しない説明がない限り禁止。",
];

/**
 * 入れ替え／ゾーン移動のあとの能力解決順を問う質問を検出する。
 */
export function matchPendingAbilityHints(input: {
  question: string;
  entities?: string[];
}): PendingAbilityMatch | null {
  const haystack = normalize(
    [input.question, ...(input.entities ?? [])].join("\n"),
  );

  const hasSwapOrLeave =
    haystack.includes(normalize("革命チェンジ")) ||
    haystack.includes(normalize("革命・チェンジ")) ||
    haystack.includes(normalize("入れ替え")) ||
    haystack.includes(normalize("離れた")) ||
    haystack.includes(normalize("手札に戻"));
  if (!hasSwapOrLeave) return null;

  const asksOrder =
    haystack.includes(normalize("出た時")) ||
    haystack.includes(normalize("攻撃する時")) ||
    haystack.includes(normalize("攻撃時")) ||
    haystack.includes(normalize("使ってから")) ||
    haystack.includes(normalize("その後")) ||
    haystack.includes(normalize("順番")) ||
    haystack.includes(normalize("順序")) ||
    haystack.includes(normalize("解決順"));

  if (!asksOrder) return null;

  const concept = getConceptById("pending_abilities");
  return {
    label: concept?.label ?? "誘発と待機・解決順",
    qaQueries: [
      "入れ替え 攻撃する時 その後",
      "離れた 攻撃する時 解決",
      "出た時 攻撃する時 順番",
    ],
    seedQaIds: concept?.qaSeeds ?? [],
    constraints: [
      ...PENDING_CONSTRAINTS,
      ...(concept?.invariants.map((i) => `[待機] ${i}`) ?? []),
      ...(concept?.commonFallacies.map((f) => `[待機・禁止推論] ${f}`) ?? []),
    ],
  };
}

export function formatPendingAbilityConstraints(
  match: PendingAbilityMatch | null,
): string | undefined {
  if (!match?.constraints.length) return undefined;
  return `【待機中能力・解決順の固定（内部制約。evidenceには引用しない）】\n${match.constraints
    .map((c) => `- ${c}`)
    .join("\n")}`;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}
