// data/ 以下の YAML（政体・地域・出来事）を検証し、public/data/atlas.json にまとめる。
// 使い方: node tools/build_data.mjs [--strict] [--missing 年,...] [--religion-missing 年,...] [--language-missing 年,...] [--iso DEU,...]
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
// --religion-missing 1650,1750 [--iso DEU,AUT] : 指定した年に宗教データのないピースを一覧する
const relMissingYears = argVal("--religion-missing")?.split(",").map(Number) ?? null;
// --language-missing 1650,1750 [--iso DEU,AUT] : 指定した年に言語データのないピースを一覧する
const langMissingYears = argVal("--language-missing")?.split(",").map(Number) ?? null;

const warnings = [];
const warn = (msg) => warnings.push(msg);

function loadDir(dir) {
  const full = path.join(DATA, dir);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const f of fs.readdirSync(full).sort()) {
    if (!/\.ya?ml$/.test(f)) continue;
    if (f.startsWith("_")) continue; // _kinds.yaml など、地域の一覧ではないファイル
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
// select の iso：国全体のピース。ただし、ヨーロッパの範囲（zone=eu）にかかる国は範囲内のピースだけ
// （全世界に広げる前に書いたデータの意味を変えないため。範囲外まで含めるときは iso_all を使う）
const byIso = new Map();
const byIsoAll = new Map();
const byAdm1 = new Map();
const byAdm2 = new Map();
const euIsos = new Set(pieces.filter((p) => (p.zone ?? "eu") === "eu").map((p) => p.iso));
for (const [i, p] of pieces.entries()) {
  if (p.adm2) {
    const k2 = `${p.iso}/${p.adm2}`;
    if (!byAdm2.has(k2)) byAdm2.set(k2, []);
    byAdm2.get(k2).push(i);
  }
  if (!byIsoAll.has(p.iso)) byIsoAll.set(p.iso, []);
  byIsoAll.get(p.iso).push(i);
  if ((p.zone ?? "eu") === "eu" || !euIsos.has(p.iso)) {
    if (!byIso.has(p.iso)) byIso.set(p.iso, []);
    byIso.get(p.iso).push(i);
  }
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
  for (const iso of sel.iso_all ?? []) {
    const l = byIsoAll.get(iso);
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

// ---- 宗教（data/religion）・言語（data/language） ----
// 地域の書き方は政治の地域と同じ。select の regions: にはその分布の地域 ID も政治の地域 ID も使える
// （同じ ID があればその分布の地域を優先）。重なりは「その年に有効な記述を持つ、いちばん小さい地域」が優先。
// ファイル名が _ で始まるもの（_kinds.yaml）は地域として読まない。
function buildDistribution(dir, label) {
  const kindsFile = path.join(DATA, dir, "_kinds.yaml");
  let kinds = [];
  if (fs.existsSync(kindsFile)) {
    try {
      kinds = YAML.parse(fs.readFileSync(kindsFile, "utf8")) ?? [];
    } catch (e) {
      warn(`${dir}/_kinds.yaml: YAML の書式エラー: ${String(e.message).split("\n")[0]}`);
    }
  }
  const kindIdx = new Map();
  for (const [i, k] of kinds.entries()) {
    if (!k.id) warn(`${dir}/_kinds.yaml: ${i + 1} 番目に id がありません`);
    else if (kindIdx.has(k.id)) warn(`${dir}/_kinds.yaml: ID の重複 "${k.id}"`);
    else kindIdx.set(k.id, i);
    if (!k.color) warn(`${dir}/_kinds.yaml: ${k.id} に color がありません`);
  }
  const regs = loadDir(dir);
  const byId = new Map();
  for (const r of regs) {
    if (!r.id) throw new Error(`${r._file}: ${label}の地域に id がありません`);
    if (byId.has(r.id)) throw new Error(`${label}の地域 ID の重複: ${r.id}`);
    byId.set(r.id, r);
  }
  const resolving = new Set();
  const done = new Map();
  const resolveAny = (id, where) => {
    if (byId.has(id)) return resolveOwn(id, where);
    if (regionById.has(id)) return resolveRegion(id, where);
    warn(`${where}: 未定義の地域 "${id}"（${label}の地域にも政治の地域にもありません）`);
    return new Set();
  };
  function resolveOwn(id, where) {
    if (done.has(id)) return done.get(id);
    const r = byId.get(id);
    if (resolving.has(id)) throw new Error(`${label}の地域の循環参照: ${id}`);
    resolving.add(id);
    const sel = r.select ?? {};
    const set = new Set();
    const where2 = `${r._file} の ${id}`;
    for (const iso of sel.iso ?? []) {
      const l = byIso.get(iso);
      if (!l) warn(`${where2}: ピースのない国コード "${iso}"`);
      for (const i of l ?? []) set.add(i);
    }
    for (const iso of sel.iso_all ?? []) {
      const l = byIsoAll.get(iso);
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
    for (const rid of sel.regions ?? []) for (const i of resolveAny(rid, where2)) set.add(i);
    for (const rid of sel.exclude_regions ?? []) for (const i of resolveAny(rid, where2)) set.delete(i);
    for (const pid of sel.exclude ?? []) {
      const i = pieceIndex.get(pid);
      if (i == null) warn(`${where2}: 除外指定に未定義のピース "${pid}"`);
      else set.delete(i);
    }
    if (set.size === 0) warn(`${where2}: ピースが1つもありません`);
    resolving.delete(id);
    done.set(id, set);
    return set;
  }
  for (const r of regs) resolveOwn(r.id, r._file);
  for (const r of regs) {
    let prev = -Infinity;
    for (const e of r.timeline ?? []) {
      const where = `${r._file} の ${r.id}（${e.from}年）`;
      if (typeof e.from !== "number") warn(`${where}: from（開始年）は数値で書いてください`);
      if (e.from <= prev) warn(`${where}: timeline は年の昇順で、同じ年を重ねないでください`);
      prev = e.from;
      if (e.main == null) warn(`${where}: main（多数派）がありません`);
      else if (!kindIdx.has(e.main)) warn(`${where}: main "${e.main}" は ${dir}/_kinds.yaml にない${label}です`);
      if (e.minor != null && !kindIdx.has(e.minor)) warn(`${where}: minor "${e.minor}" は ${dir}/_kinds.yaml にない${label}です`);
      if (e.minor != null && e.minor === e.main) warn(`${where}: minor が main と同じです`);
    }
  }
  const tlRegions = regs.filter((r) => (r.timeline ?? []).length > 0);
  const rIdx = new Map(tlRegions.map((r, i) => [r.id, i]));
  const ofPiece = pieces.map(() => []);
  for (const r of tlRegions) for (const i of done.get(r.id)) ofPiece[i].push(r);
  for (const list of ofPiece) list.sort((a, b) => done.get(a.id).size - done.get(b.id).size);
  const pieceTl = ofPiece.map((list) => {
    if (list.length === 0) return [];
    const years = [...new Set(list.flatMap((r) => r.timeline.map((e) => e.from)))].sort((a, b) => a - b);
    const out = [];
    let last = "";
    for (const y of years) {
      let state = null;
      for (const r of list) {
        const e = entryAt(r, y);
        if (e) {
          state = [y, kindIdx.get(e.main) ?? -1, e.minor == null ? -1 : (kindIdx.get(e.minor) ?? -1), rIdx.get(r.id)];
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
  return {
    allRegions: regs,
    tlRegions,
    out: {
      kinds: kinds.map((k) => (k.family ? { id: k.id, name: k.name, family: k.family, color: k.color } : { id: k.id, name: k.name, color: k.color })),
      regions: tlRegions.map((r) => ({ id: r.id, name: r.name, timeline: r.timeline })),
      pieceTimelines: pieceTl,
    },
  };
}
const rel = buildDistribution("religion", "宗教");
const religion = rel.out;
const relPieceTimelines = religion.pieceTimelines;
const relRegions = rel.allRegions;
const relTimelineRegions = rel.tlRegions;
const lang = buildDistribution("language", "言語");
const language = lang.out;

// ---- 潮流（data/movements、docs/movements-format.md） ----
const MOVEMENT_KINDS = ["thought", "art", "religion", "system"];
const movementsRaw = loadDir("movements");
const movementIds = new Set();
const checkCurve = (c, where) => {
  if (!Array.isArray(c) || c.length === 0) {
    warn(`${where}: curve がありません`);
    return [];
  }
  let prev = -Infinity;
  for (const pt of c) {
    if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== "number" || typeof pt[1] !== "number") {
      warn(`${where}: curve の点は [年, 強さ] の形で書いてください（${JSON.stringify(pt)}）`);
      continue;
    }
    if (pt[0] <= prev) warn(`${where}: curve の年は昇順で、同じ年を重ねないでください（${pt[0]}）`);
    if (pt[1] < 0 || pt[1] > 1) warn(`${where}: curve の強さは 0〜1 で書いてください（${pt[0]}年 ${pt[1]}）`);
    prev = pt[0];
  }
  return c.filter((pt) => Array.isArray(pt) && pt.length === 2);
};
const eventTitles = new Set(events.map((e) => e.title));
const movements = [];
for (const m of movementsRaw) {
  const where = `${m._file} の ${m.id ?? "(id なし)"}`;
  if (!m.id || !m.name) {
    warn(`${where}: 潮流には id と name が必要です`);
    continue;
  }
  if (movementIds.has(m.id)) {
    warn(`${where}: 潮流 ID の重複 "${m.id}"`);
    continue;
  }
  movementIds.add(m.id);
  if (!MOVEMENT_KINDS.includes(m.kind)) warn(`${where}: kind は ${MOVEMENT_KINDS.join(" / ")} のいずれか（"${m.kind}"）`);
  const curve = checkCurve(m.curve, where);
  const spread = [];
  for (const [i, s] of (m.spread ?? []).entries()) {
    const w = `${where} の spread ${i + 1} 番目`;
    const pol = s.where?.polities ?? [];
    const reg = s.where?.regions ?? [];
    if (!pol.length && !reg.length) warn(`${w}: where に polities か regions を書いてください`);
    for (const p of pol) checkPolity(p, w);
    const regionsOk = [];
    for (const r of reg) {
      if (!regionById.has(r)) warn(`${w}: 未定義の地域 "${r}"`);
      else regionsOk.push(r);
    }
    spread.push({
      polities: pol.filter((p) => polityIds.has(p)),
      regions: regionsOk,
      center: !!s.center,
      curve: checkCurve(s.curve, w),
    });
  }
  for (const t of m.events ?? []) if (!eventTitles.has(t)) warn(`${where}: 出来事「${t}」が data/events にありません（題名が一致しません）`);
  const { _file, curve: _c, spread: _s, ...rest } = m;
  movements.push({ ...rest, curve, spread });
}
// spread の regions は政治の地域のピースで解決する（画面で使うためピース index の一覧を出力）
const movementRegions = {};
for (const m of movements) for (const s of m.spread) for (const r of s.regions) {
  if (!(r in movementRegions)) movementRegions[r] = [...resolveRegion(r, "movements")].sort((a, b) => a - b);
}

// ---- 出力 ----
const strip = ({ _file, ...rest }) => rest;
const meta = YAML.parse(fs.readFileSync(path.join(DATA, "meta.yaml"), "utf8"));

// ---- 海の名前・節目・都市 ----
const readYaml = (f) => (fs.existsSync(path.join(DATA, f)) ? YAML.parse(fs.readFileSync(path.join(DATA, f), "utf8")) ?? [] : []);
const seas = readYaml("seas.yaml");
const milestones = readYaml("milestones.yaml").sort((a, b) => a.year - b.year);
const cities = readYaml("cities.yaml");
{
  const seen = new Set();
  for (const c of cities) {
    if (seen.has(c.id)) warn(`cities.yaml: 都市 ID の重複 "${c.id}"`);
    seen.add(c.id);
    if (typeof c.lon !== "number" || typeof c.lat !== "number") warn(`cities.yaml: ${c.id} の座標がありません`);
    for (const k of c.capital ?? []) checkPolity(k.polity, `cities.yaml の ${c.id}`);
  }
}
const modernCitiesFile = path.join(DATA, "generated", "cities_modern.json");
const citiesModern = fs.existsSync(modernCitiesFile) ? JSON.parse(fs.readFileSync(modernCitiesFile, "utf8")) : [];
const atlas = {
  generated: new Date().toISOString(),
  range: meta.range,
  certainty: CERTAINTY,
  pieceIds: pieces.map((p) => p.id),
  polities: polities.map(strip),
  regions: timelineRegions.map((r) => ({ id: r.id, name: r.name, timeline: r.timeline })),
  pieceTimelines,
  events: events.map(strip),
  seas,
  milestones,
  cities,
  citiesModern,
  religion,
  language,
  movements,
  movementRegions,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(atlas));

const covered = pieceTimelines.filter((t) => t.length > 0).length;
console.log(
  `政体 ${polities.length} / 地域 ${regions.length}（変遷あり ${timelineRegions.length}） / 出来事 ${events.length} / ピース ${covered}/${pieces.length} にデータあり`,
);
console.log(
  `宗教：地域 ${relRegions.length}（変遷あり ${relTimelineRegions.length}） / ピース ${relPieceTimelines.filter((t) => t.length > 0).length}/${pieces.length} にデータあり`,
);
console.log(
  `言語：地域 ${lang.allRegions.length}（変遷あり ${lang.tlRegions.length}） / ピース ${language.pieceTimelines.filter((t) => t.length > 0).length}/${pieces.length} にデータあり`,
);
console.log(`潮流：${movements.length}`);
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
function reportMissing(years, tls, label) {
  for (const y of years) {
    const miss = pieces.filter((p, i) => {
      if (missingIso && !missingIso.includes(p.iso)) return false;
      return !tls[i].some((s) => s[0] <= y);
    });
    console.log(`\n${y}年に${label}データのないピース: ${miss.length}`);
    const byGroup = new Map();
    for (const p of miss) {
      const k = `${p.iso}/${p.adm1}`;
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k).push(p.id);
    }
    for (const [k, ids] of byGroup) console.log(`  ${k}（${ids.length}）: ${ids.slice(0, 12).join(" ")}${ids.length > 12 ? " …" : ""}`);
  }
}
if (relMissingYears) reportMissing(relMissingYears, relPieceTimelines, "宗教");
if (langMissingYears) reportMissing(langMissingYears, language.pieceTimelines, "言語");
if (strict && warnings.length) process.exit(1);
