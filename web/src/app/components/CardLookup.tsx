"use client";

import { useState } from "react";
import type { OfficialCard } from "@/lib/official/types";
import type { ResolveCardNameResult } from "@/lib/resolve/types";

export function CardLookup({ embedded = false }: { embedded?: boolean }) {
  const [q, setQ] = useState("レッドゾーン");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResolveCardNameResult | null>(null);

  async function resolve(query: string, refresh = false) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `/api/cards?q=${encodeURIComponent(query)}${
        refresh ? "&refresh=1" : ""
      }`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ResolveCardNameResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await resolve(q);
  }

  async function selectCandidate(cardId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, cardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as ResolveCardNameResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={embedded ? "flex flex-col gap-4" : "mx-auto flex w-full max-w-2xl flex-col gap-6 p-6"}>
      {!embedded && (
        <header>
          <h1 className="text-xl font-semibold tracking-tight">duel_judge</h1>
          <p className="mt-1 text-sm text-zinc-600">
            カード名解決の動作確認
          </p>
        </header>
      )}
      {embedded && (
        <p className="text-sm text-zinc-600">
          略称辞書1対N → 公式検索 → 1件なら確定 / 複数なら確認
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
        <input
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="略称または正式名"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {loading ? "解決中…" : "解決"}
        </button>
        <button
          type="button"
          disabled={loading || !q.trim()}
          onClick={() => resolve(q, true)}
          className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
          title="辞書を使わず公式を再検索"
        >
          再検索
        </button>
      </form>

      {loading && (
        <p className="text-sm text-zinc-500">
          公式サイトへアクセスする場合があります（レート制限あり）。
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result?.kind === "resolved" && (
        <section className="flex flex-col gap-2">
          <p className="text-sm text-emerald-700">
            kind: <code>resolved</code> · source: {result.source}
          </p>
          <CardCard card={result.card} />
        </section>
      )}

      {result?.kind === "clarify" && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-amber-800">
            kind: <code>clarify</code> · source: {result.source}
          </p>
          <p className="text-sm text-zinc-600">{result.note}</p>
          {result.candidates.map((c) => (
            <div key={c.cardId} className="flex flex-col gap-2">
              <CardCard card={c} />
              <button
                type="button"
                disabled={loading}
                onClick={() => selectCandidate(c.cardId)}
                className="self-start rounded bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                これを選ぶ
              </button>
            </div>
          ))}
        </section>
      )}

      {result?.kind === "not_found" && (
        <p className="text-sm text-zinc-700">
          kind: <code>not_found</code> — {result.note}
        </p>
      )}
    </div>
  );
}

function CardCard({ card }: { card: OfficialCard }) {
  return (
    <article className="rounded border border-zinc-200 p-4 text-sm">
      <h2 className="font-medium">{card.officialName}</h2>
      <p className="mt-1 text-zinc-500">
        {card.productLabel ?? "—"} · {card.cardId}
      </p>
      <a
        className="mt-1 inline-block text-zinc-700 underline"
        href={card.detailUrl}
        target="_blank"
        rel="noreferrer"
      >
        公式詳細
      </a>
      <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-zinc-50 p-3 text-xs">
        {card.abilityText || "(能力テキストなし)"}
      </pre>
    </article>
  );
}
