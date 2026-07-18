"use client";

import { useState } from "react";
import type { OfficialQa, QaSearchResult } from "@/lib/official/qaTypes";

export function QaLookup() {
  const [q, setQ] = useState("レッドゾーン");
  const [details, setDetails] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QaSearchResult | null>(null);
  const [extra, setExtra] = useState<OfficialQa | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setExtra(null);
    try {
      const url = `/api/qa?q=${encodeURIComponent(q)}&details=${details}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as QaSearchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadArticle(qaId: string) {
    setLoading(true);
    setError(null);
    setExtra(null);
    try {
      const res = await fetch(`/api/qa?id=${encodeURIComponent(qaId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setExtra(data as OfficialQa);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600">
        公式Q&A検索の動作確認（`qa_w` → 必要なら記事本文）
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs text-zinc-500">
          キーワード
          <input
            className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={loading}
          />
        </label>
        <label className="flex w-28 flex-col gap-1 text-xs text-zinc-500">
          本文取得件数
          <input
            type="number"
            min={0}
            max={10}
            className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            value={details}
            onChange={(e) => setDetails(Number(e.target.value))}
            disabled={loading}
          />
        </label>
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "検索中…" : "検索"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-zinc-600">
            hits: {result.hits.length}
            {result.articles ? ` / articles: ${result.articles.length}` : ""}
          </p>

          {result.articles?.map((a) => (
            <QaArticle key={a.qaId} article={a} />
          ))}

          <ul className="flex flex-col gap-2 text-sm">
            {result.hits.map((h) => (
              <li
                key={h.qaId}
                className="flex flex-col gap-1 rounded border border-zinc-200 p-3"
              >
                <span className="text-xs text-zinc-500">{h.qaId}</span>
                <span>{h.questionPreview}</span>
                <div className="flex gap-3">
                  <a
                    className="text-xs text-zinc-700 underline"
                    href={h.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    公式
                  </a>
                  <button
                    type="button"
                    className="text-xs text-zinc-900 underline"
                    disabled={loading}
                    onClick={() => loadArticle(h.qaId)}
                  >
                    本文を取得
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {extra && (
        <section>
          <p className="mb-2 text-sm text-zinc-600">個別取得:</p>
          <QaArticle article={extra} />
        </section>
      )}
    </div>
  );
}

function QaArticle({ article }: { article: OfficialQa }) {
  return (
    <article className="rounded border border-zinc-200 p-4 text-sm">
      <p className="text-xs text-zinc-500">
        {article.qaId} ·{" "}
        <a className="underline" href={article.url} target="_blank" rel="noreferrer">
          公式
        </a>
      </p>
      <p className="mt-2 font-medium">Q</p>
      <pre className="mt-1 whitespace-pre-wrap text-xs text-zinc-800">
        {article.question}
      </pre>
      <p className="mt-3 font-medium">A</p>
      <pre className="mt-1 whitespace-pre-wrap text-xs text-zinc-800">
        {article.answer}
      </pre>
    </article>
  );
}
