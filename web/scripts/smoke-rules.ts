import { ensureRuleIndex } from "../src/lib/rules/ensureIndex";
import { searchRuleChunks } from "../src/lib/rules/search";

async function main() {
  const index = await ensureRuleIndex();
  console.log(
    JSON.stringify(
      {
        version: index.version,
        chunks: index.chunkCount,
        sample: index.chunks.slice(0, 3).map((c) => ({
          ref: c.ruleRef,
          len: c.text.length,
          head: c.text.slice(0, 60),
        })),
      },
      null,
      2,
    ),
  );
  const hits = searchRuleChunks(index.chunks, "召喚酔い", 3);
  console.log(
    "hits",
    hits.map((h) => ({
      ref: h.ruleRef,
      score: h.score,
      head: h.text.slice(0, 100),
    })),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
