/**
 * 回帰: 読み仮名「ダーバンデ」がシナリオ解決で正式名カードに紐づくこと。
 * （略称辞書で resolved しても nameMatches で捨てていた不具合の防止）
 */
import { resolveCardName } from "../src/lib/resolve/resolveCardName";
import { resolveScenarioCards } from "../src/lib/judge/scenarioCards";
import type { SearchPlan } from "../src/lib/llm/searchPlanner";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const plan: SearchPlan = {
    cardMentions: [
      {
        mention: "ダーバンデ",
        role: "attacker",
        relevantAbility: "革命チェンジ",
      },
      {
        mention: "アンティハムト",
        role: "intermediate",
        relevantAbility: "",
      },
    ],
    entities: ["ダーバンデ", "アンティハムト", "ドギラゴン逆"],
    events: ["進化", "攻撃", "革命チェンジ"],
    concepts: ["革命チェンジ", "パワー"],
    qaQueries: ["革命チェンジ パワー", "G-NEO 革命チェンジ"],
    ruleQueries: ["革命チェンジ", "進化クリーチャー"],
  };

  // カード語句なし: 略称だけで解決できること
  const withoutPrimary = await resolveScenarioCards({ plan });
  const bande = withoutPrimary.cards.find(
    (c) => normalize(c.mention) === normalize("ダーバンデ"),
  );
  assert(bande, "ダーバンデ mention missing");
  assert(
    /俳句爵|Drache/i.test(bande.card.officialName),
    `unexpected: ${bande.card.officialName}`,
  );
  console.log("OK without primary:", bande.card.officialName);

  // カード語句に正式名（ASCII apostrophe）: 略称メンションが主カードへ紐づくこと
  const asciiName = "俳句爵 Drache der'Bande";
  const curlyName = "俳句爵 Drache der\u2019Bande";
  const primaryAscii = await resolveCardName(asciiName);
  assert(
    primaryAscii.kind === "resolved",
    `ASCII formal name should resolve, got ${primaryAscii.kind}`,
  );
  const primaryCurly = await resolveCardName(curlyName);
  assert(primaryCurly.kind === "resolved", "curly formal name should resolve");

  const withPrimary = await resolveScenarioCards({
    plan,
    primaryCard: primaryAscii.card,
  });
  const linked = withPrimary.cards.find(
    (c) => normalize(c.mention) === normalize("ダーバンデ"),
  );
  assert(linked, "ダーバンデ not linked to primary");
  assert(
    linked.card.cardId === primaryAscii.card.cardId,
    "linked to wrong card",
  );
  console.log("OK with primary:", linked.card.officialName);

  console.log("OK");
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
