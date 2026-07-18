/**
 * 公式検索用に、質問文からキーワードを取り出す。
 * qa_w は全文だと0件になりやすいので、カタカナ能力名などを優先する。
 */
export function extractSearchKeywords(question: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const t = raw.trim();
    if (t.length < 2 || seen.has(t) || STOP.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  // 《正式名》
  for (const m of question.matchAll(/[《≪]([^》≫]+)[》≫]/g)) {
    push(m[1]);
  }

  // カタカナ語（ニンジャストライク等）＋中黒あり/なしの両形
  for (const m of question.matchAll(/[ァ-ヴー]{2,}/g)) {
    push(m[0]);
    if (!m[0].includes("・")) {
      // 公式は「ニンジャ・ストライク」のように中黒を挟むことが多い
      const dotted = m[0].replace(/(ストライク|トリガー|バック)$/, "・$1");
      if (dotted !== m[0]) push(dotted);
    } else {
      push(m[0].replace(/・/g, ""));
    }
  }

  // 漢字連続（墓地召喚 など）。短い一般語は STOP で落とす
  for (const m of question.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    push(m[0]);
  }

  // 長い語を先に試す
  return out.sort((a, b) => b.length - a.length);
}

/** Q&A検索に使うクエリ候補（先頭から試し、ヒットしたものを使う） */
export function buildQaQueryCandidates(
  question: string,
  officialName?: string,
): string[] {
  const keys = extractSearchKeywords(question);
  // 広い1語より、複合語を先に試す（「ニンジャストライク」だけだと無関係ヒットしやすい）
  const combined: string[] = [];
  if (keys.length >= 2) combined.push(`${keys[0]} ${keys[1]}`);
  if (keys.length >= 3) combined.push(`${keys[0]} ${keys[2]}`);

  const list = [
    ...(officialName ? [officialName] : []),
    ...combined,
    ...keys,
  ].filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of list) {
    if (seen.has(q)) continue;
    seen.add(q);
    out.push(q);
  }
  return out;
}

const STOP = new Set([
  "場合",
  "とき",
  "こと",
  "もの",
  "自分",
  "相手",
  "使用",
  "可能",
  "能力",
  "持ち",
  "確認",
  "質問",
  "状況",
  "効果",
  "処理",
  "以上",
  "以下",
  "全て",
  "すべて",
]);
