import { getConceptById } from "../../rules/ontology/concepts";
import type { ScenarioFacts } from "../facts/types";
import { matchPendingAbilityHints } from "../pendingAbilities";
import { matchPerspectiveHints } from "../perspective";
import {
  isOrderRelevant,
  matchResolutionOrderHints,
} from "../resolutionOrder";
import type { IssueClassification, IssueMatch } from "./types";

/**
 * 論点分類レジストリ。
 * 既存の perspective / pendingAbilities を同じ IssueMatch 形へ寄せ、
 * マナ支払いなど構造トリガーもここで発火する。
 */
export function classifyIssues(input: {
  question: string;
  facts: ScenarioFacts;
  entities?: string[];
  cardTexts?: string[];
}): IssueClassification {
  const matches: IssueMatch[] = [];

  const perspective = matchPerspectiveHints({
    question: input.question,
    entities: input.entities,
    cardTexts: input.cardTexts,
  });
  if (perspective) {
    const concept = getConceptById("perspective");
    matches.push({
      kind: "perspective",
      label: perspective.label,
      qaQueries: perspective.qaQueries,
      seedQaIds: perspective.seedQaIds,
      ruleRefs: concept?.ruleRefs ?? [],
      constraints: perspective.constraints,
    });
  }

  const pending = matchPendingAbilityHints({
    question: input.question,
    entities: input.entities,
    cardTexts: input.cardTexts,
  });
  if (pending) {
    const concept = getConceptById("pending_abilities");
    matches.push({
      kind: "pending_abilities",
      label: pending.label,
      qaQueries: pending.qaQueries,
      seedQaIds: pending.seedQaIds,
      ruleRefs: concept?.ruleRefs ?? [],
      constraints: pending.constraints,
    });
  }

  // 処理順フェーズ用。原則文は制約に積まず、ruleRefs / qaSeeds だけ検索へ流す。
  const resolutionOrder = matchResolutionOrderHints({
    question: input.question,
    entities: input.entities,
    cardTexts: input.cardTexts,
  });
  const orderRelevant = isOrderRelevant({
    question: input.question,
    entities: input.entities,
    cardTexts: input.cardTexts,
    pendingMatched: Boolean(pending),
  });
  if (orderRelevant) {
    const concept = getConceptById("resolution_order");
    const fromHint = resolutionOrder;
    matches.push({
      kind: "resolution_order",
      label: fromHint?.label ?? concept?.label ?? "効果の処理順",
      qaQueries: fromHint?.qaQueries ?? [
        "効果 処理 順番",
        "ターンプレイヤー 待機 解決",
        "同時に誘発 解決順",
      ],
      seedQaIds: fromHint?.seedQaIds ?? concept?.qaSeeds ?? [],
      ruleRefs: fromHint?.ruleRefs ?? concept?.ruleRefs ?? [],
      constraints: [],
    });
  }

  if (shouldCheckManaPayment(input.facts)) {
    const concept = getConceptById("mana_payment");
    matches.push({
      kind: "mana_payment",
      label: concept?.label ?? "マナ・コスト支払い",
      qaQueries: ["多色 マナ 支払う", "多色カード 文明 タップ"],
      seedQaIds: concept?.qaSeeds ?? [],
      ruleRefs: concept?.ruleRefs ?? ["107.2", "112.2a"],
      constraints: [
        ...(concept?.invariants.map((i) => `[マナ支払い] ${i}`) ?? []),
        ...(concept?.commonFallacies.map(
          (f) => `[マナ支払い・禁止推論] ${f}`,
        ) ?? []),
      ],
    });
  }

  // facts 駆動: 宣言時点パワーや入れ替え阻害が取れたら論点を立てる
  if (shouldCheckDeclarationTiming(input)) {
    const declaration = getConceptById("declaration_timing");
    if (declaration) {
      matches.push({
        kind: "declaration_timing",
        label: declaration.label,
        qaQueries: [
          "使用宣言 条件 パワー",
          "攻撃する時 パワー 条件",
          "攻撃開始 時点 条件",
        ],
        seedQaIds: declaration.qaSeeds,
        ruleRefs: declaration.ruleRefs,
        constraints: [
          ...declaration.invariants.map((i) => `[使用宣言] ${i}`),
          ...declaration.commonFallacies.map(
            (f) => `[使用宣言・禁止推論] ${f}`,
          ),
        ],
      });
    }
  }

  if (shouldCheckSwapEffect(input)) {
    const swap = getConceptById("swap_effect");
    if (swap) {
      matches.push({
        kind: "swap_effect",
        label: swap.label,
        qaQueries: [
          "入れ替え 失敗",
          "入れ替え 移動",
          "革命チェンジ 入れ替え",
        ],
        seedQaIds: swap.qaSeeds,
        ruleRefs: swap.ruleRefs,
        constraints: [
          ...swap.invariants.map((i) => `[入れ替え] ${i}`),
          ...swap.commonFallacies.map((f) => `[入れ替え・禁止推論] ${f}`),
        ],
      });
    }
  }

  if ((input.facts.writtenAbilities?.length ?? 0) > 0) {
    const concept = getConceptById("no_written_abilities");
    if (concept) {
      matches.push({
        kind: "no_written_abilities",
        label: concept.label,
        qaQueries: [
          "能力が書かれていない 召喚",
          "注釈文 能力",
          "バニラ 召喚",
        ],
        seedQaIds: concept.qaSeeds,
        ruleRefs: concept.ruleRefs,
        constraints: [
          ...concept.invariants.map((i) => `[印刷能力] ${i}`),
          ...concept.commonFallacies.map((f) => `[印刷能力・禁止推論] ${f}`),
        ],
      });
    }
  }

  if (shouldCheckReplacementEffect(input)) {
    const concept = getConceptById("replacement_effect");
    if (concept) {
      matches.push({
        kind: "replacement_effect",
        label: concept.label,
        qaQueries: [
          "置換効果 句点",
          "置換効果 連鎖",
          "かわりに その後",
          "置換ブレイク 手札",
          "シールド 離れる かわりに 墓地",
          "G城 ブレイク 墓地",
        ],
        seedQaIds: concept.qaSeeds,
        ruleRefs: concept.ruleRefs,
        constraints: [
          ...concept.invariants.map((i) => `[置換] ${i}`),
          ...concept.commonFallacies.map((f) => `[置換・禁止推論] ${f}`),
        ],
      });
    }
  }

  if (shouldCheckEvolutionEffectCarry(input)) {
    const concept = getConceptById("evolution_effect_carry");
    if (concept) {
      matches.push({
        kind: "evolution_effect_carry",
        label: concept.label,
        qaQueries: [
          "進化 効果 引き継ぎ",
          "ジャストダイバー 進化",
          "進化元 受けていた効果",
          "最初の攻撃 進化 侵略",
          "最初の攻撃 終わり 再度",
          "マッハファイター 進化 引き継ぎ",
        ],
        seedQaIds: concept.qaSeeds,
        ruleRefs: concept.ruleRefs,
        constraints: [
          ...concept.invariants.map((i) => `[進化・同一クリーチャー] ${i}`),
          ...concept.commonFallacies.map(
            (f) => `[進化・同一クリーチャー・禁止推論] ${f}`,
          ),
        ],
      });
    }
  }

  return {
    matches,
    qaQueries: unique(matches.flatMap((m) => m.qaQueries)),
    seedQaIds: unique(matches.flatMap((m) => m.seedQaIds)),
    ruleRefs: unique(matches.flatMap((m) => m.ruleRefs)),
    constraints: unique(matches.flatMap((m) => m.constraints)),
    orderRelevant,
  };
}

