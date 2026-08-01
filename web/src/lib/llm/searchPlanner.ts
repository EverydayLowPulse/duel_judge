import type { OfficialCard } from "../official/types";
import { extractSearchKeywords } from "../judge/extractKeywords";
import { isKnownKeywordAbilityName } from "../rules/keywordDictionary";
import { generateJson } from "./generateJson";
import { searchPlanModelSchema } from "./schemas";

export type SearchPlan = {
  cardMentions: Array<{
    mention: string;
    role: "attacker" | "intermediate" | "ability_source" | "other";
    relevantAbility: string;
  }>;
  /** 質問に登場するカード・能力など。検索補助専用で、根拠にはしない。 */
  entities: string[];
  /** ゲーム中に起きる操作・状態変化を順序に依存しない短い語で表す。 */
  events: string[];
  /** 総合ルールに現れそうな汎用概念。 */
  concepts: string[];
  /** 公式Q&Aの qa_w に1件ずつ渡す短い検索語。 */
  qaQueries: string[];
  /** ローカル総合ルール索引へ渡す検索語。 */
  ruleQueries: string[];
};

const searchPlanSchema = {
  type: "object",
  properties: {
    cardMentions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          mention: { type: "string" },
          role: {
            type: "string",
            enum: ["attacker", "intermediate", "ability_source", "other"],
          },
          relevantAbility: { type: "string" },
        },
        required: ["mention", "role", "relevantAbility"],
      },
    },
    entities: { type: "array", items: { type: "string" } },
    events: { type: "array", items: { type: "string" } },
    concepts: { type: "array", items: { type: "string" } },
    qaQueries: { type: "array", items: { type: "string" } },
    ruleQueries: { type: "array", items: { type: "string" } },
  },
  required: [
    "cardMentions",
    "entities",
    "events",
    "concepts",
    "qaQueries",
    "ruleQueries",
  ],
};

const SYSTEM = `あなたはデュエル・マスターズ公式文書の検索プランナーです。
ユーザーの個別状況を、公式Q&Aや総合ルールに現れる一般的な用語へ抽象化してください。

重要:
- これは検索語を作る工程であり、裁定の結論を出す工程ではありません。
- 「可能」「不可能」など、まだ証明されていない結論を検索語に混ぜないでください。
- 質問中のカード名・略称を cardMentions に分離してください。推測した別名へ勝手に置換せず、
  質問に出てきた表記のまま mention に書いてください（例: 「クイかぼ」「ダーバンデ」）。
- 「〇〇のメタ」「〇〇の置換」のような言い方でも、〇〇がカード略称なら cardMentions に入れてください。
  role は状況に応じて付け、不明なら other でよい（other でも解決対象にする）。
  mention にはユーザーの表記を保ち、role と relevantAbility（侵略、革命チェンジ等）を付けてください。
- キーワード能力名そのもの（例: Zラッシュ、Sトリガー、侵略、革命チェンジ、ニンジャストライク）は
  カード名ではないので cardMentions に入れないでください。concepts / events / relevantAbility 側へ書いてください。
- カード固有名・能力名は entities に残しつつ、events と concepts では汎用化してください。
- events は「攻撃」「使用宣言」「進化」「解決」など、起きた操作を短く列挙してください。
- concepts は「使用宣言が必要な誘発型能力」「複数の誘発型能力」「解決順序」
  「ゾーン指定のない能力」など、総合ルールの語彙に寄せてください。
- qaQueries は公式Q&A検索向けに1〜3語の短い検索語を2〜4件作ってください。
  固有能力名を含む検索と、汎用概念の検索を両方含めてください。
- qaQueries の動詞は、質問文をそのまま写さず「選ぶ」「唱える」「攻撃する」のような
  公式Q&Aに現れやすい基本形にしてください。
- ruleQueries は総合ルール向けに、概念ごとの短い検索語を2〜5件作ってください。
- 表記揺れがありそうなら「ニンジャストライク」と「ニンジャ・ストライク」のような候補を含めて構いません。
- 与えられていないカード名やルール番号を作らないでください。`;

