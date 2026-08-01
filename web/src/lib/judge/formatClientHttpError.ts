/**
 * fetch / API 失敗時の本文を UI 向けに短くする。
 * Vercel の 500 HTML ページをそのまま出さない。
 */
export function formatClientHttpError(
  status: number,
  body: string,
  contentType?: string | null,
): string {
  const ct = contentType ?? "";
  const trimmed = body.trim();

  if (ct.includes("application/json") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string; message?: string };
      const msg = parsed.error ?? parsed.message;
      if (msg?.trim()) return msg.trim().slice(0, 280);
    } catch {
      // fall through
    }
  }

  if (ct.includes("text/html") || /<!DOCTYPE html|<html[\s>]/i.test(trimmed)) {
    const title =
      trimmed.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
    if (/timeout|FUNCTION_INVOCATION_TIMEOUT/i.test(trimmed + title)) {
      return "判定がタイムアウトしました。質問を短くするか、少し待って再試行してください。";
    }
    if (status === 500 || /This page couldn.?t load|Internal Server Error/i.test(title + trimmed)) {
      return "サーバで判定処理に失敗しました。しばらくしてから再試行してください。";
    }
    if (status === 503) {
      return "サービスが混み合っています。しばらくしてから再試行してください。";
    }
    return `判定に失敗しました（HTTP ${status}）。`;
  }

  const plain = trimmed
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return `判定に失敗しました（HTTP ${status}）。`;
  return plain.length > 280 ? `${plain.slice(0, 280)}…` : plain;
}
