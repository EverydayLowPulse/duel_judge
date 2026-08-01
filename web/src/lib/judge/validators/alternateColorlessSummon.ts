/**
 * 「マナゾーンに○、○、○の各文明があれば、無色Nで召喚してよい」系の代替コスト。
 * 「各文明があれば無色Nで召喚してもよい」型の代替コスト
 *
 * 重要:
 * - 「各文明があれば」はマナゾーンにその文明が存在するかどうか（存在判定）。
 *   多色1枚が持つ全文明を同時に満たせる（支払い時の1文明割当とは別）。
 * - 支払い自体は無色Nなので、文明指定のタップは不要。
 */

const CIVS = ["光", "水", "闇", "火", "自然"] as const;

export type AlternateColorlessSummon = {
  presenceCivilizations: string[];
  colorlessCost: number;
  /** 能力文から切り出した根拠用スニペット */
  abilitySnippet: string;
};

export function parseAlternateColorlessSummon(
  abilityText: string,
): AlternateColorlessSummon | null {
  const compact = abilityText.normalize("NFKC").replace(/\s+/g, "");
  const m = compact.match(
    /マナゾーンに(.+?)の各文明があれば(.{0,100}?)支払って召喚/,
  );
  if (!m) return null;

  const civs = extractCivs(m[1]);
  if (civs.length < 2) return null;

  const window = m[0];
  const cost = parseColorlessCost(window);
  if (cost == null) return null;

  // 原文に近いスニペット（空白付き本文から再探索）
  const snippet = extractSnippet(abilityText) ?? window;

  return {
    presenceCivilizations: civs,
    colorlessCost: cost,
    abilitySnippet: snippet,
  };
}

/** マナゾーンに指定文明がすべて存在するか（多色は全文明を同時に貢献） */
export function manaZoneHasCivilizations(
  manaZone: Array<{ civilizations: string[] }>,
  required: string[],
): { ok: true } | { ok: false; missing: string[] } {
  const present = new Set(
    manaZone.flatMap((entry) =>
      entry.civilizations.map((c) => normalizeCiv(c)),
    ),
  );
  const missing = uniqueCivs(required).filter(
    (civ) => !present.has(normalizeCiv(civ)),
  );
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function extractCivs(part: string): string[] {
  const found: string[] = [];
  for (const civ of CIVS) {
    if (part.includes(civ)) found.push(civ);
  }
  return found;
}

function parseColorlessCost(window: string): number | null {
  const cc = window.match(/\[cc0(\d+)\]/i);
  if (cc) return Number(cc[1]);
  const mu = window.match(/無色[（(]?(\d+)[）)]?/);
  if (mu) return Number(mu[1]);
  return null;
}

function extractSnippet(abilityText: string): string | null {
  const normalized = abilityText.normalize("NFKC").replace(/\s+/g, " ");
  const m = normalized.match(
    /自分のマナゾーンに[^。]{0,80}各文明があれば[^。]{0,80}支払って召喚してもよい。?/,
  );
  if (m?.[0]) return m[0].trim();
  const m2 = normalized.match(
    /マナゾーンに[^。]{0,80}各文明があれば[^。]{0,80}支払って召喚[^。]{0,20}/,
  );
  return m2?.[0]?.trim() ?? null;
}

function uniqueCivs(values: string[]): string[] {
  const map = new Map<string, string>();
  for (const value of values) {
    const key = normalizeCiv(value);
    if (!key) continue;
    if (!map.has(key)) map.set(key, value.trim());
  }
  return [...map.values()];
}

function normalizeCiv(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
