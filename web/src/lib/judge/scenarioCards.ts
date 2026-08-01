import { ensureSeedAliases } from "../aliases/seed";
import { getAliasEntry } from "../aliases/store";
import type { SearchPlan } from "../llm/searchPlanner";
import type { OfficialCard } from "../official/types";
import { nameKeyMatches, normalizeCardNameKey } from "../resolve/nameMatch";
import { resolveCardName } from "../resolve/resolveCardName";

export type ScenarioCard = {
  mention: string;
  role: SearchPlan["cardMentions"][number]["role"];
  relevantAbility: string;
  card: OfficialCard;
};

/** 公式DBで確定できず、ユーザーに聞き返すべき言及 */
export type ScenarioAskAbout = {
  mention: string;
  /** 候補があるときは clarify、無いときは not_found */
  candidates: OfficialCard[];
  note: string;
};

export type ResolveScenarioCardsResult = {
  cards: ScenarioCard[];
  askAbout: ScenarioAskAbout[];
};

/**
 * 検索プランが抽出したカード名を公式DBで解決する。
 * 曖昧候補は、質問で明示された能力名を公式能力テキストに持つものへ絞る。
 *
 * 読み仮名略称（例: 「ダーバンデ」）は正式名（ラテン綴り）と文字列一致しない。
 * 略称辞書で 1件に確定したときは nameMatches で捨てない。
 *
 * 解決できない言及は黙って捨てず askAbout に残す（聞き返し用）。
 */
export async function resolveScenarioCards(input: {
  plan: SearchPlan;
  primaryCard?: OfficialCard;
}): Promise<ResolveScenarioCardsResult> {
  const resolved: ScenarioCard[] = [];
  const askAbout: ScenarioAskAbout[] = [];
  await ensureSeedAliases();

  if (input.primaryCard) {
    // プラン側の短い言及（例: 「大集合」）があれば mention に優先する。
    // 正式名だけだとマナ列挙「マナに大集合、…」と突き合わせられない。
    const primaryMention =
      (await findMentionForCard(
        input.plan.cardMentions.map((m) => m.mention),
        input.primaryCard,
      )) ?? input.primaryCard.officialName;
    resolved.push({
      mention: primaryMention,
      role: "other",
      relevantAbility: "",
      card: input.primaryCard,
    });
  }

  for (const mention of input.plan.cardMentions.slice(0, 5)) {
    const existing = resolved.find(
      (r) =>
        normalize(r.mention) === normalize(mention.mention) ||
        normalize(r.card.officialName) === normalize(mention.mention) ||
        looksLikeCardMention(mention.mention, r.card.officialName),
    );
    if (existing) {
      // より短いユーザー表記へ差し替える
      if (
        mention.mention.length < existing.mention.length &&
        (looksLikeCardMention(mention.mention, existing.card.officialName) ||
          (await aliasPointsToCard(mention.mention, existing.card)))
      ) {
        existing.mention = mention.mention;
        if (mention.role) existing.role = mention.role;
        if (mention.relevantAbility) {
          existing.relevantAbility = mention.relevantAbility;
        }
      }
      continue;
    }

    // ユーザー指定の主カードが略称と一致するなら、公式検索を飛ばして紐づける
    if (
      input.primaryCard &&
      (looksLikeCardMention(mention.mention, input.primaryCard.officialName) ||
        (await aliasPointsToCard(mention.mention, input.primaryCard)))
    ) {
      resolved.push({ ...mention, card: input.primaryCard });
      continue;
    }

    const result = await resolveCardName(mention.mention, { maxDetails: 8 });

    // 略称辞書などで 1件確定したときは正式名との文字列一致を要求しない
    // （「ダーバンデ」↛「俳句爵 Drache der'Bande」）
    if (result.kind === "resolved") {
      addResolvedMention(resolved, mention, result.card);
      continue;
    }

    let softCandidates = result.kind === "clarify" ? result.candidates : [];
    let candidates = softCandidates.filter((card) =>
      nameMatches(card, mention.mention),
    );

    // 公式検索は部分一致かつ新着順に近いため、先頭8件に完全なカード名がないことがある。
    // 名前の対応が1件もなければ範囲を広げ、誤った近似カードは採用しない。
    if (candidates.length === 0) {
      const widened = await resolveCardName(mention.mention, {
        maxDetails: 24,
        skipAlias: true,
      });
      if (widened.kind === "resolved") {
        addResolvedMention(resolved, mention, widened.card);
        continue;
      }
      softCandidates =
        widened.kind === "clarify" ? widened.candidates : softCandidates;
      candidates = softCandidates.filter((card) =>
        nameMatches(card, mention.mention),
      );
    }

    if (candidates.length === 0) {
      // 推測で採用せず、候補があれば聞き返し / 無ければ未解決
      askAbout.push({
        mention: mention.mention,
        candidates: softCandidates.slice(0, 8),
        note:
          softCandidates.length > 0
            ? `「${mention.mention}」の正式名が特定できません。候補から選ぶか、カード語句に正式名を入れてください。`
            : `「${mention.mention}」を公式DBで見つけられませんでした。正式名をカード語句に入れて再送してください。`,
      });
      continue;
    }

    const ranked = rankCandidates(
      candidates,
      mention.mention,
      mention.relevantAbility,
    );

    // 能力名が明示されているときは、その能力を持たない同名候補を除く。
    const matchingAbility = mention.relevantAbility
      ? ranked.filter((c) =>
          normalize(c.abilityText).includes(
            normalize(mention.relevantAbility),
          ),
        )
      : ranked;
    const pool = matchingAbility.length ? matchingAbility : ranked;

    // 複数候補は勝手に決めず聞き返す（1件だけ確定）
    if (pool.length > 1) {
      askAbout.push({
        mention: mention.mention,
        candidates: pool.slice(0, 8),
        note: `「${mention.mention}」の候補が複数あります。どれを指すか選んでください。`,
      });
      continue;
    }

    addResolvedMention(resolved, mention, pool[0]!);
  }

  return { cards: resolved, askAbout };
}

