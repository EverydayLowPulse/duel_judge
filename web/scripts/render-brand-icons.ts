/**
 * logo.svg → PWA / Apple 用 PNG を書き出す。
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "public/icons/logo.svg");
const outDir = path.join(root, "public/icons");

async function main() {
  const svg = fs.readFileSync(svgPath);
  const jobs: Array<[string, number]> = [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180],
  ];
  for (const [name, size] of jobs) {
    const dest = path.join(outDir, name);
    await sharp(svg, { density: 384 }).resize(size, size).png().toFile(dest);
    console.log("wrote", dest);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
