import type { AnswerPayload, JudgeContext } from "../answer/types";
import type { OfficialCard } from "../official/types";
import { generateJson } from "./generateJson";
import { answerModelSchema } from "./schemas";

export { getGeminiClient, getGeminiModelName } from "./providers/geminiJson";

/** Gemini / DeepSeek 共通の回答 JSON スキーマ */
const answerJsonSchema = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["answer"] },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["qa", "rule", "card"] },
          label: { type: "string" },
          url: { type: "string" },
          quote: {
            type: "string",
            description:
              "提供チャンクからの一字一句に近い引用。言い換え禁止。",
          },
          rule_ref: { type: "string" },
        },
        required: ["type", "label", "url", "quote"],
      },
    },
    reasoning: { type: "string" },
    conclusion: { type: "string" },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    confidence_note: { type: "string" },
  },
  required: [
    "kind",
    "evidence",
    "conclusion",
    "confidence",
    "confidence_note",
  ],
};

const SYSTEM = `あなたはデュエル・マスターズの裁定確認アシスタントです。
提供された公式チャンク（カード能力・公式Q&A・総合ルール）だけを根拠に答えてください。
チャンクに無い裁定を作ってはいけません。
evidence[].quote はチャンク本文に実際に含まれる文言だけをコピーしてください（要約・言い換え禁止）。
url / rule_ref もチャンクに付与された値だけを使ってください。
type=rule のとき evidence[].rule_ref にルール番号（例: 111.1）を必ず入れてください。
内部の前提条件検証が渡された場合、その verdict と constraintsForAnswer に反する結論を出してはいけません。
特に「使用宣言時点の条件」と「解決時点の条件」を混同しないでください。
誘発して待機した能力は、ソースが場を離れても解決できます。「革命チェンジで離れたから攻撃時効果は使えない」は原則誤りです（qa/39355・qa/39067）。
カードテキストの「自分」「相手」は、その能力を持つカードのコントローラー視点です。
質問者が自分のクリーチャーを選びたい場合でも、相手の「相手がクリーチャーを選ぶ時」能力の「相手」に該当しえます。
「自分のカードを選ぶから強制選択は発動しない」という推論は禁止です。
ツインパクトは質問が指す面（呪文側/クリーチャー側）だけを根拠にしてください。
「〜の術」「唱える」「アンタップ」なら呪文側の選択効果を見ます。
同期の妖精がいて「クリーチャーを選ぶ」効果なら、公式Q&A（スパイラル・ゲート型）を優先引用してください。
内部検証は検索・推論の補助であり evidence には引用せず、根拠は必ず公式チャンクから引用してください。
質問が能力の使用宣言条件を満たすかを問う場合、可能な限り以下を card evidence で引用してください:
- 能力元カードに書かれた条件
- 宣言時点のクリーチャーの文明・種族・コスト・パワーなど、条件判定に使った属性
confidence:
- high: 質問に直接答える公式Q&Aがある
- medium: 類似の公式Q&Aからの当てはめ
- low: Q&Aが使えず、総合ルールからの推論のみ（確定裁定ではない旨を confidence_note に書く）
根拠が足りなければ evidence を空配列にし、conclusion は「根拠不足」だけでよい（後段が withhold にする）。
免責文は書かないでください。`;

/**
 * 裁定回答を生成する。プロバイダは LLM_PROVIDER（auto/gemini/deepseek）。
 */
export async function generateAnswerWithGemini(
  ctx: JudgeContext,
  options?: { validationFailures?: string[] },
): Promise<AnswerPayload> {
  const chunkBlock = ctx.chunks
    .map(
      (c, i) =>
        `[chunk ${i + 1} id=${c.id} type=${c.type}]\nlabel: ${c.label}\nurl: ${c.url}\n---\n${c.text}`,
    )
    .join("\n\n");

  const contextCards = uniqueCards([
    ...(ctx.cards ?? []),
    ...(ctx.card ? [ctx.card] : []),
  ]);
  const cardBlock =
    contextCards.length > 0
      ? contextCards
          .map(
            (card) => `確定カード: ${card.officialName} (${card.cardId})
カード種類: ${card.cardType ?? "不明"}
文明: ${card.civilizations.join("/") || "不明"}
パワー: ${card.power ?? "不明"}
コスト: ${card.cost ?? "不明"}
種族: ${card.races.join("/") || "不明"}
能力:
${card.abilityText}`,
          )
          .join("\n\n")
      : "確定カード: なし";

  const repairBlock = options?.validationFailures?.length
    ? `前回の出典検証エラー:
${options.validationFailures.map((f) => `- ${f}`).join("\n")}

同じ誤りを直してください。evidence[].quote は、下のチャンクから連続した文字列をそのままコピーし、複数チャンクをつなげないでください。`
    : "";

  const userPrompt = `ユーザー質問:
${ctx.question}

${cardBlock}

内部の前提条件・時系列検証（出典として引用しない）:
${ctx.scenarioAnalysis ?? "(なし)"}

利用可能な公式チャンク:
${chunkBlock || "(なし)"}

${repairBlock}

上記だけを根拠に JSON で回答してください。`;

  const parsed = await generateJson({
    system: SYSTEM,
    user: userPrompt,
    jsonSchema: answerJsonSchema,
    zodSchema: answerModelSchema,
    temperature: 0.2,
  });

  return {
    kind: "answer",
    resolved_cards: contextCards.map((card) => ({
      query: ctx.cardQuery ?? card.officialName,
      official_name: card.officialName,
      card_id: card.cardId,
      detail_url: card.detailUrl,
    })),
    evidence: parsed.evidence ?? [],
    reasoning: parsed.reasoning,
    conclusion: parsed.conclusion,
    confidence: parsed.confidence,
    confidence_note: parsed.confidence_note,
  };
}

function uniqueCards(cards: OfficialCard[]): OfficialCard[] {
  const map = new Map<string, OfficialCard>();
  for (const card of cards) {
    if (!map.has(card.officialName)) map.set(card.officialName, card);
  }
  return [...map.values()];
}
