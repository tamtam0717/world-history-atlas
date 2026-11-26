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

// 手で書く画像（images: [{ file, caption }]。docs/data-format.md の「画像」）。
// file は Wikimedia Commons のファイル名。"File:"・"ファイル:" の接頭辞と "_" はそろえる。文字列だけでも書ける（caption なし）
const normImages = (obj, where) => {
  if (obj?.images == null) return;
  const arr = Array.isArray(obj.images) ? obj.images : [obj.images];
  const out = [];
  arr.forEach((x, i) => {
    const raw = typeof x === "string" ? { file: x } : x;
    let file = typeof raw?.file === "string" ? raw.file : "";
    file = file.replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\//i, "").replace(/^(file|image|ファイル|画像)\s*:/i, "").replace(/_/g, " ").trim();
    try {
      if (/%[0-9A-F]{2}/i.test(file)) file = decodeURIComponent(file);
    } catch {
      /* そのまま */
    }
    if (!file || !/\.[a-z0-9]{3,4}$/i.test(file)) {
      warn(`${where}: images[${i}] の file はファイル名（例 "Anonymous - Prise de la Bastille.jpg"）で書いてください`);
      return;
    }
    if (raw.caption != null && typeof raw.caption !== "string") warn(`${where}: images[${i}] の caption は文字列で書いてください`);
    out.push(raw.caption ? { file, caption: String(raw.caption) } : { file });
  });
  if (out.length) obj.images = out;
  else delete obj.images;
};

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
  // 君主（rulers）と情勢（periods）の取り違え：君主の項目が periods の下に入ると、パネルに君主が出ない
  (p.periods ?? []).forEach((x, i) => {
    if (x?.text == null) warn(`${p._file} の ${p.id}: periods[${i}]（${x?.from ?? "?"}–）に text がありません`);
    if (x?.name != null) warn(`${p._file} の ${p.id}: periods[${i}] に name "${x.name}" があります（君主なら rulers の下へ）`);
  });
  (p.periods ?? []).forEach((x, i) => normImages(x, `${p._file} の ${p.id}: periods[${i}]`));
  (p.rulers ?? []).forEach((x, i) => {
    if (x?.name == null) warn(`${p._file} の ${p.id}: rulers[${i}]（${x?.from ?? "?"}–）に name がありません（情勢なら periods の下へ）`);
  });
}
const checkPolity = (id, where) => {
  if (id == null) return;
  if (!polityIds.has(id)) warn(`${where}: 未定義の政体 "${id}"`);
};
// 本国（home_iso。docs/movements-format.md）：潮流の spread が既定で光らせる範囲。政体 ID → [[from, to, ピース index の一覧], ...]
// 項目は ISO コード（"GBR"）か {iso, from, to}（from・to は年。両端を含み、どちらも省略可）。ISO はその国の全ピース（iso_all と同じ）
const polityHome = {};
for (const p of polities) {
  if (p.home_iso == null) continue;
  const where = `${p._file} の ${p.id} の home_iso`;
  if (!Array.isArray(p.home_iso) || p.home_iso.length === 0) {
    warn(`${where}: ISO コードのリストで書いてください`);
    continue;
  }
  const groups = new Map();
  for (const h of p.home_iso) {
    const e = typeof h === "string" ? { iso: h } : h;
    if (!e || typeof e.iso !== "string" || (e.from != null && typeof e.from !== "number") || (e.to != null && typeof e.to !== "number")) {
      warn(`${where}: 項目は ISO コードか {iso, from, to}（from・to は年の数値、省略可）で書いてください（${JSON.stringify(h)}）`);
      continue;
    }
    const l = byIsoAll.get(e.iso);
    if (!l) {
      warn(`${where}: ピースのない国コード "${e.iso}"`);
      continue;
    }
    const k = `${e.from ?? ""}|${e.to ?? ""}`;
    if (!groups.has(k)) groups.set(k, [e.from ?? null, e.to ?? null, []]);
    groups.get(k)[2].push(...l);
  }
  polityHome[p.id] = [...groups.values()].map(([f, t, l]) => [f, t, [...new Set(l)].sort((a, b) => a - b)]);
}

