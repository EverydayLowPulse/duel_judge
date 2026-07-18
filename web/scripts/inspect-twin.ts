import * as cheerio from "cheerio";
import fs from "node:fs";

const html = fs.readFileSync("../temp/mekakushi.html", "utf8");
const $ = cheerio.load(html);
console.log("skills", $("td.skills.full").length);
$("td.skills.full").each((i, el) => {
  console.log("FACE", i, $(el).text().replace(/\s+/g, " ").trim().slice(0, 120));
});
$("table").each((i, table) => {
  const t = $(table).text().replace(/\s+/g, " ").trim();
  if (t.includes("カードの種類")) {
    console.log("TABLE", i, t.slice(0, 160));
  }
});
