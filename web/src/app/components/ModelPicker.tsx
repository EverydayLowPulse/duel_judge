"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_MODEL_ID,
  formatModelLabel,
  getCatalogModel,
  listOtherModels,
  listRecommendedModels,
  type CatalogModel,
} from "@/lib/llm/modelCatalog";

const STORAGE_KEY = "duel_judge_llm_model";

function readStoredModelId(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL_ID;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && getCatalogModel(raw)) return raw;
  } catch {
    // private mode など
  }
  return DEFAULT_MODEL_ID;
}

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (modelId: string) => void;
};

type MenuPos = { bottom: number; right: number; maxHeight: number };

/**
 * Cursor風の縦展開モデルピッカー。
 * 推奨を上にまとめ、Flash / Pro などのタグで差を示す。
 *
 * スマホ注意:
 * - 親の backdrop-blur 配下の absolute は iOS でクリップされやすい → fixed 配置
 * - 外側閉じは pointerdown（touch 対応）。開いた直後の同一タップで閉じないよう遅延登録
 */
export function ModelPicker({ value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = getCatalogModel(value) ?? getCatalogModel(DEFAULT_MODEL_ID)!;
  const recommended = listRecommendedModels();
  const others = listOtherModels();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPos(null);
      return;
    }
    function place() {
      const rect = buttonRef.current!.getBoundingClientRect();
      const gap = 8;
      const bottom = window.innerHeight - rect.top + gap;
      const right = Math.max(8, window.innerWidth - rect.right);
      // 画面上端までに収める
      const maxHeight = Math.max(160, rect.top - gap - 8);
      setMenuPos({ bottom, right, maxHeight });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // 開いたタップの pointerdown が残って即閉じするのを防ぐ
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDocPointerDown);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(model: CatalogModel) {
    onChange(model.id);
    try {
      window.localStorage.setItem(STORAGE_KEY, model.id);
    } catch {
      // ignore
    }
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-9 max-w-[min(100%,14rem)] items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-left text-xs text-zinc-700 hover:bg-white disabled:opacity-50"
      >
        <span className="truncate font-medium">
          {formatModelLabel(selected)}
        </span>
        {selected.recommended && (
          <span className="shrink-0 rounded bg-emerald-100 px-1 text-[9px] font-medium text-emerald-800">
            推奨
          </span>
        )}
        <span className="shrink-0 text-zinc-400" aria-hidden>
          ▾
        </span>
      </button>

      {open && menuPos && (
        <div
          id={listId}
          role="listbox"
          aria-label="回答モデル"
          style={{
            bottom: menuPos.bottom,
            right: menuPos.right,
            maxHeight: menuPos.maxHeight,
          }}
          className="fixed z-50 flex w-[min(18rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
            <SectionLabel>推奨</SectionLabel>
            {recommended.map((m) => (
              <ModelRow
                key={m.id}
                model={m}
                active={m.id === selected.id}
                onPick={pick}
              />
            ))}
            {others.length > 0 && (
              <>
                <SectionLabel>その他</SectionLabel>
                {others.map((m) => (
                  <ModelRow
                    key={m.id}
                    model={m}
                    active={m.id === selected.id}
                    onPick={pick}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2 text-[10px] font-medium tracking-wide text-zinc-400">
      {children}
    </p>
  );
}

function ModelRow({
  model,
  active,
  onPick,
}: {
  model: CatalogModel;
  active: boolean;
  onPick: (m: CatalogModel) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onPick(model)}
      className={
        active
          ? "flex min-h-11 w-full items-center gap-2 bg-zinc-100 px-3 py-2.5 text-left text-sm"
          : "flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-zinc-50"
      }
    >
      <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">
        {model.label}
        {model.tag ? (
          <span className="ml-1 font-normal text-zinc-500">{model.tag}</span>
        ) : null}
      </span>
      {model.recommended && (
        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
          推奨
        </span>
      )}
      {active && (
        <span className="shrink-0 text-zinc-700" aria-hidden>
          ✓
        </span>
      )}
    </button>
  );
}

export { readStoredModelId, STORAGE_KEY as MODEL_STORAGE_KEY };
