import { promises as fs } from "node:fs";
import path from "node:path";
import { cardsCacheDir } from "../paths";
import type { OfficialCard } from "../official/types";

/** カードテキストはほぼ変わらないので長め（30日） */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function safeFileName(cardId: string): string {
  return cardId.replace(/[^a-zA-Z0-9._-]/g, "_") + ".json";
}

function cachePath(cardId: string): string {
  return path.join(cardsCacheDir(), safeFileName(cardId));
}

export async function readCardCache(cardId: string): Promise<OfficialCard | null> {
  try {
    const raw = await fs.readFile(cachePath(cardId), "utf8");
    const card = JSON.parse(raw) as OfficialCard;
    const age = Date.now() - Date.parse(card.fetchedAt);
    if (!Number.isFinite(age) || age > TTL_MS) return null;
    // v2: 宣言条件の検証に使うカード属性がない旧キャッシュは再取得する。
    if (
      !Array.isArray(card.civilizations) ||
      !Array.isArray(card.races) ||
      !("power" in card) ||
      !("cost" in card)
    ) {
      return null;
    }
    // v3: ツインパクトは両面の能力が必要。旧キャッシュは片面だけなので捨てる。
    if (
      !Array.isArray(card.faces) ||
      card.faces.length === 0 ||
      (card.officialName.includes("/") && card.faces.length < 2)
    ) {
      return null;
    }
    return card;
  } catch {
    return null;
  }
}

export async function writeCardCache(card: OfficialCard): Promise<void> {
  const dir = cardsCacheDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(cachePath(card.cardId), JSON.stringify(card, null, 2), "utf8");
}
