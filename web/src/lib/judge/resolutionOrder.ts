/**
 * 処理順検証フェーズの安価な起動ゲート。
 * 原則全文はここに置かず、LLM フェーズ（resolutionOrderVerifier）の system にだけ置く。
 */
import { getConceptById } from "../rules/ontology/concepts";

export type ResolutionOrderMatch = {
  label: string;
  qaQueries: string[];
  seedQaIds: string[];
  /** 検索用。回答プロンプトへ原則を積み増ししないため空寄り */
  constraints: string[];
  ruleRefs: string[];
};

const ORDER_SIGNALS = [
  "同時",
  "順番",
  "順序",
  "解決順",
  "処理順",
  "どっちが先",
  "どちらが先",
  "先に解決",
  "どちらから",
  "どっちから",
  "誘発したあと",
  "誘発した後",
  "誘発してから",
  "待機",
  "ターンプレイヤ",
  "ターンプレイヤー",
  "非ターンプレイヤ",
  "非ターンプレイヤー",
];

const TRIGGER_TIMINGS = [
  "出た時",
  "出たとき",
  "攻撃する時",
  "攻撃時",
  "破壊された時",
  "破壊されたとき",
  "離れた時",
  "離れたとき",
  "ブレイクされた時",
  "ブレイクする時",
];

/**
 * 処理順・同時誘発・解決キューが論点になりうるか（LLM フェーズ起動用）。
 */
export function isOrderRelevant(input: {
  question: string;
  entities?: string[];
  cardTexts?: string[];
  /** pending_abilities など既に立っている論点 */
  pendingMatched?: boolean;
}): boolean {
  if (input.pendingMatched) return true;
  return (
    matchResolutionOrderHints(input) !== null ||
    hasMultipleTriggerTimings(input.question)
  );
}

/**
 * 純粋な処理順シグナル（封印×待機以外）の検出。
 * マッチしても constraints はほぼ空（原則は verify_resolution_order 側）。
 */
export function matchResolutionOrderHints(input: {
  question: string;
  entities?: string[];
  cardTexts?: string[];
}): ResolutionOrderMatch | null {
  const q = normalize(input.question);
  const hasSignal = ORDER_SIGNALS.some((s) => q.includes(normalize(s)));
  const multiTrigger = hasMultipleTriggerTimings(input.question);
  if (!hasSignal && !multiTrigger) return null;

  const concept = getConceptById("resolution_order");
  return {
    label: concept?.label ?? "効果の処理順",
    qaQueries: [
      "効果 処理 順番",
      "ターンプレイヤー 待機 解決",
      "同時に誘発 解決順",
      "誘発 待機 解決",
    ],
    seedQaIds: concept?.qaSeeds ?? [],
    ruleRefs: concept?.ruleRefs ?? ["101.4", "101.4a", "110.5a"],
    constraints: [],
  };
}

export function hasMultipleTriggerTimings(question: string): boolean {
  const q = normalize(question);
  let count = 0;
  for (const timing of TRIGGER_TIMINGS) {
    if (q.includes(normalize(timing))) count += 1;
    if (count >= 2) return true;
  }
  return false;
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}
