"use client";

import { useState } from "react";

type Hit = { ruleRef: string; text: string; score: number };
type Meta = {
  version: string;
  sourceUrl: string;
  builtAt: string;
  chunkCount: number;
};

export function RulesLookup() {
  const [q, setQ] = useState("召喚酔い");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);

  async function search(query: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/rules?q=${encodeURIComponent(query)}&limit=5`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMeta(data.meta);
      setHits(data.hits ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function rebuild() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rebuild: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMeta(data.meta);
      setHits([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600">
        総合ルールPDFの索引検索（初回はPDF取得＋チャンク分割）
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <input
          className="min-w-[12rem] flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="キーワード or ルール番号"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          検索
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void rebuild()}
          className="rounded border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          PDF再取得
        </button>
      </form>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {meta && (
        <p className="text-xs text-zinc-500">
          Ver.{meta.version} / {meta.chunkCount} chunks / built{" "}
          {meta.builtAt}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {hits.map((h) => (
          <li
            key={`${h.ruleRef}-${h.score}`}
            className="border-b border-zinc-100 pb-3 text-sm"
          >
            <div className="font-medium">
              {h.ruleRef}{" "}
              <span className="font-normal text-zinc-400">score {h.score}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">
              {h.text.length > 400 ? `${h.text.slice(0, 400)}…` : h.text}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
