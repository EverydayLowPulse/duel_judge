import type { AnswerPayload, EvidenceChunk, EvidenceItem } from "../../answer/types";
import type { OfficialCard } from "../../official/types";
import type {
  AggregateValidatorResult,
  ValidatorResult,
} from "./types";

/**
 * 決定的 validator の hardVerdict から LLM を介さず AnswerPayload を組み立てる。
 * quote は取得済みチャンクから切り出すので Evidence Gate を通せる。
 */
export function buildDeterministicAnswer(input: {
  question: string;
  cardQuery?: string;
  cards: OfficialCard[];
  chunks: EvidenceChunk[];
  aggregate: AggregateValidatorResult;
}): AnswerPayload | null {
  const crafted = input.aggregate.results.find((r) => r.craftedConclusion);
  if (crafted?.craftedConclusion) {
    return buildCraftedAnswer(input, crafted);
  }

  const verdict = input.aggregate.hardVerdict;
  if (verdict !== "not_allowed" && verdict !== "allowed") return null;

  const hard = input.aggregate.results.find((r) => r.verdict === verdict);
  if (!hard) return null;

  const evidence = pickEvidence(hard, input.chunks, verdict);
  if (evidence.length === 0) return null;

  const primary = input.cards[0];
  const resolved_cards = input.cards.map((card) => ({
    query:
      card === primary && input.cardQuery
        ? input.cardQuery
        : card.officialName,
    official_name: card.officialName,
    card_id: card.cardId,
    detail_url: card.detailUrl,
  }));

  const possible = verdict === "allowed";
  const hasQaEvidence = evidence.some((e) => e.type === "qa");
  return {
    kind: "answer",
    resolved_cards,
    evidence,
    reasoning: hard.reason,
    conclusion: possible
      ? `可能です。${hard.reason}`
      : `不可能です。${hard.reason}`,
    confidence: hasQaEvidence ? "medium" : "low",
    confidence_note: possible
      ? hard.validatorId === "no_written_ability_summon"
        ? "決定的validatorによる判定（注釈文は能力に数えない／205.2a）。"
        : hard.validatorId === "replacement_break_hand"
          ? "決定的validatorによる判定（置換ブレイクの行き先／置換は連鎖しない）。"
          : hard.validatorId === "destroy_mana_not_swap_blocker"
            ? "決定的validatorによる判定（破壊→マナは入れ替え阻害ではない／侵略≠入れ替え）。"
            : "決定的validatorによる判定（カード能力の代替コストまたは通常支払い）。"
      : hasQaEvidence
        ? "決定的validatorによる判定。類似の公式Q&Aと総合ルールを根拠にしている。"
        : "決定的validatorによる判定。公式Q&Aの直接該当は使わず、総合ルール/カード能力からの機械判定。",
  };
}

function buildCraftedAnswer(
  input: {
    question: string;
    cardQuery?: string;
    cards: OfficialCard[];
    chunks: EvidenceChunk[];
  },
  result: ValidatorResult,
): AnswerPayload | null {
  const evidence = pickEvidence(
    result,
    input.chunks,
    result.verdict === "not_allowed" ? "not_allowed" : "allowed",
  );
  // ルール根拠が取れないなら短絡しない（Gate で落とすより LLM に残す）
  if (!evidence.some((e) => e.type === "rule")) return null;

  const primary = input.cards[0];
  const resolved_cards = input.cards.map((card) => ({
    query:
      card === primary && input.cardQuery
        ? input.cardQuery
        : card.officialName,
    official_name: card.officialName,
    card_id: card.cardId,
    detail_url: card.detailUrl,
  }));

  const hasQaEvidence = evidence.some((e) => e.type === "qa");
  return {
    kind: "answer",
    resolved_cards,
    evidence,
    reasoning: result.craftedReasoning ?? result.reason,
    conclusion: result.craftedConclusion!,
    confidence: hasQaEvidence ? "medium" : "low",
    confidence_note:
      result.validatorId === "seal_pending_resolve"
        ? "決定的validatorによる判定（誘発と解決の分離／110.5a・封印116.2a）。"
        : "決定的validatorによる判定（機械組み立て結論）。",
  };
}

