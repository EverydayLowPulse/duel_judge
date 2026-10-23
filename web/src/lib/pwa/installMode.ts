/**
 * 「ホーム画面に追加」ボタンの出し分け。
 * - prompt: ブラウザの追加ダイアログ（beforeinstallprompt）を呼べる
 * - ios-guide: iPhone / iPad はダイアログが無いので、共有メニューからの手順を見せる
 * - hidden: 追加済み（ホーム画面から開いている）か、追加できないブラウザ
 */
export type InstallMode = "prompt" | "ios-guide" | "hidden";

export function installMode(env: {
  standalone: boolean;
  canPrompt: boolean;
  ios: boolean;
}): InstallMode {
  if (env.standalone) return "hidden";
  if (env.canPrompt) return "prompt";
  if (env.ios) return "ios-guide";
  return "hidden";
}

/** iPadOS は Mac を名乗るので、タッチ対応かどうかで見分ける */
export function isIosDevice(nav: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}): boolean {
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
}
