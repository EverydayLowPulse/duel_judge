"use client";

import { useState } from "react";
import { CardLookup } from "./CardLookup";
import { JudgeLookup } from "./JudgeLookup";
import { QaLookup } from "./QaLookup";
import { RulesLookup } from "./RulesLookup";

type Tab = "cards" | "qa" | "rules" | "judge";

/** 実装確認用の仮画面。本番の裁定チャットUIではない。 */
export function DevTools() {
  const [tab, setTab] = useState<Tab>("judge");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">duel_judge</h1>
        <p className="mt-1 text-sm text-zinc-600">
          開発用の動作確認UI（本番チャットとは別）
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2 text-sm">
        <TabButton active={tab === "judge"} onClick={() => setTab("judge")}>
          裁定パイプライン
        </TabButton>
        <TabButton active={tab === "cards"} onClick={() => setTab("cards")}>
          カード名解決
        </TabButton>
        <TabButton active={tab === "qa"} onClick={() => setTab("qa")}>
          公式Q&A
        </TabButton>
        <TabButton active={tab === "rules"} onClick={() => setTab("rules")}>
          総合ルール
        </TabButton>
      </div>

      {tab === "judge" && <JudgeLookup />}
      {tab === "cards" && <CardLookup embedded />}
      {tab === "qa" && <QaLookup />}
      {tab === "rules" && <RulesLookup />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded px-3 py-1.5 bg-zinc-900 text-white"
          : "rounded px-3 py-1.5 text-zinc-600 hover:bg-zinc-100"
      }
    >
      {children}
    </button>
  );
}
