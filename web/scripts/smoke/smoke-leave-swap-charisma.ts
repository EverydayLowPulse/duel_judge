/**
 * 回帰: 「破壊される時、かわりにマナゾーンに置く」は入れ替え阻害ではない。
 * 侵略だけの質問では swap_effect 論点を立てない。
 */
import { buildLeaveReplacementHints } from "../../src/lib/judge/facts/leaveReplacement";
import type { ScenarioFacts } from "../../src/lib/judge/facts/types";
import { classifyIssues } from "../../src/lib/judge/issues/classifyIssues";
import type { ScenarioCard } from "../../src/lib/judge/scenarioCards";
import type { OfficialCard } from "../../src/lib/official/types";
import {
  shouldRunDestroyManaNotSwapBlocker,
  validateDestroyManaNotSwapBlocker,
} from "../../src/lib/judge/validators/destroyManaNotSwapBlocker";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const charisma: OfficialCard = {
  cardId: "charisma-test",
  officialName: "SSS級侵略 カリスマ・ゾーン",
  productLabel: null,
  detailUrl: "https://example.test/charisma",
  civilizations: ["火"],
  races: [],
  abilityText:
    "バトルゾーンにあるこのクリーチャーが破壊される時、かわりにマナゾーンに置く。",
  cardType: "クリーチャー",
  power: "12000",
  cost: "7",
  manaValue: 1,
  faces: [
    {
      cardType: "クリーチャー",
      abilityText:
        "バトルゾーンにあるこのクリーチャーが破壊される時、かわりにマナゾーンに置く。",
    },
  ],
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

const scenarioCards: ScenarioCard[] = [
  {
    mention: "カリスマゾーン",
    role: "other",
    relevantAbility: "",
    card: charisma,
  },
];

const invasionQ =
  "ダーバンデで攻撃しカリスマゾーンで侵略しつつメカくしを唱えダーバンデの効果でアンタップ、2回目の攻撃でレッドゾーンFで侵略、攻撃終了時にFの効果でアンタップできる？";

const hints = buildLeaveReplacementHints({
  question: invasionQ,
  scenarioCards,
});

assert(
  !hints.some((h) => h.blocksSwap),
  `destroy→mana must not blocksSwap: ${JSON.stringify(hints)}`,
);
assert(
  hints.some((h) => !h.blocksSwap && /破壊/.test(h.evidence)),
  "destroy→mana should leave an explicit non-blocker hint",
);

const facts: ScenarioFacts = {
  question: invasionQ,
  entities: [],
  actions: [
    { kind: "attack", source: "user" },
    { kind: "cast", source: "user" },
    { kind: "other", source: "user" },
  ],
  manaZone: [],
  leaveReplacement: hints,
  timelineNotes: [],
};

const { matches } = classifyIssues({
  question: invasionQ,
  facts,
  cardTexts: [charisma.abilityText],
});

assert(
  !matches.some((m) => m.kind === "swap_effect"),
  `侵略-only must not open swap_effect: ${matches.map((m) => m.kind).join(",")}`,
);

// 対照: 革命チェンジを問うと論点は立つ（阻害ヒント無しでも）
const swapQ = "カリスマゾーンがいるとき革命チェンジで入れ替えできる？";
const swapFacts: ScenarioFacts = {
  ...facts,
  question: swapQ,
  actions: [{ kind: "replace", source: "user" }],
};
const swapIssues = classifyIssues({
  question: swapQ,
  facts: swapFacts,
  cardTexts: [charisma.abilityText],
});
assert(
  swapIssues.matches.some((m) => m.kind === "swap_effect"),
  "replace question should open swap_effect",
);
assert(
  swapIssues.matches.find((m) => m.kind === "swap_effect")?.validatorId !==
    "swap_leave_replacement",
  "without blocksSwap, swap_leave_replacement validator must not attach",
);

const failureQ =
  "SSS級侵略カリスマゾーンがいるとき、破壊時かわりにマナに置く効果のせいで侵略や入れ替えは失敗しますか？";
const failureFacts: ScenarioFacts = {
  ...facts,
  question: failureQ,
  leaveReplacement: buildLeaveReplacementHints({
    question: failureQ,
    scenarioCards,
  }),
};
assert(
  shouldRunDestroyManaNotSwapBlocker({
    question: failureQ,
    facts: failureFacts,
  }),
  "destroy_mana_not_swap_blocker should run",
);
assert(
  validateDestroyManaNotSwapBlocker({
    question: failureQ,
    facts: failureFacts,
    issues: {
      matches: [],
      qaQueries: [],
      seedQaIds: [],
      ruleRefs: [],
      constraints: [],
    },
  }).verdict === "allowed",
  "destroy→mana must be allowed (not a swap blocker)",
);

console.log(
  "OK: Charisma destroy→mana is not swap blocker; invasion ≠ swap issue",
);
