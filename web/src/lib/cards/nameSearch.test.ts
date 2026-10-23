import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCardNameIndex,
  cardSearchKey,
  searchCardNames,
  suggestCardsFromQuestion,
  type CardIndexEntry,
} from "./nameSearch";

function entry(cardId: string, officialName: string): CardIndexEntry {
  return {
    cardId,
    officialName,
    civilizations: ["火"],
    cost: "5",
    cardType: "クリーチャー",
  };
}

const RED_ZONE = entry("a1", "轟く侵略 レッドゾーン");
const RED_ZONE_Z = entry("a2", "超轟く侵略 レッドゾーンZ");
const RED_ZONE_PLAIN = entry("a3", "レッドゾーン・バスター");
const BOLSHACK = entry("b1", "ボルシャック・ドラゴン");
const TWIN = entry("t1", "龍装者 バルチュリス/デスティニー・ドラゴン");
const HIRAGANA = entry("h1", "ちゅうりっぷちゃん");
const SHIELD = entry("s1", "シールド・プリズン");

const index = buildCardNameIndex([
  RED_ZONE,
  RED_ZONE_Z,
  RED_ZONE_PLAIN,
  BOLSHACK,
  TWIN,
  HIRAGANA,
  SHIELD,
]);

function ids(cards: CardIndexEntry[]): string[] {
  return cards.map((c) => c.cardId);
}

describe("cardSearchKey", () => {
  it("ひらがなをカタカナに寄せ、中黒・空白を落とす", () => {
    assert.equal(cardSearchKey("ぼるしゃっく・どらごん"), "ボルシャックドラゴン");
    assert.equal(cardSearchKey("ボルシャック ドラゴン"), "ボルシャックドラゴン");
  });

  it("全角英数を半角小文字に揃える", () => {
    assert.equal(cardSearchKey("ＲｅｄＺｏｎｅ"), "redzone");
  });
});

describe("searchCardNames", () => {
  it("部分一致のカードを返す", () => {
    const result = searchCardNames(index, "レッドゾーン");
    assert.deepEqual(new Set(ids(result.cards)), new Set(["a1", "a2", "a3"]));
    assert.equal(result.total, 3);
  });

  it("前方一致を部分一致より先に並べる", () => {
    const result = searchCardNames(index, "レッドゾーン");
    assert.equal(result.cards[0]?.cardId, "a3");
  });

  it("完全一致を最優先にする", () => {
    const result = searchCardNames(index, "轟く侵略レッドゾーン");
    assert.equal(result.cards[0]?.cardId, "a1");
  });

  it("中黒の有無を無視する", () => {
    assert.deepEqual(ids(searchCardNames(index, "ボルシャックドラゴン").cards), [
      "b1",
    ]);
  });

  it("ひらがな入力でカタカナ名を引ける", () => {
    assert.deepEqual(ids(searchCardNames(index, "ぼるしゃっく").cards), ["b1"]);
  });

  it("ツインパクトの片面名で引ける", () => {
    assert.deepEqual(ids(searchCardNames(index, "デスティニー・ドラゴン").cards), [
      "t1",
    ]);
  });

  it("limit で件数を絞っても total は全件数", () => {
    const result = searchCardNames(index, "レッドゾーン", { limit: 1 });
    assert.equal(result.cards.length, 1);
    assert.equal(result.total, 3);
  });

  it("2文字未満のクエリでは何も返さない", () => {
    assert.equal(searchCardNames(index, "レ").total, 0);
    assert.equal(searchCardNames(index, "  ").total, 0);
  });
});

