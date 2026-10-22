"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type {
  QuerySuggestResult,
  QuestionSuggestResult,
} from "@/lib/cards/suggest";
import type { QuestionSuggestionGroup } from "@/lib/cards/nameSearch";
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

/** 質問文からの候補。全件ミラーがない環境では出さない */
type QuestionSuggestState =
  | { kind: "loading" }
  | { kind: "ready"; groups: QuestionSuggestionGroup[] }
  | { kind: "unavailable" };

/** 入力中候補の待ち時間。打鍵ごとに投げない程度に短く */
const TYPEAHEAD_DELAY_MS = 150;
/** 質問文候補の1グループに出す枚数。残りは「ほか N件」で検索窓へ */
const SUGGESTION_CARDS_PER_GROUP = 4;

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
  const [questionSuggest, setQuestionSuggest] = useState<QuestionSuggestState>(
    { kind: "loading" },
  );
  /** 入力中候補と明示検索の応答順を揃える（古い応答で上書きしない） */
  const searchSeq = useRef(0);
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

  // 質問文から候補を出す。編集中は待ち、編集を終えたら取り直す
  useEffect(() => {
    if (editingQuestion) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/cards/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        const data = (await res.json()) as QuestionSuggestResult;
        if (cancelled) return;
        setQuestionSuggest(
          res.ok && data.available
            ? { kind: "ready", groups: data.groups }
            : { kind: "unavailable" },
        );
      } catch {
        if (!cancelled) setQuestionSuggest({ kind: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [question, editingQuestion]);

  // 入力中の候補（ローカル全件ミラー。公式へは行かない）
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/cards/suggest?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as QuerySuggestResult;
        if (seq !== searchSeq.current) return;
        if (data.cards.length > 0) {
          setSearch({
            kind: "options",
            options: data.cards,
            note:
              data.total > data.cards.length
                ? `${data.total}件中${data.cards.length}件を表示。続けて入力すると絞り込めます`
                : undefined,
          });
        } else if (data.available) {
          setSearch({
            kind: "empty",
            note: "一致するカードがありません。「検索」を押すと公式DBも探します（新しいカードの可能性があります）。",
            tried: [],
          });
        }
        // ミラーがない環境では何もしない（従来どおり「検索」で公式へ）
      } catch {
        // 入力中候補の失敗は黙って無視（「検索」は使える）
      }
    }, TYPEAHEAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

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
    const seq = ++searchSeq.current;
    setSearch({ kind: "loading" });
    try {
      const res = await fetch(`/api/cards?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as ResolveCardNameResult & {
        error?: string;
      };
      if (seq !== searchSeq.current) return;
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

  function changeQuery(value: string) {
    setQuery(value);
    if (!value.trim()) {
      searchSeq.current += 1;
      setSearch({ kind: "idle" });
    }
  }

  /** mentionHint: 質問文候補から選んだときの語句（略称辞書の学習に使う） */
  function togglePick(option: CardOption, mentionHint?: string) {
    const already = picks.some((p) => p.cardId === option.cardId);
    if (already) {
      setPicks((prev) => prev.filter((p) => p.cardId !== option.cardId));
      setConfirmGate(null);
      return;
    }

    const mention = mentionHint ?? (query.trim() || option.officialName);
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
    changeQuery("");
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
                onChange={(e) => changeQuery(e.target.value)}
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
                    changeQuery("");
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
            questionSuggest={questionSuggest}
            picks={picks}
            disabled={submitting}
            onToggle={togglePick}
            onRetryWith={(term) => {
              setQuery(term);
              void runSearch(term);
            }}
            onBrowse={(term) => {
              // 「ほか N件」: その語で入力中候補を出す（ユーザー操作のときだけ窓に入れる）
              changeQuery(term);
              focusSearchIfDesktop();
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
                特定のカードに関する質問でなければ、「カードなしで進む」を押してこのままお進みください。
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
        <hr className="mt-3 border-0 border-t border-zinc-200" />
        <p className="mt-3 text-xs leading-relaxed text-zinc-600">{body}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onProceed}
            disabled={disabled}
            className="min-w-0 flex-1 rounded-full border border-zinc-400 bg-white px-3 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-40"
          >
            {proceedLabel}
          </button>
          <button
            type="button"
            onClick={onStay}
            disabled={disabled}
            className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
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
  questionSuggest,
  picks,
  disabled,
  onToggle,
  onRetryWith,
  onBrowse,
}: {
  state: SearchState;
  questionSuggest: QuestionSuggestState;
  picks: CardPick[];
  disabled: boolean;
  onToggle: (option: CardOption, mentionHint?: string) => void;
  onRetryWith: (term: string) => void;
  onBrowse: (term: string) => void;
}) {
  if (state.kind === "idle") {
    return (
      <QuestionSuggestions
        state={questionSuggest}
        picks={picks}
        disabled={disabled}
        onToggle={onToggle}
        onBrowse={onBrowse}
      />
    );
  }

  if (state.kind === "loading") {
    return <p className="mt-6 text-center text-xs text-zinc-500">検索中…</p>;
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
      <CardOptionGrid
        options={state.options}
        picks={picks}
        disabled={disabled}
        onToggle={(option) => onToggle(option)}
      />
    </div>
  );
}

/**
 * 検索窓が空のときに出す「質問文から見つかった候補」。
 * 語句ごとにまとめ、確定はユーザーに任せる。
 */
function QuestionSuggestions({
  state,
  picks,
  disabled,
  onToggle,
  onBrowse,
}: {
  state: QuestionSuggestState;
  picks: CardPick[];
  disabled: boolean;
  onToggle: (option: CardOption, mentionHint?: string) => void;
  onBrowse: (term: string) => void;
}) {
  if (state.kind === "unavailable") {
    return (
      <p className="mt-6 text-center text-xs text-zinc-400">
        カード名を入力して検索してください
      </p>
    );
  }
  if (state.kind === "loading") {
    return (
      <p className="mt-6 text-center text-xs text-zinc-400">
        質問文からカードを探しています…
      </p>
    );
  }
  if (state.groups.length === 0) {
    return (
      <p className="mt-6 text-center text-xs text-zinc-400">
        質問文からはカードが見つかりませんでした。カード名を入力して検索してください
      </p>
    );
  }

  return (
    <section className="space-y-4" aria-label="質問文から見つかった候補">
      <p className="text-xs text-zinc-500">
        質問文から見つかった候補です。関係するカードを選んでください
      </p>
      {state.groups.map((group) => {
        const shown = group.cards.slice(0, SUGGESTION_CARDS_PER_GROUP);
        const rest = group.total - shown.length;
        return (
          <div key={`${group.kind}:${group.mention}`} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="min-w-0 truncate text-sm font-medium text-zinc-800">
                「{group.mention}」
              </h3>
              {rest > 0 && (
                <button
                  type="button"
                  onClick={() => onBrowse(group.mention)}
                  disabled={disabled}
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40"
                >
                  ほか{rest}件
                </button>
              )}
            </div>
            <CardOptionGrid
              options={shown}
              picks={picks}
              disabled={disabled}
              onToggle={(option) => onToggle(option, group.mention)}
            />
          </div>
        );
      })}
    </section>
  );
}

function CardOptionGrid({
  options,
  picks,
  disabled,
  onToggle,
}: {
  options: CardOption[];
  picks: CardPick[];
  disabled: boolean;
  onToggle: (option: CardOption) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => {
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
