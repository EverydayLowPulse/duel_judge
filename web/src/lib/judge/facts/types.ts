import type { OfficialCard } from "../../official/types";

/** 事実の出所。LLM推測は inferred。validator は official_card / user のみ信頼する。 */
export type FactSource = "user" | "official_card" | "inferred";

export type Zone =
  | "hand"
  | "battle_zone"
  | "mana_zone"
  | "shield_zone"
  | "graveyard"
  | "deck"
  | "unknown";

export type ScenarioEntity = {
  mention: string;
  zone: Zone;
  card?: OfficialCard;
  source: FactSource;
};

export type ScenarioActionKind =
  | "summon"
  | "cast"
  | "attack"
  | "replace"
  | "move"
  | "other";

export type ScenarioAction = {
  kind: ScenarioActionKind;
  /** 召喚・唱える対象などのメンション */
  targetMention?: string;
  source: FactSource;
};

export type ManaZoneEntry = {
  mention: string;
  card?: OfficialCard;
  civilizations: string[];
  manaValue: number;
  source: FactSource;
};

/** 攻撃開始＝使用宣言時点のパワー見積もり（印刷＋既に有効な修正） */
export type DeclarationPowerHint = {
  targetMention: string;
  targetOfficialName?: string;
  printedPower: number | null;
  modifiers: Array<{
    sourceMention: string;
    sourceOfficialName: string;
    delta: number;
    kind: "turn_long_on_put" | "static" | "unknown";
    evidence: string;
    source: FactSource;
  }>;
  estimatedPowerAtAttackStart: number | null;
  notes: string[];
  source: FactSource;
};

/**
 * 「カードに能力が書かれていない」系の誘発用。
 * 注釈文（カッコ）は能力に数えない（205.2a）。
 */
export type WrittenAbilityHint = {
  watcherMention: string;
  watcherOfficialName: string;
  targetMention: string;
  targetOfficialName: string;
  /** 注釈を除いたあと能力テキストが残るか */
  hasWrittenAbilities: boolean;
  /** 監視能力の条件を満たすか（能力なし扱い） */
  countsAsNoWrittenAbilities: boolean;
  evidence: string;
  notes: string[];
  source: FactSource;
};

/**
 * 入れ替え（革命チェンジ等）を阻害しうる移動異常。
 * 進化専用ではなく、701.26b の「正常に移動できない」全般。
 */
export type LeaveReplacementHint = {
  targetMention: string;
  targetOfficialName?: string;
  kind:
    | "g_neo_evolved"
    | "star_evolution"
    | "ex_life"
    | "g_link"
    | "cannot_leave"
    | "leave_replace_text"
    | "external_field";
  /** 阻害の型: 一部だけ離れる / 本体が残る / 場の他効果 */
  blockMode: "partial_leave" | "stays_in_bz" | "external";
  /** 部分離脱系で、下にカード等がある主張か */
  hasUnderCards: boolean;
  /** 入れ替え（革命チェンジ）を阻害するか */
  blocksSwap: boolean;
  evidence: string;
  notes: string[];
  source: FactSource;
};

/**
 * 質問で主張された事実だけを持つ軽量モデル。
 * SearchPlan は検索補助専用で、裁定にはこの型へ変換して渡す。
 */
export type ScenarioFacts = {
  question: string;
  entities: ScenarioEntity[];
  actions: ScenarioAction[];
  manaZone: ManaZoneEntry[];
  /** 召喚・唱える対象（公式属性で確定できた場合） */
  paymentTarget?: {
    mention: string;
    card: OfficialCard;
    cost: number;
    civilizations: string[];
    source: FactSource;
  };
  /** 革命チェンジ等の宣言条件用。攻撃開始前から有効なパワー修正を含む */
  declarationPower?: DeclarationPowerHint[];
  /**
   * 入れ替え阻害（離脱置換・離れない・場の置換など）。
   * 進化に限らず、701.26b で移動が正常にできないケース。
   */
  leaveReplacement?: LeaveReplacementHint[];
  /** 「能力が書かれていない」監視と召喚対象の印刷能力判定 */
  writtenAbilities?: WrittenAbilityHint[];
  timelineNotes: string[];
};
