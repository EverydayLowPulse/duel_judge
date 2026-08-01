import type { EvidenceChunk } from "../../answer/types";
import type { ScenarioFacts } from "../facts/types";
import type { IssueClassification } from "../issues/types";

export type ValidatorVerdict = "allowed" | "not_allowed" | "unknown";

export type ValidatorInput = {
  question: string;
  facts: ScenarioFacts;
  issues: IssueClassification;
  chunks?: EvidenceChunk[];
};

export type ValidatorResult = {
  validatorId: string;
  verdict: ValidatorVerdict;
  reason: string;
  usedFacts: string[];
  missingFacts: string[];
  requiredRuleRefs: string[];
  constraintsForAnswer: string[];
};

export type AggregateValidatorResult = {
  results: ValidatorResult[];
  /** 決定的に not_allowed があればそれを優先 */
  hardVerdict?: ValidatorVerdict;
  constraintsForAnswer: string[];
  requiredRuleRefs: string[];
  missingFacts: string[];
};
