import { promises as fs } from "node:fs";
import path from "node:path";
import { aliasesIndexPath } from "../paths";
import type { AliasCandidate, AliasEntry, AliasIndex } from "./types";

/** 表示・キー用に正規化（辞書引きのキー） */
export function normalizeAliasKey(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

async function ensureIndex(): Promise<AliasIndex> {
  const file = aliasesIndexPath();
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as AliasIndex;
  } catch {
    return {};
  }
}

async function saveIndex(index: AliasIndex): Promise<void> {
  const file = aliasesIndexPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(index, null, 2), "utf8");
}

export async function getAliasEntry(alias: string): Promise<AliasEntry | null> {
  const index = await ensureIndex();
  return index[normalizeAliasKey(alias)] ?? null;
}

/**
 * 解決結果を辞書に保存（常に1対Nの候補リスト）。
 * 既存エントリは上書き（verifiedAt を更新）。
 */
export async function upsertAlias(
  alias: string,
  candidates: AliasCandidate[],
): Promise<AliasEntry> {
  const index = await ensureIndex();
  const key = normalizeAliasKey(alias);
  const entry: AliasEntry = {
    alias: alias.trim(),
    candidates,
    verifiedAt: new Date().toISOString(),
  };
  index[key] = entry;
  await saveIndex(index);
  return entry;
}

/** 全エントリ（質問文からの候補サジェストで、略称が文中にあるかを見る） */
export async function listAliasEntries(): Promise<AliasEntry[]> {
  return Object.values(await ensureIndex());
}