describe("suggestCardsFromQuestion", () => {
  it("質問文中の正式名を候補にする", () => {
    const groups = suggestCardsFromQuestion(
      index,
      "《轟く侵略 レッドゾーン》が侵略したときの処理は？",
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.mention, "轟く侵略 レッドゾーン");
    assert.equal(groups[0]?.cards[0]?.cardId, "a1");
  });

  it("カタカナの部分名から、それを含むカードをまとめて候補にする", () => {
    const groups = suggestCardsFromQuestion(
      index,
      "レッドゾーンで攻撃したとき、相手はブロックできますか？",
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.mention, "レッドゾーン");
    assert.deepEqual(new Set(ids(groups[0]!.cards)), new Set(["a1", "a2", "a3"]));
  });

  it("ゲーム用語のカタカナは候補にしない", () => {
    const groups = suggestCardsFromQuestion(
      index,
      "シールドをブレイクしたときクリーチャーがバトルゾーンに出ますか？",
    );
    assert.deepEqual(groups, []);
  });

  it("ひらがな表記の正式名も見つける", () => {
    const groups = suggestCardsFromQuestion(
      index,
      "ちゅうりっぷちゃんを召喚したとき",
    );
    assert.deepEqual(ids(groups[0]!.cards), ["h1"]);
  });

  it("略称辞書のキーが質問文にあれば、その候補を出す", () => {
    const groups = suggestCardsFromQuestion(index, "赤ゾで殴ったら？", {
      aliases: [
        { alias: "赤ゾ", candidates: [{ cardId: "a1", officialName: RED_ZONE.officialName }] },
      ],
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.mention, "赤ゾ");
    assert.deepEqual(ids(groups[0]!.cards), ["a1"]);
  });

  it("略称辞書に同じカードが表記違いで2件あっても、候補には1枚だけ出す", () => {
    const groups = suggestCardsFromQuestion(index, "ダーバンデで攻撃したら？", {
      aliases: [
        {
          alias: "ダーバンデ",
          candidates: [
            { cardId: "d1", officialName: "俳句爵 Drache der'Bande" },
            { cardId: "d1", officialName: "俳句爵 Drache der’Bande" },
          ],
        },
      ],
    });
    assert.equal(groups.length, 1);
    assert.deepEqual(ids(groups[0]!.cards), ["d1"]);
    assert.equal(groups[0]?.total, 1);
  });

  it("カタカナ語の途中で切れる略称一致は捨てる", () => {
    const groups = suggestCardsFromQuestion(
      index,
      "シールドをブレイクする前にレッドゾーンを",
      {
        aliases: [
          { alias: "ブレ", candidates: [{ cardId: "b1", officialName: BOLSHACK.officialName }] },
          { alias: "レッド", candidates: [{ cardId: "a2", officialName: RED_ZONE_Z.officialName }] },
        ],
      },
    );
    assert.deepEqual(
      groups.map((g) => [g.mention, g.kind]),
      [["レッドゾーン", "token"]],
    );
  });

  it("中黒でつながった名前の後半だけには一致させない", () => {
    const withShortName = buildCardNameIndex([BOLSHACK, entry("x1", "ドラゴン")]);
    const groups = suggestCardsFromQuestion(
      withShortName,
      "ボルシャック・ドラゴン以外のドラゴンを",
      { maxTokenHits: 1 },
    );
    assert.deepEqual(
      groups.map((g) => g.mention),
      ["ボルシャック・ドラゴン", "ドラゴン"],
    );
  });

  it("キーワード能力名の一部は部分名として拾わない", () => {
    const withChange = buildCardNameIndex([RED_ZONE, entry("c1", "チェンジの海")]);
    const groups = suggestCardsFromQuestion(
      withChange,
      "轟く侵略 レッドゾーンに革命チェンジできますか？",
      { reservedTerms: ["革命チェンジ", "侵略"] },
    );
    assert.deepEqual(
      groups.map((g) => g.mention),
      ["轟く侵略 レッドゾーン"],
    );
  });

  it("長い一致の内側にある短い一致は別候補にしない", () => {
    const groups = suggestCardsFromQuestion(
      index,
      "龍装者 バルチュリス/デスティニー・ドラゴンとボルシャック・ドラゴンについて",
    );
    assert.deepEqual(
      groups.map((g) => g.mention),
      ["龍装者 バルチュリス/デスティニー・ドラゴン", "ボルシャック・ドラゴン"],
    );
  });

  it("ヒット数が多すぎる語は汎用語とみなして捨てる", () => {
    const many = buildCardNameIndex(
      Array.from({ length: 5 }, (_, i) => entry(`d${i}`, `ドラゴン${i}号`)),
    );
    const groups = suggestCardsFromQuestion(many, "ドラゴンを出したとき", {
      maxTokenHits: 4,
    });
    assert.deepEqual(groups, []);
  });

  it("質問文に出てきた順に並べる", () => {
    const groups = suggestCardsFromQuestion(
      index,
      "ボルシャック・ドラゴンとレッドゾーンがバトルしたら",
    );
    assert.deepEqual(
      groups.map((g) => g.mention),
      ["ボルシャック・ドラゴン", "レッドゾーン"],
    );
  });
});
