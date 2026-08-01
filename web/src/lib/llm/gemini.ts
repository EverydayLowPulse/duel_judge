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

【根拠の絞り込み（必須）】
- evidence には、結論を支えるために実際に使う根拠だけを入れてください（目安 1〜3件。最大でも結論に直結するものだけ）。
- チャンクに載っているからといって、話題が近いだけのルール／Q&A／カードを並べないでください。
- reasoning で使わない根拠は evidence に入れないでください。逆に、evidence に入れたものは reasoning で結論への橋渡しを書いてください。
- 例（入れない）: 質問が「出る時のマナ枚数メタ／保留中の枚数カウント」なのに、進化の効果継続（801.2）や再構築（801.4c）を根拠にする。
- 例（入れる）: 同じ質問なら、メタ側カードテキスト・出る側カードテキスト・保留と枚数のルール（例: 409.1c）など、結論の分岐に必要なもの。
- 「侵略」「進化」という語が質問やカード文にあっても、問いが効果の引き継ぎ／最初の攻撃のリセットでなければ 801.2 系を根拠にしない。

内部の前提条件検証が渡された場合、その verdict と constraintsForAnswer に反する結論を出してはいけません。
特に「使用宣言時点の条件」と「解決時点の条件」を混同しないでください。
誘発して待機した能力は、ソースが場を離れても／封印されても待機効果自体は消えない（110.5a）。「離れた／封印されたから誘発しない・使えない」は原則誤り。
ただし効果が発生源にバトル等をさせるタイプなら、解決時点で発生源が無視されている・バトル不能ならその行動は不発。手札に戻すなど発生源の行動を要しない効果は残る。
決定的validatorが not_allowed と判定した事項に反する結論は禁止です。
多色カード1枚をタップしても、そのカードが持つ全文明を同時に支払ったことにはなりません（107.2 / 112.2a）。
カードテキストの「自分」「相手」は、その能力を持つカードのコントローラー視点です。
「自分のカードを選ぶから相手の強制選択は発動しない」という推論は禁止です。強制選択がありうるなら取得済み類似Q&Aを優先引用してください。
『クリーチャーまたはタマシードを選ぶ』効果でも、強制選択側のクリーチャーが選べるなら必ずそれを選ぶ（タマシード専用に分けて回避できない）。公式Q&Aがあればそれを優先引用してください。
ツインパクトは質問が指す面（呪文側/クリーチャー側）だけを根拠にしてください。
内部検証は検索・推論の補助であり evidence には引用せず、根拠は必ず公式チャンクから引用してください。
使用宣言条件を問う場合、能力テキストの条件と宣言時点の属性（文明・種族・コスト・パワー等）を card evidence で引用してください。
パワー条件は印刷値だけで決め打ちしない。攻撃開始前から有効な修正は含め、攻撃開始後の誘発パンプは含めない。
入れ替え（革命チェンジ等）は条件充足と移動成功が別問題。カード移動が正常にできないと失敗する（701.26b）。原因は進化に限らない。
侵略は重ね置きであり入れ替えではない。革命チェンジ／入れ替えと混同しないこと。「破壊される時かわりにマナへ」は入れ替え阻害ではない。
置換効果は原則として連鎖しない。『かわりにこのシールドをブレイク』する置換ブレイクでカードが離れる場合、通常ブレイク向けの『シールドゾーンを離れる時、かわりに墓地へ』は適用されず手札に加わる（取得済みQ&Aがあればそれを優先引用）。
reasoning は公式Q&Aの言い換えだけで終わらせない。結論に使う総合ルールがあるなら、その原理を1〜2文で橋渡しすること。
問いが「進化／侵略後も効果が残るか」「最初の攻撃がリセットされるか」のときだけ、801.2（同一クリーチャー・効果継続）を根拠にしてよい。その場合は evidence にも type=rule で入れ、reasoning で橋渡しする。
ジャストダイバー（出た時に付与される継続的効果）とマッハファイター（常在型能力）を混同しない。前者は進化後も残り、後者は進化元能力が無視されると失われ引き継がれない（公式Q&Aがあればそれを優先引用）。
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

上記だけを根拠に JSON で回答してください。
evidence は結論に必要なものだけにし、使わないチャンクは無視してください。`;

  const parsed = await generateJson({
    system: SYSTEM,
    user: userPrompt,
    jsonSchema: answerJsonSchema,
    zodSchema: answerModelSchema,
    temperature: 0.2,
    purpose: "answer",
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
