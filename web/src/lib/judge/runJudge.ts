import { enrichPrincipleEvidence } from "../answer/enrichPrincipleEvidence";
import { pruneUnusedRuleEvidence } from "../answer/pruneUnusedRuleEvidence";
import { runEvidenceGate } from "../answer/evidenceGate";
import { repairEvidenceQuotes } from "../answer/repairEvidenceQuotes";
import type {
  AnswerDisplayMeta,
  AnswerPayload,
  EvidenceChunk,
} from "../answer/types";
import { generateAnswerWithGemini } from "../llm/gemini";
import { planSearchWithGemini } from "../llm/searchPlanner";
import {
  verifyScenarioWithGemini,
  type ScenarioVerification,
} from "../llm/scenarioVerifier";
import {
  beginLlmUsageCapture,
  endLlmUsageCapture,
  summarizeLlmUsage,
} from "../llm/usage";
import { fetchCardDetail } from "../official/card";
import type { OfficialCard } from "../official/types";
import {
  resolveCardById,
  resolveCardName,
} from "../resolve/resolveCardName";
import type { ResolveCardNameResult } from "../resolve/types";
import { RULE_PDF_URL } from "../rules/constants";
import { isKnownKeywordAbilityName } from "../rules/keywordDictionary";
import { resolveConceptsFromIssues } from "../rules/ontology/resolveConcepts";
import { formatDeclarationPowerHints } from "./facts/declarationPower";
import { buildEnrichedScenarioFacts } from "./facts/enrichManaCards";
import { formatLeaveReplacementHints } from "./facts/leaveReplacement";
import { formatWrittenAbilityHints } from "./facts/writtenAbilities";
import { classifyIssues } from "./issues/classifyIssues";
import { retrieveOfficialSources } from "./retrieveSources";
import {
  buildConfirmedScenarioCards,
  resolveScenarioCards,
  type ScenarioCard,
} from "./scenarioCards";
import { progressEvent } from "./progress";
import type {
  ConfirmedCardInput,
  JudgeRequest,
  JudgeResponse,
  ProcessTraceEntry,
  RunJudgeOptions,
} from "./types";
import { buildDeterministicAnswer } from "./validators/buildDeterministicAnswer";
import {
  formatValidatorConstraints,
  runValidators,
} from "./validators/runValidators";

export type { JudgeRequest, JudgeResponse, RunJudgeOptions } from "./types";
export type { JudgeProgressEvent, JudgeProgressStage } from "./progress";

const DISCLAIMER =
  "本回答は公式裁定の代替ではありません。大会ではジャッジに確認してください。";

function displayMeta(): AnswerDisplayMeta {
  return {
    disclaimer: DISCLAIMER,
    last_synced_at: null,
  };
}

function finalizeJudgeResponse(
  result: JudgeResponse,
  processTrace?: ProcessTraceEntry[],
): JudgeResponse {
  const calls = endLlmUsageCapture();
  const llm = summarizeLlmUsage(calls);
  if (result.kind !== "answer" && result.kind !== "withhold") {
    return result;
  }
  const trace =
    processTrace && processTrace.length > 0
      ? processTrace
      : result.debug?.processTrace;
  return {
    ...result,
    debug: {
      chunkIds: result.debug?.chunkIds ?? [],
      gateFailures: result.debug?.gateFailures,
      gateAdjustments: result.debug?.gateAdjustments,
      processTrace: trace,
      llm: llm ?? (result.kind === "answer" ? "deterministic (LLMなし)" : undefined),
      llmCalls: calls.length > 0 ? calls : undefined,
    },
  };
}

function gateFailureMonologue(failures: string[]): string {
  const joined = failures.slice(0, 3).join(" / ");
  return (
    `出典検証で弾かれた。${joined ? `（${joined}）` : ""}` +
    " 公式ソースに無い引用や形式の崩れがあるので、同じ公式チャンクだけで見直しを行う。"
  );
}

