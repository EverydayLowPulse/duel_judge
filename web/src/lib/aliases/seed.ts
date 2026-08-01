import { upsertAlias } from "./store";
import type { AliasCandidate } from "./types";

const BANDE: AliasCandidate = {
  officialName: "俳句爵 Drache der'Bande",
  cardId: "dm25ex3-rp3S07",
  detailUrl:
    "https://dm.takaratomy.co.jp/card/detail/?id=dm25ex3-rp3S07",
};

/** DM26-EX2。公式 id は dm26ex2-SPRSEC004（旧シード dm26ex1-SP001 は誤り） */
const CHARISMA: AliasCandidate = {
  officialName: "SSS級侵略 カリスマゾーン",
  cardId: "dm26ex2-SPRSEC004",
  detailUrl:
    "https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-SPRSEC004",
};

const CHARISMA_ALIASES = [
  "カリスマゾーン",
  "カリスマ・ゾーン",
  "SSS級侵略カリスマゾーン",
  "SSS級侵略 カリスマゾーン",
  "SSS級侵略カリスマ・ゾーン",
];

const SAINT: AliasCandidate = {
  officialName: "我竜塔第一層 セイント・キャッスル",
  cardId: "dm26rp1-057",
  detailUrl:
    "https://dm.takaratomy.co.jp/card/detail/?id=dm26rp1-057",
};

/**
 * 公式検索では拾いにくい一般略称の初期辞書。
 * 1対N想定だが、ここでは確定度の高い候補を入れる。
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
  // ラテン正式名 ↔ 読み仮名（公式 keyword 検索では拾いにくい）
  { alias: "ドラッヘダーバンデ", candidates: [BANDE] },
  { alias: "ドラッヘ・ダーバンデ", candidates: [BANDE] },
  { alias: "ダーバンデ", candidates: [BANDE] },
  { alias: "ドラッヘ", candidates: [BANDE] },
  { alias: "バーダンデ", candidates: [BANDE] },
  { alias: "drache derbande", candidates: [BANDE] },
  { alias: "drache der'bande", candidates: [BANDE] },
  ...CHARISMA_ALIASES.map((alias) => ({
    alias,
    candidates: [CHARISMA],
  })),
  { alias: "セイントキャッスル", candidates: [SAINT] },
  { alias: "セイント・キャッスル", candidates: [SAINT] },
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
