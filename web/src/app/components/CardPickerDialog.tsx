"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { OfficialCard } from "@/lib/official/types";
import type {
  ClarifyCandidate,
  ResolveCardNameResult,
} from "@/lib/resolve/types";

/** 送信時にサーバへ渡す確定カード。mention はユーザーが検索に使った表記 */
export type CardPick = {
  cardId: string;
  mention: string;
  officialName: string;
};

/** 候補グリッドの表示に必要な最小限（公式詳細と clarify 候補の共通部分） */
type CardOption = {
  cardId: string;
  officialName: string;
  civilizations: string[];
  cost: string | null;
  cardType: string | null;
};

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "options"; options: CardOption[]; note?: string }
  | { kind: "empty"; note: string; tried: string[] }
  | { kind: "error"; message: string };

/** 文明の色。カード個別ではなくゲーム共通の対応 */
const CIVILIZATION_COLORS: Record<string, string> = {
  光: "bg-amber-300",
  水: "bg-sky-400",
  闇: "bg-zinc-700",
  火: "bg-red-500",
  自然: "bg-emerald-500",
};

function fromOfficialCard(card: OfficialCard): CardOption {
  return {
    cardId: card.cardId,
    officialName: card.officialName,
    civilizations: card.civilizations ?? [],
    cost: card.cost ?? null,
    cardType: card.cardType ?? null,
  };
}

function fromClarifyCandidate(candidate: ClarifyCandidate): CardOption {
  return {
    cardId: candidate.card_id,
    officialName: candidate.official_name,
    civilizations: candidate.civilizations ?? [],
    cost: candidate.cost ?? null,
    cardType: candidate.card_type ?? null,
  };
}

function formatOptionMeta(option: CardOption): string {
  const civs = option.civilizations.join("/") || "文明不明";
  const cost = option.cost ? `コスト${option.cost}` : "コスト不明";
  return `${civs} · ${cost} · ${option.cardType ?? "種類不明"}`;
}

/**
 * 送信前にカードを確定させるステップ（2/2）。
 *
 * 質問文からの推定に頼らず、ユーザー自身に選び切らせる。カード0枚での送信は
 * 「カードは関係ない質問」を明示的に押した場合だけ許す（こちらで推定しない）。
 * 候補0件のときも閉じさせず、この中で検索し直せるようにする。
 */
