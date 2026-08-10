import type { EvidenceChunk } from "../answer/types";
import { formatDeclarationPowerHints } from "../judge/facts/declarationPower";
import { formatLeaveReplacementHints } from "../judge/facts/leaveReplacement";
import { formatWrittenAbilityHints } from "../judge/facts/writtenAbilities";
import type { ScenarioFacts } from "../judge/facts/types";
import type { ScenarioCard } from "../judge/scenarioCards";
import { generateJson } from "./generateJson";
import { scenarioVerificationModelSchema } from "./schemas";

export type ScenarioVerification = {
  verdict: "allowed" | "not_allowed" | "unknown";
  summary: string;
  declarationChecks: Array<{
    ability: string;
    sourceCard: string;
    declarationTiming: string;
    activeCardAtDeclaration: string;
    requiredCondition: string;
    conditionSatisfied: "yes" | "no" | "unknown";
    reason: string;
  }>;
  /** 「自分／相手」が誰の視点かの明示チェック */
  perspectiveChecks: Array<{
    term: "自分" | "相手" | "other";
    sourceCard: string;
    interpretedAs: string;
    relativeToController: "yes" | "no" | "unknown";
    reason: string;
  }>;
  /**
   * 引用候補の公式Q&Aと本件の前提差分。
   * 類似事例の結論をそのまま流用しないためのガード。
   */
  precedentDiffs: Array<{
    qaChunkId: string;
    casePremise: string;
    thisCasePremise: string;
    sameDeclarationConditions: "yes" | "no" | "unknown";
    transferable: "yes" | "no" | "unknown";
    note: string;
  }>;
  timeline: string[];
  constraintsForAnswer: string[];
};

const schema = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["allowed", "not_allowed", "unknown"],
    },
    summary: { type: "string" },
    declarationChecks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ability: { type: "string" },
          sourceCard: { type: "string" },
          declarationTiming: { type: "string" },
          activeCardAtDeclaration: { type: "string" },
          requiredCondition: { type: "string" },
          conditionSatisfied: {
            type: "string",
            enum: ["yes", "no", "unknown"],
          },
          reason: { type: "string" },
        },
        required: [
          "ability",
          "sourceCard",
          "declarationTiming",
          "activeCardAtDeclaration",
          "requiredCondition",
          "conditionSatisfied",
          "reason",
        ],
      },
    },
    perspectiveChecks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string", enum: ["自分", "相手", "other"] },
          sourceCard: { type: "string" },
          interpretedAs: { type: "string" },
          relativeToController: {
            type: "string",
            enum: ["yes", "no", "unknown"],
          },
          reason: { type: "string" },
        },
        required: [
          "term",
          "sourceCard",
          "interpretedAs",
          "relativeToController",
          "reason",
        ],
      },
    },
    precedentDiffs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qaChunkId: { type: "string" },
          casePremise: { type: "string" },
          thisCasePremise: { type: "string" },
          sameDeclarationConditions: {
            type: "string",
            enum: ["yes", "no", "unknown"],
          },
          transferable: {
            type: "string",
            enum: ["yes", "no", "unknown"],
          },
          note: { type: "string" },
        },
        required: [
          "qaChunkId",
          "casePremise",
          "thisCasePremise",
          "sameDeclarationConditions",
          "transferable",
          "note",
        ],
      },
    },
    timeline: { type: "array", items: { type: "string" } },
    constraintsForAnswer: { type: "array", items: { type: "string" } },
  },
  required: [
    "verdict",
    "summary",
    "declarationChecks",
    "perspectiveChecks",
    "precedentDiffs",
    "timeline",
    "constraintsForAnswer",
  ],
};

