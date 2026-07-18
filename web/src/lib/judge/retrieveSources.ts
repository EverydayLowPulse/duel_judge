import type { SearchPlan } from "../llm/searchPlanner";
import { fetchQaArticle, searchQaHits } from "../official/qa";
import type { OfficialQa, QaSearchHit } from "../official/qaTypes";
import {
  matchKeywordRules,
  type MatchedKeyword,
} from "../rules/keywordDictionary";
import { lookupRuleChunksByRefs } from "../rules/lookupByRefs";
import { searchRules } from "../rules/searchRules";
import type { RuleSearchHit } from "../rules/types";

export type RetrievedSources = {
  qaArticles: OfficialQa[];
  ruleHits: RuleSearchHit[];
  usedQaQueries: string[];
  usedRuleQueries: string[];
  matchedKeywords: MatchedKeyword[];
  seededQaIds: string[];
};

/**
 * 検索プランの複数クエリを実行し、重複を統合して関連度順に絞る。
 * プラン自体は根拠ではなく、ここで取得した公式本文だけが後段の evidence 候補になる。
 * キーワード能力名は静的辞書でルール節を決定的に注入する（検索漏れ対策）。
 */
export async function retrieveOfficialSources(input: {
  question: string;
  plan: SearchPlan;
  maxQaArticles?: number;
  maxRuleHits?: number;
  /** 視点誤読対策などで必ず残したい公式Q&A ID */
  seedQaIds?: string[];
  /** プラン外でも追加で走らせる Q&A 検索語 */
  extraQaQueries?: string[];
}): Promise<RetrievedSources> {
  const qaQueries = unique([
    ...(input.extraQaQueries ?? []),
    ...input.plan.qaQueries,
  ]).slice(0, 7);
  const ruleQueries = unique(input.plan.ruleQueries).slice(0, 8);
  const forcedSeedIds = unique(input.seedQaIds ?? []);
  const relevanceTerms = unique([
    ...input.plan.entities,
    ...input.plan.events,
    ...input.plan.concepts,
    ...qaQueries,
    ...ruleQueries,
  ]);
  const keywordMatch = matchKeywordRules([
    input.question,
    ...input.plan.entities,
    ...input.plan.events,
    ...input.plan.concepts,
    ...input.plan.cardMentions.map(
      (item) => `${item.mention} ${item.relevantAbility}`,
    ),
    ...qaQueries,
    ...ruleQueries,
  ]);

  const qaCandidates = new Map<
    string,
    { hit: QaSearchHit; score: number }
  >();
  const qaSeedIds: string[] = [...forcedSeedIds];
  for (const [queryIndex, query] of qaQueries.entries()) {
    const hits = await searchQaHits(query);
    // 各検索語は異なる検索意図を表すため、公式検索の最上位を最低1件は残す。
    // 全候補を文字列一致だけで再順位付けすると、長いカード名を含む記事に偏り、
    // 「同期の妖精 選ぶ」のような汎用裁定の類似例が最終候補から消えてしまう。
    if (hits[0]) qaSeedIds.push(hits[0].qaId);
    for (const hit of hits) {
      const score =
        scoreText(hit.questionPreview, relevanceTerms) +
        Math.max(0, 10 - queryIndex * 2) +
        (forcedSeedIds.includes(hit.qaId) ? 50 : 0);
      const previous = qaCandidates.get(hit.qaId);
      if (!previous || score > previous.score) {
        qaCandidates.set(hit.qaId, { hit, score });
      }
    }
  }

  // 検索に出なくても、錨となる公式Q&Aは候補へ強制登録する。
  for (const qaId of forcedSeedIds) {
    if (qaCandidates.has(qaId)) continue;
    qaCandidates.set(qaId, {
      hit: {
        qaId,
        url: `https://dm.takaratomy.co.jp/rule/qa/${qaId}/`,
        questionPreview: `(seeded) ${qaId}`,
      },
      score: 100,
    });
  }

  const rankedQa = [...qaCandidates.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.hit.qaId) - Number(a.hit.qaId),
    );
  const topQa = selectDiverseQaCandidates(
    qaCandidates,
    qaSeedIds,
    rankedQa,
    Math.max(input.maxQaArticles ?? 5, forcedSeedIds.length + 2),
  );

  const qaArticles: OfficialQa[] = [];
  for (const { hit } of topQa) {
    try {
      qaArticles.push(await fetchQaArticle(hit.qaId));
    } catch {
      // 1記事の取得失敗で他の候補まで捨てない。
    }
  }

  const ruleCandidates = new Map<string, RuleSearchHit>();
  // 辞書ヒットは検索より先に入れ、最終候補からも落とさない。
  const dictionaryHits = await lookupRuleChunksByRefs(keywordMatch.ruleRefs);
  for (const hit of dictionaryHits) {
    ruleCandidates.set(hit.ruleRef, hit);
  }

  for (const [queryIndex, query] of ruleQueries.entries()) {
    const result = await searchRules(query, { limit: 6 });
    for (const hit of result.hits) {
      const score =
        hit.score +
        scoreText(hit.text, relevanceTerms) +
        Math.max(0, 8 - queryIndex);
      const previous = ruleCandidates.get(hit.ruleRef);
      if (!previous || score > previous.score) {
        ruleCandidates.set(hit.ruleRef, { ...hit, score });
      }
    }
  }

  const maxRuleHits = input.maxRuleHits ?? 5;
  const dictionaryRefs = new Set(dictionaryHits.map((hit) => hit.ruleRef));
  const rankedRules = [...ruleCandidates.values()].sort(
    (a, b) =>
      b.score - a.score || a.ruleRef.localeCompare(b.ruleRef),
  );
  const ruleHits = selectRulesKeepingDictionary(
    rankedRules,
    dictionaryRefs,
    // 辞書分を確保しつつ、検索結果も最低限残す。
    Math.max(maxRuleHits, dictionaryHits.length + 2),
  );

  return {
    qaArticles,
    ruleHits,
    usedQaQueries: qaQueries,
    usedRuleQueries: ruleQueries,
    matchedKeywords: keywordMatch.matches,
    seededQaIds: forcedSeedIds,
  };
}

