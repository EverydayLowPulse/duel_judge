/**
 * LLMなしの純関数テスト: 多色マナ支払い validator + 代替無色コスト
 */
import {
  manaZoneHasCivilizations,
  parseAlternateColorlessSummon,
} from "../src/lib/judge/validators/alternateColorlessSummon";
import {
  checkManaPayment,
  validateManaPayment,
} from "../src/lib/judge/validators/manaPayment";
import type { ScenarioFacts } from "../src/lib/judge/facts/types";
import type { OfficialCard } from "../src/lib/official/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  // アンティハムト相当: 光/火/自然 cost3、マナは3色1枚+水2枚
  const anti = checkManaPayment({
    cost: 3,
    requiredCivilizations: ["光", "火", "自然"],
    manaZone: [
      { civilizations: ["光", "火", "自然"], manaValue: 1 },
      { civilizations: ["水"], manaValue: 1 },
      { civilizations: ["水"], manaValue: 1 },
    ],
  });
  assert(!anti.canPay, "anti-hamuto case should be not payable");
  console.log("OK anti-hamuto color shortfall:", anti.reason);

  // 大集合: 各文明があれば無色2
  const alt = parseAlternateColorlessSummon(
    "自分のマナゾーンに光、水、自然の各文明があれば、このクリーチャーを[cc02]支払って召喚してもよい。",
  );
  assert(alt !== null, "should parse alternate colorless summon");
  assert(alt.colorlessCost === 2, "cost should be 2");
  assert(alt.presenceCivilizations.join("/") === "光/水/自然", "civs");
  const presence = manaZoneHasCivilizations(
    [
      { civilizations: ["光", "水", "自然"] },
      { civilizations: ["水"] },
      { civilizations: ["水"] },
    ],
    alt.presenceCivilizations,
  );
  assert(presence.ok, "multicolor should satisfy presence of all civs");
  console.log("OK daishugo alternate parse + presence");

  // 単色 cost3 + 水3枚 → 可能
  const mono = checkManaPayment({
    cost: 3,
    requiredCivilizations: ["水"],
    manaZone: [
      { civilizations: ["水"], manaValue: 1 },
      { civilizations: ["水"], manaValue: 1 },
      { civilizations: ["水"], manaValue: 1 },
    ],
  });
  assert(mono.canPay, "mono water should be payable");
  console.log("OK mono water");

  // 3色を3枚の単色で払う → 可能
  const rainbow = checkManaPayment({
    cost: 3,
    requiredCivilizations: ["光", "火", "自然"],
    manaZone: [
      { civilizations: ["光"], manaValue: 1 },
      { civilizations: ["火"], manaValue: 1 },
      { civilizations: ["自然"], manaValue: 1 },
    ],
  });
  assert(rainbow.canPay, "three mono colors should be payable");
  console.log("OK three mono colors");

  // 文明は足りるが枚数不足
  const short = checkManaPayment({
    cost: 5,
    requiredCivilizations: ["火"],
    manaZone: [
      { civilizations: ["火"], manaValue: 1 },
      { civilizations: ["火"], manaValue: 1 },
    ],
  });
  assert(!short.canPay, "mana shortfall should fail");
  assert(short.manaShortfall === 3, "shortfall should be 3");
  console.log("OK mana shortfall");

  // 多色2枚で2文明 → 可能（柔軟な割当）
  const flex = checkManaPayment({
    cost: 2,
    requiredCivilizations: ["光", "火"],
    manaZone: [
      { civilizations: ["光", "自然"], manaValue: 1 },
      { civilizations: ["火", "水"], manaValue: 1 },
    ],
  });
  assert(flex.canPay, "flexible multicolor assignment should work");
  console.log("OK flexible multicolor");

  // validateManaPayment: 大集合は代替で可能、アンティハムトは不可
  const daishugoCard = fakeCard({
    officialName: "大集合！アカネ&アサギ&コハク",
    civilizations: ["光", "水", "自然"],
    cost: "3",
    abilityText:
      "自分のマナゾーンに光、水、自然の各文明があれば、このクリーチャーを[cc02]支払って召喚してもよい。",
  });
  const daishugoFacts = fakeFacts(daishugoCard, [
    { civilizations: ["光", "水", "自然"], manaValue: 1 },
    { civilizations: ["水"], manaValue: 1 },
    { civilizations: ["水"], manaValue: 1 },
  ]);
  const daishugoResult = validateManaPayment({
    question: daishugoFacts.question,
    facts: daishugoFacts,
    issues: { matches: [], qaQueries: [], seedQaIds: [], ruleRefs: [], constraints: [] },
  });
  assert(
    daishugoResult.verdict === "allowed",
    `daishugo should be allowed via alternate, got ${daishugoResult.verdict}: ${daishugoResult.reason}`,
  );
  console.log("OK daishugo validate allowed:", daishugoResult.reason);

  const antiCard = fakeCard({
    officialName: "ピザスターのアンティハムト",
    civilizations: ["光", "火", "自然"],
    cost: "3",
    abilityText: "出た時、相手のクリーチャーを1体破壊する。",
  });
  const antiFacts = fakeFacts(antiCard, [
    { civilizations: ["光", "火", "自然"], manaValue: 1 },
    { civilizations: ["水"], manaValue: 1 },
    { civilizations: ["水"], manaValue: 1 },
  ]);
  const antiResult = validateManaPayment({
    question: antiFacts.question,
    facts: antiFacts,
    issues: { matches: [], qaQueries: [], seedQaIds: [], ruleRefs: [], constraints: [] },
  });
  assert(
    antiResult.verdict === "not_allowed",
    `anti-hamuto should stay not_allowed, got ${antiResult.verdict}`,
  );
  console.log("OK anti-hamuto validate not_allowed");

  console.log("ALL PASSED");
}

function fakeCard(partial: {
  officialName: string;
  civilizations: string[];
  cost: string;
  abilityText: string;
}): OfficialCard {
  return {
    cardId: "test",
    officialName: partial.officialName,
    productLabel: null,
    cardType: "クリーチャー",
    civilizations: partial.civilizations,
    power: "3000",
    cost: partial.cost,
    manaValue: 1,
    races: [],
    abilityText: partial.abilityText,
    faces: [{ cardType: "クリーチャー", abilityText: partial.abilityText }],
    detailUrl: "https://dm.takaratomy.co.jp/card/detail/?id=test",
    fetchedAt: new Date().toISOString(),
  };
}

function fakeFacts(
  card: OfficialCard,
  mana: Array<{ civilizations: string[]; manaValue: number }>,
): ScenarioFacts {
  return {
    question: `マナに${card.officialName}があるとき、${card.officialName}の召喚は可能か`,
    entities: [],
    actions: [{ kind: "summon", targetMention: card.officialName, source: "user" }],
    manaZone: mana.map((m, i) => ({
      mention: `mana${i}`,
      civilizations: m.civilizations,
      manaValue: m.manaValue,
      source: "official_card" as const,
    })),
    paymentTarget: {
      mention: card.officialName,
      card,
      cost: Number(card.cost),
      civilizations: [...card.civilizations],
      source: "official_card",
    },
    timelineNotes: [],
  };
}

main();
