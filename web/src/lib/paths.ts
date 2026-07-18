import path from "node:path";

/** リポジトリルートの data/（web/ から見て一つ上） */
export function dataRoot(): string {
  if (process.env.DUEL_JUDGE_DATA) {
    return path.resolve(process.env.DUEL_JUDGE_DATA);
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