export function CardPickerDialog({
  question,
  initialQuery,
  submitting,
  onQuestionChange,
  onCancel,
  onConfirm,
}: {
  question: string;
  /** 質問文から拾った語などの初期検索語（確定はしない） */
  initialQuery?: string;
  submitting: boolean;
  onQuestionChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: (picks: CardPick[]) => void;
}) {
  // 閉じるとアンマウントされるので、開き直すたびにこの初期値から始まる
  const [query, setQuery] = useState(() => initialQuery?.trim() ?? "");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [picks, setPicks] = useState<CardPick[]>([]);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  async function runSearch(raw: string) {
    const q = raw.trim();
    if (q.length < 2) {
      setSearch({
        kind: "error",
        message: "2文字以上で検索してください。",
      });
      return;
    }
    setSearch({ kind: "loading" });
    try {
      const res = await fetch(`/api/cards?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as ResolveCardNameResult & {
        error?: string;
      };
      if (!res.ok) {
        setSearch({
          kind: "error",
          message: data.error ?? `検索に失敗しました（HTTP ${res.status}）`,
        });
        return;
      }
      if (data.kind === "resolved") {
        setSearch({ kind: "options", options: [fromOfficialCard(data.card)] });
        return;
      }
      if (data.kind === "clarify") {
        setSearch({
          kind: "options",
          options: data.candidates.map(fromOfficialCard),
          note: data.note,
        });
        return;
      }
      const suggestions = (data.suggestions ?? []).map(fromClarifyCandidate);
      if (suggestions.length > 0) {
        setSearch({
          kind: "options",
          options: suggestions,
          note: data.note,
        });
        return;
      }
      setSearch({
        kind: "empty",
        note: data.note,
        tried: data.triedQueries ?? [],
      });
    } catch (err) {
      setSearch({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function togglePick(option: CardOption) {
    setPicks((prev) => {
      if (prev.some((p) => p.cardId === option.cardId)) {
        return prev.filter((p) => p.cardId !== option.cardId);
      }
      return [
        ...prev,
        {
          cardId: option.cardId,
          // ユーザーが打った語をそのまま渡す（略称辞書の学習と事実抽出に使う）
          mention: query.trim() || option.officialName,
          officialName: option.officialName,
        },
      ];
    });
  }

  const busy = submitting || search.kind === "loading";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-dvh w-full flex-col bg-white sm:h-[85vh] sm:max-w-3xl sm:rounded-3xl sm:shadow-xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold">
              カードを確定（2/2）
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              質問に関わるカードを選んでください
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="-mr-1 shrink-0 rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-40"
            aria-label="閉じて質問に戻る"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <QuestionPreview
            question={question}
            editing={editingQuestion}
            disabled={submitting}
            onToggleEditing={setEditingQuestion}
            onChange={onQuestionChange}
          />

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
          >
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={submitting}
              placeholder="カード名・略称で検索（例: レッドゾーン）"
              autoComplete="off"
              className="flex-1 rounded-2xl border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-2xl border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-50 disabled:opacity-40"
            >
              検索
            </button>
          </form>

          <SearchResult
            state={search}
            picks={picks}
            disabled={submitting}
            onToggle={togglePick}
            onRetryWith={(term) => {
              setQuery(term);
              void runSearch(term);
            }}
          />
        </div>

        <footer className="shrink-0 space-y-3 border-t border-zinc-200 px-4 py-3">
          {picks.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {picks.map((pick) => (
                <li key={pick.cardId}>
                  <button
                    type="button"
                    onClick={() =>
                      setPicks((prev) =>
                        prev.filter((p) => p.cardId !== pick.cardId),
                      )
                    }
                    disabled={submitting}
                    className="flex items-center gap-1.5 rounded-full bg-zinc-100 py-1 pl-3 pr-2 text-sm text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-40"
                  >
                    {pick.officialName}
                    <span className="text-zinc-500" aria-hidden>
                      ×
                    </span>
                    <span className="sr-only">を外す</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onConfirm([])}
              disabled={submitting}
              className="text-xs text-zinc-500 underline underline-offset-2 transition hover:text-zinc-700 disabled:opacity-40"
            >
              カードは関係ない質問です
            </button>
            <button
              type="button"
              onClick={() => onConfirm(picks)}
              disabled={submitting || picks.length === 0}
              className="flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
            >
              {picks.length > 0
                ? `この${picks.length}枚で裁定する`
                : "カードを選んでください"}
              <ArrowIcon />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function QuestionPreview({
  question,
  editing,
  disabled,
  onToggleEditing,
  onChange,
}: {
  question: string;
  editing: boolean;
  disabled: boolean;
  onToggleEditing: (value: boolean) => void;
  onChange: (value: string) => void;
}) {
  if (editing) {
    return (
      <div className="rounded-2xl border border-zinc-300 bg-white p-2">
        <textarea
          value={question}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
          className="w-full resize-none bg-transparent px-1 text-sm leading-relaxed outline-none"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onToggleEditing(false)}
            className="rounded-full px-3 py-1 text-xs text-zinc-600 transition hover:bg-zinc-100"
          >
            編集を終える
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onToggleEditing(true)}
      disabled={disabled}
      className="flex w-full items-start gap-2 rounded-2xl bg-zinc-50 px-3 py-2 text-left transition hover:bg-zinc-100 disabled:opacity-60"
    >
      <span className="line-clamp-2 flex-1 text-xs leading-relaxed text-zinc-500">
        {question || "（質問が空です）"}
      </span>
      <span className="shrink-0 text-xs text-zinc-400">編集</span>
    </button>
  );
}

function SearchResult({
  state,
  picks,
  disabled,
  onToggle,
  onRetryWith,
}: {
  state: SearchState;
  picks: CardPick[];
  disabled: boolean;
  onToggle: (option: CardOption) => void;
  onRetryWith: (term: string) => void;
}) {
  if (state.kind === "idle") {
    return (
      <p className="mt-6 text-center text-xs text-zinc-400">
        カード名か略称を入れて検索してください
      </p>
    );
  }

  if (state.kind === "loading") {
    return (
      <p className="mt-6 text-center text-xs text-zinc-500">
        公式カードDBを検索中…（数秒かかります）
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
        {state.message}
      </p>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="mt-3 space-y-2">
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          {state.note}
        </p>
        {state.tried.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {state.tried.slice(0, 6).map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => onRetryWith(term)}
                disabled={disabled}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
              >
                「{term}」で再検索
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {state.note && <p className="text-xs text-zinc-500">{state.note}</p>}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {state.options.map((option) => {
          const picked = picks.some((p) => p.cardId === option.cardId);
          return (
            <li key={option.cardId}>
              <button
                type="button"
                onClick={() => onToggle(option)}
                disabled={disabled}
                aria-pressed={picked}
                className={`flex h-full w-full flex-col gap-1.5 rounded-2xl border p-3 text-left transition disabled:opacity-50 ${
                  picked
                    ? "border-zinc-900 bg-zinc-900/5"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
              >
                <span className="flex gap-1" aria-hidden>
                  {(option.civilizations.length > 0
                    ? option.civilizations
                    : ["?"]
                  ).map((civ, i) => (
                    <span
                      key={`${civ}-${i}`}
                      className={`h-1.5 w-5 rounded-full ${
                        CIVILIZATION_COLORS[civ] ?? "bg-zinc-300"
                      }`}
                    />
                  ))}
                </span>
                <span className="text-sm font-medium leading-snug">
                  {option.officialName}
                </span>
                <span className="text-xs text-zinc-500">
                  {formatOptionMeta(option)}
                </span>
                {picked && (
                  <span className="text-xs font-medium text-zinc-900">
                    選択中
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