function scoreText(text: string, terms: string[]): number {
  const haystack = normalize(text);
  let score = 0;
  for (const term of terms) {
    const needle = normalize(term);
    if (!needle || needle.length < 2) continue;
    if (haystack.includes(needle)) {
      score += Math.min(needle.length, 16);
    }
  }
  return score;
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

function selectDiverseQaCandidates(
  candidates: Map<string, { hit: QaSearchHit; score: number }>,
  seedIds: string[],
  ranked: Array<{ hit: QaSearchHit; score: number }>,
  limit: number,
): Array<{ hit: QaSearchHit; score: number }> {
  if (limit <= 0) return [];

  const selected: Array<{ hit: QaSearchHit; score: number }> = [];
  const seen = new Set<string>();
  const add = (candidate: { hit: QaSearchHit; score: number } | undefined) => {
    if (!candidate || selected.length >= limit || seen.has(candidate.hit.qaId)) {
      return;
    }
    selected.push(candidate);
    seen.add(candidate.hit.qaId);
  };

  for (const id of seedIds) add(candidates.get(id));
  for (const candidate of ranked) add(candidate);
  return selected;
}

function selectRulesKeepingDictionary(
  ranked: RuleSearchHit[],
  dictionaryRefs: Set<string>,
  limit: number,
): RuleSearchHit[] {
  if (limit <= 0) return [];
  const selected: RuleSearchHit[] = [];
  const seen = new Set<string>();
  const add = (hit: RuleSearchHit | undefined) => {
    if (!hit || selected.length >= limit || seen.has(hit.ruleRef)) return;
    selected.push(hit);
    seen.add(hit.ruleRef);
  };

  for (const hit of ranked) {
    if (dictionaryRefs.has(hit.ruleRef)) add(hit);
  }
  for (const hit of ranked) add(hit);
  return selected;
}
