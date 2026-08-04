import type { EvidenceChunk } from "../../answer/types";
import type { ScenarioFacts } from "../facts/types";
import type { IssueClassification } from "../issues/types";

export type ValidatorVerdict = "allowed" | "not_allowed" | "unknown";

export type ValidatorInput = {
  question: string;
  facts: ScenarioFacts;
  issues: IssueClassification;
  chunks?: EvidenceChunk[];
  /** 公式DB由来の能力テキスト（カード名分岐には使わずパターン検出のみ） */
  cardAbilityTexts?: string[];
};

export type ValidatorResult = {
  validatorId: string;
  verdict: ValidatorVerdict;
  reason: string;
  usedFacts: string[];
  missingFacts: string[];
  requiredRuleRefs: string[];
  constraintsForAnswer: string[];
  /**
   * あるときは LLM を介さずこの結論で AnswerPayload を組み立てる。
   * allowed/not_allowed の二元では表せない裁定（誘発したが解決不発など）用。
   */
  craftedConclusion?: string;
  craftedReasoning?: string;
};

export type AggregateValidatorResult = {
  results: ValidatorResult[];
  /** 決定的に not_allowed があればそれを優先 */
  hardVerdict?: ValidatorVerdict;
  constraintsForAnswer: string[];
  requiredRuleRefs: string[];
  missingFacts: string[];
};
