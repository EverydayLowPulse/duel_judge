import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCardListHtml } from "./cardList";

// 公式 POST /card/ の応答断片（構造だけ残して縮めたもの）
const PAGE_HTML = `
<p class="totalCount"><span id="total_count">11840</span>枚</p>
<ul class="cardList">
<li><a href='/card/detail/?id=dm26ex4-001' data-href='/card/detail/?id=dm26ex4-001'><img class='cardImage' data-href='/card/detail/?id=dm26ex4-001' alt=' '/></a></li>
<li><a href='/card/detail/?id=dm26ex4-002' data-href='/card/detail/?id=dm26ex4-002'><img class='cardImage' data-href='/card/detail/?id=dm26ex4-002' alt=' '/></a></li>
</ul>
<div class="pagenavi">
<a class="page larger" href="" data-page="2">2</a>
<a class="page larger" href="" data-page="3">3</a>
<a class="last" href="" data-page="237">最後</a>
</div>
`;

describe("parseCardListHtml", () => {
  it("総件数・カードID・最終ページを取る", () => {
    assert.deepEqual(parseCardListHtml(PAGE_HTML), {
      totalCount: 11840,
      cardIds: ["dm26ex4-001", "dm26ex4-002"],
      lastPage: 237,
    });
  });

  it("ページ送りがなければ最終ページは1", () => {
    const html = `<span id="total_count">1</span>
<a data-href='/card/detail/?id=x-1'><img data-href='/card/detail/?id=x-1'/></a>`;
    assert.deepEqual(parseCardListHtml(html), {
      totalCount: 1,
      cardIds: ["x-1"],
      lastPage: 1,
    });
  });

  it("総件数が読めなければ null", () => {
    assert.equal(parseCardListHtml("<div></div>").totalCount, null);
  });
});
