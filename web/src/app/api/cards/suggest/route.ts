import { NextRequest, NextResponse } from "next/server";
import { suggestForQuery, suggestForQuestion } from "@/lib/cards/suggest";

/** 質問文が長すぎると候補が散るので上限を設ける（UIの入力上限より十分大きい） */
const MAX_QUESTION_LENGTH = 4000;

/**
 * GET /api/cards/suggest?q=れっどぞ
 * 入力中の候補（全件ミラーのローカル検索。公式へは行かない）。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ error: "query parameter q is required" }, { status: 400 });
  }
  return NextResponse.json(await suggestForQuery(q));
}

/**
 * POST /api/cards/suggest  { "question": "..." }
 * 質問文に出てくるカード名・略称・部分名から候補をまとめて返す（確定はしない）。
 */
export async function POST(req: NextRequest) {
  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.question !== "string") {
    return NextResponse.json({ error: "body.question is required" }, { status: 400 });
  }
  return NextResponse.json(
    await suggestForQuestion(body.question.slice(0, MAX_QUESTION_LENGTH)),
  );
}
