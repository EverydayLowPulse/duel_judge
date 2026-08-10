/**
 * UI／API で選ぶ LLM モデルのカタログ。
 * 推奨グループを上位表示し、Flash / Pro などのタグで差を示す。
 */
export type CatalogModel = {
  /** API に渡す model 文字列 */
  id: string;
  provider: "deepseek" | "gemini";
  /** 一覧の主表示 */
  label: string;
  /** 右寄せの短いタグ（Flash / Pro など） */
  tag?: string;
  /** 推奨グループに出す */
  recommended: boolean;
  enabled: boolean;
};

export const LLM_MODEL_CATALOG: CatalogModel[] = [
  {
    // Pro 正式版は未公開（公式案内どおり Preview 相当のまま）
    id: "deepseek-v4-pro",
    provider: "deepseek",
    label: "DeepSeek V4",
    tag: "Pro",
    recommended: true,
    enabled: true,
  },
  {
    // 正式版 DeepSeek-V4-Flash-0731。API ID は deepseek-v4-flash のまま。
    id: "deepseek-v4-flash",
    provider: "deepseek",
    label: "DeepSeek V4",
    tag: "Flash",
    recommended: true,
    enabled: true,
  },
  {
    id: "gemini-3.6-flash",
    provider: "gemini",
    label: "Gemini 3.6",
    tag: "Flash",
    recommended: false,
    enabled: true,
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    label: "Gemini 3.5",
    tag: "Flash-Lite",
    recommended: false,
    enabled: true,
  },
  {
    id: "gemini-3.1-pro",
    provider: "gemini",
    label: "Gemini 3.1",
    tag: "Pro",
    recommended: false,
    enabled: true,
  },
];

export const DEFAULT_MODEL_ID = "deepseek-v4-flash";

export function getCatalogModel(id: string): CatalogModel | undefined {
  return LLM_MODEL_CATALOG.find((m) => m.id === id && m.enabled);
}

export function listEnabledModels(): CatalogModel[] {
  return LLM_MODEL_CATALOG.filter((m) => m.enabled);
}

export function listRecommendedModels(): CatalogModel[] {
  return listEnabledModels().filter((m) => m.recommended);
}

export function listOtherModels(): CatalogModel[] {
  return listEnabledModels().filter((m) => !m.recommended);
}

export function formatModelLabel(model: CatalogModel): string {
  return model.tag ? `${model.label} ${model.tag}` : model.label;
}
