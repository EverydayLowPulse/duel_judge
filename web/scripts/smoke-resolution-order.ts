/**
 * 回帰: 処理順フェーズの起動ゲート。
 * - 解決順・同時誘発が論点なら orderRelevant / resolution_order
 * - 無関係なマナ支払いだけではスキップ
 * - 封印×メタは pending 経由でも orderRelevant
 * LLM は呼ばない（検出のみ）。
 */
import { classifyIssues } from "../src/lib/judge/issues/classifyIssues";
import {
  formatResolutionOrderConstraints,
  type ResolutionOrderVerification,
} from "../src/lib/llm/resolutionOrderVerifier";
import {
  isOrderRelevant,
  matchResolutionOrderHints,
} from "../src/lib/judge/resolutionOrder";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function emptyFacts(question: string) {
  return {
    question,
    entities: [] as string[],
    actions: [] as [],
    manaZone: [] as [],
    timelineNotes: [] as string[],
  };
}

function main() {
  const orderQ =
    "相手の場のメタの『出た時』と、自分が出したクリーチャーの『出た時』が同時に誘発したとき、解決順はどうなりますか？ターンプレイヤーからですか？";
  const orderIssues = classifyIssues({
    question: orderQ,
    facts: emptyFacts(orderQ),
  });
  assert(orderIssues.orderRelevant, "order question should be orderRelevant");
  assert(
    orderIssues.matches.some((m) => m.kind === "resolution_order"),
    "resolution_order issue should open",
  );
  assert(
    matchResolutionOrderHints({ question: orderQ }),
    "matchResolutionOrderHints should hit",
  );
  console.log("OK orderRelevant on 解決順 / 同時誘発");

  const sealQ =
    "相手の場にデスマッチ・ビートルがあり、3マナしかない状態でブラックゾーンをS級侵略で出してデスマッチを封印した場合、デスマッチのメタ効果は発動しますか？";
  const sealIssues = classifyIssues({
    question: sealQ,
    facts: emptyFacts(sealQ),
    cardTexts: [
      "相手のターン中、相手のクリーチャーがコストを支払わずに出た時、このクリーチャーとそのクリーチャーをバトルさせてもよい。",
    ],
  });
  assert(sealIssues.orderRelevant, "seal×meta should be orderRelevant via pending");
  assert(
    sealIssues.matches.some((m) => m.kind === "pending_abilities"),
    "pending_abilities should still open",
  );
  assert(
    sealIssues.matches.some((m) => m.kind === "resolution_order"),
    "resolution_order should also open when pending",
  );
  console.log("OK orderRelevant on pending_abilities path");

  const manaQ =
    "マナゾーンに光と水が1枚ずつあるとき、コスト2の光水多色を通常コストで召喚できますか？";
  const manaIssues = classifyIssues({
    question: manaQ,
    facts: emptyFacts(manaQ),
  });
  assert(!manaIssues.orderRelevant, "mana-only question must not be orderRelevant");
  assert(
    !manaIssues.matches.some((m) => m.kind === "resolution_order"),
    "resolution_order must not open for mana-only",
  );
  assert(
    !isOrderRelevant({ question: manaQ }),
    "isOrderRelevant should be false for mana-only",
  );
  console.log("OK skip on unrelated mana question");

  const sample: ResolutionOrderVerification = {
    needed: true,
    windowStart: {
      event: "クリーチャーが出た時",
      reason: "同時誘発の開始点",
    },
    triggers: [
      {
        controller: "ターンプレイヤー",
        abilitySummary: "出た時効果A",
        triggerTiming: "出た時",
        status: "triggered",
      },
    ],
    resolutionQueue: [
      {
        order: 1,
        controller: "ターンプレイヤー",
        abilitySummary: "出た時効果A",
        note: "101.4a によりTP先。同プレイヤー間は任意",
      },
    ],
    resolutions: [
      {
        effect: "出た時効果A",
        outcome: "resolves",
        reason: "解決時点で条件を満たす",
      },
    ],
    constraintsForAnswer: [
      "同時誘発の解決はターンプレイヤーの待機から（101.4a）",
    ],
  };
  const formatted = formatResolutionOrderConstraints(sample);
  assert(formatted, "formatResolutionOrderConstraints should render");
  assert(
    formatted.includes("処理順Observation"),
    "formatted block should be labeled",
  );
  assert(formatted.includes("101.4a"), "formatted should keep short TP constraint");
  assert(
    !formatResolutionOrderConstraints({
      ...sample,
      needed: false,
    }),
    "needed=false should omit block",
  );
  console.log("OK formatResolutionOrderConstraints");

  console.log("smoke-resolution-order: all passed");
}

main();
