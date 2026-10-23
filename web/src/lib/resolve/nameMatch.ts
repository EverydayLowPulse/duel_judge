/**
 * カード名照合用の正規化。
 * 中黒・空白・括弧・面区切り（/）・アポストロフィを落とし、全角半角を揃える。
 * 「ドラン・ゴルゲルス」と「ドラン・ゴル・ゲルス」を同じキーにするため。
 * 公式名の ’（U+2019）と入力の '（ASCII）も同一視する（Drache der'Bande 系）。
 */
export function normalizeCardNameKey(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[・･\s　「」『』《》≪≫:：/／&＆!！'’`]/g, "")
    .toLowerCase();
}

/**
 * ひらがなをカタカナに寄せる（照合キー専用）。
 * 正式名がひらがなのカードもあるので、公式へ送る検索語には使わない。
 */
export function foldHiraganaToKatakana(value: string): string {
  return value.replace(/[ぁ-ゖゝゞ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
}

function matchKey(value: string): string {
  return foldHiraganaToKatakana(normalizeCardNameKey(value));
}

/**
 * クエリが公式名（ツインパクトの片面名含む）を指すか。
 * ひらがな／カタカナの違いは同一視する。
 */
export function nameKeyMatches(officialName: string, query: string): boolean {
  const q = matchKey(query);
  if (q.length < 2) return false;

  const faces = officialName.split(/[/／]/).map((part) => matchKey(part));
  const full = matchKey(officialName);
  return [full, ...faces].some(
    (name) => name === q || name.includes(q) || q.includes(name),
  );
}

/**
 * 公式検索は中黒の有無・位置に敏感（中黒なしは0件になりやすい）。
 * 中黒・空白を除いた文字列のあいだに ・ を補った検索語を返す。
 * カード固有の別名ではなく、表記ゆれ一般への対策。
 */
export function middleDotSearchVariants(query: string): string[] {
  const compact = query
    .normalize("NFKC")
    .replace(/[・･\s　]+/g, "");
  const chars = [...compact];
  // 短すぎるとノイズ、長すぎると組合せが増えすぎる
  if (chars.length < 4 || chars.length > 20) return [];

  const preferred: string[] = [];
  const rest: string[] = [];
  for (let i = 1; i < chars.length; i += 1) {
    const left = chars.slice(0, i).join("");
    const right = chars.slice(i).join("");
    const variant = `${left}・${right}`;
    // デュエマ名は 2〜5 文字のかたまりが多いので、その分割を先に試す
    if (i >= 2 && i <= 5) preferred.push(variant);
    else rest.push(variant);
  }

  // 「ドラン・ゴル・ゲルス」のように中黒が複数必要な名前向け（2箇所まで）
  const doubles: string[] = [];
  if (chars.length >= 6) {
    for (let i = 2; i <= 4; i += 1) {
      for (let j = i + 2; j <= Math.min(i + 5, chars.length - 1); j += 1) {
        doubles.push(
          `${chars.slice(0, i).join("")}・${chars.slice(i, j).join("")}・${chars
            .slice(j)
            .join("")}`,
        );
      }
    }
  }

  return [...new Set([...preferred, ...doubles, ...rest])];
}

/** 公式検索用のクエリ候補（原文 → 中黒補完 → 短い接頭辞）。中黒位置ズレ対策。 */
export function buildOfficialSearchVariants(query: string): string[] {
  const q = query.normalize("NFKC").trim();
  if (!q) return [];

  const variants: string[] = [];

  // 「アカネ&アサギ&コハク」は公式検索が弱いので、& 除去・先頭断片を先に試す
  const noAmp = q.replace(/[&＆]/g, "").trim();
  if (noAmp) variants.push(noAmp);
  const ampHead = q.split(/[&＆]/)[0]?.replace(/[!！]+$/u, "").trim();
  if (ampHead && ampHead.length >= 3) variants.push(ampHead);
  const bangHead = q.split(/[!！]/)[0]?.trim();
  if (bangHead && bangHead.length >= 2) variants.push(bangHead);

  variants.push(q);

  // 中黒なし／位置ズレ: 接頭辞より先に ・ 補完を試す（古いカードが接頭辞検索の上位に出ないため）
  variants.push(...middleDotSearchVariants(q));

  const chars = [...q];
  // 1文字ずつ短くした接頭辞（末尾の中黒・空白は落とす）
  for (let len = chars.length - 1; len >= 3; len -= 1) {
    const prefix = chars
      .slice(0, len)
      .join("")
      .replace(/[・･\s　]+$/u, "");
    if (prefix.length >= 3) variants.push(prefix);
  }

  const spaced = q.replace(/[・･]/g, " ").replace(/\s+/g, " ").trim();
  if (spaced && spaced !== q) variants.push(spaced);

  // ラテン名: apostrophe / der 周辺（「Drache der'Bande」系）
  if (/[A-Za-z]/.test(q)) {
    const noApos = q.replace(/['’`]/g, "").trim();
    if (noApos && noApos !== q) variants.push(noApos);
    const derSplit = q.split(/\s+der['’`]?/i);
    if (derSplit[0] && derSplit[0].length >= 3) {
      variants.push(derSplit[0].trim());
    }
  }

  return [...new Set(variants)];
}
