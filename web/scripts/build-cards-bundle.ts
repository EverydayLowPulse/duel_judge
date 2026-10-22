/**
 * data/cards/*.json（全件ミラー＋オンデマンドキャッシュ）を
 * web/data/cards/bundled-cards.json に固め、デプロイへ同梱する。
 *
 *   npm run build:cards
 *
 * 元データがない環境（Vercel のリモートビルド等）では既存の同梱ファイルを残す。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCardMirrorBundle } from "../src/lib/cards/mirror";
import type { OfficialCard } from "../src/lib/official/types";
import { cardsCacheDir, dataRoot } from "../src/lib/paths";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "cards", "bundled-cards.json");

export function mirrorMetaPath(): string {
  return path.join(dataRoot(), "meta", "cards_mirror.json");
}

async function readListedIds(): Promise<string[]> {
  try {
    const meta = JSON.parse(await fs.readFile(mirrorMetaPath(), "utf8")) as {
      ids?: string[];
    };
    return meta.ids ?? [];
  } catch {
    return [];
  }
}

export async function buildCardsBundle(): Promise<void> {
  const dir = cardsCacheDir();
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    console.warn(
      `[build-cards] ${dir} にカードがないので同梱ファイルを更新しない`,
    );
    return;
  }

  const cards: OfficialCard[] = [];
  for (const file of files) {
    try {
      cards.push(JSON.parse(await fs.readFile(path.join(dir, file), "utf8")));
    } catch {
      console.warn(`[build-cards] 読めないファイルを飛ばす: ${file}`);
    }
  }

  // 公式一覧の順（新しい弾が先）に並べる。名前検索の同順位は先のものが勝つ
  const listed = await readListedIds();
  const rank = new Map(listed.map((id, i) => [id, i]));
  cards.sort(
    (a, b) =>
      (rank.get(a.cardId) ?? Infinity) - (rank.get(b.cardId) ?? Infinity) ||
      a.cardId.localeCompare(b.cardId),
  );

  const bundle = buildCardMirrorBundle(cards, {
    builtAt: new Date().toISOString(),
  });
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(bundle), "utf8");
  const sizeMb = ((await fs.stat(OUT)).size / (1024 * 1024)).toFixed(2);
  const skipped = cards.length - bundle.count;
  console.log(
    `[build-cards] wrote ${OUT} (cards=${bundle.count}, skipped=${skipped}, listed=${listed.length}, ${sizeMb} MB)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  buildCardsBundle().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
