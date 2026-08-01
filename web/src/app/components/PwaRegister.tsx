"use client";

import { useEffect } from "react";

/** 本番のみ Service Worker を登録（開発時のキャッシュ邪魔を避ける） */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch {
        // インストール失敗はアプリ本体を止めない
      }
    };

    void register();
  }, []);

  return null;
}
