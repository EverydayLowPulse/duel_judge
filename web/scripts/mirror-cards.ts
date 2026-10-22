/**
 * 公式カードDBの全件ミラー（samename なしで約1.2万枚）。
 *
 *   npm run mirror:cards                     # 一覧列挙 → 未取得の詳細だけ取得 → 同梱ファイル生成
 *   npm run mirror:cards -- --limit=50       # 試運転（新規取得を50枚で止める）
 *   npm run mirror:cards -- --relist         # 一覧を必ず取り直す（新弾追加時）
 *   npm run mirror:cards -- --interval-ms=1500
 *
 * - 何度止めても再開できる（取得済みで30日以内のカードは飛ばす）
 * - 公式への間隔は既定1秒（ユーザー検索の0.4秒より広げる）
 * - 連続失敗が続いたら打ち切る（ブロック・障害時に叩き続けない）
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { readCardCache, writeCardCache } from "../src/lib/cache/cardCache";
import { isCurrentCardShape } from "../src/lib/cards/mirror";
import {
  fetchCardDetailFromOfficial,
  fetchCardListPage,
} from "../src/lib/official/card";
import { setOfficialMinIntervalMs } from "../src/lib/official/rateLimit";
import { buildCardsBundle, mirrorMetaPath } from "./build-cards-bundle";

type MirrorMeta = {
  listedAt: string;
  totalCount: number | null;
  lastPage: number;
  ids: string[];
};

const LIST_REUSE_MS = 24 * 60 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 20;
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000];

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay == null) throw e;
      console.warn(
        `[mirror] ${label} 失敗、${delay / 1000}秒後に再試行: ${e instanceof Error ? e.message : e}`,
      );
      await sleep(delay);
    }
  }
}

async function readMeta(): Promise<MirrorMeta | null> {
  try {
    return JSON.parse(await fs.readFile(mirrorMetaPath(), "utf8")) as MirrorMeta;
  } catch {
    return null;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

async function listAllIds(relist: boolean): Promise<MirrorMeta> {
  const existing = await readMeta();
  if (
    !relist &&
    existing &&
    Date.now() - Date.parse(existing.listedAt) < LIST_REUSE_MS
  ) {
    console.log(`[mirror] 一覧は ${existing.listedAt} のものを再利用（${existing.ids.length}件）`);
    return existing;
  }

  const first = await withRetry("list p1", () => fetchCardListPage("", 1));
  const ids = [...first.cardIds];
  console.log(
    `[mirror] 一覧: 総数=${first.totalCount} ページ=${first.lastPage}`,
  );
  for (let page = 2; page <= first.lastPage; page += 1) {
    const { cardIds } = await withRetry(`list p${page}`, () =>
      fetchCardListPage("", page),
    );
    ids.push(...cardIds);
    if (page % 20 === 0) console.log(`[mirror] 一覧 ${page}/${first.lastPage}`);
  }

  const meta: MirrorMeta = {
    listedAt: new Date().toISOString(),
    totalCount: first.totalCount,
    lastPage: first.lastPage,
    ids: [...new Set(ids)],
  };
  if (meta.totalCount != null && meta.ids.length !== meta.totalCount) {
    console.warn(
      `[mirror] 列挙数 ${meta.ids.length} が総数 ${meta.totalCount} と一致しない（途中で弾が追加された可能性）`,
    );
  }
  await writeJson(mirrorMetaPath(), meta);
  return meta;
}

async function main() {
  const intervalMs = Number(arg("interval-ms") ?? 1000);
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;
  setOfficialMinIntervalMs(intervalMs);

  const meta = await listAllIds(arg("relist") === "true");

  const pending: string[] = [];
  for (const id of meta.ids) {
    if (!(await readCardCache(id))) pending.push(id);
  }
  const target = pending.slice(0, limit);
  console.log(
    `[mirror] 取得済み ${meta.ids.length - pending.length} / 未取得 ${pending.length} / 今回 ${target.length}（間隔 ${intervalMs}ms）`,
  );

  const failures: Array<{ cardId: string; reason: string }> = [];
  let consecutiveFailures = 0;
  const started = Date.now();

  for (const [i, cardId] of target.entries()) {
    try {
      const card = await withRetry(cardId, () => fetchCardDetailFromOfficial(cardId));
      if (!isCurrentCardShape(card)) {
        throw new Error("パース結果が不完全（面・属性の欠け）");
      }
      await writeCardCache(card);
      consecutiveFailures = 0;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      failures.push({ cardId, reason });
      consecutiveFailures += 1;
      console.warn(`[mirror] ${cardId} を飛ばす: ${reason}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`[mirror] ${MAX_CONSECUTIVE_FAILURES}件連続で失敗したので中断する`);
        break;
      }
    }

    const done = i + 1;
    if (done % 50 === 0 || done === target.length) {
      const perCard = (Date.now() - started) / done;
      const etaMin = Math.round(((target.length - done) * perCard) / 60_000);
      console.log(`[mirror] ${done}/${target.length}（失敗 ${failures.length}、残り約${etaMin}分）`);
    }
  }

  await writeJson(path.join(path.dirname(mirrorMetaPath()), "cards_mirror_failures.json"), {
    at: new Date().toISOString(),
    failures,
  });
  await buildCardsBundle();
  if (failures.length > 0) {
    console.warn(`[mirror] 失敗 ${failures.length}件。再実行すると失敗分だけ取り直す`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
