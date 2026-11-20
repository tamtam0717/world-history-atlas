// data/ 以下の YAML（政体・地域・出来事）を検証し、public/data/atlas.json にまとめる。
// 使い方: node tools/build_data.mjs [--strict]
//   --strict: 警告があれば終了コード 1（CI 用）

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const OUT = path.join(ROOT, "public", "data", "atlas.json");
const strict = process.argv.includes("--strict");
const argVal = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1];
};
// --missing 1648,1700 [--iso DEU,AUT] : 指定した年にデータのないピースを一覧する
const missingYears = argVal("--missing")?.split(",").map(Number) ?? null;
const missingIso = argVal("--iso")?.split(",") ?? null;

const warnings = [];
const warn = (msg) => warnings.push(msg);

function loadDir(dir) {
  const full = path.join(DATA, dir);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const f of fs.readdirSync(full).sort()) {
    if (!/\.ya?ml$/.test(f)) continue;
    let docs;
    try {
      docs = YAML.parse(fs.readFileSync(path.join(full, f), "utf8")) ?? [];
    } catch (e) {
      // 書きかけのファイルがあっても他のデータは確認できるように、読み飛ばして警告にする
      warn(`${dir}/${f}: YAML の書式エラーのため読み飛ばしました: ${String(e.message).split("\n")[0]}`);
      continue;
    }
    if (!Array.isArray(docs)) throw new Error(`${dir}/${f}: 先頭はリスト（- で始まる項目）にしてください`);
    for (const d of docs) out.push({ ...d, _file: `${dir}/${f}` });
  }
  return out;
}

// ---- ピース ----
const tsv = fs.readFileSync(path.join(DATA, "generated", "pieces.tsv"), "utf8").trim().split("\n");
const header = tsv.shift().split("\t");
const pieces = tsv.map((l) => Object.fromEntries(l.split("\t").map((v, i) => [header[i], v])));
const pieceIndex = new Map(pieces.map((p, i) => [p.id, i]));
const byIso = new Map();
const byAdm1 = new Map();
const byAdm2 = new Map();
for (const [i, p] of pieces.entries()) {
  if (p.adm2) {
    const k2 = `${p.iso}/${p.adm2}`;
    if (!byAdm2.has(k2)) byAdm2.set(k2, []);
    byAdm2.get(k2).push(i);
  }
  if (!byIso.has(p.iso)) byIso.set(p.iso, []);
  byIso.get(p.iso).push(i);
  const k = `${p.iso}/${p.adm1}`;
  if (!byAdm1.has(k)) byAdm1.set(k, []);
  byAdm1.get(k).push(i);
}

// ---- 政体 ----
const polities = loadDir("polities");
const polityIds = new Map();
for (const p of polities) {
  if (!p.id || !p.name) throw new Error(`${p._file}: 政体には id と name が必要です`);
  if (polityIds.has(p.id)) throw new Error(`政体 ID の重複: ${p.id}`);
  polityIds.set(p.id, polityIds.size);
}
const checkPolity = (id, where) => {
  if (id == null) return;
  if (!polityIds.has(id)) warn(`${where}: 未定義の政体 "${id}"`);
};

// ---- 地域 ----
const regions = loadDir("regions");
const regionById = new Map();
for (const r of regions) {
  if (!r.id) throw new Error(`${r._file}: 地域に id がありません`);
  if (regionById.has(r.id)) throw new Error(`地域 ID の重複: ${r.id}`);
  regionById.set(r.id, r);
}

const resolving = new Set();
const resolved = new Map();
function resolveRegion(id, where) {
  if (resolved.has(id)) return resolved.get(id);
  const r = regionById.get(id);
  if (!r) {
    warn(`${where}: 未定義の地域 "${id}"`);
    return new Set();
  }
  if (resolving.has(id)) throw new Error(`地域の循環参照: ${id}`);
  resolving.add(id);
  const sel = r.select ?? {};
  const set = new Set();
  const where2 = `${r._file} の ${id}`;
  for (const iso of sel.iso ?? []) {
    const l = byIso.get(iso);
    if (!l) warn(`${where2}: ピースのない国コード "${iso}"`);
    for (const i of l ?? []) set.add(i);
  }
  for (const k of sel.adm1 ?? []) {
    const l = byAdm1.get(k);
    if (!l) warn(`${where2}: 該当のない adm1 "${k}"`);
    for (const i of l ?? []) set.add(i);
  }
  for (const k of sel.adm2 ?? []) {
    const l = byAdm2.get(k);
    if (!l) warn(`${where2}: 該当のない adm2 "${k}"`);
    for (const i of l ?? []) set.add(i);
  }
  for (const pid of sel.pieces ?? []) {
    const i = pieceIndex.get(pid);
    if (i == null) warn(`${where2}: 未定義のピース "${pid}"`);
    else set.add(i);
  }
  for (const rid of sel.regions ?? []) for (const i of resolveRegion(rid, where2)) set.add(i);
  for (const rid of sel.exclude_regions ?? []) for (const i of resolveRegion(rid, where2)) set.delete(i);
  for (const pid of sel.exclude ?? []) {
    const i = pieceIndex.get(pid);
    if (i == null) warn(`${where2}: 除外指定に未定義のピース "${pid}"`);
    else set.delete(i);
  }
  if (set.size === 0) warn(`${where2}: ピースが1つもありません`);
  resolving.delete(id);
  resolved.set(id, set);
  return set;
}
for (const r of regions) resolveRegion(r.id, r._file);

