import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 親ディレクトリの lockfile を誤検出しないようにする
  turbopack: {
    root: path.join(__dirname),
  },
  // PDF 抽出（unpdf）をバンドルせず Node 側で読む
  serverExternalPackages: ["unpdf"],
  // ビルド同梱のルール索引を Serverless 関数に含める
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/rules/bundled-index.json"],
  },
};

export default nextConfig;
