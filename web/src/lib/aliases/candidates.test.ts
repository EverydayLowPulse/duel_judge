import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeAliasCandidates } from "./candidates";

function candidate(cardId: string, officialName: string) {
  return {
    cardId,
    officialName,
    detailUrl: `https://dm.takaratomy.co.jp/card/detail/?id=${cardId}`,
  };
}

describe("dedupeAliasCandidates", () => {
  it("アポストロフィの表記（' と ’）だけが違う同じカードは1件にまとめる", () => {
    const merged = dedupeAliasCandidates([
      candidate("d1", "俳句爵 Drache der'Bande"),
      candidate("d1", "俳句爵 Drache der’Bande"),
    ]);
    assert.equal(merged.length, 1);
  });

  it("同じ名前の再録（IDが違う別の版）は、先に登録したものを残して1件にまとめる", () => {
    const merged = dedupeAliasCandidates([
      candidate("old", "轟く侵略 レッドゾーン"),
      candidate("new", "轟く侵略 レッドゾーン"),
    ]);
    assert.deepEqual(
      merged.map((c) => c.cardId),
      ["old"],
    );
  });

  it("名前が違うカードは別々に残す", () => {
    const merged = dedupeAliasCandidates([
      candidate("a1", "轟く侵略 レッドゾーン"),
      candidate("a2", "超轟く侵略 レッドゾーンZ"),
    ]);
    assert.equal(merged.length, 2);
  });
});
