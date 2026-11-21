// 指定した年の地図を PNG に書き出す（データの目視確認用）。
// 使い方:
//   node tools/snapshot.mjs 1700 [1715 ...] [--out DIR] [--zoom LON,LAT,K] [--debug] [--polity ID] [--size WxH]
//   例: node tools/snapshot.mjs 1700 --zoom 10,51,3   … 経度10・緯度51 を中心に3倍拡大
// 事前に npm run data（atlas.json の生成）を済ませておくこと。

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  const { execSync } = await import("node:child_process");
  const g = execSync("npm root -g").toString().trim();
  ({ chromium } = require(path.join(g, "playwright")));
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const outDir = opt("--out", ".cache/snapshots");
const zoomArg = opt("--zoom", null);
const polity = opt("--polity", null);
const [w, h] = opt("--size", "1400x1000").split("x").map(Number);
const debug = flag("--debug");
const years = args.map(Number).filter(Number.isFinite);
if (!years.length) {
  console.error("年を指定してください");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 0, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const addr = server.httpServer.address();
const base = `http://127.0.0.1:${addr.port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
for (const y of years) {
  const hash = new URLSearchParams({ y: String(y) });
  if (polity) hash.set("p", polity);
  // ハッシュだけの変更では再読み込みされないので、一度空ページを挟む
  await page.goto("about:blank");
  // 表示範囲（data/meta.yaml）の外の年も確認できるよう、範囲を広げて開く
  const q = new URLSearchParams({ range: "476-2030" });
  if (debug) q.set("debug", "pieces");
  await page.goto(`${base}?${q}#${hash}`);
  await page.waitForSelector("body.ready", { timeout: 30000 });
  if (zoomArg) {
    const [lon, lat, k] = zoomArg.split(",").map(Number);
    await page.evaluate(([lon, lat, k]) => window.__atlas?.zoomTo(lon, lat, k), [lon, lat, k]);
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(300);
  const file = path.join(outDir, `map_${y}${zoomArg ? "_zoom" : ""}${polity ? "_" + polity : ""}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
await server.close();
