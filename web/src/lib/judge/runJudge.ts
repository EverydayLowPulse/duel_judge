import { runEvidenceGate } from "../answer/evidenceGate";
import type { AnswerDisplayMeta, EvidenceChunk } from "../answer/types";
import { generateAnswerWithGemini } from "../llm/gemini";
import { planSearchWithGemini } from "../llm/searchPlanner";
import {
  verifyScenarioWithGemini,
  type ScenarioVerification,
} from "../llm/scenarioVerifier";
import type { OfficialCard } from "../official/types";
import {
  resolveCardById,
  resolveCardName,
} from "../resolve/resolveCardName";
import type { ResolveCardNameResult } from "../resolve/types";
import { RULE_PDF_URL } from "../rules/constants";
import {
  formatPendingAbilityConstraints,
  matchPendingAbilityHints,
} from "./pendingAbilities";
import {
  formatPerspectiveConstraints,
  matchPerspectiveHints,
} from "./perspective";
import { retrieveOfficialSources } from "./retrieveSources";
import { resolveScenarioCards } from "./scenarioCards";
import type { JudgeRequest, JudgeResponse } from "./types";

export type { JudgeRequest, JudgeResponse } from "./types";

const DISCLAIMER =
  "本回答は公式裁定の代替ではありません。大会ではジャッジに確認してください。";

function displayMeta(): AnswerDisplayMeta {
  return {
    disclaimer: DISCLAIMER,
    last_synced_at: null,
  };
}

/**
 * 薄い裁定パイプライン（MVP）:
 * カード解決 → 検索プラン生成 → 複数検索・統合 → Gemini回答 → Evidence Gate
 */
