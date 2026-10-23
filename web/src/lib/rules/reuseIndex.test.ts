import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canReuseRuleIndex } from "./reuseIndex";
import type { RuleIndex } from "./types";

const URL_V150 = "https://dm.takaratomy.co.jp/img/dm_rule_20260410_4.pdf";

function index(overrides: Partial<RuleIndex> = {}): RuleIndex {
  return {
    version: "1.50",
    sourceUrl: URL_V150,
    sourceFile: "dm_rule_20260410_4.pdf",
    builtAt: "2026-10-01T00:00:00.000Z",
    chunkCount: 1,
    chunks: [{ ruleRef: "101.4a", text: "…" }],
    ...overrides,
  };
}

describe("canReuseRuleIndex", () => {
  it("同じ版のPDFから作った索引は使い回す", () => {
    assert.equal(canReuseRuleIndex(index(), URL_V150), true);
  });

  it("ルールが改訂されてPDFのURLが変わったら作り直す", () => {
    const next = "https://dm.takaratomy.co.jp/img/dm_rule_20261001_1.pdf";
    assert.equal(canReuseRuleIndex(index(), next), false);
  });

  it("索引がなければ作り直す", () => {
    assert.equal(canReuseRuleIndex(null, URL_V150), false);
  });

  it("中身が空の索引は使わない（抽出に失敗した残骸を引き継がない）", () => {
    assert.equal(canReuseRuleIndex(index({ chunks: [], chunkCount: 0 }), URL_V150), false);
  });
});
