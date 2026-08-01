import type { SearchPlan } from "../../llm/searchPlanner";
import type { OfficialCard } from "../../official/types";
import { nameKeyMatches, normalizeCardNameKey } from "../../resolve/nameMatch";
import type { ScenarioCard } from "../scenarioCards";
import { buildDeclarationPowerHints } from "./declarationPower";
import { buildLeaveReplacementHints } from "./leaveReplacement";
import { buildWrittenAbilityHints } from "./writtenAbilities";
import type {
  ManaZoneEntry,
  ScenarioAction,
  ScenarioEntity,
  ScenarioFacts,
  Zone,
} from "./types";

/**
 * SearchPlan + 解決済みカードから ScenarioFacts を構築する。
 * カード属性は公式DB由来のみ採用し、LLMの数値推測は使わない。
 */
export function buildScenarioFacts(input: {
  question: string;
  plan: SearchPlan;
  scenarioCards: ScenarioCard[];
  primaryCard?: OfficialCard;
}): ScenarioFacts {
  const question = input.question;
  const resolvedByMention = new Map<string, OfficialCard>();
  for (const item of input.scenarioCards) {
    resolvedByMention.set(normalizeCardNameKey(item.mention), item.card);
    resolvedByMention.set(
      normalizeCardNameKey(item.card.officialName),
      item.card,
    );
  }
  if (input.primaryCard) {
    resolvedByMention.set(
      normalizeCardNameKey(input.primaryCard.officialName),
      input.primaryCard,
    );
  }

  const entities: ScenarioEntity[] = [];
  for (const mention of input.plan.cardMentions) {
    const card =
      resolvedByMention.get(normalizeCardNameKey(mention.mention)) ??
      findCardByLooseName(mention.mention, input.scenarioCards);
    entities.push({
      mention: mention.mention,
      zone: inferZone(question, mention.mention),
      card,
      source: card ? "official_card" : "user",
    });
  }

  // プランに無いが解決済みのカードも entity に残す
  for (const item of input.scenarioCards) {
    if (
      entities.some(
        (e) =>
          normalizeCardNameKey(e.mention) ===
            normalizeCardNameKey(item.mention) ||
          (e.card &&
            normalizeCardNameKey(e.card.officialName) ===
              normalizeCardNameKey(item.card.officialName)),
      )
    ) {
      continue;
    }
    entities.push({
      mention: item.mention,
      zone: inferZone(question, item.mention),
      card: item.card,
      source: "official_card",
    });
  }

  const actions = inferActions(question, input.plan);
  const manaZone = extractManaZone(question, input.scenarioCards, entities);
  const paymentTarget = inferPaymentTarget({
    question,
    plan: input.plan,
    scenarioCards: input.scenarioCards,
    primaryCard: input.primaryCard,
    entities,
  });
  const declarationPower = buildDeclarationPowerHints({
    question,
    scenarioCards: input.scenarioCards,
  });
  const leaveReplacement = buildLeaveReplacementHints({
    question,
    scenarioCards: input.scenarioCards,
  });
  const writtenAbilities = buildWrittenAbilityHints({
    question,
    scenarioCards: input.scenarioCards,
  });

  return {
    question,
    entities,
    actions,
    manaZone,
    paymentTarget,
    declarationPower:
      declarationPower.length > 0 ? declarationPower : undefined,
    leaveReplacement:
      leaveReplacement.length > 0 ? leaveReplacement : undefined,
    writtenAbilities:
      writtenAbilities.length > 0 ? writtenAbilities : undefined,
    timelineNotes: input.plan.events.slice(0, 8),
  };
}

function inferActions(question: string, plan: SearchPlan): ScenarioAction[] {
  const q = normalize(question);
  const actions: ScenarioAction[] = [];
  if (q.includes(normalize("召喚")) || plan.events.some((e) => normalize(e).includes(normalize("召喚")))) {
    actions.push({ kind: "summon", source: "user" });
  }
  if (q.includes(normalize("唱える")) || q.includes(normalize("呪文"))) {
    actions.push({ kind: "cast", source: "user" });
  }
  if (q.includes(normalize("攻撃")) || plan.events.some((e) => normalize(e).includes(normalize("攻撃")))) {
    actions.push({ kind: "attack", source: "user" });
  }
  if (
    q.includes(normalize("革命チェンジ")) ||
    q.includes(normalize("入れ替え"))
  ) {
    actions.push({ kind: "replace", source: "user" });
  }
  return actions;
}

function inferZone(question: string, mention: string): Zone {
  const q = normalize(question);
  const m = normalize(mention);
  // 「マナにA、B、C」パターン
  if (
    q.includes(normalize("マナに")) ||
    q.includes(normalize("マナゾーン"))
  ) {
    // 召喚対象っぽい言及の直後でないカードはマナ候補として後段で再分類
    if (q.includes(m)) return "mana_zone";
  }
  if (q.includes(normalize("手札"))) return "hand";
  if (q.includes(normalize("バトルゾーン"))) return "battle_zone";
  return "unknown";
}

/**
 * 「マナにA、B、Cが存在する」のような列挙を、解決済みカードへ紐づける。
 */
