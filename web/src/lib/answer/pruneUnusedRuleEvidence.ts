import type { AnswerPayload, EvidenceItem } from "./types";

/**
 * reasoning / conclusion で触れられていないルール根拠を落とす。
 * （チャンクに載っているだけの関係薄い総合ルールを UI に出さない）
 * card / qa は結論カードや類似例として残しうるので、原則そのまま。
 */
export function pruneUnusedRuleEvidence(answer: AnswerPayload): {
  answer: AnswerPayload;
  removed: string[];
} {
  const body = normalize(
    [answer.conclusion ?? "", answer.reasoning ?? ""].join("\n"),
  );
  const removed: string[] = [];
  const evidence: EvidenceItem[] = [];

  for (const ev of answer.evidence ?? []) {
    if (ev.type !== "rule" || !ev.rule_ref?.trim()) {
      evidence.push(ev);
      continue;
    }
    const ref = normalize(ev.rule_ref);
    if (ref && body.includes(ref)) {
      evidence.push(ev);
      continue;
    }
    removed.push(ev.rule_ref);
  }

  // 全部落とすと Gate が空 evidence で withhold するので、最低1件は残す
  if (evidence.length === 0 && (answer.evidence?.length ?? 0) > 0) {
    return { answer, removed: [] };
  }

  return {
    answer: { ...answer, evidence },
    removed,
  };
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