/** 召喚・唱える質問で、マナか多色カードが関わるときにマナ支払いの論点を立てる */
function shouldCheckManaPayment(facts: ScenarioFacts): boolean {
  const q = normalize(facts.question);
  const asksSummon =
    q.includes(normalize("召喚")) ||
    q.includes(normalize("唱える")) ||
    facts.actions.some((a) => a.kind === "summon" || a.kind === "cast");
  const mentionsMana =
    q.includes(normalize("マナ")) ||
    q.includes(normalize("マナゾーン")) ||
    facts.manaZone.length > 0;
  const multiColorTarget =
    (facts.paymentTarget?.civilizations.length ?? 0) >= 2 ||
    facts.entities.some((e) => (e.card?.civilizations.length ?? 0) >= 2);
  return asksSummon && (mentionsMana || multiColorTarget);
}

function shouldCheckDeclarationTiming(input: {
  question: string;
  facts: ScenarioFacts;
}): boolean {
  if ((input.facts.declarationPower?.length ?? 0) > 0) return true;
  const q = normalize(input.question);
  const asksDeclaration =
    q.includes(normalize("使用宣言")) ||
    q.includes(normalize("革命チェンジ")) ||
    q.includes(normalize("侵略")) ||
    input.facts.actions.some(
      (a) => a.kind === "replace" || a.kind === "attack",
    );
  if (!asksDeclaration) return false;
  return (
    q.includes(normalize("パワー")) ||
    q.includes(normalize("条件")) ||
    q.includes(normalize("可能"))
  );
}

