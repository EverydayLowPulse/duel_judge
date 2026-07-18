import { containsNormalized } from "./normalize";
import type { AnswerPayload, EvidenceChunk, WithholdPayload } from "./types";

export type GateResult =
  | { ok: true; answer: AnswerPayload; adjustments: string[] }
  | { ok: false; withhold: WithholdPayload; failures: string[] };

const OFFICIAL_PREFIX = "https://dm.takaratomy.co.jp/";

/**
 * answer を出す前の機械チェック。
 * - ハード失敗（捏造・根拠なし）→ withhold
 * - ソフト失敗（confidence ラベル不整合など）→ 自動修正して回答を出す
 */
export function runEvidenceGate(
  answer: AnswerPayload,
  chunks: EvidenceChunk[],
): GateResult {
  const hardFailures: string[] = [];
  const adjustments: string[] = [];
  const corpus = chunks.map((c) => c.text).join("\n");

  if (!answer.evidence?.length) {
    return {
      ok: false,
      failures: ["evidence が空"],
      withhold: {
        kind: "withhold",
        reason: "提供された公式チャンクだけでは根拠付き回答ができませんでした",
        tried: ["Q&A検索", "LLM生成", "Evidence Gate"],
        next_hint:
          "質問を公式Q&Aに近い文言にするか、カード正式名を指定して再試行してください。",
      },
    };
  }

  if (!answer.conclusion?.trim()) {
    hardFailures.push("conclusion が空");
  }

  for (const [i, ev] of (answer.evidence ?? []).entries()) {
    if (!["qa", "rule", "card"].includes(ev.type)) {
      hardFailures.push(`evidence[${i}].type 不正: ${ev.type}`);
    }
    if (!ev.url?.startsWith(OFFICIAL_PREFIX)) {
      hardFailures.push(`evidence[${i}].url が公式ドメイン外`);
    }
    if (!ev.quote?.trim()) {
      hardFailures.push(`evidence[${i}].quote が空`);
    } else if (!containsNormalized(corpus, ev.quote)) {
      hardFailures.push(`evidence[${i}].quote が取得済みチャンクに存在しない`);
    }
    if (ev.type === "rule" && !ev.rule_ref) {
      hardFailures.push(`evidence[${i}] は rule なのに rule_ref がない`);
    }
  }

  if (hardFailures.length > 0) {
    return {
      ok: false,
      failures: hardFailures,
      withhold: {
        kind: "withhold",
        reason: `出典検証に失敗: ${hardFailures.join("; ")}`,
        tried: ["Q&A検索", "Evidence Gate"],
        next_hint:
          "カード正式名を指定するか、質問を具体化してもう一度試してください。",
      },
    };
  }

  const fixed = normalizeConfidence(answer, adjustments);
  return { ok: true, answer: fixed, adjustments };
}

/**
 * confidence と evidence 種別の食い違いは、保留せずラベルを直す。
 */
function normalizeConfidence(
  answer: AnswerPayload,
  adjustments: string[],
): AnswerPayload {
  const hasQa = answer.evidence.some((e) => e.type === "qa");
  const hasRule = answer.evidence.some((e) => e.type === "rule");
  let confidence = answer.confidence;
  let confidence_note = answer.confidence_note;
  let reasoning = answer.reasoning;

  if ((confidence === "high" || confidence === "medium") && !hasQa) {
    const next = hasRule ? "low" : "medium";
    adjustments.push(
      `confidence ${confidence}→${next}（type:qa が無いため自動修正）`,
    );
    confidence = next;
    confidence_note = appendNote(
      confidence_note,
      hasRule
        ? "公式Q&Aなし。ルール/カードからの推論（確信度を自動調整）"
        : "公式Q&Aなし。カード情報からの推論（確信度を自動調整）",
    );
  }

  if (confidence === "low" && hasQa) {
    adjustments.push("confidence low→medium（type:qa があるため自動修正）");
    confidence = "medium";
    confidence_note = appendNote(
      confidence_note,
      "類似Q&Aあり（確信度を自動調整）",
    );
  }

  if (confidence === "low" && !hasRule && !hasQa) {
    // card only は low のまま許容（旧ゲートの「rule必須」はソフト扱いに変更）
    adjustments.push(
      "card根拠のみのため low を維持（rule 必須チェックは緩和）",
    );
  }

  if (
    (confidence === "medium" || confidence === "low") &&
    !reasoning?.trim()
  ) {
    adjustments.push("reasoning が空のため短い注記を自動付与");
    reasoning =
      confidence === "low"
        ? "直接該当の公式Q&Aは使えず、取得済みの公式ルール/カード情報からの推論です。"
        : "類似の公式根拠からの当てはめです。直接該当のQ&Aではない可能性があります。";
  }

  return {
    ...answer,
    confidence,
    confidence_note,
    reasoning,
  };
}

function appendNote(base: string, extra: string): string {
  const trimmed = base?.trim() ?? "";
  if (!trimmed) return extra;
  if (trimmed.includes(extra)) return trimmed;
  return `${trimmed} / ${extra}`;
}