export async function runJudge(req: JudgeRequest): Promise<JudgeResponse> {
  const question = req.question.trim();
  if (!question) {
    return {
      kind: "withhold",
      withhold: {
        kind: "withhold",
        reason: "質問が空です",
        tried: [],
        next_hint: "裁定したい状況を書いてください。",
      },
      display: displayMeta(),
    };
  }

  let cardQuery = req.cardQuery?.trim();
  let resolve: ResolveCardNameResult | null = null;

  if (req.cardId && cardQuery) {
    resolve = await resolveCardById(cardQuery, req.cardId);
  } else if (cardQuery) {
    resolve = await resolveCardName(cardQuery);
  }

  if (resolve?.kind === "clarify") {
    return { kind: "clarify", resolve };
  }
  if (resolve?.kind === "not_found") {
    return { kind: "not_found", resolve };
  }

  const card = resolve?.kind === "resolved" ? resolve.card : undefined;
  const plan = await planSearchWithGemini({ question, card });
  const scenarioCards = await resolveScenarioCards({
    plan,
    primaryCard: card,
  });
  // カード語句で指定したカードに、略称メンションを安全に紐づける
  // （ドッコイ等の別カードには付けない。名前の包含／部分列で判定）
  if (card) {
    for (const mention of plan.cardMentions) {
      if (mention.role === "other") continue;
      const alreadyResolved = scenarioCards.some(
        (resolved) =>
          normalizeCardName(resolved.mention) ===
            normalizeCardName(mention.mention) ||
          normalizeCardName(resolved.card.officialName) ===
            normalizeCardName(mention.mention),
      );
      if (alreadyResolved) continue;
      if (!looksLikeCardMention(mention.mention, card.officialName)) continue;
      scenarioCards.push({
        mention: mention.mention,
        role: mention.role,
        relevantAbility: mention.relevantAbility,
        card,
      });
    }
  }

  const unresolvedMentions = plan.cardMentions.filter(
    (mention) =>
      mention.role !== "other" &&
      !scenarioCards.some(
        (resolved) =>
          normalizeCardName(resolved.mention) ===
            normalizeCardName(mention.mention) ||
          normalizeCardName(resolved.card.officialName) ===
            normalizeCardName(mention.mention),
      ),
  );
  if (unresolvedMentions.length > 0) {
    return {
      kind: "not_found",
      resolve: {
        kind: "not_found",
        query: unresolvedMentions.map((item) => item.mention).join(" / "),
        note: `次のカードを公式DBで確定できませんでした: ${unresolvedMentions
          .map((item) => item.mention)
          .join("、")}。正式名を「カード語句」に入れて、同じ質問をもう一度送ってください。`,
      },
    };
  }
  const allCards = uniqueCards(scenarioCards.map((item) => item.card));
  const entityHints = [
    ...plan.entities,
    ...plan.cardMentions.map((item) => item.mention),
    ...allCards.map((item) => item.officialName),
  ];
  const perspective = matchPerspectiveHints({
    question,
    entities: entityHints,
    cardTexts: allCards.map((item) => item.abilityText),
  });
  const pendingAbilities = matchPendingAbilityHints({
    question,
    entities: entityHints,
  });
  const enrichedPlan = {
    ...plan,
    entities: unique([
      ...allCards.map((item) => item.officialName),
      ...plan.entities,
    ]),
    qaQueries: unique([
      ...(pendingAbilities?.qaQueries ?? []),
      ...(perspective?.qaQueries ?? []),
      ...plan.cardMentions
        .filter((item) => item.relevantAbility)
        .flatMap((item) => [
          `${item.relevantAbility} 使用宣言 条件`,
          `${item.relevantAbility} 攻撃開始時点`,
        ]),
      ...plan.qaQueries,
    ]).slice(0, 7),
    ruleQueries: unique([
      ...plan.cardMentions
        .filter((item) => item.relevantAbility)
        .map((item) => `${item.relevantAbility} 使用宣言`),
      ...plan.ruleQueries,
    ]).slice(0, 8),
  };
  const sources = await retrieveOfficialSources({
    question,
    plan: enrichedPlan,
    maxQaArticles: 5,
    // キーワード辞書で注入する節を落とさないよう、検索枠より広めに取る。
    maxRuleHits: 8,
    seedQaIds: unique([
      ...(pendingAbilities?.seedQaIds ?? []),
      ...(perspective?.seedQaIds ?? []),
    ]),
    extraQaQueries: unique([
      ...(pendingAbilities?.qaQueries ?? []),
      ...(perspective?.qaQueries ?? []),
    ]),
  });

  const chunks: EvidenceChunk[] = [];
  for (const scenarioCard of allCards) {
    chunks.push({
      id: `card:${scenarioCard.cardId}`,
      type: "card",
      label: scenarioCard.officialName,
      url: scenarioCard.detailUrl,
      text: cardEvidenceText(scenarioCard),
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

  const hasQa = chunks.some((c) => c.type === "qa");
  const hasRule = chunks.some((c) => c.type === "rule");
  if (!hasQa && !hasRule) {
    return {
      kind: "withhold",
      withhold: {
        kind: "withhold",
        reason: "関連する公式Q&A・総合ルールが見つかりませんでした",
        tried: ["カード名解決", "公式Q&A検索", "総合ルール検索"],
        next_hint:
          "カード正式名を「カード語句」に入れるか、能力名（例: ニンジャストライク）を質問に含めてください。",
      },
      display: displayMeta(),
      debug: { chunkIds: chunks.map((c) => c.id) },
    };
  }

  let scenarioVerification: ScenarioVerification | undefined;
  if (scenarioCards.length > 0) {
    scenarioVerification = await verifyScenarioWithGemini({
      question,
      cards: scenarioCards,
      chunks,
    });
  }
  if (
    scenarioVerification?.verdict === "unknown" &&
    scenarioVerification.declarationChecks.some(
      (check) => check.conditionSatisfied === "unknown",
    )
  ) {
    return {
      kind: "withhold",
      withhold: {
        kind: "withhold",
        reason:
          "能力の使用宣言時点で条件を満たすか、公式情報だけでは確定できませんでした",
        tried: [
          "公式カード能力取得",
          "公式Q&A・総合ルール検索",
          "宣言時点の前提条件検証",
        ],
        next_hint:
          "攻撃を開始したカードと、使いたい能力を持つカードの正式名を指定してください。",
      },
      display: displayMeta(),
      debug: { chunkIds: chunks.map((chunk) => chunk.id) },
    };
  }
  const perspectiveBlock = formatPerspectiveConstraints(perspective);
  const pendingBlock = formatPendingAbilityConstraints(pendingAbilities);
  const scenarioAnalysis = [
    pendingBlock,
    perspectiveBlock,
    scenarioVerification
      ? JSON.stringify(scenarioVerification, null, 2)
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n") || undefined;

  const draft = await generateAnswerWithGemini({
    question,
    cardQuery,
    card,
    cards: allCards,
    scenarioAnalysis,
    chunks,
  });

  let gate = runEvidenceGate(draft, chunks);
  if (!gate.ok) {
    // 検索は成功していて引用形式だけが壊れた場合に備え、同じ公式チャンクで1回だけ修復する。
    // 新しい根拠をモデルに作らせず、Evidence Gate は修復後も必ず再実行する。
    const repaired = await generateAnswerWithGemini(
      {
        question,
        cardQuery,
        card,
        cards: allCards,
        scenarioAnalysis,
        chunks,
      },
      { validationFailures: gate.failures },
    );
    gate = runEvidenceGate(repaired, chunks);
  }

  if (!gate.ok) {
    return {
      kind: "withhold",
      withhold: gate.withhold,
      display: displayMeta(),
      debug: {
        chunkIds: chunks.map((c) => c.id),
        gateFailures: gate.failures,
      },
    };
  }

  return {
    kind: "answer",
    answer: gate.answer,
    display: displayMeta(),
    debug: {
      chunkIds: chunks.map((c) => c.id),
      gateAdjustments:
        gate.adjustments.length > 0 ? gate.adjustments : undefined,
    },
  };
}

function cardEvidenceText(card: OfficialCard): string {
  const faceSummary =
    card.faces?.length > 1
      ? `面数: ${card.faces.length}（ツインパクト等。質問が指す面だけを使う）\n`
      : "";
  return `${card.officialName}
カード種類: ${card.cardType ?? "不明"}
${faceSummary}文明: ${card.civilizations.join("/") || "不明"}
パワー: ${card.power ?? "不明"}
コスト: ${card.cost ?? "不明"}
種族: ${card.races.join("/") || "不明"}
${card.abilityText}`;
}

function uniqueCards(cards: OfficialCard[]): OfficialCard[] {
  const map = new Map<string, OfficialCard>();
  for (const card of cards) {
    if (!map.has(card.officialName)) map.set(card.officialName, card);
  }
  return [...map.values()];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeCardName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫:：]/g, "")
    .toLowerCase();
}

/**
 * 略称が正式名を指すかのゆるい判定。
 * 例: 「ワルプリS」→「ワルスラ・プリンスS」（文字の部分列）
 */
function looksLikeCardMention(mention: string, officialName: string): boolean {
  const m = normalizeCardName(mention);
  const n = normalizeCardName(officialName);
  if (m.length < 3) return false;
  if (n === m || n.includes(m) || m.includes(n)) return true;
  let i = 0;
  for (const ch of n) {
    if (ch === m[i]) i += 1;
    if (i >= m.length) return true;
  }
  return false;
}
