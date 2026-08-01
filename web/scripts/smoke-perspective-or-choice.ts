/**
 * 回帰: クリーチャー/タマシード OR 選択でも強制選択は逃れられない（qa/45555）。
 */
import { matchPerspectiveHints } from "../src/lib/judge/perspective";
import { classifyIssues } from "../src/lib/judge/issues/classifyIssues";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const fairyText =
  "相手がクリーチャーを選ぶなら、可能ならこのクリーチャーを選ぶ。メガ・ラスト・バースト";
const trapText =
  "このタマシードが出た時、コスト４以下のクリーチャー１体またはコスト４以下のタマシードを１枚選び、持ち主のマナゾーンに置く。";

const question =
  "相手の盤面に同期の妖精がいる状況で自分はトラップの地版を出しこのトラップの効果でタマシードを選ぶと宣言しトラップ自身をマナに置くことは可能ですか？";

const perspective = matchPerspectiveHints({
  question,
  cardTexts: [fairyText, trapText],
  entities: ["同期の妖精", "トラップの地版"],
});
assert(perspective, "perspective should match");
assert(
  perspective.seedQaIds.includes("45555"),
  `45555 should be seeded, got ${perspective.seedQaIds.join(",")}`,
);
assert(
  perspective.constraints.some((c) => /45555|タマシード/.test(c)),
  "OR-choice constraint should mention 45555 or タマシード",
);

const issues = classifyIssues({
  question,
  facts: {
    question,
    entities: [],
    actions: [],
    manaZone: [],
    timelineNotes: [],
  },
  cardTexts: [fairyText, trapText],
  entities: ["同期の妖精", "トラップの地版"],
});
assert(
  issues.matches.some((m) => m.kind === "perspective"),
  "perspective issue should open",
);
assert(issues.seedQaIds.includes("45555"), "45555 via classifyIssues");

console.log("OK perspective OR-choice seeds 45555");
