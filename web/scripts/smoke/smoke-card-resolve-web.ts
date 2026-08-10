/**
 * dmwiki 検索 HTML パースと、wiki→公式の配線スモーク。
 */
import { parseDmwikiSearchHtml } from "../../src/lib/resolve/dmwikiSearch";
import { resolveCardName } from "../../src/lib/resolve/resolveCardName";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const FIXTURE = `<div id="cmd"><ul>
 <li><a href="https://dmwiki.net/?cmd=read&amp;page=x">《俳句爵 Drache der'Bande》</a></li>
 <li><a href="https://dmwiki.net/?cmd=read&amp;page=y">《大集合！アカネ＆アサギ＆コハク》</a></li>
 <li><a href="https://dmwiki.net/?cmd=read&amp;page=z">ルール質問掲示板/コメント</a></li>
</ul></div>`;

async function main() {
  const hits = parseDmwikiSearchHtml(FIXTURE);
  assert(hits.length === 2, `expected 2 card hits, got ${hits.length}`);
  assert(
    hits[0]?.title.includes("Drache"),
    `unexpected first: ${hits[0]?.title}`,
  );
  console.log(
    "OK parse",
    hits.map((h) => h.title),
  );

  // ネットワーク: skipAlias で公式が弱くても wiki 経由で取れること
  const result = await resolveCardName("ダーバンデ", { skipAlias: true });
  console.log("resolve ダーバンデ ->", result.kind, "source" in result ? result.source : "");
  if (result.kind === "resolved") {
    assert(
      /Drache|俳句爵|ダーバンデ/i.test(result.card.officialName),
      result.card.officialName,
    );
    console.log(" ", result.card.officialName, "via", result.source);
  } else if (result.kind === "clarify") {
    const hit = result.candidates.some((c) =>
      /Drache|俳句爵/i.test(c.officialName),
    );
    assert(hit, "bande not in clarify");
  } else {
    throw new Error(`unexpected not_found: ${result.note}`);
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
