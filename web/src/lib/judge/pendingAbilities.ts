/**
 * 待機中能力の誤読を防ぐヒント。
 * 「場を離れた／封印された＝もう解決できない・誘発しない」という短絡を止め、
 * 原則（110.5a / 116.2）を固定する。
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
  "出た時点で誘発条件を満たせば誘発する。『封印されたから誘発しない』は原則誤り（誘発と解決の混同）。",
  "誘発して待機した能力は、その後にソースがバトルゾーンを離れても／封印されても、待機効果自体は消えない（総合ルール 110.5a）。",
  "入れ替えやゾーン移動・封印のあとも、すでに待機した「攻撃する時」「出た時」等は解決順の対象になりうる。",
  "使用宣言・誘発と、その後の解決を混同しない。",
  "効果が発生源にバトル等をさせるタイプなら、解決時点で発生源が無視されている・バトル不能ならその行動は不発に終わる（待機は残っても行動できない）。",
  "手札に戻すなど発生源の行動を要しない待機効果は、発生源が離れても／封印されても解決できる。",
  "「離れたあとに攻撃時効果は使えない」「封印されたからメタは誘発しない」という結論は、取得済み公式根拠と矛盾しない説明がない限り禁止。",
];

/**
 * 入れ替え／ゾーン移動／封印のあとの誘発・待機・解決を問う質問を検出する。
 */
export function matchPendingAbilityHints(input: {
  question: string;
  entities?: string[];
  cardTexts?: string[];
}): PendingAbilityMatch | null {
  const haystack = normalize(
    [input.question, ...(input.entities ?? []), ...(input.cardTexts ?? [])].join(
      "\n",
    ),
  );
  const q = normalize(input.question);

  const sourceCompromised =
    q.includes(normalize("革命チェンジ")) ||
    q.includes(normalize("革命・チェンジ")) ||
    q.includes(normalize("入れ替え")) ||
    q.includes(normalize("離れた")) ||
    q.includes(normalize("手札に戻")) ||
    q.includes(normalize("破壊")) ||
    q.includes(normalize("封印")) ||
    q.includes(normalize("無視"));
  if (!sourceCompromised) return null;

  const asksOrder =
    q.includes(normalize("出た時")) ||
    q.includes(normalize("攻撃する時")) ||
    q.includes(normalize("攻撃時")) ||
    q.includes(normalize("使ってから")) ||
    q.includes(normalize("その後")) ||
    q.includes(normalize("順番")) ||
    q.includes(normalize("順序")) ||
    q.includes(normalize("解決順"));

  // 封印×メタ／誘発・発動の成否（解決失敗との区別）
  const asksTriggerOrResolve =
    q.includes(normalize("誘発")) ||
    q.includes(normalize("発動")) ||
    q.includes(normalize("メタ効果")) ||
    q.includes(normalize("メタは")) ||
    q.includes(normalize("効果は")) ||
    q.includes(normalize("バトルさせ")) ||
    q.includes(normalize("バトルできる")) ||
    q.includes(normalize("バトルでき")) ||
    haystack.includes(normalize("バトルさせてもよい"));

  if (!asksOrder && !asksTriggerOrResolve) return null;

  const concept = getConceptById("pending_abilities");
  return {
    label: concept?.label ?? "誘発と待機・解決順",
    qaQueries: [
      "入れ替え 攻撃する時 その後",
      "離れた 攻撃する時 解決",
      "出た時 攻撃する時 順番",
      "封印 誘発 待機 解決",
      "バトルさせ 場を離れた",
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