/**
 * 送信前にユーザーが確定したカードから、公式検索を一切せずにシナリオカードを組む。
 *
 * mention はユーザーが検索に使った表記を優先する。読み仮名やひらがな表記は
 * 正式名と文字列一致しないため、ここで名前照合を要求してはいけない
 * （確定済みという事実がユーザー由来の根拠になる）。
 */
export function buildConfirmedScenarioCards(input: {
  plan: SearchPlan;
  cards: Array<{ card: OfficialCard; mention?: string }>;
}): ScenarioCard[] {
  const out: ScenarioCard[] = [];

  for (const { card, mention } of input.cards) {
    if (out.some((r) => r.card.cardId === card.cardId)) continue;

    const planMention = input.plan.cardMentions.find(
      (m) =>
        (mention && normalize(m.mention) === normalize(mention)) ||
        looksLikeCardMention(m.mention, card.officialName),
    );

    out.push({
      mention: mention || planMention?.mention || card.officialName,
      role: planMention?.role ?? "other",
      relevantAbility: planMention?.relevantAbility ?? "",
      card,
    });
  }

  return out;
}

/** 同一カードでも別表記の mention は残す（unresolvedMentions 判定用） */
function addResolvedMention(
  resolved: ScenarioCard[],
  mention: SearchPlan["cardMentions"][number],
  card: OfficialCard,
): void {
  const sameMention = resolved.some(
    (r) =>
      r.card.officialName === card.officialName &&
      normalize(r.mention) === normalize(mention.mention),
  );
  if (sameMention) return;
  resolved.push({ ...mention, card });
}

async function findMentionForCard(
  mentions: string[],
  card: OfficialCard,
): Promise<string | undefined> {
  for (const mention of mentions) {
    if (
      looksLikeCardMention(mention, card.officialName) ||
      (await aliasPointsToCard(mention, card))
    ) {
      return mention;
    }
  }
  return undefined;
}

/** 略称辞書の候補がこの公式カードを指すか */
async function aliasPointsToCard(
  mention: string,
  card: OfficialCard,
): Promise<boolean> {
  const entry = await getAliasEntry(mention);
  if (!entry) return false;
  return entry.candidates.some(
    (c) =>
      c.cardId === card.cardId ||
      normalize(c.officialName) === normalize(card.officialName),
  );
}

function rankCandidates(
  cards: OfficialCard[],
  mention: string,
  ability: string,
): OfficialCard[] {
  const mentionN = normalize(mention);
  const abilityN = normalize(ability);
  const score = (card: OfficialCard) => {
    let value = 0;
    const name = normalize(card.officialName);
    const text = normalize(card.abilityText);
    if (name === mentionN) value += 100;
    if (name.includes(mentionN)) value += 30;
    if (abilityN && text.includes(abilityN)) value += 50;
    return value;
  };
  return [...cards].sort((a, b) => score(b) - score(a));
}

function normalize(value: string): string {
  return normalizeCardNameKey(value);
}

function nameMatches(card: OfficialCard, mention: string): boolean {
  return nameKeyMatches(card.officialName, mention);
}

/** 略称（例: ワルプリS）が正式名の部分列になっているかも見る */
function looksLikeCardMention(mention: string, officialName: string): boolean {
  if (nameKeyMatches(officialName, mention)) return true;
  const m = normalize(mention);
  const n = normalize(officialName);
  if (m.length < 3) return false;
  let i = 0;
  for (const ch of n) {
    if (ch === m[i]) i += 1;
    if (i >= m.length) return true;
  }
  return false;
}