/** @deprecated 互換用。buildDeterministicAnswer を使う */
export function buildDeterministicNotAllowedAnswer(
  input: Parameters<typeof buildDeterministicAnswer>[0],
): AnswerPayload | null {
  if (input.aggregate.hardVerdict !== "not_allowed") return null;
  return buildDeterministicAnswer(input);
}

function pickEvidence(
  result: ValidatorResult,
  chunks: EvidenceChunk[],
  verdict: "allowed" | "not_allowed",
): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  // 代替コストが絡む「可能」はカード能力を主根拠にする
  if (verdict === "allowed") {
    if (result.validatorId === "replacement_break_hand") {
      const qaEv = pickReplacementBreakQaEvidence(chunks);
      if (qaEv) items.push(qaEv);
    }
    if (result.validatorId === "destroy_mana_not_swap_blocker") {
      const cardEv = pickDestroyManaCardEvidence(chunks);
      if (cardEv) items.push(cardEv);
    }
    const cardEv = pickCardAbilityEvidence(chunks);
    if (cardEv && !items.some((i) => i.type === "card" && i.quote === cardEv.quote)) {
      items.push(cardEv);
    }
  }

  // 入れ替え失敗系は公式Q&A（スター進化の類似例など）を優先
  if (verdict === "not_allowed") {
    const qaEv = pickSwapFailureQaEvidence(chunks);
    if (qaEv) items.push(qaEv);
    const cardEv = pickLeaveReplacementCardEvidence(chunks);
    if (cardEv) items.push(cardEv);
  }

  const preferred = result.requiredRuleRefs;
  const ruleChunks = chunks.filter((c) => c.type === "rule");
  const selected: EvidenceChunk[] = [];

  for (const ref of preferred) {
    const hit =
      ruleChunks.find((c) => c.id === `rule:${ref}`) ||
      ruleChunks.find(
        (c) =>
          c.id.startsWith("rule:") &&
          (c.text.includes(ref) || c.label.includes(ref)),
      );
    if (hit && !selected.some((s) => s.id === hit.id)) {
      selected.push(hit);
    }
  }

  if (selected.length === 0 && ruleChunks[0] && items.length === 0) {
    selected.push(ruleChunks[0]);
  }

  for (const chunk of selected.slice(0, 2)) {
    const ruleRef = chunk.id.startsWith("rule:")
      ? chunk.id.slice("rule:".length)
      : undefined;
    items.push({
      type: "rule",
      label: chunk.label,
      url: chunk.url,
      rule_ref: ruleRef,
      quote: extractQuote(chunk.text, 160),
    });
  }

  return items.slice(0, 3);
}

function pickDestroyManaCardEvidence(
  chunks: EvidenceChunk[],
): EvidenceItem | null {
  const cardChunks = chunks.filter((c) => c.type === "card");
  for (const chunk of cardChunks) {
    const text = chunk.text.normalize("NFKC");
    const m = text.match(/破壊される時[、,]?かわりに[^。＊\n]{0,80}/);
    if (!m) continue;
    const quote = m[0].trim();
    if (!chunk.text.includes(quote) && !text.includes(quote)) continue;
    const rawIdx = chunk.text.normalize("NFKC").indexOf(quote);
    const rawQuote =
      rawIdx >= 0
        ? chunk.text.normalize("NFKC").slice(rawIdx, rawIdx + quote.length)
        : quote;
    return {
      type: "card",
      label: chunk.label,
      url: chunk.url,
      quote: rawQuote,
    };
  }
  return null;
}

function pickReplacementBreakQaEvidence(
  chunks: EvidenceChunk[],
): EvidenceItem | null {
  const qaChunks = chunks.filter((c) => c.type === "qa");
  const preferred =
    qaChunks.find((c) => c.id.includes("48504") || c.url.includes("48504")) ||
    qaChunks.find(
      (c) =>
        c.text.includes("手札に加わり") ||
        c.text.includes("手札に加え") ||
        (c.text.includes("置換") && c.text.includes("墓地") && c.text.includes("手札")),
    );
  if (!preferred) return null;
  const answerStart = preferred.text.indexOf("A");
  const body =
    answerStart >= 0 ? preferred.text.slice(answerStart) : preferred.text;
  return {
    type: "qa",
    label: preferred.label,
    url: preferred.url,
    quote: extractQuote(body, 200),
  };
}

