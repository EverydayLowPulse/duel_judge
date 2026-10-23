import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { installMode, isIosDevice } from "./installMode";

describe("installMode", () => {
  it("ホーム画面から開いているときは出さない", () => {
    assert.equal(
      installMode({ standalone: true, canPrompt: true, ios: false }),
      "hidden",
    );
    assert.equal(
      installMode({ standalone: true, canPrompt: false, ios: true }),
      "hidden",
    );
  });

  it("ブラウザの追加ダイアログを出せるなら、それを使う", () => {
    assert.equal(
      installMode({ standalone: false, canPrompt: true, ios: false }),
      "prompt",
    );
  });

  it("iPhone / iPad は追加ダイアログが無いので、共有メニューからの手順を出す", () => {
    assert.equal(
      installMode({ standalone: false, canPrompt: false, ios: true }),
      "ios-guide",
    );
  });

  it("追加できないブラウザでは出さない", () => {
    assert.equal(
      installMode({ standalone: false, canPrompt: false, ios: false }),
      "hidden",
    );
  });
});

describe("isIosDevice", () => {
  it("iPhone の UA を iOS とみなす", () => {
    assert.equal(
      isIosDevice({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
      true,
    );
  });

  it("Mac を名乗るタッチ端末（iPadOS）も iOS とみなす", () => {
    assert.equal(
      isIosDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
      true,
    );
  });

  it("タッチの無い Mac や Android は iOS とみなさない", () => {
    assert.equal(
      isIosDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
      false,
    );
    assert.equal(
      isIosDevice({
        userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      }),
      false,
    );
  });
});
