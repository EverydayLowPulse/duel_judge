/**
 * 1回の裁定リクエスト内で呼んだ LLM の記録。
 * AsyncLocalStorage ではなく明示 begin/end（Next Route でも扱いやすい）。
 */
export type LlmCallRecord = {
  provider: "gemini" | "deepseek";
  model: string;
  /** 呼び出し目的（任意） */
  purpose?: string;
};

let active: LlmCallRecord[] | null = null;

export function beginLlmUsageCapture(): void {
  active = [];
}

export function recordLlmCall(record: LlmCallRecord): void {
  active?.push(record);
}

export function endLlmUsageCapture(): LlmCallRecord[] {
  const calls = active ?? [];
  active = null;
  return calls;
}

/** UI向けの短い要約（例: plan=gemini:… → answer=gemini:…） */
export function summarizeLlmUsage(calls: LlmCallRecord[]): string | undefined {
  if (calls.length === 0) return undefined;
  const parts = calls.map((c) => {
    const id = `${c.provider}:${c.model}`;
    return c.purpose ? `${c.purpose}=${id}` : id;
  });
  // 連続重複を畳む
  const compact: string[] = [];
  for (const p of parts) {
    if (compact[compact.length - 1] !== p) compact.push(p);
  }
  return compact.join(" → ");
}