const CERTAINTY = ["certain", "uncertain", "nominal", "occupied"];
for (const r of regions) {
  let prev = -Infinity;
  for (const e of r.timeline ?? []) {
    const where = `${r._file} の ${r.id}（${e.from}年）`;
    if (typeof e.from !== "number") warn(`${where}: from（開始年）は数値で書いてください`);
    if (e.from <= prev) warn(`${where}: timeline は年の昇順で、同じ年を重ねないでください`);
    prev = e.from;
    checkPolity(e.owner, where);
    checkPolity(e.overlord, where);
    if (e.certainty && !CERTAINTY.includes(e.certainty)) warn(`${where}: certainty は ${CERTAINTY.join(" / ")} のいずれか`);
  }
}

// ---- ピースごとの所属の変遷を確定する ----
// 同じピースを含む地域が複数あるときは、その年に有効な記述を持つ「いちばん小さい地域」を優先する。
const regionsOfPiece = pieces.map(() => []);
const timelineRegions = regions.filter((r) => (r.timeline ?? []).length > 0);
for (const r of timelineRegions) for (const i of resolved.get(r.id)) regionsOfPiece[i].push(r);
for (const list of regionsOfPiece) list.sort((a, b) => resolved.get(a.id).size - resolved.get(b.id).size);

const regionIdx = new Map(timelineRegions.map((r, i) => [r.id, i]));
const entryAt = (r, year) => {
  let cur = null;
  for (const e of r.timeline) if (e.from <= year) cur = e;
  return cur;
};
const pieceTimelines = regionsOfPiece.map((list) => {
  if (list.length === 0) return [];
  const years = [...new Set(list.flatMap((r) => r.timeline.map((e) => e.from)))].sort((a, b) => a - b);
  const out = [];
  let last = "";
  for (const y of years) {
    let state = null;
    for (const r of list) {
      const e = entryAt(r, y);
      if (e) {
        state = [
          y,
          e.owner == null ? -1 : polityIds.get(e.owner) ?? -1,
          e.overlord == null ? -1 : polityIds.get(e.overlord) ?? -1,
          CERTAINTY.indexOf(e.certainty ?? "certain"),
          regionIdx.get(r.id),
        ];
        break;
      }
    }
    if (!state) continue;
    const key = state.slice(1).join(",");
    if (key !== last) out.push(state);
    last = key;
  }
  return out;
});

// ---- 出来事 ----
const events = loadDir("events");
for (const e of events) {
  const where = `${e._file} の「${e.title}」`;
  if (typeof e.year !== "number") warn(`${where}: year が数値ではありません`);
  for (const p of e.polities ?? []) checkPolity(p, where);
}
events.sort((a, b) => a.year - b.year || String(a.date ?? "").localeCompare(String(b.date ?? "")));

// ---- 出力 ----
const strip = ({ _file, ...rest }) => rest;
const meta = YAML.parse(fs.readFileSync(path.join(DATA, "meta.yaml"), "utf8"));
const atlas = {
  generated: new Date().toISOString(),
  range: meta.range,
  certainty: CERTAINTY,
  pieceIds: pieces.map((p) => p.id),
  polities: polities.map(strip),
  regions: timelineRegions.map((r) => ({ id: r.id, name: r.name, timeline: r.timeline })),
  pieceTimelines,
  events: events.map(strip),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(atlas));

const covered = pieceTimelines.filter((t) => t.length > 0).length;
console.log(
  `政体 ${polities.length} / 地域 ${regions.length}（変遷あり ${timelineRegions.length}） / 出来事 ${events.length} / ピース ${covered}/${pieces.length} にデータあり`,
);
for (const w of warnings) console.warn("警告: " + w);
if (missingYears) {
  for (const y of missingYears) {
    const miss = pieces.filter((p, i) => {
      if (missingIso && !missingIso.includes(p.iso)) return false;
      return !pieceTimelines[i].some((s) => s[0] <= y);
    });
    console.log(`\n${y}年にデータのないピース: ${miss.length}`);
    const byGroup = new Map();
    for (const p of miss) {
      const k = `${p.iso}/${p.adm1}`;
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k).push(p.id);
    }
    for (const [k, ids] of byGroup) console.log(`  ${k}（${ids.length}）: ${ids.slice(0, 12).join(" ")}${ids.length > 12 ? " …" : ""}`);
  }
}
if (strict && warnings.length) process.exit(1);
