/**
 * ヘッダーのデモボタンで再生する台本。
 * 質問の入力 → カード確定画面での検索とタップ → 確定、を人の操作速度で再現する。
 * デモで正しく答えられたことを確かめた質問を使う。
 */
export type DemoScenario = {
  question: string;
  cards: Array<{
    /** カード確定画面の検索窓に打つ語 */
    searchTerm: string;
    /** 出てきた候補のうち、正式名にこれを含むものをタップする */
    nameIncludes: string;
  }>;
};

export const DEMO_SCENARIO: DemoScenario = {
  question:
    "メカくしで自分のダーバンデをアンタップしたいが、相手に同期の妖精がいると効果を吸われる？",
  cards: [
    { searchTerm: "メカくし", nameIncludes: "メカくしの術" },
    { searchTerm: "ダーバンデ", nameIncludes: "Bande" },
    { searchTerm: "同期の妖精", nameIncludes: "同期の妖精" },
  ],
};

/** 1文字ずつ打つときの途中経過。サロゲートペアは1文字として扱う */
export function typingSteps(text: string): string[] {
  const chars = Array.from(text);
  return chars.map((_, i) => chars.slice(0, i + 1).join(""));
}