function extractManaZone(
  question: string,
  scenarioCards: ScenarioCard[],
  entities: ScenarioEntity[],
): ManaZoneEntry[] {
  const qNorm = normalize(question);
  const hasManaContext =
    qNorm.includes(normalize("マナに")) ||
    qNorm.includes(normalize("マナゾーン")) ||
    qNorm.includes(normalize("マナが"));
  if (!hasManaContext) {
    return entities
      .filter((e) => e.zone === "mana_zone" && e.card)
      .map((e) => toManaEntry(e.mention, e.card!));
  }

  const entries: ManaZoneEntry[] = [];
  const seen = new Set<string>();

  // 「マナに〜」以降を切り出してカード名を拾う
  const manaSpan = sliceManaSpan(question);
  const candidates = [
    ...scenarioCards.map((c) => ({
      mention: c.mention,
      card: c.card,
    })),
    ...scenarioCards.map((c) => ({
      mention: c.card.officialName,
      card: c.card,
    })),
  ];

  // 質問に現れる回数ぶんマナに載せる（5000VTが2枚など）
  for (const candidate of uniqueByOfficialName(candidates)) {
    const count = countMentions(manaSpan || question, [
      candidate.mention,
      candidate.card.officialName,
      ...shortAliases(candidate.card.officialName),
    ]);
    if (count <= 0) continue;
    for (let i = 0; i < count; i += 1) {
      const key = `${candidate.card.officialName}#${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(toManaEntry(candidate.mention, candidate.card));
    }
  }

  // 列挙の「3枚」と整合しない場合でも、取れた分だけ返す（不足は validator が unknown/not_allowed）
  return entries;
}

function inferPaymentTarget(input: {
  question: string;
  plan: SearchPlan;
  scenarioCards: ScenarioCard[];
  primaryCard?: OfficialCard;
  entities: ScenarioEntity[];
}): ScenarioFacts["paymentTarget"] {
  const q = normalize(input.question);
  const summonLike =
    q.includes(normalize("召喚")) || q.includes(normalize("唱える"));
  if (!summonLike) return undefined;

  // 「Xの召喚」「Xを召喚」を優先
  for (const item of input.scenarioCards) {
    const names = [item.mention, item.card.officialName];
    for (const name of names) {
      const n = normalize(name);
      if (
        q.includes(n + normalize("の召喚")) ||
        q.includes(n + normalize("を召喚")) ||
        q.includes(normalize("召喚") + n)
      ) {
        return toPaymentTarget(name, item.card);
      }
    }
  }

  if (input.primaryCard) {
    return toPaymentTarget(
      input.primaryCard.officialName,
      input.primaryCard,
    );
  }

  // 多色カードを召喚対象候補に
  const multi = input.scenarioCards.find(
    (c) => c.card.civilizations.length >= 2,
  );
  if (multi) return toPaymentTarget(multi.mention, multi.card);

  return undefined;
}

function toPaymentTarget(
  mention: string,
  card: OfficialCard,
): NonNullable<ScenarioFacts["paymentTarget"]> {
  return {
    mention,
    card,
    cost: parseCost(card.cost),
    civilizations: [...card.civilizations],
    source: "official_card",
  };
}

function toManaEntry(mention: string, card: OfficialCard): ManaZoneEntry {
  return {
    mention,
    card,
    civilizations: [...card.civilizations],
    manaValue: card.manaValue ?? 1,
    source: "official_card",
  };
}

function parseCost(cost: string | null): number {
  if (!cost) return 0;
  const m = cost.normalize("NFKC").match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function sliceManaSpan(question: string): string {
  const normalized = question.normalize("NFKC");
  const markers = ["マナに", "マナゾーンに", "マナゾーン", "マナが"];
  for (const marker of markers) {
    const idx = normalized.indexOf(marker);
    if (idx >= 0) {
      const sliced = normalized.slice(idx, idx + 160);
      // 「の3枚」「が存在するとき」以降（召喚対象の再言及）は含めない
      const cut = sliced.split(
        /の\s*\d+\s*枚|が存在|とき|時に|、?召喚|を召喚|の召喚/,
      )[0];
      return cut ?? sliced;
    }
  }
  return normalized;
}

function countMentions(text: string, names: string[]): number {
  const hay = normalize(text);
  let count = 0;
  for (const name of names) {
    const needle = normalize(name);
    if (needle.length < 2) continue;
    let from = 0;
    while (from < hay.length) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      count += 1;
      from = at + needle.length;
    }
    if (count > 0) break;
  }
  return count;
}

function shortAliases(officialName: string): string[] {
  // 「ピザスターのアンティハムト」→「アンティハムト」
  // 「飛翔龍 5000VT」→「5000VT」「5000vt」
  // 「大集合！アカネ&アサギ&コハク」→「大集合」
  const parts = officialName.split(/[\s　/／]+/).filter(Boolean);
  const aliases = [...parts];
  const noPrefix = officialName.replace(/^.*?の/, "");
  if (noPrefix && noPrefix !== officialName) aliases.push(noPrefix);
  const head = officialName.split(/[!！&＆]/)[0]?.trim();
  if (head && head.length >= 2 && head !== officialName) aliases.push(head);
  return aliases;
}

function findCardByLooseName(
  mention: string,
  scenarioCards: ScenarioCard[],
): OfficialCard | undefined {
  return scenarioCards.find((c) => nameKeyMatches(c.card.officialName, mention))
    ?.card;
}

function uniqueByOfficialName(
  items: Array<{ mention: string; card: OfficialCard }>,
): Array<{ mention: string; card: OfficialCard }> {
  const map = new Map<string, { mention: string; card: OfficialCard }>();
  for (const item of items) {
    if (!map.has(item.card.officialName)) {
      map.set(item.card.officialName, item);
    }
  }
  return [...map.values()];
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫:：]/g, "")
    .toLowerCase();
}
