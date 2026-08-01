import type { OfficialCard } from "../../official/types";
import { normalizeCardNameKey as normalize } from "../../resolve/nameMatch";
import type { ScenarioCard } from "../scenarioCards";
import type { LeaveReplacementHint } from "./types";

/**
 * 革命チェンジ等の「入れ替え」を阻害する置換・移動不能を検出する。
 *
 * 原則は進化専用ではない（総合ルール 701.26b）:
 * - 構成の一部だけ離れる（G-NEO進化 / スター進化 / G・リンク）
 * - 本体がバトルゾーンに残る（EXライフ / 離れない）
 * - 場の他カードの置換で移動が正常にできない（出す／戻す等を「かわりに」で置換）
 *
 * 偽陽性を避けるため、条件付きのものは質問側の主張（進化・EXライフあり等）と突き合わせる。
 * カード名ブラックリストは使わない（解決済みカードの能力テキストで判定する）。
 */
export function buildLeaveReplacementHints(input: {
  question: string;
  scenarioCards: ScenarioCard[];
}): LeaveReplacementHint[] {
  const q = normalize(input.question);
  const underCards = claimsHasUnderCards(q);
  const attackers = pickAttackRelated(input.question, input.scenarioCards);
  const hints: LeaveReplacementHint[] = [];
  const seen = new Set<string>();

  const push = (hint: LeaveReplacementHint) => {
    const key = `${hint.kind}:${hint.targetOfficialName ?? hint.targetMention}`;
    if (seen.has(key)) return;
    seen.add(key);
    hints.push(hint);
  };

  for (const target of attackers) {
    for (const detected of detectOnCard(target, q, underCards)) {
      push(detected);
    }
  }

  // 攻撃クリーチャー以外（相手の場など）による外部阻害
  for (const card of input.scenarioCards) {
    const external = detectExternalBlocker(card, q);
    if (external) push(external);
  }

  return hints;
}

export function formatLeaveReplacementHints(
  hints: LeaveReplacementHint[],
): string | undefined {
  if (hints.length === 0) return undefined;
  const lines = hints.flatMap((h) => [
    `【入れ替え阻害】${h.targetOfficialName ?? h.targetMention}`,
    `  種別: ${h.kind} / モード: ${h.blockMode} / 阻害: ${h.blocksSwap ? "はい" : "いいえ（条件未充足）"}`,
    `  根拠: ${h.evidence}`,
    ...h.notes.map((n) => `  ・${n}`),
  ]);
  return lines.join("\n");
}