function pickSwapFailureQaEvidence(
  chunks: EvidenceChunk[],
): EvidenceItem | null {
  const qaChunks = chunks.filter((c) => c.type === "qa");
  // 本文の原則フレーズを優先（特定 QA ID への依存を避ける）
  const preferred = qaChunks.find(
    (c) =>
      c.text.includes("入れ替える効果は") ||
      c.text.includes("入れ替えは失敗") ||
      c.text.includes("入れ替えは実行されません") ||
      c.text.includes("構成するカードがすべて") ||
      c.text.includes("バトルゾーンから離れない") ||
      c.text.includes("カードの移動が正常に"),
  );
  if (!preferred) return null;
  // A 部分を優先して引用
  const answerStart = preferred.text.indexOf("A");
  const body =
    answerStart >= 0 ? preferred.text.slice(answerStart) : preferred.text;
  return {
    type: "qa",
    label: preferred.label,
    url: preferred.url,
    quote: extractQuote(body, 200),
  };
}

function pickLeaveReplacementCardEvidence(
  chunks: EvidenceChunk[],
): EvidenceItem | null {
  const cardChunks = chunks.filter((c) => c.type === "card");
  for (const chunk of cardChunks) {
    const text = chunk.text.normalize("NFKC");
    if (!/G[\s-]?NEO|スター進化|離れる時/.test(text)) continue;
    const m =
      text.match(/G[\s-]?NEO進化[^。＊\n]{0,100}/i) ||
      text.match(/スター進化[^。＊\n]{0,100}/) ||
      text.match(/離れる時[、,]?かわりに[^。＊\n]{0,100}/);
    if (!m) continue;
    const quote = m[0].trim();
    if (!chunk.text.includes(quote) && !text.includes(quote)) continue;
    // Evidence Gate は原文チャンク上の部分文字列一致。chunk.text から切り出す
    const rawIdx = chunk.text.normalize("NFKC").indexOf(quote);
    const rawQuote =
      rawIdx >= 0
        ? chunk.text.normalize("NFKC").slice(rawIdx, rawIdx + quote.length)
        : quote;
    return {
      type: "card",
      label: chunk.label,
      url: chunk.url,
      quote: rawQuote,
    };
  }
  return null;
}

function pickCardAbilityEvidence(chunks: EvidenceChunk[]): EvidenceItem | null {
  const cardChunks = chunks.filter((c) => c.type === "card");
  for (const marker of ["各文明があれば", "能力が書かれていない", "能力の書かれていない"]) {
    for (const chunk of cardChunks) {
      const idx = chunk.text.indexOf(marker);
      if (idx < 0) continue;
      const start = Math.max(0, chunk.text.lastIndexOf("。", idx) + 1);
      const end = chunk.text.indexOf("。", idx);
      const sentence =
        end >= 0
          ? chunk.text.slice(start, end + 1).trim()
          : chunk.text.slice(start, start + 120).trim();
      if (!sentence || !chunk.text.includes(sentence)) continue;
      return {
        type: "card",
        label: chunk.label,
        url: chunk.url,
        quote: sentence,
      };
    }
  }
  // 注釈のみカード（カッコ書き）を引用
  for (const chunk of cardChunks) {
    const m = chunk.text.match(/（[^）]{4,80}）/);
    if (!m?.[0] || !chunk.text.includes(m[0])) continue;
    // 監視能力カードではなく、注釈だけの対象側を優先
    if (chunk.text.includes("能力が書かれていない")) continue;
    return {
      type: "card",
      label: chunk.label,
      url: chunk.url,
      quote: m[0],
    };
  }
  // フォールバック: 先頭カードの短い引用
  const first = cardChunks[0];
  if (!first?.text.trim()) return null;
  return {
    type: "card",
    label: first.label,
    url: first.url,
    quote: extractQuote(first.text, 160),
  };
}

/** チャンク本文から、Evidence Gate が通る短い連続引用を切り出す */
function extractQuote(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  const slice = normalized.slice(0, maxLen);
  const cut = Math.max(
    slice.lastIndexOf("。"),
    slice.lastIndexOf("．"),
    slice.lastIndexOf("、"),
  );
  return (cut >= 40 ? slice.slice(0, cut + 1) : slice).trim();
}
