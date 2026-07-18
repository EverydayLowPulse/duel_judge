import { upsertAlias } from "./store";
import type { AliasCandidate } from "./types";

/**
 * 公式検索では拾いにくい一般略称の初期辞書。
 * 1対N想定だが、ここでは確定度の高い1対1を入れる。
 */
const SEED_ALIASES: Array<{ alias: string; candidates: AliasCandidate[] }> = [
  {
    alias: "ワルプリS",
    candidates: [
      {
        officialName: "ワルスラ・プリンスS",
        cardId: "dmr21-002",
        detailUrl:
          "https://dm.takaratomy.co.jp/card/detail/?id=dmr21-002",
      },
    ],
  },
  {
    alias: "ワルプリ",
    candidates: [
      {
        officialName: "ワルスラ・プリンスS",
        cardId: "dmr21-002",
        detailUrl:
          "https://dm.takaratomy.co.jp/card/detail/?id=dmr21-002",
      },
    ],
  },
  {
    alias: "ザレッド",
    candidates: [
      {
        officialName: "轟速 ザ・レッド",
        cardId: "dmr17-081",
        detailUrl:
          "https://dm.takaratomy.co.jp/card/detail/?id=dmr17-081",
      },
    ],
  },
  {
    alias: "ザ・レッド",
    candidates: [
      {
        officialName: "轟速 ザ・レッド",
        cardId: "dmr17-081",
        detailUrl:
          "https://dm.takaratomy.co.jp/card/detail/?id=dmr17-081",
      },
    ],
  },
];

let seeded = false;

/** プロセス内で一度だけシードする */
export async function ensureSeedAliases(): Promise<void> {
  if (seeded) return;
  seeded = true;
  for (const entry of SEED_ALIASES) {
    try {
      await upsertAlias(entry.alias, entry.candidates);
    } catch {
      // シード失敗で裁定全体を止めない
    }
  }
}
