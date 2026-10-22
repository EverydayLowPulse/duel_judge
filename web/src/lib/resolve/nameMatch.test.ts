import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nameKeyMatches } from "./nameMatch";

describe("nameKeyMatches", () => {
  it("中黒の有無を無視する", () => {
    assert.equal(nameKeyMatches("ボルシャック・ドラゴン", "ボルシャックドラゴン"), true);
  });

  it("ひらがなの入力でもカタカナ名に一致する", () => {
    assert.equal(nameKeyMatches("ボルシャック・ドラゴン", "ぼるしゃっく"), true);
  });

  it("ひらがなの正式名は原文どおり一致する", () => {
    assert.equal(nameKeyMatches("ちゅうりっぷちゃん", "ちゅうりっぷ"), true);
  });

  it("無関係な名前には一致しない", () => {
    assert.equal(nameKeyMatches("ボルシャック・ドラゴン", "レッドゾーン"), false);
  });
});
