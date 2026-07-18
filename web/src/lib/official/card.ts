import * as cheerio from "cheerio";
import type { CardResolveResult, CardSearchHit, OfficialCard } from "./types";
import { withOfficialRateLimit } from "./rateLimit";
import { readCardCache, writeCardCache } from "../cache/cardCache";
import {
  buildOfficialSearchVariants,
  nameKeyMatches,
} from "../resolve/nameMatch";

// cheerio API 型（load 戻り値）
type CheerioAPI = ReturnType<typeof cheerio.load>;

const BASE = "https://dm.takaratomy.co.jp";
const UA = "duel_judge/0.1 (personal research; respectful rate limit)";

function detailUrl(cardId: string): string {
  return `${BASE}/card/detail/?id=${encodeURIComponent(cardId)}`;
}

/**
 * 公式カード検索（POST）。一覧には名前がなく id だけ返る。
 */
export async function searchCardHits(
  keyword: string,
  options?: { page?: number },
): Promise<{ totalHint: number | null; hits: CardSearchHit[] }> {
  const page = options?.page ?? 1;
  const body = new URLSearchParams();
  body.set("keyword", keyword);
  body.set("pagenum", String(page));
  body.append("keyword_type[]", "card_name");
  // samename は付けない（MVP: 再録を増やさない）

  const html = await withOfficialRateLimit(async () => {
    const res = await fetch(`${BASE}/card/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": UA,
      },
      body,
      // Next の fetch キャッシュを避ける（毎回公式へ）
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`card search failed: HTTP ${res.status}`);
    }
    return res.text();
  });

  const $ = cheerio.load(html);
  const totalRaw = $("#total_count").first().text().trim();
  const totalHint = totalRaw ? Number(totalRaw) : null;

  const ids: string[] = [];
  $("a[data-href*='/card/detail/?id=']").each((_, el) => {
    const href = $(el).attr("data-href") ?? "";
    const m = href.match(/[?&]id=([^&]+)/);
    if (m?.[1]) ids.push(m[1]);
  });

  const unique = [...new Set(ids)];
  return {
    totalHint: Number.isFinite(totalHint) ? totalHint : null,
    hits: unique.map((cardId) => ({ cardId, detailUrl: detailUrl(cardId) })),
  };
}

/**
 * 詳細ページから正式名・能力テキストを取る。
 */
export async function fetchCardDetail(cardId: string): Promise<OfficialCard> {
  const cached = await readCardCache(cardId);
  if (cached) return cached;

  const url = detailUrl(cardId);
  const html = await withOfficialRateLimit(async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`card detail failed: HTTP ${res.status} id=${cardId}`);
    }
    return res.text();
  });

  const card = parseCardDetailHtml(cardId, html);
  await writeCardCache(card);
  return card;
}

export function parseCardDetailHtml(cardId: string, html: string): OfficialCard {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  // 例: 轟く侵略 レッドゾーン(DM26SD1 2F/12) | デュエル・マスターズ
  const head = title.split("|")[0]?.trim() ?? title;
  const nameMatch = head.match(/^(.*?)(?:\(([^)]*)\))?$/);
  const officialName = (nameMatch?.[1] ?? head).trim();
  const productLabel = nameMatch?.[2]?.trim() ?? null;

  const flatBody = $("body").text().replace(/\s+/g, " ").trim();
  const cardType = textBetween(flatBody, "カードの種類", "文明");
  const civilizationText = textBetween(flatBody, "文明", "レアリティ");
  const power = textBetween(flatBody, "パワー", "コスト");
  const cost = textBetween(flatBody, "コスト", "マナ");
  const raceText = textBetween(flatBody, "種族", "イラストレーター");

  // ツインパクトは特殊能力ブロックが2つある。片面だけ取ると呪文側を落とす。
  const faces = extractCardFaces($);
  const abilityText =
    faces.length > 0
      ? faces
          .map((face, index) => {
            const label = face.cardType ?? `面${index + 1}`;
            return `【${label}側】\n${face.abilityText}`;
          })
          .join("\n\n")
      : "";

  return {
    cardId,
    officialName,
    productLabel,
    cardType,
    civilizations: splitCardField(civilizationText),
    power,
    cost,
    races: splitCardField(raceText),
    abilityText,
    faces,
    detailUrl: detailUrl(cardId),
    fetchedAt: new Date().toISOString(),
  };
}

function extractCardFaces(
  $: CheerioAPI,
): Array<{ cardType: string | null; abilityText: string }> {
  const typeHints: string[] = [];
  $("table").each((_, table) => {
    const t = $(table).text().replace(/\s+/g, " ").trim();
    if (!t.includes("カードの種類")) return;
    const type = textBetween(t, "カードの種類", "文明");
    if (type) typeHints.push(type);
  });

  const faces: Array<{ cardType: string | null; abilityText: string }> = [];
  $("td.skills.full").each((index, el) => {
    const abilityText = $(el)
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+/g, " ")
      .trim();
    if (!abilityText) return;
    faces.push({
      cardType: typeHints[index] ?? null,
      abilityText,
    });
  });

  if (faces.length > 0) return faces;

  // 旧レイアウト向けフォールバック
  const bodyText = $("body").text();
  const ab = bodyText.match(/特殊能力([\s\S]*?)フレーバー/);
  if (ab?.[1]) {
    return [
      {
        cardType: textBetween(
          bodyText.replace(/\s+/g, " ").trim(),
          "カードの種類",
          "文明",
        ),
        abilityText: ab[1].replace(/\s+/g, "\n").trim(),
      },
    ];
  }
  return [];
}

function textBetween(
  text: string,
  startLabel: string,
  endLabel: string,
): string | null {
  const start = text.indexOf(startLabel);
  if (start < 0) return null;
  const valueStart = start + startLabel.length;
  const end = text.indexOf(endLabel, valueStart);
  if (end < 0) return null;
  const value = text.slice(valueStart, end).trim();
  return value || null;
}

function splitCardField(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[\/／]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * キーワード → 候補カード一覧（詳細まで取得）。
 * 曖昧検索で大量ヒットしうるので detail 取得数に上限を付ける。
 *
 * 公式検索は中黒位置に敏感（「ドラン・ゴルゲルス」は0件、
 * 「ドラン・ゴル・ゲルス」はヒット）。ヒット0や名前不一致のときは
 * 接頭辞を短くして再検索し、正規化名で絞り込む。
 */
export async function resolveCardCandidates(
  query: string,
  options?: { maxDetails?: number },
): Promise<CardResolveResult> {
  const maxDetails = options?.maxDetails ?? 12;
  const variants = buildOfficialSearchVariants(query).slice(0, 8);
  const seenIds = new Set<string>();
  const candidates: OfficialCard[] = [];
  let totalHint: number | null = null;

  for (const variant of variants) {
    const { totalHint: hint, hits } = await searchCardHits(variant);
    if (totalHint == null) totalHint = hint;

    for (const hit of hits.slice(0, maxDetails)) {
      if (seenIds.has(hit.cardId)) continue;
      seenIds.add(hit.cardId);
      candidates.push(await fetchCardDetail(hit.cardId));
      if (candidates.length >= maxDetails) break;
    }

    // 正規化後にクエリと一致する候補が取れたら打ち切り
    if (candidates.some((card) => nameKeyMatches(card.officialName, query))) {
      break;
    }
    if (candidates.length >= maxDetails) break;
  }

  // 正式名で重複除去（再録・別印刷）
  const byName = new Map<string, OfficialCard>();
  for (const c of candidates) {
    if (!byName.has(c.officialName)) {
      byName.set(c.officialName, c);
    }
  }

  return {
    query,
    totalHint,
    candidates: [...byName.values()],
  };
}
