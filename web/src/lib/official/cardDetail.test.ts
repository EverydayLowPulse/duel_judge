import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardDetailUrl, parseCardDetailHtml } from "./card";

describe("cardDetailUrl", () => {
  it("公式が生のまま要求する + と $ はエンコードしない", () => {
    assert.equal(
      cardDetailUrl("dm34+1s-003"),
      "https://dm.takaratomy.co.jp/card/detail/?id=dm34+1s-003",
    );
    assert.equal(
      cardDetailUrl("dmrp07-s06$"),
      "https://dm.takaratomy.co.jp/card/detail/?id=dmrp07-s06$",
    );
  });

  it("クエリを壊す文字はエンコードする", () => {
    assert.equal(
      cardDetailUrl("a&b#c"),
      "https://dm.takaratomy.co.jp/card/detail/?id=a%26b%23c",
    );
  });
});

// 公式詳細ページの面ごとの表（構造だけ残して縮めたもの）
function faceTables(face: {
  type: string;
  civ: string;
  skills: string;
}): string {
  return `
<table><tbody><tr><th><p>カードの種類</p></th><td class='type'>${face.type}</td><th><p>文明</p></th><td class='civil'>${face.civ}</td></tr></tbody></table>
<table><tbody><tr><th><p>レアリティ</p></th><td class='rarelity'>C</td><th><p>パワー</p></th><td class='power'>1000</td></tr></tbody></table>
<table><tbody><tr><th><p>コスト</p></th><td class='cost'>1</td><th><p>マナ</p></th><td class='mana'>1</td></tr></tbody></table>
<table><tbody><tr><th><p>種族</p></th><td class='race'>シノビ</td></tr></tbody></table>
<table><tbody><tr><th class='illusttitle'>イラストレーター</th><td colspan='3' class='illusttxt'>x</td></tr></tbody></table>
<table><tbody><tr><th class='full'><p>特殊能力</p></th></tr><tr><td class='skills full'>${face.skills}</td></tr></tbody></table>
<table><tbody><tr><th class='full'><p>フレーバー</p></th></tr><tr><td class='flavor full'></td></tr></tbody></table>`;
}

function page(name: string, faces: string[]): string {
  return `<html><head><title>${name}(TEST 1/1) | デュエル・マスターズ</title></head>
<body><h3 class='card-name'>${name}</h3>${faces.join("")}</body></html>`;
}

describe("parseCardDetailHtml", () => {
  it("能力のないカードも1面として持つ", () => {
    const card = parseCardDetailHtml(
      "x-1",
      page("バニラ", [faceTables({ type: "クリーチャー", civ: "光", skills: "" })]),
    );
    assert.deepEqual(card.faces, [{ cardType: "クリーチャー", abilityText: "" }]);
    assert.equal(card.parserVersion, 2);
  });

  it("片面に能力がないツインパクトも面の種類がずれない", () => {
    const card = parseCardDetailHtml(
      "x-2",
      page("パーロック / 呪文側", [
        faceTables({ type: "クリーチャー", civ: "水", skills: "" }),
        faceTables({ type: "呪文", civ: "水", skills: "S・トリガー" }),
      ]),
    );
    assert.deepEqual(card.faces, [
      { cardType: "クリーチャー", abilityText: "" },
      { cardType: "呪文", abilityText: "S・トリガー" },
    ]);
    assert.equal(card.abilityText, "【クリーチャー側】\n\n\n【呪文側】\nS・トリガー");
  });
});
