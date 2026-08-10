/**
 * 回帰: アンティハムトから出したダーバンデは、攻撃開始時点で +3000 を含める。
 */
import { buildDeclarationPowerHints } from "../../src/lib/judge/facts/declarationPower";
import { buildScenarioFacts } from "../../src/lib/judge/facts/buildScenarioFacts";
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

  const hints = buildDeclarationPowerHints({ question, scenarioCards });
  assert(hints.length >= 1, "expected power hint");
  const hint = hints[0];
  assert(hint.printedPower === 3000, `printed=${hint.printedPower}`);
  assert(
    hint.modifiers.some((m) => m.delta === 3000 && m.kind === "turn_long_on_put"),
    `modifiers=${JSON.stringify(hint.modifiers)}`,
  );
  assert(
    hint.estimatedPowerAtAttackStart === 6000,
    `estimated=${hint.estimatedPowerAtAttackStart}`,
  );
  console.log("OK hints", hint.estimatedPowerAtAttackStart, hint.modifiers);

  const plan: SearchPlan = {
    cardMentions: scenarioCards.map((c) => ({
      mention: c.mention,
      role: c.role,
      relevantAbility: c.relevantAbility,
    })),
    entities: ["ダーバンデ", "アンティハムト", "ロビンフッド"],
    events: ["出す", "攻撃", "革命チェンジ"],
    concepts: ["革命チェンジ", "パワー"],
    qaQueries: ["革命チェンジ パワー"],
    ruleQueries: ["革命チェンジ"],
  };
  const facts = buildScenarioFacts({ question, plan, scenarioCards });
  assert(
    facts.declarationPower?.[0]?.estimatedPowerAtAttackStart === 6000,
    "facts missing declaration power",
  );
  console.log("OK facts");
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
