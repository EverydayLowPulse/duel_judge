import { runEvidenceGate } from "../src/lib/answer/evidenceGate";
import { generateAnswerWithGemini } from "../src/lib/llm/gemini";
import { planSearchWithGemini } from "../src/lib/llm/searchPlanner";
import { verifyScenarioWithGemini } from "../src/lib/llm/scenarioVerifier";
import {
  formatPerspectiveConstraints,
  matchPerspectiveHints,
} from "../src/lib/judge/perspective";
import { retrieveOfficialSources } from "../src/lib/judge/retrieveSources";
import { resolveScenarioCards } from "../src/lib/judge/scenarioCards";
import { RULE_PDF_URL } from "../src/lib/rules/constants";
import type { EvidenceChunk } from "../src/lib/answer/types";

async function main() {
  const question =
    "メカくしで自分のダーバンデをアンタップしたいんだが敵方に同期の妖精がいるときメカくしの術の効果吸われる？";
  const plan = await planSearchWithGemini({ question });
  const { cards: scenarioCards } = await resolveScenarioCards({ plan });
  const allCards = scenarioCards.map((c) => c.card);
  const perspective = matchPerspectiveHints({
    question,
    entities: [
      ...plan.entities,
      ...plan.cardMentions.map((m) => m.mention),
      ...allCards.map((c) => c.officialName),
    ],
    cardTexts: allCards.map((c) => c.abilityText),
  });
  const sources = await retrieveOfficialSources({
    question,
    plan: {
      ...plan,
      qaQueries: [
        ...(perspective?.qaQueries ?? []),
        ...plan.qaQueries,
      ].slice(0, 7),
    },
    seedQaIds: perspective?.seedQaIds,
    extraQaQueries: perspective?.qaQueries,
    maxQaArticles: 5,
    maxRuleHits: 4,
  });

  const chunks: EvidenceChunk[] = [];
  for (const card of allCards) {
    chunks.push({
      id: `card:${card.cardId}`,
      type: "card",
      label: card.officialName,
      url: card.detailUrl,
      text: `${card.officialName}\n${card.abilityText}`,
    });
  }
  for (const a of sources.qaArticles) {
    chunks.push({
      id: `qa:${a.qaId}`,
      type: "qa",
      label: "公式Q&A",
      url: a.url,
      text: `Q: ${a.question}\nA: ${a.answer}`,
    });
  }
  for (const r of sources.ruleHits) {
    chunks.push({
      id: `rule:${r.ruleRef}`,
      type: "rule",
      label: `総合ルール ${r.ruleRef}`,
      url: RULE_PDF_URL,
      text: r.text,
    });
  }

  console.log(
    "cards",
    scenarioCards.map((c) => c.card.officialName),
  );
  console.log(
    "qaIds",
    sources.qaArticles.map((a) => a.qaId),
  );

  const verification = await verifyScenarioWithGemini({
    question,
    cards: scenarioCards,
    chunks,
  });
  console.log(
    "verdict",
    verification.verdict,
    "perspective",
    verification.perspectiveChecks,
  );
  console.log("constraints", verification.constraintsForAnswer);

  const scenarioAnalysis = [
    formatPerspectiveConstraints(perspective),
    JSON.stringify(verification, null, 2),
  ]
    .filter(Boolean)
    .join("\n\n");

  const draft = await generateAnswerWithGemini({
    question,
    cards: allCards,
    scenarioAnalysis,
    chunks,
  });
  console.log(
    "draft evidence",
    draft.evidence.map((e) => ({
      type: e.type,
      quote: e.quote.slice(0, 100),
    })),
  );
  console.log("draft conclusion", draft.conclusion);

  let gate = runEvidenceGate(draft, chunks);
  if (!gate.ok) {
    console.log("gate fail", gate.failures);
    const repaired = await generateAnswerWithGemini(
      {
        question,
        cards: allCards,
        scenarioAnalysis,
        chunks,
      },
      { validationFailures: gate.failures },
    );
    console.log(
      "repaired evidence",
      repaired.evidence.map((e) => ({
        type: e.type,
        quote: e.quote.slice(0, 100),
      })),
    );
    console.log("repaired conclusion", repaired.conclusion);
    gate = runEvidenceGate(repaired, chunks);
  }
  console.log(
    "final",
    gate.ok
      ? {
          ok: true,
          confidence: gate.answer.confidence,
          conclusion: gate.answer.conclusion,
          adjustments: gate.adjustments,
        }
      : { ok: false, failures: gate.failures },
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
