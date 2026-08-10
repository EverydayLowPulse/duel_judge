"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
 * 質問文からの推定に頼らず、ユーザー自身に選び切らせる。
 * 0枚・1枚で進むときは確認を挟む（取りこぼし防止）。
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
  /** 0枚 / 1枚で進むときの弱い確認。動的判定ではなく枚数だけの一律確認 */
  const [confirmGate, setConfirmGate] = useState<null | "zero" | "one">(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    // タッチ端末では開いた瞬間の自動フォーカス＋キーボードでレイアウトが崩れるのでやらない。
    // （iOS は 16px 未満入力だとさらにページズームして戻らない）
    const finePointer =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (finePointer) searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // 確認オーバーレイ中は外側ダイアログを閉じず、確認だけ取り消す
      if (confirmGate) {
        setConfirmGate(null);
        return;
      }
      onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmGate, onCancel]);

  function focusSearchIfDesktop() {
    const finePointer =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (finePointer) searchInputRef.current?.focus();
  }

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
    const already = picks.some((p) => p.cardId === option.cardId);
    if (already) {
      setPicks((prev) => prev.filter((p) => p.cardId !== option.cardId));
      setConfirmGate(null);
      return;
    }

    const mention = query.trim() || option.officialName;
    setPicks((prev) => [
      ...prev,
      {
        cardId: option.cardId,
        // ユーザーが打った語をそのまま渡す（略称辞書の学習と事実抽出に使う）
        mention,
        officialName: option.officialName,
      },
    ]);
    setConfirmGate(null);
    // 次のカードを打ちやすくする。検索直後の伸ばし打ちは残し、選択時だけ消す
    setQuery("");
    setSearch({ kind: "idle" });
    requestAnimationFrame(() => focusSearchIfDesktop());
  }

  function requestConfirm() {
    if (picks.length === 0) {
      setConfirmGate("zero");
      return;
    }
    if (picks.length === 1) {
      setConfirmGate("one");
      return;
    }
    onConfirm(picks);
  }

  const busy = submitting || search.kind === "loading";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-dvh w-full flex-col bg-white sm:h-[85vh] sm:max-w-3xl sm:rounded-3xl sm:shadow-xl"
      >
        <header className="flex shrink-0 items-start border-b border-zinc-200 px-3 py-3 sm:justify-between sm:gap-3 sm:px-5 sm:py-5">
          {/* スマホ: タイトル行に揃えた‹のみ。PC: 右上× */}
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="-ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-800 transition active:opacity-50 disabled:opacity-40 sm:hidden"
            aria-label="質問入力に戻る"
          >
            <BackChevronIcon />
          </button>
          <div className="min-w-0 flex-1 space-y-0.5 pt-0.5 text-center sm:space-y-1.5 sm:pt-0 sm:text-left">
            <h2
              id={titleId}
              className="text-lg font-semibold leading-7 tracking-tight sm:text-xl sm:leading-tight"
            >
              カードを確定（2/2）
            </h2>
            <p className="truncate text-[15px] text-zinc-600 sm:text-base sm:leading-snug">
              関連するカードをすべて選んでください
            </p>
          </div>
          {/* タイトル中央寄せ用（戻るボタンと同幅） */}
          <span className="inline-flex h-7 w-7 shrink-0 sm:hidden" aria-hidden />
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="-mr-1 hidden shrink-0 rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-40 sm:inline-flex"
            aria-label="閉じて質問に戻る"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="shrink-0 space-y-2 border-b border-zinc-100 px-4 py-2.5 sm:space-y-3 sm:py-3">
          <QuestionPreview
            question={question}
            editing={editingQuestion}
            disabled={submitting}
            onToggleEditing={setEditingQuestion}
            onChange={onQuestionChange}
          />

          {/*
            検索行はスクロール領域の外に置き、キーボード表示時にボタンが見切れないようにする。
            text-base(=16px) は iOS Safari の入力フォーカス自動ズーム回避（text-sm だとズームして戻らない）。
            見た目の高さは padding だけ下げる（フォントは触らない）。
          */}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
          >
            <div className="relative min-w-0 flex-1">
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={submitting}
                placeholder="カード名を検索"
                autoComplete="off"
                enterKeyHint="search"
                className="w-full rounded-xl border border-zinc-300 py-2 pl-3 pr-9 text-base outline-none ring-zinc-300 focus:ring-2 disabled:opacity-60 sm:rounded-2xl sm:py-2.5"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSearch({ kind: "idle" });
                    focusSearchIfDesktop();
                  }}
                  disabled={submitting}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-40"
                  aria-label="検索語を消す"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-xl border border-zinc-300 px-3 py-2 text-base font-medium transition hover:bg-zinc-50 disabled:opacity-40 sm:rounded-2xl sm:px-4 sm:py-2.5"
            >
              検索
            </button>
          </form>

          {picks.length > 0 && (
            <ul className="flex flex-wrap justify-start gap-1.5 sm:gap-2">
              {picks.map((pick) => (
                <li
                  key={pick.cardId}
                  className="min-w-0 max-w-[calc(50%-0.1875rem)] sm:max-w-none"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPicks((prev) =>
                        prev.filter((p) => p.cardId !== pick.cardId),
                      );
                      setConfirmGate(null);
                    }}
                    disabled={submitting}
                    className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-zinc-100 py-0.5 pl-1.5 pr-2.5 text-xs text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-40 sm:gap-1.5 sm:py-1 sm:pl-3 sm:pr-2 sm:text-sm"
                  >
                    {/* スマホは × 左、PCは名前→×（order で入れ替え） */}
                    <span
                      className="shrink-0 text-zinc-500 sm:order-2"
                      aria-hidden
                    >
                      ×
                    </span>
                    <span className="min-w-0 truncate sm:order-1">
                      {pick.officialName}
                    </span>
                    <span className="sr-only">を外す</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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

        <footer className="shrink-0 border-t border-zinc-200 px-4 py-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={requestConfirm}
              disabled={submitting}
              className="flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
            >
              {picks.length > 0
                ? `この${picks.length}枚で裁定する`
                : "カードなしで進む"}
              <ArrowIcon />
            </button>
          </div>
        </footer>

        {/*
          0枚/1枚の確認はフッター帯ではなく、ダイアログ内オーバーレイにする。
          外側にもう1枚 fixed モーダルを積むのではなく、このパネル内で完結させる
         （ネストした「ポップアップの上のポップアップ」感を避けつつ視線を中央に集める）。
        */}
        {confirmGate === "zero" && picks.length === 0 && (
          <ConfirmGateOverlay
            title="カードを選択せずに進みますか？"
            body={
              <>
                質問に関連するカードがある場合はすべて選択してください。
                <br />
                特定のカードに関する質問でなければ、「カードなしで進む」を押してください。
              </>
            }
            stayLabel="戻って選ぶ"
            proceedLabel="カードなしで進む"
            disabled={submitting}
            onStay={() => {
              setConfirmGate(null);
              focusSearchIfDesktop();
            }}
            onProceed={() => onConfirm([])}
          />
        )}

        {confirmGate === "one" && picks.length === 1 && (
          <ConfirmGateOverlay
            title="この1枚だけで進みますか？"
            body={
              <>
                他に関連するカードがある場合はすべて選択してください。
                <br />
                この1枚だけなら、「この1枚で進む」を押してください。
              </>
            }
            stayLabel="まだ選ぶ"
            proceedLabel="この1枚で進む"
            disabled={submitting}
            onStay={() => {
              setConfirmGate(null);
              focusSearchIfDesktop();
            }}
            onProceed={() => onConfirm(picks)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * ダイアログ内の確認レイヤ。
 * absolute inset-0 で親（relative な dialog）だけを覆うので、
 * 画面全体に第2モーダルを重ねるより軽く、スマホのフルスクリーンでも中央に浮く。
 */
function ConfirmGateOverlay({
  title,
  body,
  stayLabel,
  proceedLabel,
  disabled,
  onStay,
  onProceed,
}: {
  title: string;
  body: ReactNode;
  stayLabel: string;
  proceedLabel: string;
  disabled: boolean;
  onStay: () => void;
  onProceed: () => void;
}) {
  const titleId = useId();
  return (
    <div
      className="absolute inset-0 z-10 flex items-start justify-center bg-black/45 px-4 pb-4 pt-[18vh] sm:items-start sm:pt-[14vh]"
      role="presentation"
      onClick={(e) => {
        // 暗い背景タップで「まだ選ぶ」相当（誤タップで確定しない）
        if (e.target === e.currentTarget && !disabled) onStay();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl sm:p-6"
      >
        <h3
          id={titleId}
          className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl"
        >
          {title}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600">{body}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onProceed}
            disabled={disabled}
            className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
          >
            {proceedLabel}
          </button>
          <button
            type="button"
            onClick={onStay}
            disabled={disabled}
            className="rounded-full px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40"
          >
            {stayLabel}
          </button>
        </div>
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
          className="w-full resize-none bg-transparent px-1 text-base leading-relaxed outline-none"
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
        カード名を入力して検索してください
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

function BackChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
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
