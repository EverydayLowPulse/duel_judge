import { resolveCardName } from "../../resolve/resolveCardName";
import type { ScenarioCard } from "../scenarioCards";
import { buildScenarioFacts } from "./buildScenarioFacts";
import type { ScenarioFacts } from "./types";
import type { SearchPlan } from "../../llm/searchPlanner";
import type { OfficialCard } from "../../official/types";

/**
 * マナ列挙に含まれる未解決カード名を公式DBで補完してから facts を組み立てる。
 *
 * `resolveExtraCards: false`（送信前確定モード）では公式検索をしない。
 * 盤面に関わるカードはユーザーが選び切っているため、文章から推定して足さない。
 */
export async function buildEnrichedScenarioFacts(input: {
  question: string;
  plan: SearchPlan;
  scenarioCards: ScenarioCard[];
  primaryCard?: OfficialCard;
  resolveExtraCards?: boolean;
}): Promise<{ facts: ScenarioFacts; extraCards: ScenarioCard[] }> {
  const tokens =
    input.resolveExtraCards === false ? [] : extractManaTokens(input.question);
  const extraCards: ScenarioCard[] = [];
  const known = new Set(
    input.scenarioCards.flatMap((c) => [
      normalize(c.mention),
      normalize(c.card.officialName),
    ]),
  );

  for (const token of tokens.slice(0, 6)) {
    if (known.has(normalize(token))) continue;
    // 短すぎる・数字だけのトークンはスキップしない（5000vt は通す）
    if (token.length < 2) continue;
    const result = await resolveCardName(token, { maxDetails: 8 });
    if (result.kind !== "resolved") continue;
    extraCards.push({
      mention: token,
      role: "other",
      relevantAbility: "",
      card: result.card,
    });
    known.add(normalize(token));
    known.add(normalize(result.card.officialName));
  }

  const scenarioCards = [...input.scenarioCards, ...extraCards];
  const facts = buildScenarioFacts({
    ...input,
    scenarioCards,
  });
  return { facts, extraCards };
}

function extractManaTokens(question: string): string[] {
  const normalized = question.normalize("NFKC");
  const markers = ["マナに", "マナゾーンに", "マナゾーン"];
  let span: string | null = null;
  for (const marker of markers) {
    const idx = normalized.indexOf(marker);
    if (idx >= 0) {
      span = normalized.slice(idx, idx + 160);
      break;
    }
  }
  // マナのマーカーが無ければマナ列挙は無い。質問全文を候補にすると
  // 文の断片をカード名として公式検索してしまう。
  if (span === null) return [];
  // 「の3枚」「が存在する」などで切る
  span = span.split(/の\s*\d+\s*枚|が存在|とき|時、|。/)[0] ?? span;

  return span
    .replace(/マナ(ゾーン)?に/g, "")
    .split(/[、,，・\s　]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .filter((t) => !/^(存在する|とき|時|枚)$/.test(t));
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫:：]/g, "")
    .toLowerCase();
}
