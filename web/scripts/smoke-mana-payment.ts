/**
 * 回帰: マナにアンティハムト+5000VT×2 でアンティハムト召喚は不可能。
 */
import { buildEnrichedScenarioFacts } from "../src/lib/judge/facts/enrichManaCards";
import { classifyIssues } from "../src/lib/judge/issues/classifyIssues";
import { runJudge } from "../src/lib/judge/runJudge";
import { resolveScenarioCards } from "../src/lib/judge/scenarioCards";
import { checkManaPayment } from "../src/lib/judge/validators/manaPayment";
import { runValidators } from "../src/lib/judge/validators/runValidators";
import { planSearchWithGemini } from "../src/lib/llm/searchPlanner";
import { resolveCardName } from "../src/lib/resolve/resolveCardName";

async function main() {
  const question =
    "マナにアンティハムト、5000vt, 5000vtの3枚が存在するとき、アンティハムトの召喚は可能か";

  const primary = await resolveCardName("ピザスターのアンティハムト");
  if (primary.kind !== "resolved") {
    throw new Error(`primary resolve failed: ${primary.kind}`);
  }

  const plan = await planSearchWithGemini({
    question,
    card: primary.card,
  });
  const { cards: scenarioCards } = await resolveScenarioCards({
    plan,
    primaryCard: primary.card,
  });
  const { facts } = await buildEnrichedScenarioFacts({
    question,
    plan,
    scenarioCards,
    primaryCard: primary.card,
  });

  console.log(
    "facts",
    JSON.stringify(
      {
        paymentTarget: facts.paymentTarget && {
          name: facts.paymentTarget.card.officialName,
          cost: facts.paymentTarget.cost,
          civs: facts.paymentTarget.civilizations,
        },
        manaZone: facts.manaZone.map((m) => ({
          name: m.card?.officialName ?? m.mention,
          civs: m.civilizations,
          mana: m.manaValue,
        })),
      },
      null,
      2,
    ),
  );

  if (!facts.paymentTarget || facts.manaZone.length < 3) {
    throw new Error("failed to structure mana payment facts");
  }

  const check = checkManaPayment({
    cost: facts.paymentTarget.cost,
    requiredCivilizations: facts.paymentTarget.civilizations,
    manaZone: facts.manaZone.map((m) => ({
      civilizations: m.civilizations,
      manaValue: m.manaValue,
    })),
  });
  if (check.canPay) {
    throw new Error(`deterministic check should fail: ${check.reason}`);
  }

  const issues = classifyIssues({ question, facts });
  const aggregate = runValidators({ question, facts, issues });
  if (aggregate.hardVerdict !== "not_allowed") {
    throw new Error(
      `expected hardVerdict not_allowed, got ${aggregate.hardVerdict}`,
    );
  }
  console.log("validator OK", aggregate.results[0]?.reason);

  const result = await runJudge({
    question,
    cardQuery: "ピザスターのアンティハムト",
  });
  if (result.kind !== "answer") {
    console.log(JSON.stringify(result, null, 2));
    throw new Error(`expected answer, got ${result.kind}`);
  }

  const conclusion = result.answer.conclusion;
  console.log("conclusion", conclusion);
  console.log(
    "rule evidence",
    result.answer.evidence
      .filter((e) => e.type === "rule")
      .map((e) => e.rule_ref),
  );

  if (!/不可能|できない|払え|足りません|満たせません/.test(conclusion)) {
    throw new Error(`expected negative conclusion: ${conclusion}`);
  }
  if (/^可能/.test(conclusion.trim()) && !/不可能/.test(conclusion)) {
    throw new Error(`unexpected positive conclusion: ${conclusion}`);
  }

  const hasRule = result.debug?.chunkIds?.some(
    (id) =>
      id === "rule:112.2a" ||
      id === "rule:107.2" ||
      id === "rule:112.2",
  );
  if (!hasRule) {
    console.warn("warning: expected rule chunk 112.2a/107.2 in debug.chunkIds");
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
