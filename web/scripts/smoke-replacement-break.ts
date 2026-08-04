/**
 * 回帰: 置換論点（かわりに／置換）と汎用原則（連鎖しない・句点範囲 101.5a）。
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
  issues.constraints.some((c) => /句点|101\.5a/.test(c)),
  "generic period-scope (101.5a) should be injected",
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

// 「かわりに」があれば置換論点（カード文のみでも可）。ケース特化の検出はしない。
const zRushQuestion =
  "シールドをブレイクされた際、ボルシャックマントラをSTで出しました。同時にZラッシュを起動することは可能ですか";
const zRushCardText =
  "S・トリガー\nこのクリーチャーをバトルゾーンに出した時、カードを1枚引いてもよい。\nZラッシュ：自分か相手のシールドが離れた時、かわりに〜";
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
  zRushIssues.matches.some((m) => m.kind === "replacement_effect"),
  "かわりに in card text should open replacement_effect",
);

// 句点範囲は見る系に限らない汎用原則。カード名は smoke のみ。
const periodQ =
  "相手の場にまがつかぜがいるときasmラジオを唱えるとどうなる？";
const periodTexts = [
  "相手が自身の山札を１枚以上見る時または表向きにする時、相手はかわりに自身の山札の上から１枚を表向きにする。",
  "自分の山札の上から５枚を見る。その中から、コスト３以下のクリーチャーを２体まで出す。残りを好きな順序で山札の下に置く。",
];
const periodIssues = classifyIssues({
  question: periodQ,
  facts: {
    question: periodQ,
    entities: [],
    actions: [],
    manaZone: [],
    timelineNotes: [],
  },
  cardTexts: periodTexts,
});
assert(
  periodIssues.matches.some((m) => m.kind === "replacement_effect"),
  "かわりに should open replacement_effect",
);
assert(periodIssues.ruleRefs.includes("101.5a"), "101.5a should be seeded");
assert(
  periodIssues.constraints.some((c) => /句点|101\.5a/.test(c)),
  "period-scope constraint required",
);
assert(
  periodIssues.constraints.some((c) => /能力全体が無効|後続の句点/.test(c)),
  "generic whole-effect-cancel fallacy should be constrained",
);
assert(
  !periodIssues.constraints.some((c) => /見る\/表向きにする置換がかかった/.test(c)),
  "must not keep look-specific fallacy wording",
);

console.log("OK replacement generic かわりに + 101.5a period scope");
