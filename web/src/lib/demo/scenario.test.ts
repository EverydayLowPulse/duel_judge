import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEMO_SCENARIO, typingSteps } from "./scenario";

describe("DEMO_SCENARIO", () => {
  it("質問文がある", () => {
    assert.ok(DEMO_SCENARIO.question.trim());
  });

  it("カードごとに、検索窓に打つ語と、タップする候補の見分け方がある", () => {
    assert.ok(DEMO_SCENARIO.cards.length > 0);
    for (const card of DEMO_SCENARIO.cards) {
      assert.ok(card.searchTerm.trim());
      assert.ok(card.nameIncludes.trim());
    }
  });

  it("2枚以上選ぶ（1枚だと確認のダイアログが挟まり、流れが止まる）", () => {
    assert.ok(DEMO_SCENARIO.cards.length >= 2);
  });
});

describe("typingSteps", () => {
  it("1文字ずつ増えていく途中経過を返す", () => {
    assert.deepEqual(typingSteps("メカく"), ["メ", "メカ", "メカく"]);
  });

  it("絵文字などのサロゲートペアを途中で割らない", () => {
    assert.deepEqual(typingSteps("a😀"), ["a", "a😀"]);
  });

  it("空文字なら何も打たない", () => {
    assert.deepEqual(typingSteps(""), []);
  });
});
