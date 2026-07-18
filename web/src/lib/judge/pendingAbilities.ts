/**
 * 革命チェンジ後の「待機中能力」誤読を防ぐヒント。
 * 「場を離れた＝攻撃時効果は使えない」という短絡を止め、公式Q&Aを錨にする。
 */

export type PendingAbilityMatch = {
  label: string;
  qaQueries: string[];
  seedQaIds: string[];
  constraints: string[];
};

const PENDING_CONSTRAINTS = [
  "誘発して待機した能力は、その後にソースがバトルゾーンを離れても解決できる（総合ルール 110.5a）。「場にいないから使えない」は原則誤り。",
  "革命チェンジで手札に戻った元攻撃クリーチャーの「攻撃する時」能力は、入れ替え後も解決できる（公式Q&A qa/39355）。",
  "革命チェンジの入れ替え後、元クリーチャーの「攻撃する時」と新クリーチャーの「出た時」は好きな順番で解決できる（公式Q&A qa/39067）。",
  "革命チェンジと元クリーチャーの「攻撃する時」はどちらも攻撃時に誘発・待機する。先に革命チェンジを解決してから「出た時」→「攻撃する時」の順も可能（qa/44747）。",
  "「革命チェンジで離れたあとに攻撃時効果は使えない」という結論は、qa/39355 と矛盾しない説明ができない限り禁止。",
];

/**
 * 革命チェンジと出た時／攻撃時の順序を問う質問を検出する。
 */
export function matchPendingAbilityHints(input: {
  question: string;
  entities?: string[];
}): PendingAbilityMatch | null {
  const haystack = normalize(
    [input.question, ...(input.entities ?? [])].join("\n"),
  );

  const hasRevolution =
    haystack.includes(normalize("革命チェンジ")) ||
    haystack.includes(normalize("革命・チェンジ"));
  if (!hasRevolution) return null;

  // 「AからBに革命チェンジできるか」だけでは拾わない（「から」は接続に多用される）
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

  return {
    label: "革命チェンジ後の待機能力",
    qaQueries: [
      "革命チェンジ 攻撃する時 入れ替えた後",
      "革命チェンジ 出た時 攻撃する時 順番",
      "革命チェンジ 離れた 攻撃する時",
    ],
    seedQaIds: ["39355", "39067", "44747"],
    constraints: [
      ...PENDING_CONSTRAINTS,
      "本件は革命チェンジ後の能力解決順の質問として扱い、qa/39355・qa/39067 を主根拠候補にする。",
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
