import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficialCard } from "../official/types";
import {
  buildCardMirrorBundle,
  createCardMirror,
  isCurrentCardShape,
  parseCardMirrorBundle,
} from "./mirror";

function card(cardId: string, officialName: string): OfficialCard {
  return {
    cardId,
    officialName,
    productLabel: null,
    cardType: "クリーチャー",
    civilizations: ["火"],
    power: "5000",
    cost: "5",
    manaValue: 1,
    races: ["ドラゴン"],
    abilityText: "【クリーチャー側】\nW・ブレイカー",
    faces: [{ cardType: "クリーチャー", abilityText: "W・ブレイカー" }],
    detailUrl: `https://dm.takaratomy.co.jp/card/detail/?id=${cardId}`,
    fetchedAt: "2026-10-21T00:00:00.000Z",
  };
}

describe("isCurrentCardShape", () => {
  it("今の形のカードを受け入れる", () => {
    assert.equal(isCurrentCardShape(card("a", "A")), true);
  });

  it("ツインパクトなのに片面しかない旧形式は捨てる", () => {
    assert.equal(isCurrentCardShape(card("t", "A/B")), false);
  });

  it("v2 パーサの出力は名前に / があっても面の数を信用する", () => {
    assert.equal(
      isCurrentCardShape({ ...card("s", "*/零幻/*"), parserVersion: 2 }),
      true,
    );
  });

  it("v2 でも面が0件ならパース失敗として捨てる", () => {
    assert.equal(
      isCurrentCardShape({ ...card("e", "E"), faces: [], parserVersion: 2 }),
      false,
    );
  });

  it("manaValue のない旧形式は捨てる", () => {
    const old: Partial<OfficialCard> = card("a", "A");
    delete old.manaValue;
    assert.equal(isCurrentCardShape(old as OfficialCard), false);
  });

  it("誤パースされたマナ値は捨てる", () => {
    assert.equal(isCurrentCardShape({ ...card("a", "A"), manaValue: 20 }), false);
  });
});

describe("buildCardMirrorBundle / parseCardMirrorBundle", () => {
  it("cardId で重複を除き、旧形式を落とす", () => {
    const bundle = buildCardMirrorBundle(
      [card("a", "A"), card("a", "A"), card("t", "A/B"), card("b", "B")],
      { builtAt: "2026-10-21T00:00:00.000Z" },
    );
    assert.equal(bundle.count, 2);
    assert.deepEqual(
      bundle.cards.map((c) => c.cardId),
      ["a", "b"],
    );
  });

  it("JSON を往復できる", () => {
    const bundle = buildCardMirrorBundle([card("a", "A")], {
      builtAt: "2026-10-21T00:00:00.000Z",
    });
    const parsed = parseCardMirrorBundle(JSON.stringify(bundle));
    assert.deepEqual(parsed, bundle);
  });

  it("壊れた JSON や未知の版は null", () => {
    assert.equal(parseCardMirrorBundle("{"), null);
    assert.equal(
      parseCardMirrorBundle(JSON.stringify({ version: 99, cards: [] })),
      null,
    );
  });
});

describe("createCardMirror", () => {
  const mirror = createCardMirror(
    buildCardMirrorBundle([card("a", "A"), card("a2", "A"), card("b", "B")], {
      builtAt: "2026-10-21T00:00:00.000Z",
    }),
  );

  it("cardId で引ける", () => {
    assert.equal(mirror.get("b")?.officialName, "B");
    assert.equal(mirror.get("zzz"), null);
  });

  it("名前索引は同名の再録を1枚にまとめる", () => {
    assert.deepEqual(
      mirror.nameIndex.cards.map((c) => c.entry.cardId),
      ["a", "b"],
    );
  });
});
