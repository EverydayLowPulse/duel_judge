import type { IssueMatch } from "../../judge/issues/types";
import { getConceptById, RULE_CONCEPTS } from "./concepts";
import type { ResolvedConcepts, RuleConcept } from "./types";

/**
 * 論点分類結果から RuleConcept を解決し、ruleRefs / qaSeeds / constraints を統合する。
 */
export function resolveConceptsFromIssues(
  matches: IssueMatch[],
): ResolvedConcepts {
  const concepts: RuleConcept[] = [];
  const ruleRefs = new Set<string>();
  const qaSeeds = new Set<string>();
  const constraints: string[] = [];
  const validatorIds = new Set<string>();

  for (const match of matches) {
    const concept = getConceptById(match.kind);
    if (concept) {
      concepts.push(concept);
      for (const ref of concept.ruleRefs) ruleRefs.add(ref);
      for (const id of concept.qaSeeds) qaSeeds.add(id);
      for (const inv of concept.invariants) {
        constraints.push(`[${concept.label}] ${inv}`);
      }
      for (const fallacy of concept.commonFallacies) {
        constraints.push(`[${concept.label}・禁止推論] ${fallacy}`);
      }
      if (concept.validatorId) validatorIds.add(concept.validatorId);
    }
    for (const ref of match.ruleRefs) ruleRefs.add(ref);
    for (const id of match.seedQaIds) qaSeeds.add(id);
    constraints.push(...match.constraints);
    if (match.validatorId) validatorIds.add(match.validatorId);
  }

  return {
    concepts,
    ruleRefs: [...ruleRefs],
    qaSeeds: [...qaSeeds],
    constraints: unique(constraints),
    validatorIds: [...validatorIds],
  };
}

/** 質問テキストからも概念の補助マッチを取る（構造トリガーの補完） */
export function matchConceptsByText(texts: string[]): RuleConcept[] {
  const haystack = normalize(texts.join("\n"));
  return RULE_CONCEPTS.filter((concept) => {
    const needles = [
      concept.label,
      ...concept.aliases,
      ...concept.structuralHints,
    ].map(normalize);
    return needles.some(
      (needle) => needle.length >= 2 && haystack.includes(needle),
    );
  });
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫]/g, "")
    .toLowerCase();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
