import { NextRequest, NextResponse } from "next/server";
import { runJudge } from "@/lib/judge/runJudge";

/**
 * POST /api/judge
 * body: { question, cardQuery?, cardId? }
 */
export async function POST(req: NextRequest) {
  let body: { question?: string; cardQuery?: string; cardId?: string };
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

  try {
    const result = await runJudge({
      question,
      cardQuery: body.cardQuery?.trim() || undefined,
      cardId: body.cardId?.trim() || undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("GEMINI_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
