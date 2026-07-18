"use client";

import { useState } from "react";
import type { JudgeResponse } from "@/lib/judge/types";

export function JudgeLookup() {
  const [question, setQuestion] = useState(
    "侵略で出したレッドゾーンの「出た時」能力は使えますか？",
  );
  const [cardQuery, setCardQuery] = useState("轟く侵略 レッドゾーン");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JudgeResponse | null>(null);

  async function run(body: {
    question: string;
    cardQuery?: string;
    cardId?: string;
  }) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as JudgeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run({
      question,
      cardQuery: cardQuery.trim() || undefined,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600">
        裁定パイプライン確認（カード解決 → Q&A → Gemini → Evidence Gate）
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          質問
          <textarea
            className="min-h-24 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          カード語句（任意・曖昧なら clarify）
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            value={cardQuery}
            onChange={(e) => setCardQuery(e.target.value)}
            disabled={loading}
            placeholder="例: レッドゾーン / 轟く侵略 レッドゾーン"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="self-start rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "判定中…" : "裁定する"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result?.kind === "clarify" && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-amber-800">
            kind: <code>clarify</code>
          </p>
          <p className="text-sm text-zinc-600">{result.resolve.note}</p>
          {result.resolve.candidates.map((c) => (
            <button
              key={c.cardId}
              type="button"
              disabled={loading}
              className="rounded border border-zinc-200 p-3 text-left text-sm hover:bg-zinc-50"
              onClick={() =>
                run({
                  question,
                  cardQuery: cardQuery.trim() || result.resolve.query,
                  cardId: c.cardId,
                })
              }
            >
              <span className="font-medium">{c.officialName}</span>
              <span className="mt-1 block text-xs text-zinc-500">
                {c.cardId} · これを選んで続行
              </span>
            </button>
          ))}
        </section>
      )}

      {result?.kind === "not_found" && (
        <p className="text-sm text-zinc-700">
          kind: <code>not_found</code> — {result.resolve.note}
        </p>
      )}

      {result?.kind === "withhold" && (
        <section className="rounded border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">withhold</p>
          <p className="mt-2">{result.withhold.reason}</p>
          <p className="mt-2 text-zinc-600">{result.withhold.next_hint}</p>
          {result.debug?.gateFailures && (
            <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600">
              {result.debug.gateFailures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-500">{result.display.disclaimer}</p>
        </section>
      )}

      {result?.kind === "answer" && (
        <section className="flex flex-col gap-3 rounded border border-zinc-200 p-4 text-sm">
          <p className="text-emerald-700">
            kind: <code>answer</code> · confidence:{" "}
            {result.answer.confidence}
          </p>
          <div>
            <p className="font-medium">【結論】</p>
            <p className="mt-1">{result.answer.conclusion}</p>
          </div>
          {result.answer.reasoning && (
            <div>
              <p className="font-medium">【推論】</p>
              <p className="mt-1 text-zinc-700">{result.answer.reasoning}</p>
            </div>
          )}
          <div>
            <p className="font-medium">【根拠】</p>
            <ul className="mt-1 flex flex-col gap-2">
              {result.answer.evidence.map((ev, i) => (
                <li key={`${ev.url}-${i}`} className="text-zinc-700">
                  <span className="text-xs text-zinc-500">
                    {ev.type} · {ev.label}
                  </span>
                  <pre className="mt-1 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs">
                    {ev.quote}
                  </pre>
                  <a
                    className="text-xs underline"
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
          <p className="text-xs text-zinc-500">
            【確信度】{result.answer.confidence} —{" "}
            {result.answer.confidence_note}
          </p>
          <p className="text-xs text-zinc-500">{result.display.disclaimer}</p>
        </section>
      )}
    </div>
  );
}
