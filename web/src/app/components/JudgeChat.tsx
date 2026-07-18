"use client";

import Link from "next/link";
import { useState } from "react";
import type { JudgeResponse } from "@/lib/judge/types";

type ChatItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; result: JudgeResponse };

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 本番向けの裁定チャット（/）。/dev のデバッグUIとは別。 */
export function JudgeChat() {
  const [question, setQuestion] = useState("");
  const [cardQuery, setCardQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  /** clarify 再開用に、最後のユーザー質問を保持 */
  const [pending, setPending] = useState<{
    question: string;
    cardQuery?: string;
  } | null>(null);

  async function runJudge(body: {
    question: string;
    cardQuery?: string;
    cardId?: string;
  }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const result = data as JudgeResponse;
      setItems((prev) => [...prev, { id: newId(), role: "assistant", result }]);
      // カード未確定・保留時は元の質問をフォームに戻し、カード語句だけ直して再送できるようにする
      if (
        result.kind === "clarify" ||
        result.kind === "not_found" ||
        result.kind === "withhold"
      ) {
        setPending({
          question: body.question,
          cardQuery: body.cardQuery,
        });
        setQuestion(body.question);
        if (body.cardQuery) setCardQuery(body.cardQuery);
      } else {
        setPending(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    const cq = cardQuery.trim() || undefined;
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        role: "user",
        text: cq ? `${q}\n（カード: ${cq}）` : q,
      },
    ]);
    setQuestion("");
    await runJudge({ question: q, cardQuery: cq });
  }

  async function selectCandidate(cardId: string, cardName: string) {
    if (!pending || loading) return;
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        role: "user",
        text: `カードを確定: ${cardName}`,
      },
    ]);
    await runJudge({
      question: pending.question,
      cardQuery: pending.cardQuery ?? cardName,
      cardId,
    });
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-4 p-6 text-zinc-900">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">duel_judge</h1>
          <p className="mt-1 text-sm text-zinc-600">
            デュエマ裁定確認（公式ソースのみ・出典必須）
          </p>
        </div>
        <Link
          href="/dev"
          className="text-xs text-zinc-500 underline underline-offset-2"
        >
          開発用ツール
        </Link>
      </header>

      <div className="flex min-h-[40vh] flex-1 flex-col gap-4">
        {items.length === 0 && (
          <p className="rounded border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">
            裁定したい状況を書いてください。カード名が曖昧なときは候補を聞いてから続行します。
          </p>
        )}

        {items.map((item) =>
          item.role === "user" ? (
            <div
              key={item.id}
              className="ml-8 whitespace-pre-wrap rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              {item.text}
            </div>
          ) : (
            <AssistantBubble
              key={item.id}
              result={item.result}
              loading={loading}
              onSelectCandidate={selectCandidate}
            />
          ),
        )}

        {loading && (
          <p className="text-sm text-zinc-500">公式ソースを参照して判定中…</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <form
        onSubmit={onSubmit}
        className="sticky bottom-0 flex flex-col gap-2 border-t border-zinc-200 bg-white pt-3 pb-2"
      >
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          カード語句（任意）
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            value={cardQuery}
            onChange={(e) => setCardQuery(e.target.value)}
            disabled={loading}
            placeholder="例: レッドゾーン（空でも可）"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          質問
          <textarea
            className="min-h-20 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
            placeholder="例: 侵略で出した「出た時」能力は使えますか？"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="self-end rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "判定中…" : "聞く"}
        </button>
      </form>
    </div>
  );
}

function AssistantBubble({
  result,
  loading,
  onSelectCandidate,
}: {
  result: JudgeResponse;
  loading: boolean;
  onSelectCandidate: (cardId: string, cardName: string) => void;
}) {
  if (result.kind === "clarify") {
    return (
      <section className="mr-8 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-medium text-amber-900">カードを確認してください</p>
        <p className="text-zinc-700">{result.resolve.note}</p>
        <ul className="flex flex-col gap-2">
          {result.resolve.candidates.map((c) => (
            <li key={c.cardId}>
              <button
                type="button"
                disabled={loading}
                className="w-full rounded border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50 disabled:opacity-50"
                onClick={() => onSelectCandidate(c.cardId, c.officialName)}
              >
                <span className="font-medium">{c.officialName}</span>
                <span className="mt-1 block text-xs text-zinc-500">
                  {c.cardId}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (result.kind === "not_found") {
    return (
      <section className="mr-8 rounded-lg border border-zinc-200 p-4 text-sm">
        <p className="font-medium">カードが見つかりませんでした</p>
        <p className="mt-2 text-zinc-700">{result.resolve.note}</p>
        <p className="mt-2 text-xs text-zinc-500">
          下の「カード語句」に正式名を入れて、同じ質問のまま再送できます。
        </p>
      </section>
    );
  }

  if (result.kind === "withhold") {
    return (
      <section className="mr-8 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="font-medium text-amber-900">回答を保留しました</p>
        <p>{result.withhold.reason}</p>
        {result.withhold.next_hint && (
          <p className="text-zinc-600">{result.withhold.next_hint}</p>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          質問文は入力欄に戻してあります。カード語句を直して再送できます。
        </p>
        <p className="text-xs text-zinc-500">{result.display.disclaimer}</p>
      </section>
    );
  }

  const a = result.answer;
  const confidenceLabel =
    a.confidence === "high" ? "高" : a.confidence === "medium" ? "中" : "低";

  return (
    <section className="mr-8 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm">
      <div>
        <p className="font-medium">【結論】</p>
        <p className="mt-1 whitespace-pre-wrap">{a.conclusion}</p>
      </div>

      <div>
        <p className="font-medium">【根拠】</p>
        <ul className="mt-2 flex flex-col gap-3">
          {a.evidence.map((ev, i) => (
            <li key={`${ev.url}-${i}`}>
              <p className="text-xs text-zinc-500">
                {ev.type === "qa"
                  ? "公式Q&A"
                  : ev.type === "rule"
                    ? `総合ルール ${ev.rule_ref ?? ""}`
                    : "カード"}
                {ev.label ? ` · ${ev.label}` : ""}
              </p>
              <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-zinc-300 pl-3 text-zinc-800">
                {ev.quote}
              </blockquote>
              <a
                className="mt-1 inline-block text-xs text-zinc-600 underline underline-offset-2"
                href={ev.url}
                target="_blank"
                rel="noreferrer"
              >
                {ev.url}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {a.reasoning && (
        <div>
          <p className="font-medium">【推論】</p>
          <p className="mt-1 whitespace-pre-wrap text-zinc-700">{a.reasoning}</p>
        </div>
      )}

      <p className="text-xs text-zinc-600">
        【確信度】{confidenceLabel} — {a.confidence_note}
      </p>
      {result.debug?.gateAdjustments &&
        result.debug.gateAdjustments.length > 0 && (
          <p className="text-xs text-zinc-500">
            ※ 確信度は出典種別に合わせて自動調整しています
          </p>
        )}
      <p className="text-xs text-zinc-500">{result.display.disclaimer}</p>
    </section>
  );
}
