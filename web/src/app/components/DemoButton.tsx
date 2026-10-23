"use client";

type Props = {
  disabled?: boolean;
  onClick: () => void;
};

/** ヘッダー右上のデモ再生ボタン。何を聞けばいいか分からない初見の人向け */
export function DemoButton({ disabled, onClick }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
        <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
      </svg>
      デモ再生
    </button>
  );
}
