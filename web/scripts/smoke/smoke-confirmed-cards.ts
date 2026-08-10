/**
 * 回帰: 送信前にユーザーが確定したカードは、公式検索なしでシナリオに載ること。
 *
 * - 読み仮名・ひらがな表記は正式名と文字列一致しないので、名前照合を要求しない
 * - マナのマーカーが無い質問で、文の断片をカード名として引かない
 * - 確定モードでは文章からカードを足さない
 */
import { buildEnrichedScenarioFacts } from "../../src/lib/judge/facts/enrichManaCards";
import { buildConfirmedScenarioCards } from "../../src/lib/judge/scenarioCards";
import type { SearchPlan } from "../../src/lib/llm/searchPlanner";
import type { OfficialCard } from "../../src/lib/official/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function card(officialName: string, cardId: string): OfficialCard {
  return {
    cardId,
    officialName,
    productLabel: null,
    cardType: "クリーチャー",
    civilizations: ["光"],
    power: "2500",
    cost: "2",
    manaValue: 1,
    races: ["スノーフェアリー"],
    abilityText: `${officialName}の能力テキスト`,
    faces: [{ cardType: "クリーチャー", abilityText: "能力" }],
    detailUrl: `https://dm.takaratomy.co.jp/card/detail/?id=${cardId}`,
    fetchedAt: new Date().toISOString(),
  };
}

function plan(mentions: SearchPlan["cardMentions"]): SearchPlan {
  return {
    cardMentions: mentions,
    entities: [],
    events: [],
    concepts: [],
    qaQueries: [],
    ruleQueries: [],
  };
}

async function main() {
  // 読み仮名の言及は正式名と一致しないが、確定済みなので採用される
  const readingOnly = buildConfirmedScenarioCards({
    plan: plan([
      { mention: "読み仮名表記", role: "ability_source", relevantAbility: "呪文ロック" },
    ]),
    cards: [{ card: card("漢字の正式名", "dmtest-001"), mention: "読み仮名表記" }],
  });
  assert(readingOnly.length === 1, "確定カードは1件載る");
  assert(
    readingOnly[0]!.mention === "読み仮名表記",
    "mention はユーザーの表記を保つ",
  );
  assert(
    readingOnly[0]!.role === "ability_source" &&
      readingOnly[0]!.relevantAbility === "呪文ロック",
    "同じ表記のプラン言及から role / relevantAbility を引き継ぐ",
  );
  console.log("OK confirmed reading-only mention");

  // プランに対応する言及が無くても落とさない（正式名で載る）
  const noPlanMention = buildConfirmedScenarioCards({
    plan: plan([]),
    cards: [{ card: card("別の正式名", "dmtest-002") }],
  });
  assert(noPlanMention.length === 1, "プラン言及が無くても確定カードは載る");
  assert(
    noPlanMention[0]!.mention === "別の正式名",
    "mention 未指定なら正式名を使う",
  );
  console.log("OK confirmed without plan mention");

  // マナのマーカーが無い質問では、文の断片を公式検索しない（extraCards 0件）
  const noManaMarker = await buildEnrichedScenarioFacts({
    question: "この能力は進化していない状態で、相手がさらに出せますか",
    plan: plan([]),
    scenarioCards: [],
  });
  assert(
    noManaMarker.extraCards.length === 0,
    "マナ列挙が無い質問で追加カードを引かない",
  );
  console.log("OK no mana marker");

  // 確定モードではマナ列挙があっても文章からカードを足さない
  const confirmedMode = await buildEnrichedScenarioFacts({
    question: "マナに大集合、5000vt、5000vtの3枚が存在するとき召喚は可能か",
    plan: plan([]),
    scenarioCards: [],
    resolveExtraCards: false,
  });
  assert(
    confirmedMode.extraCards.length === 0,
    "確定モードでは文章からカードを足さない",
  );
  console.log("OK confirmed mode skips text lookup");

  console.log("OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
