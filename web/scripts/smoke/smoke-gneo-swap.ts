/**
 * 回帰: G-NEO進化中のダーバンデへの革命チェンジ入れ替えは不可。
 */
import { buildLeaveReplacementHints } from "../../src/lib/judge/facts/leaveReplacement";
import { buildScenarioFacts } from "../../src/lib/judge/facts/buildScenarioFacts";
import { classifyIssues } from "../../src/lib/judge/issues/classifyIssues";
import type { SearchPlan } from "../../src/lib/llm/searchPlanner";
import { resolveCardName } from "../../src/lib/resolve/resolveCardName";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const bande = await resolveCardName("ダーバンデ");
  const hamu = await resolveCardName("アンティハムト");
  assert(bande.kind === "resolved", "bande");
  assert(hamu.kind === "resolved", "hamu");

  const question =
    "アンティハムトからダーバンデをハムトから進化する形で出し、攻撃時効果で呪文を1枚唱えるとパワーが9000に達するがロビンフッドへの革命チェンジは可能か";

  const scenarioCards = [
    {
      mention: "ダーバンデ",
      role: "attacker" as const,
      relevantAbility: "革命チェンジ",
      card: bande.card,
    },
    {
      mention: "アンティハムト",
      role: "intermediate" as const,
      relevantAbility: "",
      card: hamu.card,
    },
  ];

  const hints = buildLeaveReplacementHints({ question, scenarioCards });
  assert(hints.length >= 1, "expected leave replacement hint");
  assert(hints[0].kind === "g_neo_evolved", `kind=${hints[0].kind}`);
  assert(hints[0].blocksSwap === true, "should block swap when evolved");
  console.log("OK leave hint", hints[0].kind, hints[0].blocksSwap);

  const plan: SearchPlan = {
    cardMentions: scenarioCards.map((c) => ({
      mention: c.mention,
      role: c.role,
      relevantAbility: c.relevantAbility,
    })),
    entities: ["ダーバンデ", "アンティハムト", "ロビンフッド"],
    events: ["進化", "攻撃", "革命チェンジ"],
    concepts: ["革命チェンジ", "G-NEO"],
    qaQueries: ["スター進化 革命チェンジ"],
    ruleQueries: ["革命チェンジ", "G-NEO"],
  };
  const facts = buildScenarioFacts({ question, plan, scenarioCards });
  assert(
    facts.leaveReplacement?.some((h) => h.blocksSwap),
    "facts.leaveReplacement missing",
  );

  const issues = classifyIssues({
    question,
    facts,
    entities: plan.entities,
    cardTexts: scenarioCards.map((c) => c.card.abilityText),
  });
  assert(
    issues.matches.some((m) => m.kind === "swap_effect"),
    "swap_effect issue should open",
  );
  console.log("OK swap issue");

  // 進化なし射出なら阻害しない
  const noEvoQ =
    "アンティハムトからダーバンデを進化なしで出し、ロビンフッドへ革命チェンジは可能か";
  const noEvoHints = buildLeaveReplacementHints({
    question: noEvoQ,
    scenarioCards,
  });
  assert(
    !noEvoHints.some((h) => h.blocksSwap),
    "non-evolved G-NEO should not block",
  );
  console.log("OK non-evolved does not block");

  // 場の置換: カード名ではなく能力テキストで検出
  const externalCard = {
    mention: "場の置換持ち",
    role: "other" as const,
    relevantAbility: "",
    card: {
      ...bande.card,
      officialName: "テスト用・場の置換持ち",
      cardType: "クリーチャー",
      abilityText:
        "相手のクリーチャーが出る時、かわりにそれをマナゾーンに置く。",
    },
  };
  const externalHints = buildLeaveReplacementHints({
    question: "相手の場の置換持ちがいる状況で攻撃して革命チェンジは可能か",
    scenarioCards: [externalCard],
  });
  assert(
    externalHints.some((h) => h.kind === "external_field" && h.blocksSwap),
    "external field blocker should be detected from ability text",
  );
  console.log("OK external field");

  // EXライフ: カードテキスト＋質問主張
  const exCard = {
    mention: "ガイゼキアール",
    role: "attacker" as const,
    relevantAbility: "革命チェンジ",
    card: {
      ...bande.card,
      officialName: "魔帝連結 ガイゼキアール",
      cardType: "クリーチャー",
      abilityText:
        "EXライフ：このクリーチャーがバトルゾーンを離れる時、かわりにこのクリーチャーの下にある「EXライフ」シールドを1つ破壊する。",
    },
  };
  const exHints = buildLeaveReplacementHints({
    question:
      "EXライフシールドがあるガイゼキアールが攻撃する時、ドギラゴン剣へ革命チェンジは可能か",
    scenarioCards: [exCard],
  });
  assert(
    exHints.some((h) => h.kind === "ex_life" && h.blocksSwap),
    "EXライフ should block when claimed",
  );
  console.log("OK ex_life");
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
