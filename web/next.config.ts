import os from "node:os";
import path from "node:path";
import type { NextConfig } from "next";

/** 開発時、同一Wi‑Fiのスマホ等から /_next を読めるようにする */
function lanDevOrigins(): string[] {
  const hosts: string[] = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) hosts.push(net.address);
    }
  }
  return hosts;
}

const nextConfig: NextConfig = {
  // 親ディレクトリの lockfile を誤検出しないようにする
  turbopack: {
    root: path.join(__dirname),
  },
  // スマホなど LAN ホストから dev を開くと、未許可だと JS が読めず UI が反応しなくなる
  allowedDevOrigins: lanDevOrigins(),
  // PDF 抽出（unpdf）をバンドルせず Node 側で読む
  serverExternalPackages: ["unpdf"],
  // ビルド同梱のルール索引・カード全件ミラーを Serverless 関数に含める
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./data/rules/bundled-index.json",
      "./data/cards/bundled-cards.json",
    ],
  },
};

export default nextConfig;