function shouldCheckSwapEffect(input: {
  question: string;
  facts: ScenarioFacts;
}): boolean {
  // 侵略の重ね置きは入れ替えではない。革命チェンジ／入れ替えを問うときだけ論点化。
  const q = normalize(input.question);
  const asksSwap =
    q.includes(normalize("革命チェンジ")) ||
    q.includes(normalize("入れ替え")) ||
    input.facts.actions.some((a) => a.kind === "replace");
  if (!asksSwap) return false;

  // 阻害ヒントがある／入れ替えを直接問う
  return true;
}

function shouldCheckReplacementEffect(input: {
  question: string;
  facts: ScenarioFacts;
  cardTexts?: string[];
}): boolean {
  // 汎用: 「かわりに」「置換」が出たら置換論点を開く（句点範囲・連鎖は制約側で扱う）
  const hay = normalize(
    [input.question, ...(input.cardTexts ?? [])].join("\n"),
  );
  return (
    hay.includes(normalize("かわりに")) || hay.includes(normalize("置換"))
  );
}

function shouldCheckEvolutionEffectCarry(input: {
  question: string;
  facts: ScenarioFacts;
  cardTexts?: string[];
}): boolean {
  const q = normalize(input.question);
  const hay = normalize(
    [input.question, ...(input.cardTexts ?? [])].join("\n"),
  );
  // 侵略は進化の重ね置き。質問に「進化」が無くても同一クリーチャー論点が要る。
  // 注意: カード文の「NEO進化」だけでは発火しない（マナ支払い質問などに誤爆する）。
  const hasStack =
    q.includes(normalize("進化")) ||
    q.includes(normalize("進化先")) ||
    q.includes(normalize("進化元")) ||
    q.includes(normalize("侵略")) ||
    q.includes(normalize("ジャストダイバー")) ||
    hay.includes(normalize("ジャストダイバー"));
  if (!hasStack) return false;

  // 「効果」単体は置換効果・メタ効果などと衝突するので使わない。
  // 「残る」単体も「マナに残る」と衝突する。
  const asksCarry =
    q.includes(normalize("引き継")) ||
    q.includes(normalize("引継")) ||
    q.includes(normalize("効果が残")) ||
    q.includes(normalize("効果が継続")) ||
    q.includes(normalize("受けていた効果")) ||
    q.includes(normalize("継続的効果")) ||
    q.includes(normalize("ジャストダイバー")) ||
    hay.includes(normalize("ジャストダイバー")) ||
    q.includes(normalize("マッハファイター")) ||
    hay.includes(normalize("マッハファイター"));
  if (asksCarry) return true;

  // 「最初の攻撃」「2度目の攻撃で侵略→初回能力」など同一性の取り違え
  const asksFirstAttackIdentity =
    q.includes(normalize("最初の攻撃")) ||
    q.includes(normalize("はじめての攻撃")) ||
    ((q.includes(normalize("2度目")) ||
      q.includes(normalize("２度目")) ||
      q.includes(normalize("2回目")) ||
      q.includes(normalize("２回目")) ||
      q.includes(normalize("再度攻撃")) ||
      q.includes(normalize("もう一度攻撃"))) &&
      (q.includes(normalize("アンタップ")) ||
        q.includes(normalize("攻撃の終わり")) ||
        q.includes(normalize("攻撃終了"))));
  return asksFirstAttackIdentity;
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
