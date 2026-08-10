"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { fetchJudge } from "@/lib/judge/fetchJudge";
import type { JudgeProgressEvent } from "@/lib/judge/progress";
import type { JudgeResponse } from "@/lib/judge/types";
import { DEFAULT_MODEL_ID } from "@/lib/llm/modelCatalog";
import { CardPickerDialog, type CardPick } from "./CardPickerDialog";
import { ModelPicker, readStoredModelId } from "./ModelPicker";

type ThinkingStep = {
  kind: "status" | "draft" | "monologue";
  message: string;
  detail?: string;
};

type ChatItem =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      result: JudgeResponse;
      /** 判定中に積んだ進捗（回答後も折りたたみで残す） */
      thinkingSteps?: ThinkingStep[];
    }
  | {
      id: string;
      role: "thinking";
      steps: ThinkingStep[];
    };

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 本番向けの裁定チャット（/）。ChatGPT風の1カラム会話UI。 */
export function JudgeChat() {
  const [question, setQuestion] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thinkingIdRef = useRef<string | null>(null);

  useEffect(() => {
    setModelId(readStoredModelId());
  }, []);

  // 新メッセージで下端へ
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items, loading]);

  function appendThinkingStep(step: ThinkingStep) {
    const id = thinkingIdRef.current;
    if (!id) return;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id || item.role !== "thinking") return item;
        const last = item.steps[item.steps.length - 1];
        if (
          last &&
          last.kind === step.kind &&
          last.message === step.message &&
          last.detail === step.detail
        ) {
          return item;
        }
        return { ...item, steps: [...item.steps, step] };
      }),
    );
  }

  async function runJudge(body: {
    question: string;
    confirmedCards: CardPick[];
    model?: string;
  }) {
    setLoading(true);
    setError(null);
    const thinkingId = newId();
    thinkingIdRef.current = thinkingId;
    setItems((prev) => [
      ...prev,
      {
        id: thinkingId,
        role: "thinking",
        steps: [
          {
            kind: "status",
            message: "判定を開始しています…",
          },
        ],
      },
    ]);

    try {
      const result = await fetchJudge(
        {
          question: body.question,
          confirmedCards: body.confirmedCards.map((pick) => ({
            cardId: pick.cardId,
            mention: pick.mention,
          })),
          model: body.model ?? modelId,
        },
        {
        onProgress: (event: JudgeProgressEvent) => {
          appendThinkingStep({
            kind: event.kind ?? "status",
            message: event.message,
            detail: event.detail,
          });
        },
      });

      setItems((prev) => {
        const thinking = prev.find(
          (i) => i.id === thinkingId && i.role === "thinking",
        );
        const liveSteps =
          thinking && thinking.role === "thinking" ? thinking.steps : [];
        const fromServer =
          (result.kind === "answer" || result.kind === "withhold") &&
          result.debug?.processTrace
            ? result.debug.processTrace.map((t) => ({
                kind: (t.kind ?? "status") as ThinkingStep["kind"],
                message: t.message,
                detail: t.detail,
              }))
            : [];
        // ライブの方が長いときはそれを優先（途中の status も残る）
        const steps = liveSteps.length >= fromServer.length ? liveSteps : fromServer;
        return [
          ...prev.filter((i) => i.id !== thinkingId),
          {
            id: newId(),
            role: "assistant",
            result,
            thinkingSteps: steps,
          },
        ];
      });

      // やり直せるよう、確定できなかったときは質問文を入力欄に戻す
      if (
        result.kind === "clarify" ||
        result.kind === "not_found" ||
        result.kind === "withhold"
      ) {
        setQuestion(body.question);
      }
    } catch (err) {
      setItems((prev) => prev.filter((i) => i.id !== thinkingId));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      thinkingIdRef.current = null;
      setLoading(false);
    }
  }

  /** 送信ボタンの代替。ここでは送らず、カード確定ステップへ進む */
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    openPicker();
  }

  /** 通常は空で開く。clarify 等から「この語で開き直す」ときだけ初期語を渡す */
  function openPicker(initialQuery?: string) {
    setPickerQuery(initialQuery?.trim() ?? "");
    setPickerOpen(true);
  }

  async function confirmCards(picks: CardPick[]) {
    const q = question.trim();
    if (!q || loading) return;
    setPickerOpen(false);

    const cardLine =
      picks.length > 0
        ? `（カード: ${picks.map((p) => p.officialName).join(" / ")}）`
        : "（特定のカードなし）";
    setItems((prev) => [
      ...prev,
      { id: newId(), role: "user", text: `${q}\n${cardLine}` },
    ]);
    setQuestion("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await runJudge({ question: q, confirmedCards: picks });
  }

  function onTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent);
    }
  }

  function onTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuestion(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  return (
    <div className="flex h-dvh flex-col bg-zinc-50 text-zinc-900">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200/80 bg-white/90 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">
            DM_judge
          </h1>
          <p className="text-xs text-zinc-500">デュエマのルールにくわしいAI</p>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {items.length === 0 && (
            <EmptyState />
          )}

          {items.map((item) => {
            if (item.role === "user") {
              return (
                <div key={item.id} className="flex justify-end">
                  <div className="flex max-w-[85%] flex-col items-end gap-1">
                    <div className="whitespace-pre-wrap rounded-3xl bg-zinc-800 px-4 py-2.5 text-[15px] leading-relaxed text-white">
                      {item.text}
                    </div>
                    <CopyIconButton
                      getText={() => item.text}
                      tone="default"
                    />
                  </div>
                </div>
              );
            }
            if (item.role === "thinking") {
              return (
                <div key={item.id} className="flex justify-start">
                  <ThinkingPanel steps={item.steps} active />
                </div>
              );
            }
            return (
              <div key={item.id} className="flex justify-start">
                <div className="w-full max-w-[92%] space-y-3">
                  {item.thinkingSteps && item.thinkingSteps.length > 0 && (
                    <ThinkingPanel steps={item.thinkingSteps} active={false} />
                  )}
                  <AssistantBubble
                    result={item.result}
                    loading={loading}
                    onPickCards={openPicker}
                  />
                </div>
              </div>
            );
          })}

          {error && (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-200/80 bg-white/95 px-3 py-3 backdrop-blur">
        <form
          onSubmit={onSubmit}
          className="mx-auto flex w-full max-w-3xl flex-col gap-2"
        >
          <div className="flex items-center justify-end gap-2 px-1">
            <ModelPicker
              value={modelId}
              disabled={loading}
              onChange={setModelId}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-[28px] border border-zinc-200 bg-white px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-zinc-300">
            <textarea
              ref={textareaRef}
              // text-base(=16px): iOS Safari/PWA は 16px 未満でフォーカス時にズームし、閉じても戻らない
              className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-base leading-relaxed outline-none"
              value={question}
              onChange={onTextareaInput}
              onKeyDown={onTextareaKeyDown}
              disabled={loading}
              rows={1}
              placeholder={
                "なんでも質問してください"
              }
            />
            {/* 送信ボタンの代替。位置・色・矢印を保ち、次に確定ステップが来ることだけ示す */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40"
              >
                カード選択へ
                <SendIcon />
              </button>
            </div>
          </div>
          <p className="px-1 text-center text-[11px] text-zinc-400">
            Enter で次へ · Shift+Enter で改行 · 公式ソースのみ参照
          </p>
        </form>
      </div>

      {pickerOpen && (
        <CardPickerDialog
          question={question}
          initialQuery={pickerQuery}
          submitting={loading}
          onQuestionChange={setQuestion}
          onCancel={() => setPickerOpen(false)}
          onConfirm={confirmCards}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-2xl font-semibold tracking-tight text-zinc-800">
        DM_judge
      </p>
      <p className="max-w-md text-sm leading-relaxed text-zinc-500">
        デュエマのルールにくわしいAI。
        <br />
        公式ルールや公式Q&Aをもとに回答します。
      </p>
    </div>
  );
}

function ThinkingPanel({
  steps,
  active,
}: {
  steps: ThinkingStep[];
  active: boolean;
}) {
  const [open, setOpen] = useState(active);

  // 判定中は開き、回答が出たら自動で閉じる（手動で開き直せる）
  useEffect(() => {
    setOpen(active);
  }, [active]);

  return (
    <div className="w-full max-w-[92%] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left text-zinc-600"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 font-medium">
          {active && (
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
          )}
          {active ? "考えています…" : "推論過程"}
        </span>
        <span className="text-xs text-zinc-400">{open ? "隠す" : "表示"}</span>
      </button>
      {open && (
        <ol className="mt-2 space-y-2.5 border-t border-zinc-100 pt-2">
          {steps.map((step, i) => (
            <li
              key={`${i}-${step.kind}-${step.message.slice(0, 24)}`}
              className="animate-[fadeIn_0.25s_ease-out]"
            >
              {step.kind === "monologue" ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 italic">
                  {step.message}
                  {active && i === steps.length - 1 ? "…" : ""}
                </p>
              ) : (
                <div className="flex gap-2 text-xs leading-relaxed text-zinc-600">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-300" />
                  <span>
                    {step.message}
                    {active && i === steps.length - 1 ? "…" : ""}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * 候補提示は送信前の確定ポップアップに一本化する。ここでは同じUIを開き直すだけで、
 * バブルの中に別デザインの選択リストを置かない。
 */
function ReopenPickerButton({
  term,
  loading,
  onPickCards,
  label = "カードを選び直す",
}: {
  term?: string;
  loading: boolean;
  onPickCards: (initialQuery?: string) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => onPickCards(term)}
      className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40"
    >
      {label}
      <SendIcon />
    </button>
  );
}

function AssistantBubble({
  result,
  loading,
  onPickCards,
}: {
  result: JudgeResponse;
  loading: boolean;
  onPickCards: (initialQuery?: string) => void;
}) {
  if (result.kind === "clarify") {
    return (
      <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-[15px]">
        <p className="font-medium text-amber-950">カードを確認してください</p>
        <p className="text-zinc-700">{result.resolve.note}</p>
        <ReopenPickerButton
          term={result.resolve.query}
          loading={loading}
          onPickCards={onPickCards}
        />
      </section>
    );
  }

  if (result.kind === "not_found") {
    const r = result.resolve;
    return (
      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 text-[15px]">
        <p className="font-medium">カードが見つかりませんでした</p>
        <p className="text-zinc-700">{r.note}</p>
        <ReopenPickerButton
          term={r.cleanedQuery ?? r.query}
          loading={loading}
          onPickCards={onPickCards}
        />
      </section>
    );
  }

  if (result.kind === "withhold") {
    return (
      <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-[15px]">
        <p className="font-medium text-amber-950">回答を保留しました</p>
        <p>{result.withhold.reason}</p>
        {result.withhold.next_hint && (
          <p className="text-zinc-600">{result.withhold.next_hint}</p>
        )}
        <ReopenPickerButton loading={loading} onPickCards={onPickCards} />
        <FooterMeta
          disclaimer={result.display.disclaimer}
          llm={result.debug?.llm}
        />
      </section>
    );
  }

  return (
    <AnswerMessage
      result={result}
    />
  );
}

/**
 * 表示順: 結論（太字）→ 推論 → 根拠一覧。
 * 回答全体を1つの枠で囲み、根拠ごとのカード枠は使わない。
 */
function AnswerMessage({
  result,
}: {
  result: Extract<JudgeResponse, { kind: "answer" }>;
}) {
  const a = result.answer;
  const [phase, setPhase] = useState(0);
  const confidenceLabel =
    a.confidence === "high" ? "高" : a.confidence === "medium" ? "中" : "低";

  useEffect(() => {
    setPhase(0);
    const timers = [
      window.setTimeout(() => setPhase(1), 120),
      window.setTimeout(() => setPhase(2), 280),
      window.setTimeout(() => setPhase(3), 440),
      window.setTimeout(() => setPhase(4), 600),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [result]);

  return (
    <article className="relative rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-[15px] leading-relaxed text-zinc-800 shadow-sm">
      <CopyIconButton
        className="absolute right-2.5 top-2.5"
        getText={() => formatAnswerForClipboard(result)}
      />

      {phase >= 1 && (
        <section className="animate-[fadeIn_0.3s_ease-out] pr-10">
          <p className="text-xs font-medium tracking-wide text-zinc-400">
            結論
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-base font-bold text-zinc-900">
            {a.conclusion}
          </p>
          {a.resolved_cards.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {a.resolved_cards.map((c) => (
                <li key={c.card_id}>
                  <a
                    href={c.detail_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-200/80"
                  >
                    {c.official_name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {phase >= 2 && a.reasoning && (
        <section className="animate-[fadeIn_0.3s_ease-out] mt-4">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">
            {a.reasoning}
          </p>
        </section>
      )}

      {phase >= 3 && a.evidence.length > 0 && (
        <section className="animate-[fadeIn_0.3s_ease-out] mt-6 border-t border-zinc-100 pt-4">
          <p className="text-xs font-medium tracking-wide text-zinc-400">
            根拠
          </p>
          <ul className="mt-3 space-y-5">
            {a.evidence.map((ev, i) => (
              <li key={`${ev.url}-${i}`}>
                <p className="text-xs text-zinc-500">
                  {ev.type === "qa"
                    ? "公式Q&A"
                    : ev.type === "rule"
                      ? `総合ルール ${ev.rule_ref ?? ""}`.trim()
                      : "カード"}
                  {ev.label ? ` · ${ev.label}` : ""}
                </p>
                <blockquote className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">
                  {ev.quote}
                </blockquote>
                <a
                  className="mt-1.5 inline-block text-xs text-zinc-500 underline underline-offset-2"
                  href={ev.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  出典を開く
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {phase >= 4 && (
        <div className="animate-[fadeIn_0.3s_ease-out] mt-5 space-y-1 border-t border-zinc-100 pt-3">
          <p className="text-xs text-zinc-500">
            確信度: {confidenceLabel} — {a.confidence_note}
          </p>
          {result.debug?.gateAdjustments &&
            result.debug.gateAdjustments.length > 0 && (
              <p className="text-xs text-zinc-400">
                ※ 確信度は出典種別に合わせて自動調整しています
              </p>
            )}
          <FooterMeta
            disclaimer={result.display.disclaimer}
            llm={result.debug?.llm}
          />
        </div>
      )}
    </article>
  );
}

function formatAnswerForClipboard(
  result: Extract<JudgeResponse, { kind: "answer" }>,
): string {
  const a = result.answer;
  const parts: string[] = [`結論\n${a.conclusion.trim()}`];
  if (a.reasoning?.trim()) {
    parts.push(a.reasoning.trim());
  }
  if (a.evidence.length > 0) {
    const lines = a.evidence.map((ev, i) => {
      const kind =
        ev.type === "qa"
          ? "公式Q&A"
          : ev.type === "rule"
            ? `総合ルール ${ev.rule_ref ?? ""}`.trim()
            : "カード";
      const head = ev.label ? `${kind} · ${ev.label}` : kind;
      return `${i + 1}. ${head}\n${ev.quote.trim()}\n${ev.url}`;
    });
    parts.push(`根拠\n${lines.join("\n\n")}`);
  }
  return parts.join("\n\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/** よくある「重なった四角」のコピーボタン */
function CopyIconButton({
  getText,
  className = "",
  tone = "default",
}: {
  getText: () => string;
  className?: string;
  tone?: "default" | "onDark";
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyText(getText());
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  const toneClass =
    tone === "onDark"
      ? "text-zinc-300 hover:bg-white/10 hover:text-white"
      : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700";

  return (
    <button
      type="button"
      onClick={(e) => void onCopy(e)}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${toneClass} ${className}`}
      aria-label={copied ? "コピーしました" : "コピー"}
      title={copied ? "コピーしました" : "コピー"}
    >
      {copied ? <CheckIcon /> : <CopySquaresIcon />}
    </button>
  );
}

function CopySquaresIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="8"
        y="8"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M4 16V6a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5 9.5 17 19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FooterMeta({
  disclaimer,
  llm,
}: {
  disclaimer: string;
  llm?: string;
}) {
  return (
    <div className="space-y-0.5 pt-1 text-xs text-zinc-400">
      {llm && <p>モデル: {llm}</p>}
      <p>{disclaimer}</p>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M12 19V5M12 5l-6 6M12 5l6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
