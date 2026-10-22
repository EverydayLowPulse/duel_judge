import { promises as fs } from "node:fs";
import path from "node:path";
import type { OfficialCard } from "../official/types";
import {
  buildCardNameIndex,
  type CardIndexEntry,
  type CardNameIndex,
} from "./nameSearch";

/**
 * 公式カードDBの全件ミラー。
 * `npm run mirror:cards` で data/cards/ に詳細を貯め、`npm run build:cards` で
 * web/data/cards/bundled-cards.json に固めてデプロイへ同梱する。
 * 能力取得はミラー優先、ミラーにない新カードだけ公式へ取りに行く。
 */
export const CARD_MIRROR_VERSION = 1;

export type CardMirrorBundle = {
  version: typeof CARD_MIRROR_VERSION;
  builtAt: string;
  count: number;
  cards: OfficialCard[];
};

export type CardMirror = {
  builtAt: string;
  count: number;
  get: (cardId: string) => OfficialCard | null;
  /** 名前検索・サジェスト用（同名の再録は1枚にまとめる） */
  nameIndex: CardNameIndex;
};

/**
 * パーサの改修で増えた項目がそろっているか。古い形は再取得させる。
 * v2: 宣言条件の検証に使う文明・種族・パワー・コスト
 * v3: ツインパクトの両面
 * v4/v5: マナ支払い検証用の manaValue（誤パースは捨てる）
 *
 * 面の数は、パーサ v2 以降なら公式の面の数そのものなので信用する。
 * v1 は空の能力欄を捨てていたので、名前の「/」で片面落ちを推定する
 * （「*／名前／*」のような非ツインパクトや、片面バニラのツインパクトは v1 では弾かれる）。
 */
export function isCurrentCardShape(card: OfficialCard): boolean {
  if (
    !Array.isArray(card.civilizations) ||
    !Array.isArray(card.races) ||
    !("power" in card) ||
    !("cost" in card)
  ) {
    return false;
  }
  if (!Array.isArray(card.faces) || card.faces.length === 0) return false;
  if (
    (card.parserVersion ?? 1) < 2 &&
    card.officialName.includes("/") &&
    card.faces.length < 2
  ) {
    return false;
  }
  if (!("manaValue" in card)) return false;
  if (
    card.manaValue != null &&
    (!Number.isInteger(card.manaValue) ||
      card.manaValue < 1 ||
      card.manaValue > 9)
  ) {
    return false;
  }
  return true;
}

export function buildCardMirrorBundle(
  cards: OfficialCard[],
  options: { builtAt: string },
): CardMirrorBundle {
  const byId = new Map<string, OfficialCard>();
  for (const card of cards) {
    if (!isCurrentCardShape(card) || byId.has(card.cardId)) continue;
    byId.set(card.cardId, card);
  }
  const unique = [...byId.values()];
  return {
    version: CARD_MIRROR_VERSION,
    builtAt: options.builtAt,
    count: unique.length,
    cards: unique,
  };
}

export function parseCardMirrorBundle(raw: string): CardMirrorBundle | null {
  try {
    const data = JSON.parse(raw) as Partial<CardMirrorBundle>;
    if (data.version !== CARD_MIRROR_VERSION || !Array.isArray(data.cards)) {
      return null;
    }
    return data as CardMirrorBundle;
  } catch {
    return null;
  }
}

function toIndexEntry(card: OfficialCard): CardIndexEntry {
  return {
    cardId: card.cardId,
    officialName: card.officialName,
    civilizations: card.civilizations,
    cost: card.cost,
    cardType: card.cardType,
  };
}

export function createCardMirror(bundle: CardMirrorBundle): CardMirror {
  const byId = new Map(bundle.cards.map((c) => [c.cardId, c]));
  const seenNames = new Set<string>();
  const entries: CardIndexEntry[] = [];
  for (const card of bundle.cards) {
    if (seenNames.has(card.officialName)) continue;
    seenNames.add(card.officialName);
    entries.push(toIndexEntry(card));
  }
  return {
    builtAt: bundle.builtAt,
    count: bundle.count,
    get: (cardId) => byId.get(cardId) ?? null,
    nameIndex: buildCardNameIndex(entries),
  };
}

/** デプロイ同梱のミラー（web/data/cards/bundled-cards.json） */
export function bundledCardMirrorPath(): string {
  return path.join(process.cwd(), "data", "cards", "bundled-cards.json");
}

let loading: Promise<CardMirror | null> | null = null;

/**
 * 同梱ミラーを1回だけ読む。未生成（クロール前など）なら null を返し、
 * 呼び出し側は従来どおり公式検索へフォールバックする。
 */
export function loadCardMirror(): Promise<CardMirror | null> {
  loading ??= fs
    .readFile(bundledCardMirrorPath(), "utf8")
    .then((raw) => {
      const bundle = parseCardMirrorBundle(raw);
      return bundle ? createCardMirror(bundle) : null;
    })
    .catch(() => null);
  return loading;
}
