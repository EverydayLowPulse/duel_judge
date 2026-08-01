/**
 * 回帰: 置換ブレイク × G城墓地置換 → 手札（qa/48504）論点が立つこと。
 */
import type { ScenarioFacts } from "../src/lib/judge/facts/types";
import { classifyIssues } from "../src/lib/judge/issues/classifyIssues";
import {
  shouldRunReplacementBreakHand,
  validateReplacementBreakHand,
} from "../src/lib/judge/validators/replacementBreakHand";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const gCastleText =
  "相手のクリーチャーがシールドを１つ以上ブレイクする時、かわりにこのシールドをブレイクさせてもよい。このカードが表向きで自分のシールドゾーンを離れる時、かわりに墓地に置く。";

const question =
  "我竜塔第一層セイントキャッスルの置換ブレイクを使ったとき、セイントキャッスルは手札に戻りますか（墓地置換は効きますか）";

const facts: ScenarioFacts = {
  question,
  entities: [],
  actions: [],
  manaZone: [],
  timelineNotes: [],
};

const issues = classifyIssues({
  question,
  facts,
  cardTexts: [gCastleText],
  entities: ["セイントキャッスル"],
});

assert(
  issues.matches.some((m) => m.kind === "replacement_effect"),
  `replacement_effect should open, got ${issues.matches.map((m) => m.kind).join(",")}`,
);
assert(
  issues.seedQaIds.includes("48504"),
  `48504 should be seeded, got ${issues.seedQaIds.join(",")}`,
);
assert(
  issues.constraints.some((c) => /連鎖|置換ブレイク|手札/.test(c)),
  "constraint should mention non-chaining / hand",
);

assert(
  shouldRunReplacementBreakHand({ question, issues }),
  "replacement_break_hand should run for 置換ブレイク×行き先",
);
const verdict = validateReplacementBreakHand({
  question,
  facts,
  issues,
});
assert(verdict.verdict === "allowed", `expected allowed, got ${verdict.verdict}`);
assert(/手札/.test(verdict.reason), "reason should mention 手札");

// 偽陽性: シールドブレイク＋ST出＋Zラッシュ。カード文に「かわりに」があっても置換論点は立てない。
const zRushQuestion =
  "シールドをブレイクされた際、ボルシャックマントラをSTで出しました。同時にZラッシュを起動することは可能ですか";
const zRushCardText =
  "S・トリガー\nこのクリーチャーをバトルゾーンに出した時、カードを1枚引いてもよい。\nZラッシュ：自分か相手のシールドが離れた時、かわりに〜"; // わざと「かわりに」を含む
const zRushIssues = classifyIssues({
  question: zRushQuestion,
  facts: {
    question: zRushQuestion,
    entities: [],
    actions: [],
    manaZone: [],
    timelineNotes: [],
  },
  cardTexts: [zRushCardText],
  entities: ["ボルシャック・マントラ"],
});
assert(
  !zRushIssues.matches.some((m) => m.kind === "replacement_effect"),
  `Zラッシュ質問で replacement_effect が誤発火: ${zRushIssues.matches
    .map((m) => m.kind)
    .join(",")}`,
);

console.log("OK replacement break seeds 48504 + deterministic hand");
