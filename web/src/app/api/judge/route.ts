import { NextRequest, NextResponse } from "next/server";
import { runJudge } from "@/lib/judge/runJudge";
import type { JudgeProgressEvent } from "@/lib/judge/progress";
import type {
  ConfirmedCardInput,
  JudgeRequest,
  JudgeResponse,
} from "@/lib/judge/types";
import { formatUserFacingLlmError } from "@/lib/llm/generateJson";
import {
  resolveLlmOverride,
  runWithLlmOverride,
} from "@/lib/llm/providerContext";

/** Vercel Hobby 上限。裁定は PDF初回＋LLM で時間がかかる */
export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** プロキシ／携帯回線が「無通信」と判断して切るのを防ぐ */
const HEARTBEAT_MS = 8_000;

/**
 * POST /api/judge
 * body: { question, confirmedCards?, cardQuery?, cardId?, model?, provider?, stream? }
 *
 * confirmedCards: 送信前にユーザーが確定したカード（`[]` は「カードなし」の明示）。
 *   指定時はカード名解決を行わない。cardQuery / cardId は後方互換。
 * model: カタログID（推奨）。provider は後方互換。
 *
 * stream: true または Accept: text/event-stream のとき SSE
 *   event: progress → { stage, message }
 *   event: result   → JudgeResponse
 *   event: error    → { error }
 * それ以外は従来どおり JSON 一発。
 */
export async function POST(req: NextRequest) {
  let body: {
    question?: string;
    cardQuery?: string;
    cardId?: string;
    confirmedCards?: unknown;
    model?: string;
    provider?: string;
    stream?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json(
      { error: "body.question is required" },
      { status: 400 },
    );
  }

  const resolved = resolveLlmOverride({
    model: body.model,
    provider: body.provider,
  });
  if (resolved.error) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const accept = req.headers.get("accept") ?? "";
  const wantStream =
    body.stream === true || accept.includes("text/event-stream");

  const judgeReq: JudgeRequest = {
    question,
    cardQuery: body.cardQuery?.trim() || undefined,
    cardId: body.cardId?.trim() || undefined,
    confirmedCards: parseConfirmedCards(body.confirmedCards),
    model: resolved.catalog?.id,
    provider: resolved.override?.provider,
  };

  if (!wantStream) {
    try {
      const result = await runWithLlmOverride(resolved.override, () =>
        runJudge(judgeReq),
      );
      return NextResponse.json(result);
    } catch (e) {
      return jsonError(e);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      const send = (event: string, data: unknown) => {
        safeEnqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, HEARTBEAT_MS);

      const onAbort = () => {
        closed = true;
        clearInterval(heartbeat);
      };
      req.signal.addEventListener("abort", onAbort);

      try {
        send("progress", {
          stage: "resolve_card",
          message: "判定を開始しています…",
          kind: "status",
        } satisfies JudgeProgressEvent);

        const result: JudgeResponse = await runWithLlmOverride(
          resolved.override,
          () =>
            runJudge(judgeReq, {
              onProgress: (event: JudgeProgressEvent) =>
                send("progress", event),
            }),
        );
        if (!closed) send("result", result);
      } catch (e) {
        if (!closed) send("error", { error: formatJudgeError(e) });
      } finally {
        clearInterval(heartbeat);
        req.signal.removeEventListener("abort", onAbort);
        if (!closed) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
        closed = true;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** 空配列（カードなしの明示）と未指定（後方互換の推定モード）を区別する */
function parseConfirmedCards(raw: unknown): ConfirmedCardInput[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ConfirmedCardInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { cardId, mention } = item as { cardId?: unknown; mention?: unknown };
    const id = typeof cardId === "string" ? cardId.trim() : "";
    if (!id) continue;
    out.push({
      cardId: id,
      mention:
        typeof mention === "string" && mention.trim() ? mention.trim() : undefined,
    });
  }
  return out;
}

function formatJudgeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/^\s*\{/.test(raw.trim()) || /UNAVAILABLE|high demand|503/i.test(raw)) {
    return formatUserFacingLlmError(e);
  }
  return raw;
}

function jsonError(e: unknown) {
  const message = formatJudgeError(e);
  const status =
    message.includes("GEMINI_API_KEY") || message.includes("未設定")
      ? 503
      : 502;
  return NextResponse.json({ error: message }, { status });
}
