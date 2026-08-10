/** 論点の種類。ontology の RuleConcept.id と対応させる。 */
export type IssueKind =
  | "mana_payment"
  | "pending_abilities"
  | "resolution_order"
  | "perspective"
  | "declaration_timing"
  | "replacement_effect"
  | "swap_effect"
  | "zone_move"
  | "selection"
  | "attack_procedure"
  | "state_based"
  | "put_vs_summon"
  | "no_written_abilities"
  | "evolution_effect_carry";

export type IssueMatch = {
  kind: IssueKind;
  label: string;
  qaQueries: string[];
  seedQaIds: string[];
  ruleRefs: string[];
  constraints: string[];
  /** 紐づく決定的 validator があればその id */
  validatorId?: string;
};

export type IssueClassification = {
  matches: IssueMatch[];
  qaQueries: string[];
  seedQaIds: string[];
  ruleRefs: string[];
  constraints: string[];
  /** 処理順検証フェーズ（verify_resolution_order）を起動するか */
  orderRelevant: boolean;
};