const SYSTEM = `あなたはデュエル・マスターズ裁定の前提条件検証器です。
回答文を作るのではなく、能力の「使用宣言」と「解決」を時系列で分離して検証してください。

必須手順:
1. 攻撃開始時など、能力を使用宣言する瞬間のアクティブなクリーチャーを確定する。
2. 宣言する各能力について、能力元カードの公式テキストから文明・種族・コスト・パワー等の条件を抜き出す。
3. その条件を、宣言時点のアクティブなクリーチャーの公式属性と比較する。
4. 宣言時点で条件を満たさない能力は、その後の侵略・進化・パンプ等で条件を満たしても遡って宣言できない。
5. 宣言できたか（誘発・使用宣言）と、宣言後に解決できるかを混同しない。
   （待機キュー・同時誘発・101.4a の解決順は別フェーズ verify_resolution_order が担当する。ここでは扱わない。）
6. カードテキストに「自分」「相手」や強制選択（相手が選ぶ時／かわりに選ぶ）がある場合、perspectiveChecks を作る:
   - 「自分／相手」は能力コントローラー視点（質問者視点ではない）
   - 「自分のカードを選ぶから強制選択は発動しない」という推論は禁止
   - 強制選択がありうるなら、取得済み類似Q&Aを transferable 判定の有力候補にする
   - ツインパクトは質問語から呪文側/クリーチャー側を先に確定する
7. 取得済みの各公式Q&Aについて precedentDiffs を必ず作る:
   - casePremise / thisCasePremise / sameDeclarationConditions / transferable
   - 結論だけ似ていても、宣言時点の条件が違うなら transferable=no
8. transferable=no のQ&Aを、本件を「可能」とするための主根拠にしてはならない。
9. カード候補が曖昧で結論が変わりうる場合は unknown にする。
9b. 質問が「使用宣言の条件（攻撃時能力・侵略の種族条件など）」を問っていない場合:
   - declarationChecks は空配列にしてよい
   - 召喚時の置換（出る時かわりにマナへ等）や支払い可否だけなら、宣言条件 unknown を理由に verdict=unknown にしない
10. 宣言時点のパワー計算:
   - 印刷パワーだけで決め打ちしない
   - 攻撃開始前から有効な修正（出す時のこのターン＋N、常在型など）は含める
   - 「攻撃する時」誘発で後から上がるパワーは含めない
   - 内部の「宣言時点パワー見積もり」があればそれを基準にする
11. 入れ替え成功は条件充足とは別問題（進化専用ではない）:
   - カード移動が正常にできないと入れ替え失敗（701.26b）
   - 一部だけ離れる／本体が残る／場の置換で移動不能、のいずれでも not_allowed になりうる
   - 内部の「入れ替え阻害」で blocksSwap=yes なら、入れ替え成功と結論してはならない
12. 「カードに能力が書かれていない」判定:
   - 注釈文（カッコ書き）は能力ではない（205.2a）
   - 注釈のみのクリーチャーは能力なし扱い
   - 内部の「印刷能力の有無」があればそれを優先する
13. 置換効果:
   - 置換は原則連鎖しない
   - 置換ブレイクでシールドが離れる場合、通常ブレイク向けの『離れる時かわりに墓地』は適用されず手札へ（取得済みQ&A優先）
   - 句点（。）で区切られる文章の一部だけが置換されたとき、その句点の範囲だけが置換済み（101.5a）
   - 同じ能力の別句点は別イベント。一部置換＝後続句点まで全部無効、と短絡しない

公式カード情報と取得済み公式チャンクに無い属性や条件は作らないでください。
この検証結果自体は出典ではなく、後段の回答を論理的に制約する内部データです。`;

export async function verifyScenarioWithGemini(input: {
  question: string;
  cards: ScenarioCard[];
  chunks: EvidenceChunk[];
  facts?: ScenarioFacts;
}): Promise<ScenarioVerification> {
  const cards = input.cards
    .map(
      ({ mention, role, relevantAbility, card }) => `[mention=${mention} role=${role} ability=${relevantAbility || "-"}]
正式名: ${card.officialName}
カード種類: ${card.cardType ?? "不明"}
文明: ${card.civilizations.join("/") || "不明"}
パワー: ${card.power ?? "不明"}
コスト: ${card.cost ?? "不明"}
種族: ${card.races.join("/") || "不明"}
公式能力:
${card.abilityText}
URL: ${card.detailUrl}`,
    )
    .join("\n\n");

  const sources = input.chunks
    .filter((c) => c.type === "qa" || c.type === "rule")
    .map(
      (c) =>
        `[${c.id} ${c.label}]\n${c.text}\nURL: ${c.url}`,
    )
    .join("\n\n");

  const powerBlock =
    formatDeclarationPowerHints(input.facts?.declarationPower ?? []) ??
    "(なし)";
  const leaveBlock =
    formatLeaveReplacementHints(input.facts?.leaveReplacement ?? []) ??
    "(なし)";
  const writtenBlock =
    formatWrittenAbilityHints(input.facts?.writtenAbilities ?? []) ?? "(なし)";

  return generateJson({
    system: SYSTEM,
    user: `質問:\n${input.question}\n\n公式カード情報:\n${cards || "(なし)"}\n\n宣言時点パワー見積もり（内部。印刷だけで決め打ちしない）:\n${powerBlock}\n\n離脱置換（内部。入れ替え阻害の判定用）:\n${leaveBlock}\n\n印刷能力の有無（内部。注釈文は能力に数えない）:\n${writtenBlock}\n\n取得済み公式Q&A・ルール:\n${sources || "(なし)"}`,
    jsonSchema: schema,
    zodSchema: scenarioVerificationModelSchema,
    temperature: 0,
    purpose: "verify",
  });
}
