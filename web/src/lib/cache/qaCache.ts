import { promises as fs } from "node:fs";
import path from "node:path";
import { qaCacheDir } from "../paths";
import type { OfficialQa } from "../official/qaTypes";

/** Q&Aもほぼ不変なので長め（30日） */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cachePath(qaId: string): string {
  return path.join(qaCacheDir(), `${qaId}.json`);
}

export async function readQaCache(qaId: string): Promise<OfficialQa | null> {
  try {
    const raw = await fs.readFile(cachePath(qaId), "utf8");
    const article = JSON.parse(raw) as OfficialQa;
    const age = Date.now() - Date.parse(article.fetchedAt);
    if (!Number.isFinite(age) || age > TTL_MS) return null;
    return article;
  } catch {
    return null;
  }
}

export async function writeQaCache(article: OfficialQa): Promise<void> {
  const dir = qaCacheDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    cachePath(article.qaId),
    JSON.stringify(article, null, 2),
    "utf8",
  );
}
