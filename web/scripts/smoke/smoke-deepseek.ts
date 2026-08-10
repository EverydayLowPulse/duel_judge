import { z } from "zod";
import { generateJson, getLlmProvider } from "../../src/lib/llm/generateJson";
import { runJudge } from "../../src/lib/judge/runJudge";

async function smoke() {
  console.log("provider=", getLlmProvider());
  const ping = await generateJson({
    system: "Reply with JSON only.",
    user: 'Return {"ok":true,"provider":"deepseek"}',
    jsonSchema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        provider: { type: "string" },
      },
      required: ["ok", "provider"],
    },
    zodSchema: z.object({
      ok: z.boolean(),
      provider: z.string(),
    }),
    temperature: 0,
  });
  console.log("ping=", JSON.stringify(ping));
}

async function regression() {
  const question =
    "ザレッドで攻撃する際にレッドゾーンに侵略、そこからカツムゲンに革命チェンジできるか？";
  const result = await runJudge({ question });
  console.log(
    JSON.stringify(
      {
        kind: result.kind,
        conclusion:
          result.kind === "answer" ? result.answer.conclusion : undefined,
        confidence:
          result.kind === "answer" ? result.answer.confidence : undefined,
        reasoning:
          result.kind === "answer" ? result.answer.reasoning : undefined,
        withhold:
          result.kind === "withhold" ? result.withhold.reason : undefined,
        clarify:
          result.kind === "clarify"
            ? result.resolve.candidates.map((c) => c.officialName)
            : undefined,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const mode = process.argv[2] ?? "smoke";
  if (mode === "judge") await regression();
  else await smoke();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
