/**
 * 回帰: 中黒なしのカード名でも公式検索経由で解決できること。
 * （公式DBは中黒敏感で、接頭辞検索だけでは古いカードが上位に出ない）
 */
import {
  buildOfficialSearchVariants,
  middleDotSearchVariants,
} from "../../src/lib/resolve/nameMatch";
import { resolveCardName } from "../../src/lib/resolve/resolveCardName";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const noDot = "アクアティーチャー";
  const withDot = "アクア・ティーチャー";

  const insertions = middleDotSearchVariants(noDot);
  assert(
    insertions.includes(withDot),
    `middleDotSearchVariants should include ${withDot}`,
  );

  const variants = buildOfficialSearchVariants(noDot);
  const early = variants.slice(0, 8);
  assert(
    early.includes(withDot),
    `buildOfficialSearchVariants early slots should include ${withDot}, got ${early.join(", ")}`,
  );
  console.log("OK variants", early);

  for (const q of [noDot, withDot]) {
    const result = await resolveCardName(q);
    console.log(q, "->", result.kind);
    assert(result.kind === "resolved", `expected resolved for ${q}, got ${result.kind}`);
    assert(
      result.card.officialName.includes("アクア・ティーチャー") ||
        result.card.officialName.includes("アクアティーチャー"),
      `unexpected: ${result.card.officialName}`,
    );
    console.log("  ", result.card.officialName);
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
