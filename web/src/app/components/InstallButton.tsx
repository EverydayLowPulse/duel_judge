"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { installMode, isIosDevice } from "@/lib/pwa/installMode";

/** Chrome / Edge / Android の追加ダイアログ。標準の型定義にまだ無い */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// beforeinstallprompt は描画より先に来ることがあるので、読み込んだ時点で待ち受ける
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function subscribePrompt(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeStandalone(listener: () => void) {
  const media = window.matchMedia(STANDALONE_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function readStandalone(): boolean {
  return (
    window.matchMedia(STANDALONE_QUERY).matches ||
    // iOS Safari はホーム画面から開くと navigator.standalone が true
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribeNothing() {
  return () => {};
}

/** ヘッダー右上の「ホーム画面に追加」。追加済み・追加できないブラウザでは出さない */
export function InstallButton() {
  const canPrompt = useSyncExternalStore(
    subscribePrompt,
    () => deferredPrompt !== null,
    () => false,
  );
  // サーバーでは追加済み扱いにして、描画のずれ（hydration mismatch）を避ける
  const standalone = useSyncExternalStore(
    subscribeStandalone,
    readStandalone,
    () => true,
  );
  const ios = useSyncExternalStore(
    subscribeNothing,
    () => isIosDevice(navigator),
    () => false,
  );
  const [guideOpen, setGuideOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 手順の外を押すか Esc で閉じる。ヘッダーの backdrop-blur の内側では
  // fixed の幕が画面全体を覆えないので、document で押された場所を見る
  useEffect(() => {
    if (!guideOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setGuideOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGuideOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [guideOpen]);

  const mode = installMode({ standalone, canPrompt, ios });
  if (mode === "hidden") return null;

  const onClick = async () => {
    if (mode === "ios-guide") {
      setGuideOpen((open) => !open);
      return;
    }
    const event = deferredPrompt;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    // 同じイベントは2度使えない。断られても次の機会にブラウザがまた送ってくる
    deferredPrompt = null;
    notify();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-expanded={mode === "ios-guide" ? guideOpen : undefined}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        ホームに追加
      </button>
      {guideOpen && (
        <div
          role="dialog"
          aria-label="ホーム画面に追加する手順"
          className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-700 shadow-lg"
        >
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              画面下（iPad は右上）の共有ボタン
              <ShareIcon />
              をタップ
            </li>
            <li>「ホーム画面に追加」を選ぶ</li>
          </ol>
        </div>
      )}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      className="mx-0.5 inline-block align-[-2px]"
      aria-label="共有"
    >
      <path
        d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