/**
 * 質問を「固有名 → イベント → 汎用ルール概念 → 複数検索語」に変換する。
 * 生成結果は検索にだけ使い、回答の evidence には使わない。
 */
export async function planSearchWithGemini(input: {
  question: string;
  card?: OfficialCard;
}): Promise<SearchPlan> {
  const cardContext = input.card
    ? `確定カード: ${input.card.officialName}\n能力テキスト:\n${input.card.abilityText}`
    : "確定カード: なし";

  try {
    const parsed = await generateJson({
      system: SYSTEM,
      user: `ユーザー質問:\n${input.question}\n\n${cardContext}`,
      jsonSchema: searchPlanSchema,
      zodSchema: searchPlanModelSchema,
      temperature: 0.1,
      purpose: "plan",
    });
    return sanitizePlan(parsed, input);
  } catch {
    // 検索プランナーの混雑・一時障害で裁定全体を止めない。
    return deterministicFallback(input);
  }
}

function sanitizePlan(
  raw: Partial<SearchPlan>,
  input: { question: string; card?: OfficialCard },
): SearchPlan {
  const keywords = extractSearchKeywords(input.question);
  const rawMentions = cleanCardMentions(raw.cardMentions);
  const keywordMentions = rawMentions
    .filter((m) => isKnownKeywordAbilityName(m.mention))
    .map((m) => m.mention);
  const cardMentions = rawMentions
    .filter((m) => !isKnownKeywordAbilityName(m.mention))
    .slice(0, 6);
  const entities = unique([
    ...(input.card ? [input.card.officialName] : []),
    ...cleanList(raw.entities),
    ...keywordMentions,
    ...keywords.slice(0, 3),
  ]);
  const events = unique(cleanList(raw.events)).slice(0, 8);
  const concepts = unique([
    ...cleanList(raw.concepts),
    ...keywordMentions,
  ]).slice(0, 8);
  const qaQueries = unique(
    [
      ...cleanList(raw.qaQueries),
      ...(input.card ? [input.card.officialName] : []),
      ...keywordMentions,
      ...keywords.slice(0, 2),
    ].map(normalizeQaQuery),
  ).slice(0, 5);
  const ruleQueries = unique([
    ...cleanList(raw.ruleQueries),
    ...concepts,
    ...events,
    ...keywords.slice(0, 2),
  ]).slice(0, 8);

  return {
    cardMentions,
    entities,
    events,
    concepts,
    qaQueries,
    ruleQueries,
  };
}

function deterministicFallback(input: {
  question: string;
  card?: OfficialCard;
}): SearchPlan {
  const keywords = extractSearchKeywords(input.question);
  const entities = unique([
    ...(input.card ? [input.card.officialName] : []),
    ...keywords,
  ]).slice(0, 8);
  return {
    cardMentions: input.card
      ? [
          {
            mention: input.card.officialName,
            role: "other",
            relevantAbility: "",
          },
        ]
      : [],
    entities,
    events: [],
    concepts: [],
    qaQueries: entities.slice(0, 4),
    ruleQueries: entities.slice(0, 6),
  };
}

function cleanCardMentions(value: unknown): SearchPlan["cardMentions"] {
  if (!Array.isArray(value)) return [];
  const roles = new Set([
    "attacker",
    "intermediate",
    "ability_source",
    "other",
  ]);
  return value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({
      mention: typeof v.mention === "string" ? v.mention.trim() : "",
      role: roles.has(String(v.role))
        ? (v.role as SearchPlan["cardMentions"][number]["role"])
        : ("other" as const),
      relevantAbility:
        typeof v.relevantAbility === "string"
          ? v.relevantAbility.trim()
          : "",
    }))
    .filter((v) => v.mention.length >= 2);
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.replace(/\s+/g, " ").trim())
    .filter((v) => v.length >= 2 && v.length <= 80);
}

function normalizeQaQuery(value: string): string {
  return value
    .replace(/選ばなければ(?:ならない|いけない)/g, "選ぶ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
