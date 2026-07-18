import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `.env.local` を直接読む。
 * 親シェルの空文字 env が Next の自動読込を潰すことがあるため。
 */
export function resolveEnv(name: string): string | undefined {
  if (process.env[name] === "") {
    delete process.env[name];
  }
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;

  for (const path of [
    join(process.cwd(), ".env.local"),
    join(process.cwd(), "web", ".env.local"),
  ]) {
    const value = parseEnvLocalValue(path, name);
    if (value) {
      process.env[name] = value;
      return value;
    }
  }
  return undefined;
}

export function requireEnv(name: string): string {
  const value = resolveEnv(name);
  if (!value) {
    throw new Error(
      `${name} が未設定です。web/.env.local に設定してください。cwd=${process.cwd()}`,
    );
  }
  return value;
}

function parseEnvLocalValue(
  filePath: string,
  name: string,
): string | undefined {
  if (!existsSync(filePath)) return undefined;
  const text = readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key !== name) continue;
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v || undefined;
  }
  return undefined;
}