function detectOnCard(
  target: ScenarioCard,
  qNorm: string,
  underCards: boolean,
): LeaveReplacementHint[] {
  const card = target.card;
  const type = (card.cardType ?? "").normalize("NFKC");
  const text = (card.abilityText ?? "").normalize("NFKC");
  const blob = `${type}\n${text}`;
  const out: LeaveReplacementHint[] = [];

  if (/G[\s-]?NEO/i.test(blob)) {
    out.push(
      makeHint({
        target,
        kind: "g_neo_evolved",
        blockMode: "partial_leave",
        blocksSwap: underCards,
        hasUnderCards: underCards,
        evidence: matchSnippet(text, /G[\s-]?NEO進化[^。＊\n]{0,80}/i) || type || "G-NEO",
        activeNote: underCards
          ? "下にカードがある G-NEO進化のため、離れる時に下だけが離れる置換が働く。"
          : "G-NEOだが、下にカードが無い主張なら離脱置換は働かない。",
        ruleHint: "803.2 / 701.26b",
      }),
    );
  }

  if (/スター進化/.test(blob) || /<[^>]*\.Star>/i.test(blob)) {
    out.push(
      makeHint({
        target,
        kind: "star_evolution",
        blockMode: "partial_leave",
        blocksSwap: underCards,
        hasUnderCards: underCards,
        evidence: matchSnippet(text, /スター進化[^。＊\n]{0,80}/) || "スター進化",
        activeNote: underCards
          ? "下にカードがあるスター進化のため、トップだけが離れる置換が働く。"
          : "スター進化だが、下にカードが無いなら離脱置換は働かない。",
        ruleHint: "701.26b",
      }),
    );
  }

  if (/EXライフ/.test(blob)) {
    const active = qNorm.includes(normalize("EXライフ"));
    out.push(
      makeHint({
        target,
        kind: "ex_life",
        blockMode: "stays_in_bz",
        blocksSwap: active,
        evidence: matchSnippet(text, /EXライフ[^。＊\n]{0,80}/) || "EXライフ",
        activeNote: active
          ? "EXライフシールドがあるため、本体がバトルゾーンから離れず入れ替え失敗。"
          : "EXライフ持ちだが、質問がEXライフシールドの存在を主張していない（条件未充足）。",
        ruleHint: "701.26b",
      }),
    );
  }

  if (/G[\s・･]?リンク/.test(blob) || /Gリンク/.test(blob)) {
    const linked =
      qNorm.includes(normalize("リンク")) ||
      qNorm.includes(normalize("Gリンク")) ||
      qNorm.includes(normalize("G・リンク"));
    out.push(
      makeHint({
        target,
        kind: "g_link",
        blockMode: "partial_leave",
        blocksSwap: linked,
        evidence: matchSnippet(text, /G[\s・･]?リンク[^。＊\n]{0,80}/) || "G・リンク",
        activeNote: linked
          ? "G・リンク中は構成カードすべてが手札に戻れず入れ替え失敗。"
          : "G・リンク持ちだが、リンク中である主張がない（条件未充足）。",
        ruleHint: "701.26b",
      }),
    );
  }

  // 「離れない」（置換・常在）。質問またはテキストから。
  if (
    /バトルゾーンを離れない/.test(text) ||
    (/離れない/.test(text) && /かわりに|このクリーチャー/.test(text))
  ) {
    out.push(
      makeHint({
        target,
        kind: "cannot_leave",
        blockMode: "stays_in_bz",
        blocksSwap: true,
        evidence:
          matchSnippet(text, /[^。＊\n]{0,20}離れない[^。＊\n]{0,40}/) ||
          "離れない",
        activeNote: "離れない効果により本体が移動できず入れ替え失敗。",
        ruleHint: "701.26b",
      }),
    );
  } else if (
    qNorm.includes(normalize("離れない")) &&
    nameMentioned(qNorm, target)
  ) {
    out.push(
      makeHint({
        target,
        kind: "cannot_leave",
        blockMode: "stays_in_bz",
        blocksSwap: true,
        evidence: "質問が離れない状態を主張",
        activeNote: "質問上、攻撃クリーチャーが離れないため入れ替え失敗。",
        ruleHint: "701.26b",
      }),
    );
  }

  // テキスト上の一般的な「離れる時、かわりに」（上記以外）
  if (
    /離れる時[、,]?かわりに/.test(text) &&
    !out.some((h) =>
      ["g_neo_evolved", "star_evolution", "ex_life"].includes(h.kind),
    )
  ) {
    const needsUnder = /下/.test(text);
    out.push(
      makeHint({
        target,
        kind: "leave_replace_text",
        blockMode: needsUnder ? "partial_leave" : "stays_in_bz",
        blocksSwap: needsUnder ? underCards : true,
        hasUnderCards: needsUnder ? underCards : false,
        evidence:
          matchSnippet(text, /離れる時[、,]?かわりに[^。＊\n]{0,80}/) ||
          "離れる時、かわりに",
        activeNote: needsUnder
          ? underCards
            ? "離れる時置換（下のカード）により構成が揃わず入れ替え失敗。"
            : "離れる時置換テキストがあるが、下にカードがある主張がない。"
          : "離れる時置換により移動が置換され、入れ替え失敗しうる。",
        ruleHint: "701.26b",
      }),
    );
  }

  return out;
}

/**
 * 場の他カードが「出す／戻す」等を置換しているか。
 * カード名ではなく能力テキストのイベント種別で判定する。
 *
 * 注意: 「破壊される時、かわりにマナゾーンに置く」等の破壊置換は
 * 入れ替え（手札に戻す移動）の阻害ではない。侵略の重ね置きとも無関係。
 */
