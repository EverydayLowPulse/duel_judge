import path from "node:path";
import { tmpdir } from "node:os";

/**
 * リポジトリルートの data/（web/ から見て一つ上）。
 * サーバレス（Vercel 等）では書き込み可能な DUEL_JUDGE_DATA を使う。
 * 未設定かつ VERCEL 上では /tmp 配下にフォールバックする。
 */
export function dataRoot(): string {
  if (process.env.DUEL_JUDGE_DATA) {
    return path.resolve(process.env.DUEL_JUDGE_DATA);
  }
  if (process.env.VERCEL) {
    return path.join(tmpdir(), "duel_judge_data");
  }
  return path.resolve(process.cwd(), "..", "data");
}

export function cardsCacheDir(): string {
  return path.join(dataRoot(), "cards");
}

export function aliasesIndexPath(): string {
  return path.join(dataRoot(), "aliases", "index.json");
}

export function qaCacheDir(): string {
  return path.join(dataRoot(), "qa");
}

export function rulesDir(): string {
  return path.join(dataRoot(), "rules");
}
