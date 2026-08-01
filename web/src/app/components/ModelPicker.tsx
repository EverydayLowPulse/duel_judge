"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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

/**
 * Cursor風の縦展開モデルピッカー。
 * 推奨を上にまとめ、コスト差はタグで示唆（クレジットは未実装）。
 */
export function ModelPicker({ value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = getCatalogModel(value) ?? getCatalogModel(DEFAULT_MODEL_ID)!;
  const recommended = listRecommendedModels();
  const others = listOtherModels();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
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
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex max-w-[min(100%,14rem)] items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-left text-[11px] text-zinc-700 hover:bg-white disabled:opacity-50"
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

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="回答モデル"
          className="absolute bottom-full right-0 z-40 mb-2 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg"
        >
          <div className="max-h-72 overflow-y-auto py-1">
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
          <p className="border-t border-zinc-100 px-3 py-2 text-[10px] leading-snug text-zinc-400">
            クレジット課金は未実装。コスト差のあるモデルを増やすときに導入予定。
          </p>
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
  const costHint =
    model.costTier === "low"
      ? "低コスト"
      : model.costTier === "mid"
        ? "中"
        : "高";
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onPick(model)}
      className={
        active
          ? "flex w-full items-center gap-2 bg-zinc-100 px-3 py-2 text-left text-sm"
          : "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50"
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
      <span className="shrink-0 text-[10px] text-zinc-400">{costHint}</span>
      {active && (
        <span className="shrink-0 text-zinc-700" aria-hidden>
          ✓
        </span>
      )}
    </button>
  );
}

export { readStoredModelId, STORAGE_KEY as MODEL_STORAGE_KEY };
