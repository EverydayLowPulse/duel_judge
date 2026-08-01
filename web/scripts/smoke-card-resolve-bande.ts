/**
 * 回帰: 読み仮名「ドラッヘダーバンデ」とノイズ付きクエリでカード解決できること。
 */
import { cleanCardQuery } from "../src/lib/resolve/cleanCardQuery";
import { resolveCardName } from "../src/lib/resolve/resolveCardName";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const cleaned = cleanCardQuery("ドラッヘダーバンデ　3コスの");
  assert(cleaned.cleaned.includes("ドラッヘ"), `cleaned=${cleaned.cleaned}`);
  assert(
    !cleaned.cleaned.includes("コス"),
    `cost noise remains: ${cleaned.cleaned}`,
  );
  console.log("OK cleanCardQuery", cleaned);

  for (const q of [
    "ドラッヘダーバンデ",
    "ドラッヘダーバンデ 3コスの",
    "ダーバンデ",
    // 公式は ’（U+2019）、手入力は '（ASCII）になりやすい
    "俳句爵 Drache der'Bande",
    "俳句爵 Drache der\u2019Bande",
  ]) {
    const result = await resolveCardName(q);
    console.log(q, "->", result.kind);
    if (result.kind === "resolved") {
      assert(
        /Drache|ダーバンデ|俳句爵/i.test(result.card.officialName),
        `unexpected card: ${result.card.officialName}`,
      );
      console.log("  ", result.card.officialName, result.card.cost);
    } else if (result.kind === "clarify") {
      const hit = result.candidates.some((c) =>
        /Drache|俳句爵/i.test(c.officialName),
      );
      assert(hit, `bande not in clarify: ${result.candidates.map((c) => c.officialName).join(", ")}`);
      console.log(
        "  candidates",
        result.candidates.map((c) => `${c.officialName}(${c.cost})`),
      );
    } else {
      console.log(JSON.stringify(result, null, 2));
      throw new Error(`expected resolved or clarify for ${q}, got not_found`);
    }
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
