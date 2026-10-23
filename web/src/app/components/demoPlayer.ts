import { typingSteps, type DemoScenario } from "@/lib/demo/scenario";

/** 人が打つ速さに寄せた間隔（ミリ秒） */
const QUESTION_CHAR_MS = 30;
const SEARCH_CHAR_MS = 80;
/** 画面を見て次の操作に移るまでの間 */
const THINK_MS = 700;
/** スクロールが止まるのを待つ間 */
const SCROLL_MS = 500;

export type DemoDriver = {
  /** 質問入力欄の値を変える（JudgeChat の state） */
  typeQuestion: (text: string) => void;
  /** 「カード選択へ」を押したときと同じ処理 */
  openPicker: () => void;
};

type ScenarioCard = DemoScenario["cards"][number];

/**
 * 台本どおりに本物の画面を操作する。カード確定画面は飛ばさず、
 * 質問文から見つかった候補までスクロールしてタップ → 確定、を人の操作速度で行う。
 * 候補に出ていないカード（略称辞書が未学習の環境など）だけ、検索窓に打って選ぶ。
 * 途中で画面が閉じられるなどして要素が見つからなければ、例外を投げて止まる。
 */
export async function playDemo(
  scenario: DemoScenario,
  driver: DemoDriver,
): Promise<void> {
  for (const partial of typingSteps(scenario.question)) {
    driver.typeQuestion(partial);
    await sleep(QUESTION_CHAR_MS);
  }
  await sleep(THINK_MS);
  driver.openPicker();

  const search = await waitFor(() =>
    document.querySelector<HTMLInputElement>('[data-demo="card-search"]'),
  );
  // 質問文からの候補は開いた後に届く。出なければ検索窓で選ぶ
  await waitFor(
    () => document.querySelector(QUESTION_SUGGEST),
    3000,
  ).catch(() => null);

  for (const [index, card] of scenario.cards.entries()) {
    await sleep(THINK_MS);
    const suggested = findOption(card, QUESTION_SUGGEST);
    if (suggested) {
      suggested.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(SCROLL_MS);
      // スクロールの間に描き直されていても押せるよう、押す直前に探し直す
      (findOption(card, QUESTION_SUGGEST) ?? suggested).click();
    } else {
      await pickBySearch(search, card);
    }
    // 選べたことを確かめる。選べていなければ、違う枚数のまま確定しないよう止める
    await waitFor(
      () =>
        document.querySelectorAll('[data-demo="picked-card"]').length >=
        index + 1,
      3000,
    );
  }

  await sleep(THINK_MS);
  const confirm = await waitFor(() =>
    document.querySelector<HTMLButtonElement>('[data-demo="confirm"]'),
  );
  confirm.click();
}

const QUESTION_SUGGEST = 'section[aria-label="質問文から見つかった候補"]';

async function pickBySearch(search: HTMLInputElement, card: ScenarioCard) {
  for (const partial of typingSteps(card.searchTerm)) {
    if (!search.isConnected) throw new Error("カード確定画面が閉じられた");
    setInputValue(search, partial);
    await sleep(SEARCH_CHAR_MS);
  }
  // 候補は打っている途中から出て、打ち終わると差し替わる（再録の別版になることもある）。
  // 結果が落ち着くのを待ってから探し、見つけた要素をすぐ押す
  await sleep(THINK_MS);
  const option = await waitFor(() => findOption(card));
  option.click();
}

/** まだ選んでいない候補のうち、正式名が台本と合うもの */
function findOption(
  card: ScenarioCard,
  within?: string,
): HTMLButtonElement | undefined {
  const root = within ? document.querySelector(within) : document;
  if (!root) return undefined;
  return [...root.querySelectorAll<HTMLButtonElement>("[data-card-name]")].find(
    (button) =>
      button.getAttribute("aria-pressed") !== "true" &&
      normalizeName(button.dataset.cardName ?? "").includes(
        normalizeName(card.nameIncludes),
      ),
  );
}

/** React の制御された input に、人が打ったのと同じ onChange を起こす */
function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 公式の表記はアポストロフィが ’ と ' で揺れる */
function normalizeName(value: string): string {
  return value.replace(/[’‘]/g, "'");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  find: () => T | null | undefined,
  timeoutMs = 8000,
): Promise<T> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = find();
    if (found) return found;
    await sleep(100);
  }
  throw new Error("デモで操作する要素が見つからなかった");
}
