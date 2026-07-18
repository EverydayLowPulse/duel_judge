import { z } from "zod";

/** モデルが返す answer JSON（resolved_cards はアプリ側で付与） */
export const answerModelSchema = z.object({
  kind: z.literal("answer").optional().default("answer"),
  evidence: z
    .array(
      z.object({
        type: z.enum(["qa", "rule", "card"]),
        label: z.string(),
        url: z.string(),
        quote: z.string(),
        rule_ref: z.string().optional(),
      }),
    )
    .default([]),
  reasoning: z.string().optional(),
  conclusion: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  confidence_note: z.string(),
});

export const searchPlanModelSchema = z.object({
  cardMentions: z
    .array(
      z.object({
        mention: z.string(),
        role: z.enum([
          "attacker",
          "intermediate",
          "ability_source",
          "other",
        ]),
        relevantAbility: z.string(),
      }),
    )
    .default([]),
  entities: z.array(z.string()).default([]),
  events: z.array(z.string()).default([]),
  concepts: z.array(z.string()).default([]),
  qaQueries: z.array(z.string()).default([]),
  ruleQueries: z.array(z.string()).default([]),
});

export const scenarioVerificationModelSchema = z.object({
  verdict: z.enum(["allowed", "not_allowed", "unknown"]),
  summary: z.string().default(""),
  declarationChecks: z
    .array(
      z.object({
        ability: z.string(),
        sourceCard: z.string(),
        declarationTiming: z.string(),
        activeCardAtDeclaration: z.string(),
        requiredCondition: z.string(),
        conditionSatisfied: z.enum(["yes", "no", "unknown"]),
        reason: z.string(),
      }),
    )
    .default([]),
  perspectiveChecks: z
    .array(
      z.object({
        term: z.enum(["自分", "相手", "other"]),
        sourceCard: z.string(),
        interpretedAs: z.string(),
        relativeToController: z.enum(["yes", "no", "unknown"]),
        reason: z.string(),
      }),
    )
    .default([]),
  precedentDiffs: z
    .array(
      z.object({
        qaChunkId: z.string(),
        casePremise: z.string(),
        thisCasePremise: z.string(),
        sameDeclarationConditions: z.enum(["yes", "no", "unknown"]),
        transferable: z.enum(["yes", "no", "unknown"]),
        note: z.string(),
      }),
    )
    .default([]),
  timeline: z.array(z.string()).default([]),
  constraintsForAnswer: z.array(z.string()).default([]),
});