// ---- 地域 ----
const regions = loadDir("regions");
const regionById = new Map();
for (const r of regions) {
  if (!r.id) throw new Error(`${r._file}: 地域に id がありません`);
  if (regionById.has(r.id)) throw new Error(`地域 ID の重複: ${r.id}`);
  regionById.set(r.id, r);
  // 時期による地域名（names: [{from, to, name}]。範囲外は name）。20世紀の「国境の変化」で近世の名前が出ないようにする
  if (r.names != null) {
    if (!Array.isArray(r.names)) warn(`${r._file} の ${r.id}: names はリストで書いてください`);
    else
      for (const n of r.names)
        if (!n || typeof n.name !== "string" || (n.from != null && typeof n.from !== "number") || (n.to != null && typeof n.to !== "number"))
          warn(`${r._file} の ${r.id}: names の項目は {from, to, name}（from・to は年の数値、どちらか省略可）で書いてください`);
  }
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

// 末尾に足していく（atlas.json のピースの状態は、この配列の番号で持つ）
const CERTAINTY = ["certain", "uncertain", "nominal", "occupied", "indirect"];
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
// 地域の until（その年まで有効。1648 年より前だけの区分けなど）：until を過ぎたら、その地域は無いものとして外側の地域が効く
for (const r of timelineRegions) if (r.until != null && typeof r.until !== "number") warn(`地域 ${r.id}: until は年（数値）で書いてください`);
const polEntryAt = (r, y) => (typeof r.until === "number" && y > r.until ? null : entryAt(r, y));
const pieceTimelines = regionsOfPiece.map((list) => {
  if (list.length === 0) return [];
  const years = [...new Set(list.flatMap((r) => [...r.timeline.map((e) => e.from), ...(typeof r.until === "number" ? [r.until + 1] : [])]))].sort((a, b) => a - b);
  const out = [];
  let last = "";
  for (const y of years) {
    let state = null;
    for (const r of list) {
      const e = polEntryAt(r, y);
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

// ---- 植民地（data/colonies。docs/data-format.md の「植民地」） ----
// 宗主国（parent）の色で塗る土地のうち、どの副ラベル（label）・地域・国のピースをひとつの植民地とみなすかと、その説明。
// 画面では、副ラベルの出ている所を押すと植民地を選んだ状態になる（データのない植民地も、副ラベル単位で選べる）
const colonyRaw = loadDir("colonies");
const colonies = [];
const colonyIds = new Set();
{
  // 実際に使われている (owner, 副ラベルの1行目) の組（match の書き間違いの検出用）
  const usedLabels = new Map(); // owner → Set(label)
  for (const r of regions)
    for (const e of r.timeline ?? []) {
      if (!e.label || !e.owner) continue;
      if (!usedLabels.has(e.owner)) usedLabels.set(e.owner, new Set());
      const set = usedLabels.get(e.owner);
      set.add(e.label);
      set.add(e.label.split("\n")[0]);
    }
  const MATCH_KEYS = ["labels", "contains", "exclude_labels", "exclude_certainty", "regions", "iso"];
  for (const c of colonyRaw) {
    const where = `${c._file} の ${c.id ?? "(id なし)"}`;
    if (!c.id || !c.name || !c.parent) {
      warn(`${where}: 植民地には id・name・parent が必要です`);
      continue;
    }
    if (colonyIds.has(c.id) || polityIds.has(c.id)) {
      warn(`${where}: ID "${c.id}" が重複しています（植民地どうし、または政体の ID と）`);
      continue;
    }
    colonyIds.add(c.id);
    checkPolity(c.parent, where);
    for (const p of c.polities ?? []) checkPolity(p, `${where} の polities`);
    const m = c.match ?? {};
    for (const k of Object.keys(m)) if (!MATCH_KEYS.includes(k)) warn(`${where}: match の "${k}" は使えません（${MATCH_KEYS.join(" / ")}）`);
    if (!m.labels?.length && !m.contains?.length && !m.regions?.length && !m.iso?.length)
      warn(`${where}: match に labels・contains・regions・iso のどれかを書いてください`);
    const used = usedLabels.get(c.parent) ?? new Set();
    for (const l of [...(m.labels ?? []), ...(m.exclude_labels ?? [])])
      if (!used.has(l)) warn(`${where}: 副ラベル「${l}」は owner: ${c.parent} の地域に見つかりません`);
    for (const l of m.contains ?? []) if (![...used].some((x) => x.includes(l))) warn(`${where}: 「${l}」を含む副ラベルは owner: ${c.parent} の地域に見つかりません`);
    for (const x of m.exclude_certainty ?? []) if (!CERTAINTY.includes(x)) warn(`${where}: exclude_certainty の "${x}" は ${CERTAINTY.join(" / ")} のいずれか`);
    if (c.from != null && typeof c.from !== "number") warn(`${where}: from は年（数値）で書いてください`);
    if (c.to != null && typeof c.to !== "number") warn(`${where}: to は年（数値）で書いてください`);
    const set = new Set();
    for (const rid of m.regions ?? []) for (const i of resolveRegion(rid, where)) set.add(i);
    for (const iso of m.iso ?? []) {
      const l = byIsoAll.get(iso);
      if (!l) warn(`${where}: ピースのない国コード "${iso}"`);
      for (const i of l ?? []) set.add(i);
    }
    (c.periods ?? []).forEach((x, i) => {
      if (x?.text == null) warn(`${where}: periods[${i}]（${x?.from ?? "?"}–）に text がありません`);
      if (x?.name != null) warn(`${where}: periods[${i}] に name "${x.name}" があります（総督なら governors の下へ）`);
      normImages(x, `${where}: periods[${i}]`);
    });
    (c.governors ?? []).forEach((x, i) => {
      if (x?.name == null) warn(`${where}: governors[${i}]（${x?.from ?? "?"}–）に name がありません`);
      if (typeof x?.from !== "number") warn(`${where}: governors[${i}] の from は年（数値）で書いてください`);
    });
    normImages(c, where);
    const { _file, match, ...rest } = c;
    const outMatch = {};
    for (const k of ["labels", "contains", "exclude_labels", "exclude_certainty"]) if (m[k]?.length) outMatch[k] = m[k];
    colonies.push({ ...rest, match: outMatch, ...(set.size ? { pieces: [...set].sort((a, b) => a - b) } : {}) });
  }
}

// ---- 出来事 ----
const events = loadDir("events");
for (const e of events) {
  const where = `${e._file} の「${e.title}」`;
  if (typeof e.year !== "number") warn(`${where}: year が数値ではありません`);
  // 関係する政体には、植民地の ID（data/colonies）も書ける（その植民地を選んだときに、植民地の出来事として先頭に出る）
  for (const p of e.polities ?? []) if (!colonyIds.has(p)) checkPolity(p, where);
  normImages(e, where);
  // 任意の場所：lon・lat、または at: [経度, 緯度]。書かれていれば代表点として最優先する
  if (e.at != null || e.lon != null || e.lat != null) {
    if (e.at != null && (e.lon != null || e.lat != null)) warn(`${where}: 場所は at か lon・lat のどちらか一方で書いてください`);
    const [lon, lat] = e.at != null ? (Array.isArray(e.at) && e.at.length === 2 ? e.at : [NaN, NaN]) : [e.lon, e.lat];
    if (typeof lon !== "number" || typeof lat !== "number" || !(lon >= -180 && lon <= 180) || !(lat >= -90 && lat <= 90)) {
      warn(`${where}: 場所（at / lon・lat）は [経度, 緯度] の数値で、経度 -180〜180・緯度 -90〜90 にしてください`);
    } else e._at = [lon, lat];
  }
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
  // 世俗化だけの地域（宗教のみ）：timeline のどの項目にも main がなく secular だけがあるもの。
  // 多数派の判定には使わず、世俗化の割合だけを重ねる（data/religion/secular.yaml）
  const secularOnly = (r) => dir === "religion" && (r.timeline ?? []).length > 0 && r.timeline.every((e) => e.main == null && e.secular != null);
  for (const r of regs) {
    let prev = -Infinity;
    const secOnly = secularOnly(r);
    if (r.until != null && (typeof r.until !== "number" || (r.timeline ?? []).some((e) => e.from > r.until)))
      warn(`${r._file} の ${r.id}: until（この年まで有効）は数値で、timeline のすべての項目の年以上にしてください`);
    for (const e of r.timeline ?? []) {
      const where = `${r._file} の ${r.id}（${e.from}年）`;
      if (typeof e.from !== "number") warn(`${where}: from（開始年）は数値で書いてください`);
      if (e.from <= prev) warn(`${where}: timeline は年の昇順で、同じ年を重ねないでください`);
      prev = e.from;
      if (e.main == null) {
        if (!secOnly) warn(`${where}: main（多数派）がありません（世俗化だけの地域なら、すべての項目を secular だけにしてください）`);
      }
      else if (e.main === "none") {
        // main: none（値なし。無人になった時期など）：その年から、この地域のピースを塗らない
        if (e.minor != null) warn(`${where}: main: none（値なし）の項目に minor は書けません`);
      }
      else if (!kindIdx.has(e.main)) warn(`${where}: main "${e.main}" は ${dir}/_kinds.yaml にない${label}です`);
      if (e.minor != null && !kindIdx.has(e.minor)) warn(`${where}: minor "${e.minor}" は ${dir}/_kinds.yaml にない${label}です`);
      if (e.minor != null && e.minor === e.main) warn(`${where}: minor が main と同じです`);
      if (e.secular != null) {
        if (dir !== "religion") warn(`${where}: secular は宗教のデータだけで使えます`);
        else if (typeof e.secular !== "number" || !(e.secular >= 0 && e.secular <= 1)) warn(`${where}: secular（世俗化の割合）は 0〜1 の数値で書いてください`);
      }
    }
  }
  const tlRegions = regs.filter((r) => (r.timeline ?? []).length > 0 && !secularOnly(r));
  const secRegions = regs.filter(secularOnly);
  const rIdx = new Map(tlRegions.map((r, i) => [r.id, i]));
  const ofPiece = pieces.map(() => []);
  for (const r of tlRegions) for (const i of done.get(r.id)) ofPiece[i].push(r);
  for (const list of ofPiece) list.sort((a, b) => done.get(a.id).size - done.get(b.id).size);
  // 世俗化の割合を引く地域（ふつうの地域と世俗化だけの地域、小さい順）
  const secOfPiece = ofPiece.map((l) => l.slice());
  for (const r of secRegions) for (const i of done.get(r.id)) secOfPiece[i].push(r);
  for (const list of secOfPiece) list.sort((a, b) => done.get(a.id).size - done.get(b.id).size);
  const pieceTl = ofPiece.map((list, pi) => {
    if (list.length === 0) return [];
    const secList = secOfPiece[pi];
    // until（その年まで有効な地域。1648 年より前だけの区分けなど）：until+1 の年にも切り替えを入れる
    const years = [...new Set(secList.flatMap((r) => [...r.timeline.map((e) => e.from), ...(typeof r.until === "number" ? [r.until + 1] : [])]))].sort((a, b) => a - b);
    const out = [];
    let last = "";
    const distEntryAt = (r, y) => (typeof r.until === "number" && y > r.until ? null : entryAt(r, y));
    for (const y of years) {
      let state = null;
      for (const r of list) {
        const e = distEntryAt(r, y);
        if (e) {
          // main: none（値なし）は、データのないピースと同じ [年, -1, -1, -1]（ガラパゴスの 1832 年より前などと同じ表示）
          state = e.main === "none" ? [y, -1, -1, -1] : [y, kindIdx.get(e.main) ?? -1, e.minor == null ? -1 : (kindIdx.get(e.minor) ?? -1), rIdx.get(r.id)];
          break;
        }
      }
      if (!state) continue;
      // 世俗化の割合（宗教のみ）：main とは別に、その年の記述に secular を書いている「いちばん小さい地域」から取る。
      // 小さい地域の記述に secular がなければ、外側の大きい地域の値が効く（secular: 0 と書けば打ち消せる）。
      // 0 より大きいときだけ 5 番目に入れる
      if (dir === "religion" && state[1] >= 0) {
        for (const r of secList) {
          const e = distEntryAt(r, y);
          if (e && typeof e.secular === "number") {
            if (e.secular > 0) state.push(Math.min(1, e.secular));
            break;
          }
        }
      }
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
      // main: none（値なし）は画面では main なし（null）として渡す
      regions: tlRegions.map((r) => ({ id: r.id, name: r.name, timeline: r.timeline.map((e) => (e.main === "none" ? { ...e, main: null } : e)) })),
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
const pseudoRegions = new Map();
for (const m of movementsRaw) {
  const where = `${m._file} の ${m.id ?? "(id なし)"}`;
  normImages(m, where);
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
    const KEYS = ["polities", "regions", "exclude_regions", "include_colonies", "iso", "adm1"];
    for (const k of Object.keys(s.where ?? {})) if (!KEYS.includes(k)) warn(`${w}: where の "${k}" は使えません（${KEYS.join(" / ")}）`);
    const pol = s.where?.polities ?? [];
    const reg = s.where?.regions ?? [];
    const exc = s.where?.exclude_regions ?? [];
    const colonies = s.where?.include_colonies ?? false;
    // iso・adm1（現代の国・州のピース。年や所属に関係なく光る）：政治の地域がまだない所や、植民地の一部だけを光らせたいときに使う。
    // 画面では regions と同じに扱うので、"iso:USA"・"adm1:USA/Virginia" という名前の地域として movementRegions に入れる
    const isoSel = s.where?.iso ?? [];
    const adm1Sel = s.where?.adm1 ?? [];
    const pseudo = [];
    for (const iso of isoSel) {
      if (!byIsoAll.has(iso)) warn(`${w}: ピースのない国コード "${iso}"`);
      else pseudo.push([`iso:${iso}`, byIsoAll.get(iso)]);
    }
    for (const k of adm1Sel) {
      if (!byAdm1.has(k)) warn(`${w}: 該当のない adm1 "${k}"`);
      else pseudo.push([`adm1:${k}`, byAdm1.get(k)]);
    }
    for (const [k, l] of pseudo) pseudoRegions.set(k, l);
    if (!pol.length && !reg.length && !pseudo.length) warn(`${w}: where に polities・regions・iso・adm1 のどれかを書いてください`);
    if (typeof colonies !== "boolean") warn(`${w}: include_colonies は true か false で書いてください`);
    if (colonies === true && !pol.length) warn(`${w}: include_colonies は polities と一緒に使います`);
    for (const p of pol) checkPolity(p, w);
    const okRegions = (list) => {
      const out = [];
      for (const r of list) {
        if (!regionById.has(r)) warn(`${w}: 未定義の地域 "${r}"`);
        else out.push(r);
      }
      return out;
    };
    const regionsOk = okRegions(reg);
    const excludeOk = okRegions(exc);
    spread.push({
      polities: pol.filter((p) => polityIds.has(p)),
      regions: [...regionsOk, ...pseudo.map(([k]) => k)],
      ...(excludeOk.length ? { exclude: excludeOk } : {}),
      ...(colonies === true ? { colonies: true } : {}),
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
for (const m of movements) for (const s of m.spread) for (const r of [...s.regions, ...(s.exclude ?? [])]) {
  if (!(r in movementRegions))
    movementRegions[r] = pseudoRegions.has(r) ? [...new Set(pseudoRegions.get(r))].sort((a, b) => a - b) : [...resolveRegion(r, "movements")].sort((a, b) => a - b);
}

// ---- 出力 ----
const strip = ({ _file, _at, at, lon, lat, ...rest }) => rest;
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
    normImages(c, `cities.yaml の ${c.id}`);
  }
}
const modernCitiesFile = path.join(DATA, "generated", "cities_modern.json");
const citiesModern = fs.existsSync(modernCitiesFile) ? JSON.parse(fs.readFileSync(modernCitiesFile, "utf8")) : [];

// ---- 出来事の場所（右パネルで、地図に映っている地域の出来事を先に並べるため） ----
// 出来事ごとに代表点 pts（[経度, 緯度] の列）を求める。関係する政体ごとに1点：
//   その年の首都（cities.yaml の capital）→ なければ本国（home_iso）の重心 → なければ、その年の領域（ピース）の重心。
// 地域別のファイル（下の FILE_BOX）の出来事は、その地域の中の点を優先する：
//   首都が地域の外なら、その政体の地域内の領土の重心（例：インドの出来事のイギリス → 英領インド）。
//   地域の中の点が1つでもあれば、地域の外の点（例：ペリー来航のワシントン）は捨てる。
const FILE_BOX = {
  // [西, 南, 東, 北]
  "events/china.yaml": [97, 18, 135, 54],
  "events/inner_asia.yaml": [45, 25, 150, 62],
  "events/japan_korea.yaml": [118, 20, 160, 56],
  "events/india_east.yaml": [60, 5, 98, 37],
  "events/india_north.yaml": [60, 5, 98, 37],
  "events/india_south.yaml": [60, 5, 98, 37],
  "events/mainland_sea.yaml": [92, 5, 110, 29],
  "events/maritime_sea.yaml": [94, -11, 142, 21],
  "events/ottoman.yaml": [10, 10, 65, 49],
  "events/usa.yaml": [-180, 15, -60, 72],
  "events/canada.yaml": [-170, 40, -50, 84],
  "events/mexico_caribbean.yaml": [-118, 7, -58, 33],
  "events/andes.yaml": [-82, -24, -50, 13],
  "events/south_cone.yaml": [-76, -56, -34, 6],
  "events/west_africa.yaml": [-26, 3, 16, 28],
  "events/guinea_coast.yaml": [-4, -2, 25, 24],
  "events/east_africa.yaml": [21, -12, 52, 23],
  "events/southern_africa.yaml": [8, -36, 60, 6],
  "events/australasia.yaml": [95, -55, 180, -5],
  "events/pacific.yaml": [125, -30, 180, 25],
};
// 地域別でないファイル（ヨーロッパの各担当）の出来事で、関係国の領土が画面に映っているかを数える範囲。
// 植民地（例：英領インド）が映っているだけで本国の出来事が「範囲内」にならないようにする
const TERRITORY_BOX_DEFAULT = [-32, 27, 66, 72];
/** 出来事の領土判定の範囲（atlas.eventBoxes。出来事の bx はこの番号） */
const eventBoxes = [];
const eventBoxIndex = new Map();
const regionCenter = new Map(); // 地域 ID → [経度, 緯度]（国境の変化の一覧も、地図に映っている地域を先にするため）
{
  const inBox = (b, lon, lat) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
  const capitals = new Map(); // 政体 ID → [{from, to, lon, lat}]
  for (const c of cities) {
    for (const k of c.capital ?? []) {
      if (!capitals.has(k.polity)) capitals.set(k.polity, []);
      capitals.get(k.polity).push({ from: k.from ?? -Infinity, to: k.to ?? Infinity, lon: c.lon, lat: c.lat });
    }
  }
  const capitalAt = (id, y) => {
    const list = capitals.get(id);
    if (!list) return null;
    let best = null;
    let gap = Infinity;
    for (const k of list) {
      const g = y < k.from ? k.from - y : y > k.to ? y - k.to : 0;
      if (g < gap) [best, gap] = [k, g];
    }
    return best ? [best.lon, best.lat] : null;
  };
  const pLon = pieces.map((p) => Number(p.lon));
  const pLat = pieces.map((p) => Number(p.lat));
  const pArea = pieces.map((p) => Math.max(1, Number(p.area_km2) || 1));
  const ownerAt = (i, y) => {
    let o = -1;
    for (const s of pieceTimelines[i]) {
      if (s[0] > y) break;
      o = s[1];
    }
    return o;
  };
  // 政体の、その年の領域の重心（box があればその中だけ）。面積で重みをつけた単位ベクトルの平均
  const cache = new Map();
  const territoryCentroid = (id, y, box) => {
    const pi = polityIds.get(id);
    if (pi == null) return null;
    const key = `${pi}|${y}|${box ?? ""}`;
    if (cache.has(key)) return cache.get(key);
    let x = 0, yy = 0, z = 0, n = 0;
    for (let i = 0; i < pieces.length; i++) {
      if (box && !inBox(box, pLon[i], pLat[i])) continue;
      if (ownerAt(i, y) !== pi) continue;
      const lo = (pLon[i] * Math.PI) / 180, la = (pLat[i] * Math.PI) / 180, w = pArea[i];
      x += w * Math.cos(la) * Math.cos(lo);
      yy += w * Math.cos(la) * Math.sin(lo);
      z += w * Math.sin(la);
      n++;
    }
    const r = n ? [(Math.atan2(yy, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, yy)) * 180) / Math.PI] : null;
    cache.set(key, r);
    return r;
  };
  for (const r of timelineRegions) {
    let x = 0, yy = 0, z = 0;
    for (const i of resolved.get(r.id)) {
      const lo = (pLon[i] * Math.PI) / 180, la = (pLat[i] * Math.PI) / 180, w = pArea[i];
      x += w * Math.cos(la) * Math.cos(lo);
      yy += w * Math.cos(la) * Math.sin(lo);
      z += w * Math.sin(la);
    }
    if (x || yy || z) {
      const r1 = (v) => Math.round(v * 10) / 10;
      regionCenter.set(r.id, [r1((Math.atan2(yy, x) * 180) / Math.PI), r1((Math.atan2(z, Math.hypot(x, yy)) * 180) / Math.PI)]);
    }
  }
  // 本国（home_iso）の重心：首都のない政体（アメリカなど）の代わりの点。歴史データのない地域（南北アメリカなど）では、
  // その年の所属を問わず本国のピース全体の重心にする
  const homeCentroid = (id, y) => {
    const groups = polityHome[id];
    if (!groups) return null;
    const list = groups.filter(([f, t]) => (f == null || f <= y) && (t == null || y <= t)).flatMap((g) => g[2]);
    if (!list.length) return null;
    const pi = polityIds.get(id);
    const owned = list.filter((i) => ownerAt(i, y) === pi);
    const use = owned.length ? owned : list;
    let x = 0, yy = 0, z = 0;
    for (const i of use) {
      const lo = (pLon[i] * Math.PI) / 180, la = (pLat[i] * Math.PI) / 180, w = pArea[i];
      x += w * Math.cos(la) * Math.cos(lo);
      yy += w * Math.cos(la) * Math.sin(lo);
      z += w * Math.sin(la);
    }
    return [(Math.atan2(yy, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, yy)) * 180) / Math.PI];
  };
  let none = 0;
  for (const e of events) {
    // 場所が書いてあれば、それだけを代表点にする（領土による判定もしない）
    if (e._at) {
      e.pts = [[Math.round(e._at[0] * 10) / 10, Math.round(e._at[1] * 10) / 10]];
      e.fixed = true;
      continue;
    }
    const box = FILE_BOX[e._file] ?? null;
    // 画面に関係国の領土が映っているかの判定で数える範囲（地域別ファイルはその地域、ほかはヨーロッパ）
    const tbox = box ?? TERRITORY_BOX_DEFAULT;
    const tk = tbox.join(",");
    if (!eventBoxIndex.has(tk)) {
      eventBoxIndex.set(tk, eventBoxes.length);
      eventBoxes.push(tbox);
    }
    e.bx = eventBoxIndex.get(tk);
    const inside = [];
    const outside = [];
    for (const id of e.polities ?? []) {
      const cap = capitalAt(id, e.year);
      let pt = null;
      if (box) {
        if (cap && inBox(box, ...cap)) pt = cap;
        else pt = territoryCentroid(id, e.year, box);
        if (pt) {
          inside.push(pt);
          continue;
        }
      }
      pt = cap ?? homeCentroid(id, e.year) ?? territoryCentroid(id, e.year, null);
      if (pt) (box && inBox(box, ...pt) ? inside : outside).push(pt);
    }
    let pts = inside.length ? inside : outside;
    if (!pts.length && box) pts = [[(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]];
    // 近い点（1度以内）はまとめ、小数1桁に丸める
    const out = [];
    for (const p of pts) {
      const q = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
      if (!out.some((o) => Math.abs(o[0] - q[0]) < 1 && Math.abs(o[1] - q[1]) < 1)) out.push(q);
    }
    if (out.length) e.pts = out;
    else none++;
  }
  if (none) console.log(`出来事の場所：${none} 件は場所を決められませんでした（パネルでは常に「地図の範囲内」として扱う）`);
}

// ---- 出来事の代表点が入っているピース（pp）。植民地を選んだとき「その植民地の出来事」を判定するのに使う ----
// ピースの形は public/data/pieces.topo.json（tools/build_pieces.sh が作る。並びは pieces.tsv と同じ）。経緯度の平面で内外を判定する
{
  const topoFile = path.join(ROOT, "public", "data", "pieces.topo.json");
  if (fs.existsSync(topoFile)) {
    const topo = JSON.parse(fs.readFileSync(topoFile, "utf8"));
    const geoms = topo.objects.pieces.geometries;
    const [sx, sy] = topo.transform?.scale ?? [1, 1];
    const [tx, ty] = topo.transform?.translate ?? [0, 0];
    // 弧を経緯度の点列に（量子化を解く）
    const arcs = topo.arcs.map((arc) => {
      let x = 0, y = 0;
      return arc.map((p) => (topo.transform ? ((x += p[0]), (y += p[1]), [x * sx + tx, y * sy + ty]) : p));
    });
    const ringOf = (ids) => {
      const pts = [];
      for (const id of ids) {
        const a = id < 0 ? arcs[~id].slice().reverse() : arcs[id];
        for (let k = pts.length ? 1 : 0; k < a.length; k++) pts.push(a[k]);
      }
      return pts;
    };
    const idPos = new Map(geoms.map((g, i) => [g.properties?.id, i]));
    const polysOf = new Map(); // ピースの topo 番号 → [[外周, 穴...], ...]
    const boxOf = new Map();
    const getPolys = (gi) => {
      if (polysOf.has(gi)) return polysOf.get(gi);
      const g = geoms[gi];
      const list = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
      const polys = list.map((rings) => rings.map(ringOf));
      let b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const poly of polys) for (const [x, y] of poly[0] ?? []) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
      polysOf.set(gi, polys);
      boxOf.set(gi, b);
      return polys;
    };
    const inRing = (x, y, ring) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    // 中心点の近い順に調べる（ほとんどの点は近くのピースに入る）
    const pLon = pieces.map((p) => Number(p.lon));
    const pLat = pieces.map((p) => Number(p.lat));
    const topoOf = pieces.map((p) => idPos.get(p.id) ?? -1);
    const pieceAt = (lon, lat) => {
      const order = [];
      for (let i = 0; i < pieces.length; i++) {
        const d = Math.abs(pLon[i] - lon) + Math.abs(pLat[i] - lat);
        if (d < 25) order.push([d, i]);
      }
      order.sort((a, b) => a[0] - b[0]);
      for (const [, i] of order) {
        const gi = topoOf[i];
        if (gi < 0) continue;
        const polys = getPolys(gi);
        const b = boxOf.get(gi);
        if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
        for (const poly of polys) if (poly[0] && inRing(lon, lat, poly[0]) && !poly.slice(1).some((h) => inRing(lon, lat, h))) return i;
      }
      return -1;
    };
    const memo = new Map();
    for (const e of events) {
      if (!e.pts?.length) continue;
      e.pp = e.pts.map(([lon, lat]) => {
        const k = `${lon},${lat}`;
        if (!memo.has(k)) memo.set(k, pieceAt(lon, lat));
        return memo.get(k);
      });
      if (e.pp.every((x) => x < 0)) delete e.pp;
    }
  }
}
const atlas = {
  generated: new Date().toISOString(),
  range: meta.range,
  certainty: CERTAINTY,
  pieceIds: pieces.map((p) => p.id),
  polities: polities.map(({ _file, home_iso, ...rest }) => rest),
  regions: timelineRegions.map((r) => ({ id: r.id, name: r.name, ...(r.names ? { names: r.names } : {}), timeline: r.timeline, ...(regionCenter.has(r.id) ? { c: regionCenter.get(r.id) } : {}) })),
  pieceTimelines,
  events: events.map(strip),
  eventBoxes,
  seas,
  milestones,
  cities,
  citiesModern,
  religion,
  language,
  movements,
  movementRegions,
  colonies,
  // 潮流で使う政体の本国（植民地・占領地を光らせないため）
  movementHome: Object.fromEntries(
    [...new Set(movements.flatMap((m) => m.spread.filter((s) => !s.colonies).flatMap((s) => s.polities)))]
      .filter((id) => id in polityHome)
      .map((id) => [id, polityHome[id]]),
  ),
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
console.log(`潮流：${movements.length} / 植民地：${colonies.length}`);
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
