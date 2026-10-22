import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScenarioFacts } from "../facts/types";
import { classifyIssues } from "./classifyIssues";

function facts(question: string, overrides: Partial<ScenarioFacts> = {}): ScenarioFacts {
  return {
    question,
    entities: [],
    actions: [],
    manaZone: [],
    timelineNotes: [],
    ...overrides,
  };
}

function kinds(question: string, overrides: Partial<ScenarioFacts> = {}) {
  return classifyIssues({ question, facts: facts(question, overrides) }).matches.map(
    (m) => m.kind,
  );
}

describe("classifyIssues: マナ支払いの論点", () => {
  it("召喚とマナに触れる質問ではマナ支払いの論点を立てる", () => {
    const q = "マナに光と水のカードが1枚ずつあるとき、光水の多色クリーチャーは召喚できますか";
    assert.ok(kinds(q).includes("mana_payment"));
  });

  it("マナ支払いの論点では多色マナのルール番号を検索に入れる", () => {
    const q = "マナに光と水のカードが1枚ずつあるとき、光水の多色クリーチャーは召喚できますか";
    const result = classifyIssues({ question: q, facts: facts(q) });
    assert.ok(result.ruleRefs.includes("112.2a"));
  });

  it("マナに触れなくても、多色カードを召喚する質問なら論点を立てる", () => {
    const q = "このクリーチャーは召喚できますか";
    const multiColor = {
      mention: "多色クリーチャー",
      civilizations: ["光", "水"],
    };
    assert.ok(
      kinds(q, {
        entities: [
          {
            mention: multiColor.mention,
            card: { civilizations: multiColor.civilizations },
          } as unknown as ScenarioFacts["entities"][number],
        ],
      }).includes("mana_payment"),
    );
  });

  it("召喚も唱えるも出てこない質問ではマナ支払いの論点を立てない", () => {
    const q = "マナゾーンのカードは何枚までタップできますか";
    assert.ok(!kinds(q).includes("mana_payment"));
  });
});
