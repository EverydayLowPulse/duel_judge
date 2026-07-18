import { GoogleGenAI } from "@google/genai";
import { requireEnv, resolveEnv } from "../env";

export function getGeminiClient() {
  return new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
}

export function getGeminiModelName(): string {
  return resolveEnv("GEMINI_MODEL") || "gemini-3.5-flash";
}

export async function generateJsonWithGemini(input: {
  system: string;
  user: string;
  jsonSchema: object;
  temperature?: number;
}): Promise<string> {
  const response = await getGeminiClient().models.generateContent({
    model: getGeminiModelName(),
    contents: input.user,
    config: {
      systemInstruction: input.system,
      temperature: input.temperature ?? 0.2,
      responseMimeType: "application/json",
      responseJsonSchema: input.jsonSchema,
    },
  });
  if (!response.text) {
    throw new Error("Gemini から空の応答が返りました");
  }
  return response.text;
}
