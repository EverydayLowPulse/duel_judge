import { resolveEnv } from "../llm/env";
import { searchDmwikiCardNames } from "./dmwikiSearch";
import { rewriteCardSearchQueries } from "./rewriteCardQuery";

export type WebAssistCandidate = {
  proposedOfficialName: string;
  officialSearchQuery: string;
  source: "dmwiki";
};

/**
 * CARD_RESOLVE_WEB=auto|on|off（既定 auto = 有効）
 */
export function isCardResolveWebEnabled(): boolean {
  const raw = (resolveEnv("CARD_RESOLVE_WEB") || "auto").toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return false;
  if (raw === "on" || raw === "1" || raw === "true" || raw === "auto") {
    return true;
  }
  return true;
}

/**
 * 公式検索0件時の補助: （任意）DeepSeekで語整形 → dmwiki検索 → 正式名候補。
 * 論拠には使わず、公式DB再検索用のヒントのみ。
 */
export async function assistCardNamesFromWeb(
  query: string,
): Promise<WebAssistCandidate[]> {
  if (!isCardResolveWebEnabled()) return [];

  const q = query.normalize("NFKC").trim();
  if (q.length < 2) return [];

  const rewritten = await rewriteCardSearchQueries(q);
  const searchWords = unique([q, ...rewritten]).slice(0, 4);

  const byName = new Map<string, WebAssistCandidate>();
  for (const word of searchWords) {
    try {
      const hits = await searchDmwikiCardNames(word, { maxHits: 8 });
      for (const hit of hits) {
        if (byName.has(hit.title)) continue;
        byName.set(hit.title, {
          proposedOfficialName: hit.title,
          officialSearchQuery: pickOfficialQuery(hit.title),
          source: "dmwiki",
        });
      }
    } catch (error) {
      console.warn(
        "[resolve] dmwiki search failed",
        word,
        error instanceof Error ? error.message : error,
      );
    }
    if (byName.size >= 8) break;
  }

  return [...byName.values()].slice(0, 8);
}

/** 公式検索は長すぎると弱いことがあるので先頭のかたまりを優先 */
function pickOfficialQuery(officialName: string): string {
  const name = officialName.normalize("NFKC").trim();
  // ツインパクトは片面名
  const face = name.split(/[/／]/)[0]?.trim() ?? name;
  if (face.length <= 24) return face;
  // スペース区切りの先頭トークン群
  const parts = face.split(/\s+/);
  if (parts[0] && parts[0].length >= 3) {
    const head = parts.slice(0, 2).join(" ");
    return head.length <= 24 ? head : parts[0];
  }
  return face.slice(0, 24);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}
