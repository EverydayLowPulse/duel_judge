import type { EvidenceChunk } from "../answer/types";
import type { ScenarioFacts } from "../judge/facts/types";
import type { ScenarioCard } from "../judge/scenarioCards";
import { generateJson } from "./generateJson";
import { resolutionOrderModelSchema } from "./schemas";

export type ResolutionOrderVerification = {
  needed: boolean;
  windowStart: {
    event: string;
    reason: string;
  };
  triggers: Array<{
    controller: string;
    abilitySummary: string;
    triggerTiming: string;
    status: "triggered" | "did_not_trigger";
  }>;
  resolutionQueue: Array<{
    order: number;
    controller: string;
    abilitySummary: string;
    note: string;
  }>;
  resolutions: Array<{
    effect: string;
    outcome: "resolves" | "fizzles" | "unknown";
    reason: string;
  }>;
  /** 後段へ渡す短い制約のみ（原則全文はここに繰り返さない） */
  constraintsForAnswer: string[];
};

const schema = {
  type: "object",
  properties: {
    needed: { type: "boolean" },
    windowStart: {
      type: "object",
      properties: {
        event: { type: "string" },
        reason: { type: "string" },
      },
      required: ["event", "reason"],
    },
    triggers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          controller: { type: "string" },
          abilitySummary: { type: "string" },
          triggerTiming: { type: "string" },
          status: {
            type: "string",
            enum: ["triggered", "did_not_trigger"],
          },
        },
        required: [
          "controller",
          "abilitySummary",
          "triggerTiming",
          "status",
        ],
      },
    },
    resolutionQueue: {
      type: "array",
      items: {
        type: "object",
        properties: {
          order: { type: "number" },
          controller: { type: "string" },
          abilitySummary: { type: "string" },
          note: { type: "string" },
        },
        required: ["order", "controller", "abilitySummary", "note"],
      },
    },
    resolutions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          effect: { type: "string" },
          outcome: {
            type: "string",
            enum: ["resolves", "fizzles", "unknown"],
          },
          reason: { type: "string" },
        },
        required: ["effect", "outcome", "reason"],
      },
    },
    constraintsForAnswer: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "needed",
    "windowStart",
    "triggers",
    "resolutionQueue",
    "resolutions",
    "constraintsForAnswer",
  ],
};

const SYSTEM = `あなたはデュエル・マスターズの「効果処理順」Observation 器です。
回答文は作らず、質問に関係する区間だけを時系列で整理してください。

スコープ:
1. まず needed を決める。処理順・同時誘発・誘発と解決の分離が質問の結論に不要なら needed=false とし、空配列と短い windowStart（event="なし"）でよい。
2. needed=true のときだけ、質問の答えに必要な開始イベントを windowStart.event に書く（例: 「クリーチャーAが出た時」「攻撃宣言直後」）。ターン開始や無関係な前段から機械的に辿らない。
3. windowStart 以降に、誘発する能力を triggers に列挙する。誘発しなかったものは did_not_trigger。

原則（カード固有名で分岐しない）:
- 常在型能力と誘発型能力は別物。常在は適用条件を満たす間ずっと効く。誘発は記載タイミングで待ち、条件成立で誘発する。
- 誘発と解決は別イベント。誘発自体はカード記載のタイミングで、各カード・各プレイヤーについて同時に起こりうる。
- 解決順はターンプレイヤーの待機効果 → 非ターンプレイヤーの待機効果（総合ルール 101.4 / 101.4a）。同じプレイヤーの複数待機の間の順は任意である旨を resolutionQueue[].note に書く。
- いったん誘発した能力は発生源や対象から独立して待機しうる（110.5a）。発生源がゾーン移動・封印されても待機自体は原則消えない。
- 発生源にバトル等をさせる効果は、解決時点で発生源が無視／バトル不能ならその行動は不発。手札に戻す等は発生源の行動を要しないので残りうる。
- 盤面にいた対象の状態を参照して発動する効果は、対象が離れる前の状態（最終情報）を参照しうる。離れたあとのゾーン状態だけを見て「対象がいないから誘発しなかった」と短絡しない。
- 「封印された／離れたから誘発しない」は、誘発と解決の混同として禁止（取得済み根拠と矛盾しない説明がある場合のみ例外）。

出力:
- resolutionQueue は 101.4a に沿った解決順の観察（任意順の箇所は note で明示）。
- resolutions は各効果の resolves / fizzles / unknown と理由。
- constraintsForAnswer は後段回答用の短い箇条書きのみ（最大8件）。原則の全文コピーは禁止。本件の結論を縛る観察だけ書く。
- 公式カード情報と取得済みチャンクに無い事実は作らない。この結果は出典ではなく内部 Observation。`;

/**
 * 後段（回答生成）へ渡す短いブロック。巨大 JSON は渡さない。
 */
export function formatResolutionOrderConstraints(
  verification: ResolutionOrderVerification | undefined,
): string | undefined {
  if (!verification?.needed) return undefined;
  const lines: string[] = [];
  if (verification.windowStart.event && verification.windowStart.event !== "なし") {
    lines.push(
      `開始: ${verification.windowStart.event}（${verification.windowStart.reason}）`,
    );
  }
  if (verification.resolutionQueue.length > 0) {
    const queue = verification.resolutionQueue
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(
        (item) =>
          `${item.order}. [${item.controller}] ${item.abilitySummary}${
            item.note ? ` — ${item.note}` : ""
          }`,
      )
      .join(" / ");
    lines.push(`解決キュー: ${queue}`);
  }
  for (const c of verification.constraintsForAnswer.slice(0, 8)) {
    const t = c.trim();
    if (t) lines.push(t);
  }
  if (lines.length === 0) return undefined;
  return `【処理順Observation（内部。evidenceには引用しない）】\n${lines
    .map((l) => `- ${l}`)
    .join("\n")}`;
}

export async function verifyResolutionOrderWithGemini(input: {
  question: string;
  cards: ScenarioCard[];
  chunks: EvidenceChunk[];
  facts?: ScenarioFacts;
}): Promise<ResolutionOrderVerification> {
  const cards = input.cards
    .map(
      ({ mention, role, relevantAbility, card }) =>
        `[mention=${mention} role=${role} ability=${relevantAbility || "-"}]
正式名: ${card.officialName}
カード種類: ${card.cardType ?? "不明"}
文明: ${card.civilizations.join("/") || "不明"}
公式能力:
${card.abilityText}
URL: ${card.detailUrl}`,
    )
    .join("\n\n");

  const sources = input.chunks
    .filter((c) => c.type === "qa" || c.type === "rule")
    .slice(0, 12)
    .map((c) => `[${c.id} ${c.label}]\n${c.text}\nURL: ${c.url}`)
    .join("\n\n");

  const timeline =
    input.facts?.timelineNotes?.length ?
      input.facts.timelineNotes.join("\n")
    : "(なし)";
  const actions =
    input.facts?.actions?.length ?
      input.facts.actions
        .map(
          (a) =>
            `${a.kind}${a.targetMention ? ` → ${a.targetMention}` : ""} (${a.source})`,
        )
        .join("\n")
    : "(なし)";

  return generateJson({
    system: SYSTEM,
    user: `質問:\n${input.question}\n\n公式カード情報:\n${cards || "(なし)"}\n\n主張されたタイムライン（内部）:\n${timeline}\n\n主張されたアクション（内部）:\n${actions}\n\n取得済み公式Q&A・ルール（抜粋）:\n${sources || "(なし)"}`,
    jsonSchema: schema,
    zodSchema: resolutionOrderModelSchema,
    temperature: 0,
    purpose: "verify",
  });
}
