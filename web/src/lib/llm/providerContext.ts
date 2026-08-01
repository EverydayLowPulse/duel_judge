import { AsyncLocalStorage } from "node:async_hooks";
import {
  getCatalogModel,
  type CatalogModel,
} from "./modelCatalog";

export type LlmProvider = "auto" | "gemini" | "deepseek";

export type LlmOverride = {
  /** auto のときは modelId 無し（環境変数のモデルを使う） */
  provider: LlmProvider;
  modelId?: string;
};

/**
 * 1リクエスト内だけ LLM 選択を上書きする。
 * UI のモデルピッカー → API body.model → ここ → generateJson。
 */
const storage = new AsyncLocalStorage<LlmOverride>();

export function runWithLlmOverride<T>(
  override: LlmOverride | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!override) return fn();
  return storage.run(override, fn);
}

/** @deprecated runWithLlmOverride を使う */
export function runWithLlmProvider<T>(
  provider: LlmProvider | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!provider) return fn();
  return runWithLlmOverride({ provider }, fn);
}

export function getLlmOverride(): LlmOverride | undefined {
  return storage.getStore();
}

export function getLlmProviderOverride(): LlmProvider | undefined {
  return storage.getStore()?.provider;
}

export function getLlmModelOverride(): string | undefined {
  return storage.getStore()?.modelId;
}

export function parseLlmProvider(raw: unknown): LlmProvider | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "auto" || v === "gemini" || v === "deepseek") return v;
  return undefined;
}

/**
 * body.model / body.provider から上書き設定を作る。
 * model が有効なら provider はカタログから決まる。
 */
export function resolveLlmOverride(input: {
  model?: unknown;
  provider?: unknown;
}): { override?: LlmOverride; catalog?: CatalogModel; error?: string } {
  if (typeof input.model === "string" && input.model.trim()) {
    const id = input.model.trim();
    const catalog = getCatalogModel(id);
    if (!catalog) {
      return { error: `unknown model: ${id}` };
    }
    return {
      catalog,
      override: { provider: catalog.provider, modelId: catalog.id },
    };
  }

  const provider = parseLlmProvider(input.provider);
  if (input.provider != null && !provider) {
    return { error: "body.provider must be auto|gemini|deepseek" };
  }
  if (provider) {
    return { override: { provider } };
  }
  return {};
}