function detectExternalBlocker(
  card: ScenarioCard,
  qNorm: string,
): LeaveReplacementHint | null {
  if (!nameMentioned(qNorm, card)) return null;
  const text = (card.card.abilityText ?? "").normalize("NFKC");
  const name = card.card.officialName;
  const typeBlob = `${card.card.cardType ?? ""}\n${text}`;

  // 攻撃側自身の離脱置換は detectOnCard 側
  if (/G[\s-]?NEO|スター進化|EXライフ/.test(typeBlob)) {
    return null;
  }

  // 破壊時置換だけなら入れ替え阻害にしない（明示ヒントとして残す）
  const destroyOnlyReplacement =
    /破壊される時[、,]?かわりに/.test(text) ||
    /破壊した時[、,]?かわりに/.test(text);
  if (
    destroyOnlyReplacement &&
    !/手札に戻/.test(text) &&
    !/バトルゾーンに出/.test(text)
  ) {
    return makeHint({
      target: card,
      kind: "external_field",
      blockMode: "external",
      blocksSwap: false,
      evidence:
        matchSnippet(text, /破壊される?時[、,]?かわりに[^。＊\n]{0,60}/) ||
        name,
      activeNote:
        `${name} の破壊時置換（例: かわりにマナゾーンへ）は入れ替え阻害ではない。侵略の重ね置きとも無関係。`,
      ruleHint: "701.26b（該当せず）",
    });
  }

  const replacesPutOrReturn =
    /かわりに/.test(text) &&
    (/バトルゾーンに出/.test(text) ||
      /クリーチャーを出/.test(text) ||
      /出す時/.test(text) ||
      /出せない/.test(text) ||
      /手札に戻/.test(text) ||
      /かわりに破壊/.test(text) ||
      /かわりに山札/.test(text));

  if (!replacesPutOrReturn) return null;

  return makeHint({
    target: card,
    kind: "external_field",
    blockMode: "external",
    blocksSwap: true,
    evidence: matchSnippet(text, /[^。＊\n]{0,10}かわりに[^。＊\n]{0,50}/) || name,
    activeNote: `${name} の場効果によりカード移動が正常にできず、入れ替えが失敗しうる。`,
    ruleHint: "701.26b",
  });
}

function makeHint(input: {
  target: ScenarioCard;
  kind: LeaveReplacementHint["kind"];
  blockMode: LeaveReplacementHint["blockMode"];
  blocksSwap: boolean;
  evidence: string;
  activeNote: string;
  ruleHint: string;
  hasUnderCards?: boolean;
}): LeaveReplacementHint {
  return {
    targetMention: input.target.mention,
    targetOfficialName: input.target.card.officialName,
    kind: input.kind,
    blockMode: input.blockMode,
    hasUnderCards: input.hasUnderCards ?? false,
    blocksSwap: input.blocksSwap,
    evidence: input.evidence,
    notes: input.blocksSwap
      ? [
          input.activeNote,
          `入れ替えはカード移動が正常にできないと失敗する（${input.ruleHint}）。進化・EXライフ・リンク・場の置換など原因は問わない。`,
        ]
      : [input.activeNote],
    source: "official_card",
  };
}

function claimsHasUnderCards(qNorm: string): boolean {
  if (
    qNorm.includes(normalize("進化なし")) ||
    qNorm.includes(normalize("進化無し")) ||
    qNorm.includes(normalize("進化でない")) ||
    qNorm.includes(normalize("非進化")) ||
    qNorm.includes(normalize("進化元なし")) ||
    qNorm.includes(normalize("下にカードがない")) ||
    qNorm.includes(normalize("下にカードが無い"))
  ) {
    return false;
  }
  return (
    qNorm.includes(normalize("進化する形")) ||
    qNorm.includes(normalize("進化して")) ||
    qNorm.includes(normalize("から進化")) ||
    qNorm.includes(normalize("の上に")) ||
    qNorm.includes(normalize("下にカード")) ||
    qNorm.includes(normalize("進化元")) ||
    (qNorm.includes(normalize("進化")) &&
      (qNorm.includes(normalize("から")) || qNorm.includes(normalize("出し"))))
  );
}

function pickAttackRelated(
  question: string,
  scenarioCards: ScenarioCard[],
): ScenarioCard[] {
  const byRole = scenarioCards.filter(
    (c) => c.role === "attacker" || c.role === "intermediate",
  );
  if (byRole.length > 0) {
    const attackers = byRole.filter((c) => c.role === "attacker");
    return attackers.length > 0 ? attackers : byRole;
  }
  const q = normalize(question);
  return scenarioCards.filter((c) => nameMentioned(q, c));
}

function nameMentioned(qNorm: string, card: ScenarioCard): boolean {
  const names = [card.mention, card.card.officialName];
  return names.some((name) => {
    const n = normalize(name);
    return n.length >= 2 && qNorm.includes(n);
  });
}

function matchSnippet(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[0]?.trim() || null;
}