/**
 * 薄い裁定パイプライン（MVP）:
 * カード解決 → Facts/Issues → 検索 → 決定的validators →
 * （不可なら決定的回答）→ 残余は LLM 回答 → Evidence Gate
 *
 * options.onProgress で段階進捗を受け取れる（回答トークンのストリームではない）。
 */
export async function runJudge(
  req: JudgeRequest,
  options?: RunJudgeOptions,
): Promise<JudgeResponse> {
  beginLlmUsageCapture();
  const processTrace: ProcessTraceEntry[] = [];
  try {
    const result = await runJudgePipeline(req, {
      ...options,
      onProgress: (event) => {
        processTrace.push({
          stage: event.stage,
          message: event.message,
          kind: event.kind,
          detail: event.detail,
        });
        options?.onProgress?.(event);
      },
    });
    return finalizeJudgeResponse(result, processTrace);
  } catch (error) {
    endLlmUsageCapture();
    throw error;
  }
}

async function runJudgePipeline(
  req: JudgeRequest,
  options?: RunJudgeOptions,
): Promise<JudgeResponse> {
  const report = (
    stage: Parameters<typeof progressEvent>[0],
    message?: string,
    extra?: Parameters<typeof progressEvent>[2],
  ) => {
    options?.onProgress?.(progressEvent(stage, message, extra));
  };

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

  // 送信前にユーザーが確定していれば名前解決は一切しない。
  // 読み仮名・ひらがな表記は正式名と一致せず、公式への空打ちを積み上げるだけになる。
  let confirmed: ConfirmedCard[] | null = null;
  if (req.confirmedCards) {
    report("resolve_card", "確定したカードを読み込み中…");
    confirmed = await loadConfirmedCards(req.confirmedCards);
  } else {
    // カード解決（公式0件時は内部で dmwiki 補助→公式再検索）
    if (req.cardId && cardQuery) {
      report("resolve_card", "指定カードを取得中…");
      resolve = await resolveCardById(cardQuery, req.cardId);
    } else if (cardQuery) {
      report("resolve_card");
      resolve = await resolveCardName(cardQuery);
    }

    if (resolve?.kind === "clarify") {
      return { kind: "clarify", resolve };
    }
    if (resolve?.kind === "not_found") {
      return { kind: "not_found", resolve };
    }
  }

  const card =
    confirmed?.[0]?.card ??
    (resolve?.kind === "resolved" ? resolve.card : undefined);
  if (confirmed && !cardQuery) {
    cardQuery =
      confirmed
        .map((item) => item.mention ?? item.card.officialName)
        .join(" / ") || undefined;
  }
  report("plan");
  const plan = await planSearchWithGemini({
    question,
    card,
    cards: confirmed?.map((item) => item.card),
  });

  let scenarioCards: ScenarioCard[];
  if (confirmed) {
    scenarioCards = buildConfirmedScenarioCards({ plan, cards: confirmed });
  } else {
    report("resolve_scenario");
    const scenarioResolved = await resolveScenarioCards({
      plan,
      primaryCard: card,
    });
    scenarioCards = scenarioResolved.cards;

    // 解決できなかった言及は推測で進めず聞き返す
    const askWithCandidates = scenarioResolved.askAbout.filter(
      (a) => a.candidates.length > 0,
    );
    if (askWithCandidates.length > 0) {
      const first = askWithCandidates[0]!;
      return {
        kind: "clarify",
        resolve: {
          kind: "clarify",
          query: first.mention,
          source: "official_search",
          note: first.note,
          questions: askWithCandidates.map((a) => ({
            about: a.mention,
            candidates: a.candidates.map((c) => ({
              official_name: c.officialName,
              card_id: c.cardId,
              detail_url: c.detailUrl,
              cost: c.cost,
              civilizations: c.civilizations,
              card_type: c.cardType,
            })),
          })),
          candidates: first.candidates,
        },
      };
    }
    const askUnresolved = scenarioResolved.askAbout.filter(
      (a) => a.candidates.length === 0,
    );
    if (askUnresolved.length > 0) {
      return {
        kind: "not_found",
        resolve: {
          kind: "not_found",
          query: askUnresolved.map((a) => a.mention).join(" / "),
          note: askUnresolved.map((a) => a.note).join(" "),
        },
      };
    }

    // カード語句で指定したカードに、略称メンションを安全に紐づける
    // （ドッコイ等の別カードには付けない。名前の包含／部分列、または略称辞書で判定）
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
        // 読み仮名略称は正式名の部分列にならないことがある（ダーバンデ ↛ Drache）
        // その場合は resolveScenarioCards 側の略称辞書解決に任せる
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
        !isKnownKeywordAbilityName(mention.mention) &&
        !scenarioCards.some(
          (resolved) =>
            normalizeCardName(resolved.mention) ===
              normalizeCardName(mention.mention) ||
            normalizeCardName(resolved.card.officialName) ===
              normalizeCardName(mention.mention) ||
            looksLikeCardMention(mention.mention, resolved.card.officialName),
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
  }
  report("build_facts");
  const { facts, extraCards } = await buildEnrichedScenarioFacts({
    question,
    plan,
    scenarioCards,
    primaryCard: card,
    resolveExtraCards: !confirmed,
  });
  if (extraCards.length > 0) {
    scenarioCards.push(...extraCards);
  }
  const allCards = uniqueCards(scenarioCards.map((item) => item.card));
  const entityHints = [
    ...plan.entities,
    ...plan.cardMentions.map((item) => item.mention),
    ...allCards.map((item) => item.officialName),
  ];
  const issues = classifyIssues({
    question,
    facts,
    entities: entityHints,
    cardTexts: allCards.map((item) => item.abilityText),
  });
  const concepts = resolveConceptsFromIssues(issues.matches);
  const enrichedPlan = {
    ...plan,
    entities: unique([
      ...allCards.map((item) => item.officialName),
      ...plan.entities,
    ]),
    qaQueries: unique([
      ...issues.qaQueries,
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
      ...concepts.ruleRefs,
    ]).slice(0, 8),
  };
  report("retrieve");
  const sources = await retrieveOfficialSources({
    question,
    plan: enrichedPlan,
    maxQaArticles: 5,
    // キーワード辞書・ontology の節を落とさないよう、検索枠より広めに取る。
    maxRuleHits: 8,
    seedQaIds: unique([...issues.seedQaIds, ...concepts.qaSeeds]),
    extraQaQueries: issues.qaQueries,
    seedRuleRefs: unique([...issues.ruleRefs, ...concepts.ruleRefs]),
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

  report("validate");
  const deterministic = runValidators({
    question,
    facts,
    issues,
    chunks,
    cardAbilityTexts: allCards.map((c) => c.abilityText),
  });

  // 決定的に可/不可が付いたら LLM を介さず回答を組み立てる（引用捏造・Evidence Gate 失敗を避ける）
  // 「可能」の短絡: マナ／バニラ召喚／置換ブレイク行き先が allowed なら LLM に落とさない
  const manaOrVanillaAllowed = deterministic.results.some(
    (r) =>
      (r.validatorId === "mana_payment" ||
        r.validatorId === "no_written_ability_summon" ||
        r.validatorId === "replacement_break_hand" ||
        r.validatorId === "destroy_mana_not_swap_blocker" ||
        r.validatorId === "seal_pending_resolve") &&
      r.verdict === "allowed",
  );
  const hasCraftedConclusion = deterministic.results.some(
    (r) => Boolean(r.craftedConclusion),
  );
  const onlyShortCircuitAllowedIssue =
    issues.matches.length > 0 &&
    issues.matches.every(
      (m) =>
        m.kind === "mana_payment" || m.kind === "no_written_abilities",
    );
  const canShortCircuit =
    hasCraftedConclusion ||
    deterministic.hardVerdict === "not_allowed" ||
    (manaOrVanillaAllowed &&
      !deterministic.results.some((r) => r.verdict === "not_allowed")) ||
    (deterministic.hardVerdict === "allowed" && onlyShortCircuitAllowedIssue);
  if (canShortCircuit) {
    const aggregateForCraft =
      deterministic.hardVerdict === "allowed" ||
      deterministic.hardVerdict === "not_allowed"
        ? deterministic
        : {
            ...deterministic,
            hardVerdict: manaOrVanillaAllowed
              ? ("allowed" as const)
              : deterministic.hardVerdict,
          };
    const crafted = buildDeterministicAnswer({
      question,
      cardQuery,
      cards: allCards,
      chunks,
      aggregate: aggregateForCraft,
    });
    if (crafted) {
      report("evidence_gate");
      const gate = runEvidenceGate(crafted, chunks);
      if (gate.ok) {
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
    }
  }

  let scenarioVerification: ScenarioVerification | undefined;
  // 決定的に不可なら LLM 検証を省略して制約だけ渡す（コスト削減＋誤答抑止）
  if (
    deterministic.hardVerdict !== "not_allowed" &&
    scenarioCards.length > 0
  ) {
    report("verify_scenario");
    scenarioVerification = await verifyScenarioWithGemini({
      question,
      cards: scenarioCards,
      chunks,
      facts,
    });
  }
  // 宣言条件が unknown でも即 withhold しない。
  // （DeepSeek 等が慎重に unknown を返すと、召喚置換など無関係な質問まで保留になりやすい）
  // 検証結果は scenarioAnalysis 経由で回答 LLM を制約する。
  const declarationUnknown =
    scenarioVerification?.verdict === "unknown" &&
    scenarioVerification.declarationChecks.some(
      (check) => check.conditionSatisfied === "unknown",
    ) &&
    deterministic.hardVerdict !== "not_allowed";
  const scenarioAnalysis = [
    formatValidatorConstraints(deterministic),
    formatDeclarationPowerHints(facts.declarationPower ?? []),
    formatLeaveReplacementHints(facts.leaveReplacement ?? []),
    formatWrittenAbilityHints(facts.writtenAbilities ?? []),
    issues.constraints.length > 0
      ? `【論点制約（内部。evidenceには引用しない）】\n${issues.constraints
          .map((c) => `- ${c}`)
          .join("\n")}`
      : undefined,
    concepts.constraints.length > 0
      ? `【RuleConcept制約（内部。evidenceには引用しない）】\n${concepts.constraints
          .map((c) => `- ${c}`)
          .join("\n")}`
      : undefined,
    declarationUnknown
      ? "【宣言条件検証】一部条件が unknown。断定できない点は confidence を下げ、公式チャンクに無い条件は作らない。"
      : undefined,
    scenarioVerification
      ? JSON.stringify(scenarioVerification, null, 2)
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n") || undefined;

  const principleRuleRefs = unique([
    ...issues.ruleRefs,
    ...concepts.ruleRefs,
    ...deterministic.requiredRuleRefs,
  ]);
  const principleHints = [
    ...issues.matches
      .filter((m) => m.kind === "evolution_effect_carry")
      .flatMap(() => [
        "総合ルール 801.2 により、進化（侵略による重ね置きを含む）後も同一クリーチャーとして扱う。適用されていた効果は継続し、『各ターン最初の攻撃』などの回数制限も進化でリセットされない。",
      ]),
    ...issues.matches
      .filter((m) => m.kind === "replacement_effect")
      .flatMap(() => [
        "置換効果は原則として連鎖しない。置換ブレイクでシールドが離れる場合、通常ブレイク向けの『シールドゾーンを離れる時、かわりに墓地へ』は適用されず手札に加わる（qa/48504）。",
        "置換が句点（。）で区切られる文章の一部だけを変えたとき、その句点の範囲だけが置換済み。同じ能力の別句点は別イベントとして残り、一部置換＝能力全体が無効ではない（101.5a）。",
      ]),
    ...issues.matches
      .filter((m) => m.kind === "pending_abilities")
      .flatMap(() => [
        "いったん誘発した効果は発生源と独立して待機する（110.5a）。封印で無視されても『誘発しなかった』ではない。発生源にバトル等をさせる効果は解決時点でバトル不能なら不発、手札に戻す等は残る。",
      ]),
  ];

  report("generate_answer");
  const draft = await generateAnswerWithGemini({
    question,
    cardQuery,
    card,
    cards: allCards,
    scenarioAnalysis,
    chunks,
  });
  const enrichedDraft = enrichPrincipleEvidence({
    answer: draft,
    chunks,
    requiredRuleRefs: principleRuleRefs,
    principleHints,
  });
  const quoteRepaired = repairEvidenceQuotes({
    answer: enrichedDraft.answer,
    chunks,
  });
  const prunedDraft = pruneUnusedRuleEvidence(quoteRepaired.answer);
  let pruneRemoved = prunedDraft.removed;

  // Gate 前の進捗（中身の草案テキストは推論過程に出さない）
  report("generate_answer", "回答を組み立てた。出典照合に回す。", {
    kind: "status",
  });

  report("evidence_gate");
  let gate = runEvidenceGate(prunedDraft.answer, chunks);
  if (!gate.ok) {
    // 検索は成功していて引用形式だけが壊れた場合に備え、同じ公式チャンクで1回だけ修復する。
    // 新しい根拠をモデルに作らせず、Evidence Gate は修復後も必ず再実行する。
    report(
      "revise_answer",
      gateFailureMonologue(gate.failures),
      { kind: "monologue" },
    );
    report("revise_answer", "同じ公式チャンクだけで引用を直して再生成する…");
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
    const enrichedRepaired = enrichPrincipleEvidence({
      answer: repaired,
      chunks,
      requiredRuleRefs: principleRuleRefs,
      principleHints,
    });
    const quoteRepairedAgain = repairEvidenceQuotes({
      answer: enrichedRepaired.answer,
      chunks,
    });
    const prunedRepaired = pruneUnusedRuleEvidence(quoteRepairedAgain.answer);
    pruneRemoved = prunedRepaired.removed;
    report("revise_answer", "見直し後の回答を組み立てた。", {
      kind: "status",
    });
    report("evidence_gate", "見直し後の出典を再照合中…");
    gate = runEvidenceGate(prunedRepaired.answer, chunks);
  }

  if (!gate.ok) {
    report(
      "revise_answer",
      "見直しでも出典検証を通らなかった。根拠付きでは答えられないので保留する。",
      { kind: "monologue" },
    );
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

  const quoteAdjustments = [
    ...enrichedDraft.adjustments,
    ...quoteRepaired.adjustments,
    ...pruneRemoved.map((ref) => `未使用の rule ${ref} を evidence から除去`),
  ];
  return {
    kind: "answer",
    answer: gate.answer,
    display: displayMeta(),
    debug: {
      chunkIds: chunks.map((c) => c.id),
      gateAdjustments:
        [...quoteAdjustments, ...gate.adjustments].length > 0
          ? [...quoteAdjustments, ...gate.adjustments]
          : undefined,
    },
  };
}

type ConfirmedCard = { card: OfficialCard; mention?: string };

/**
 * 送信前に確定したカードを cardId から読む（詳細はキャッシュ優先）。
 *
 * ユーザーが検索に使った表記は略称辞書へ 1対N で追記する。手書きシードを増やさずに
 * 「この表記はこのカード」を確認済み事実として蓄積し、次回の名前解決を通す。
 */
async function loadConfirmedCards(
  items: ConfirmedCardInput[],
): Promise<ConfirmedCard[]> {
  const out: ConfirmedCard[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.cardId)) continue;
    seen.add(item.cardId);

    if (item.mention) {
      const resolved = await resolveCardById(item.mention, item.cardId);
      if (resolved.kind === "resolved") {
        out.push({ card: resolved.card, mention: item.mention });
        continue;
      }
    }
    out.push({ card: await fetchCardDetail(item.cardId) });
  }

  return out;
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
マナ: ${card.manaValue ?? "不明"}
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
