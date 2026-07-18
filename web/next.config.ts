import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 親ディレクトリの lockfile を誤検出しないようにする
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
