import type { JudgeProgressEvent } from "./progress";
import type { JudgeRequest, JudgeResponse } from "./types";
import { formatClientHttpError } from "./formatClientHttpError";

export type FetchJudgeOptions = {
  onProgress?: (event: JudgeProgressEvent) => void;
};

/**
 * POST /api/judge を SSE で呼び、progress → result を受け取る。
 * サーバが JSON のみ返した場合は後方互換でそのまま読む。
 */
export async function fetchJudge(
  body: JudgeRequest,
  options?: FetchJudgeOptions,
): Promise<JudgeResponse> {
  let res: Response;
  try {
    res = await fetch("/api/judge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ ...body, stream: true }),
    });
  } catch {
    throw new Error(
      "判定サーバに接続できませんでした。通信状況を確認して再試行してください。",
    );
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await res.json()) as JudgeResponse & { error?: string };
    if (!res.ok) {
      throw new Error(
        data.error ??
          formatClientHttpError(res.status, JSON.stringify(data), contentType),
      );
    }
    return data;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(formatClientHttpError(res.status, text, contentType));
  }

  // HTML が 200 で返ることは稀だが、SSE 以外は弾く
  if (contentType.includes("text/html")) {
    const text = await res.text().catch(() => "");
    throw new Error(formatClientHttpError(res.status || 500, text, contentType));
  }

  return readJudgeSse(res.body, options?.onProgress);
}

async function readJudgeSse(
  body: ReadableStream<Uint8Array>,
  onProgress?: (event: JudgeProgressEvent) => void,
): Promise<JudgeResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: JudgeResponse | null = null;
  let streamError: string | null = null;
  let lastProgress: JudgeProgressEvent | null = null;
  let readFailed = false;

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        readFailed = true;
        break;
      }
      const { done, value } = chunk;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE は空行区切り。不完全な塊は buffer に残す
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const event = parseSseBlock(part);
        if (!event) continue;
        if (event.name === "progress") {
          lastProgress = event.data as JudgeProgressEvent;
          onProgress?.(lastProgress);
        } else if (event.name === "result") {
          result = event.data as JudgeResponse;
        } else if (event.name === "error") {
          const payload = event.data as { error?: string };
          streamError = payload.error ?? "判定に失敗しました";
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  if (streamError) throw new Error(streamError);
  if (result) return result;

  const stageHint = lastProgress?.message
    ? `（最後の進捗: ${lastProgress.message}）`
    : "";
  if (readFailed) {
    throw new Error(
      `判定の途中で通信が切れました${stageHint}。もう一度送ってください。`,
    );
  }
  throw new Error(
    `判定結果を受信できませんでした${stageHint}。サーバ側の時間制限（約60秒）か通信切断のことがあります。もう一度送ってください。`,
  );
}

function parseSseBlock(
  block: string,
): { name: string; data: unknown } | null {
  let name = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    // SSE コメント（: keepalive）は無視
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      name = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }
  if (dataLines.length === 0) return null;
  try {
    return { name, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}
