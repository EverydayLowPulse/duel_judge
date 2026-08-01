import type { IssueKind } from "../../judge/issues/types";

export type RuleConcept = {
  id: IssueKind | string;
  label: string;
  aliases: string[];
  /** 質問文に含まれると発火しうる語（補助。構造トリガーは issue classifier 側） */
  structuralHints: string[];
  ruleRefs: string[];
  qaSeeds: string[];
  requiredFacts: string[];
  validatorId?: string;
  invariants: string[];
  commonFallacies: string[];
};

export type ResolvedConcepts = {
  concepts: RuleConcept[];
  ruleRefs: string[];
  qaSeeds: string[];
  constraints: string[];
  validatorIds: string[];
};
