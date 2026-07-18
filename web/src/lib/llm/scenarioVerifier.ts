import type { EvidenceChunk } from "../answer/types";
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
5b. 待機中能力の解決を誤らない:
   - 誘発して待機した能力は、ソースがバトルゾーンを離れても解決できる（110.5a）
   - 革命チェンジで手札に戻った元攻撃クリーチャーの「攻撃する時」は入れ替え後も解決できる（qa/39355）
   - 入れ替え後の「攻撃する時」と新クリーチャーの「出た時」は好きな順番で解決できる（qa/39067）
   - 「場を離れたから攻撃時効果は使えない」という結論は、上記と矛盾しない説明がない限り禁止
   - 質問が「出た時を使ってから攻撃時を使う」なら、原則 allowed（ハイパー面の有無など別条件は明示）
6. カードテキストに「自分」「相手」がある場合、perspectiveChecks を必ず作る:
   - 「自分／相手」は質問者視点ではなく、その能力を持つカードのコントローラー視点
   - 強制選択カード（同期の妖精等）があるなら、そのカードの「相手」について必ず1件作る
   - 質問者が自分のクリーチャーを選びたい場合でも、相手の「相手がクリーチャーを選ぶ時」の
     「相手」に該当しうる
   - 「自分のカードを対象にするから相手の強制選択は発動しない」という推論は禁止
   - 同期の妖精など強制選択がある場合、スパイラル・ゲート型の公式Q&A（qa/43917）を
     transferable=yes の有力候補として扱う（「クリーチャーを選ぶ」効果なら原則適用）
   - ツインパクトは質問語（術・唱える・アンタップ等）から呪文側/クリーチャー側を先に確定する。
     呪文側の「クリーチャーを1体選びタップ/アンタップ」を、クリーチャー側の攻撃時能力と取り違えない
7. 取得済みの各公式Q&Aについて precedentDiffs を必ず作る:
   - casePremise: そのQ&A事例側の宣言時点の前提（どのカードが攻撃中で、どの条件を満たしていたか）
   - thisCasePremise: 本件の宣言時点の前提
   - sameDeclarationConditions: 宣言条件が実質同じか
   - transferable: そのQ&Aの結論を本件へ移植してよいか
   - 結論だけ似ていても、宣言時点の条件が違うなら transferable=no にする
   - 例: 「レッドゾーン侵略＋革命チェンジが可能」のQ&Aでも、事例のチェンジ先が
     攻撃開始時点ですでに条件を満たすカードで、本件のチェンジ先が満たさないなら
     transferable=no。制約に「このQ&Aは本件の可能根拠に使えない」と書く
8. transferable=no のQ&Aを、本件を「可能」とするための主根拠にしてはならない。
9. カード候補が曖昧で結論が変わりうる場合は unknown にする。

公式カード情報と取得済み公式チャンクに無い属性や条件は作らないでください。
この検証結果自体は出典ではなく、後段の回答を論理的に制約する内部データです。`;

export async function verifyScenarioWithGemini(input: {
  question: string;
  cards: ScenarioCard[];
  chunks: EvidenceChunk[];
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

  return generateJson({
    system: SYSTEM,
    user: `質問:\n${input.question}\n\n公式カード情報:\n${cards || "(なし)"}\n\n取得済み公式Q&A・ルール:\n${sources || "(なし)"}`,
    jsonSchema: schema,
    zodSchema: scenarioVerificationModelSchema,
    temperature: 0,
  });
}
