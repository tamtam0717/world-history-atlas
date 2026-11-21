// 国（政体）ごとの「節目」：国を選んでいる間、« » と ⌘←→ はこの年へジャンプする。
//
// atlas.json から次の3種類を自動で求める（国を選んだときに一度だけ計算してキャッシュ）。
//  1. 領土の大きな変化：その政体が owner か overlord であるピースの面積が、ある年に大きく増えた・減った
//     （増えた分・減った分のどちらかが「前年の面積の SHARE 以上」か「BIG_KM2 以上」。どちらでも MIN_KM2 未満は無視）。
//     初めて地図に現れた年・消えた年も含める。
//  2. その政体が関わる重要度1の出来事（節目が少ない国では重要度2も）。
//  3. 国名・種別（names の切り替え）が変わった年。

import { geoArea } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { AtlasIndex, HistEvent, Polity } from "./data";

export interface PolityMilestone {
  year: number;
  /** ラベル（「シュレジエン獲得」など） */
  title: string;
  /** そのほかの理由（ツールチップ用） */
  detail: string[];
  /** 主な理由の種類（見た目の出し分け用） */
  kind: "gain" | "loss" | "appear" | "vanish" | "event" | "name";
  /** 領土の大きな変化があった年なら、その向き（ラベルが出来事の題名のときも付ける） */
  terr?: "gain" | "loss" | "appear" | "vanish";
}

/** 前年の面積に対するこの割合以上の増減を「大きな変化」とする */
const SHARE = 0.05;
/** 割合が小さくても、この面積（km²）以上の増減は「大きな変化」とする（大国向け） */
const BIG_KM2 = 40000;
/** これ未満の増減は、割合が大きくても無視する（小さな領邦の出入り） */
const MIN_KM2 = 1500;
/** 重要度1の出来事と領土・国名の節目を合わせてこれ未満なら、重要度2の出来事も加える */
const FEW = 8;

/** 地球の半径（km）。d3 の geoArea（ステラジアン）を km² にする */
const R_KM = 6371.0088;

/** 多角形の面積（km²）。輪の向きが逆の多角形は「地球全体からその形を除いた面積」になるので補う */
function polygonAreaKm2(rings: number[][][]) {
  let s = geoArea({ type: "Polygon", coordinates: rings });
  if (s > 2 * Math.PI) s = 4 * Math.PI - s;
  return s * R_KM * R_KM;
}

/** 地域名の括弧書きや「〜領」を落として短くする */
function shortRegion(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)/g, "")
    .replace(/^[ァ-ヶー・＝]+領(?=.)/, "")
    .trim();
}

export class PolityMilestones {
  private areas: Float64Array | null = null;
  private cache = new Map<string, PolityMilestone[]>();

  constructor(
    private topo: Topology,
    private idx: AtlasIndex,
    private range: [number, number],
  ) {}

  /** ピースごとの面積（km²）。最初に使うときに一度だけ計算する */
  private pieceAreas(): Float64Array {
    if (this.areas) return this.areas;
    const fc = feature(this.topo, this.topo.objects.pieces as GeometryCollection) as unknown as GeoJSON.FeatureCollection;
    const out = new Float64Array(fc.features.length);
    fc.features.forEach((f, i) => {
      const g = f.geometry;
      const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
      let a = 0;
      for (const p of polys) a += polygonAreaKm2(p as number[][][]);
      out[i] = a;
    });
    this.areas = out;
    return out;
  }

  /** その政体の節目（年の昇順）。計算結果はキャッシュする */
  get(polityId: string): PolityMilestone[] {
    let ms = this.cache.get(polityId);
    if (!ms) {
      ms = this.compute(polityId);
      this.cache.set(polityId, ms);
    }
    return ms;
  }

  private compute(polityId: string): PolityMilestone[] {
    const { idx } = this;
    const atlas = idx.atlas;
    const pi = idx.polityIndex.get(polityId);
    const polity = idx.polityById.get(polityId);
    if (pi === undefined || !polity) return [];
    const [y0, y1] = this.range;
    const n = y1 - y0 + 1;
    const areas = this.pieceAreas();
    const name = (k: number, y: number) => (k >= 0 ? idx.shortName(atlas.polities[k], y) : "");

    // 年ごとの増えた・減った面積と、そのときの地域・相手国
    const gain = new Float64Array(n);
    const loss = new Float64Array(n);
    const total = new Float64Array(n + 1);
    type Part = { region: number; other: number; area: number };
    const gainParts = new Map<number, Part[]>();
    const lossParts = new Map<number, Part[]>();
    const push = (m: Map<number, Part[]>, y: number, p: Part) => {
      let l = m.get(y);
      if (!l) m.set(y, (l = []));
      l.push(p);
    };
    const mine = (st: number[] | undefined) => !!st && (st[1] === pi || st[2] === pi);

    atlas.pieceTimelines.forEach((tl, i) => {
      const a = areas[i] ?? 0;
      if (!a) return;
      for (let k = 0; k < tl.length; k++) {
        const st = tl[k];
        const inMine = mine(st);
        const from = Math.max(y0, st[0]);
        const to = Math.min(y1 + 1, k + 1 < tl.length ? tl[k + 1][0] : y1 + 1);
        if (inMine && from < to) {
          total[from - y0] += a;
          total[to - y0] -= a;
        }
        // 境目の年（範囲の最初の年は「変化」としない）
        if (st[0] <= y0 || st[0] > y1) continue;
        const prev = k > 0 ? tl[k - 1] : undefined;
        const wasMine = mine(prev);
        if (inMine === wasMine) continue;
        const y = st[0] - y0;
        if (inMine) {
          gain[y] += a;
          push(gainParts, y, { region: st[4], other: prev ? prev[1] : -1, area: a });
        } else {
          loss[y] += a;
          push(lossParts, y, { region: st[4], other: st[1], area: a });
        }
      }
    });
    for (let y = 1; y <= n; y++) total[y] += total[y - 1];

    /** 変化の中心の地域と相手国（面積の大きい順） */
    const describe = (parts: Part[], y: number, verb: "gain" | "loss") => {
      const byRegion = new Map<number, number>();
      const byOther = new Map<number, number>();
      for (const p of parts) {
        byRegion.set(p.region, (byRegion.get(p.region) ?? 0) + p.area);
        if (p.other >= 0 && p.other !== pi) byOther.set(p.other, (byOther.get(p.other) ?? 0) + p.area);
      }
      const regions = [...byRegion].sort((a, b) => b[1] - a[1]);
      const others = [...byOther].sort((a, b) => b[1] - a[1]);
      const sum = parts.reduce((s, p) => s + p.area, 0);
      const r0 = regions[0] && atlas.regions[regions[0][0]] ? shortRegion(atlas.regions[regions[0][0]].name) : "";
      // 2位以下の地域が合わせて2割以上あれば「など」
      const more = regions.length > 1 && (sum - regions[0][1]) / sum > 0.2;
      const place = r0 ? `${r0}${more ? "など" : ""}` : "";
      const title = verb === "gain" ? (place ? `${place}を獲得` : "領土を拡大") : place ? `${place}を失う` : "領土を失う";
      const who = others
        .slice(0, 3)
        .map(([k]) => name(k, y0 + y))
        .filter(Boolean);
      const detail = `${title}（${Math.round(sum).toLocaleString()} km²${who.length ? `、${verb === "gain" ? "←" : "→"}${who.join("・")}` : ""}）`;
      return { title, detail, others: others.map(([k]) => atlas.polities[k].id) };
    };

    const byYear = new Map<number, { terr?: PolityMilestone; others?: string[]; events: HistEvent[]; name?: string }>();
    const slot = (year: number) => {
      let s = byYear.get(year);
      if (!s) byYear.set(year, (s = { events: [] }));
      return s;
    };

    // 1. 領土の大きな変化
    for (let y = 1; y < n; y++) {
      const g = gain[y];
      const l = loss[y];
      if (!g && !l) continue;
      const before = total[y - 1];
      const after = total[y];
      const year = y0 + y;
      if (before === 0 && after > 0) {
        slot(year).terr = { year, title: `${idx.shortName(polity, year)}が地図に現れる`, detail: [], kind: "appear" };
        continue;
      }
      if (before > 0 && after === 0) {
        slot(year).terr = { year, title: `${idx.shortName(polity, year - 1)}が地図から消える`, detail: [], kind: "vanish" };
        continue;
      }
      const big = (v: number) => v >= MIN_KM2 && (v >= before * SHARE || v >= BIG_KM2);
      const gBig = big(g);
      const lBig = big(l);
      if (!gBig && !lBig) continue;
      const dg = gBig ? describe(gainParts.get(y) ?? [], y, "gain") : null;
      const dl = lBig ? describe(lossParts.get(y) ?? [], y, "loss") : null;
      // 増減の両方があるときは、大きい方をラベルにする
      const main = dg && dl ? (g >= l ? dg : dl) : (dg ?? dl)!;
      const detail = [dg, dl].filter((d) => d && d !== main).map((d) => d!.detail);
      const sl = slot(year);
      sl.terr = { year, title: main.title, detail: [main.detail, ...detail], kind: main === dg ? "gain" : "loss" };
      sl.others = [...(dg?.others ?? []), ...(dl?.others ?? [])];
    }
    // 範囲の最初の年にまだない国：最初に現れた年（上で拾えなかったとき）
    if (total[0] === 0) {
      const first = total.findIndex((v) => v > 0);
      if (first > 0 && first < n && !byYear.get(y0 + first)?.terr) {
        const year = y0 + first;
        slot(year).terr = { year, title: `${idx.shortName(polity, year)}が地図に現れる`, detail: [], kind: "appear" };
      }
    }

    // 3. 国名・種別の切り替え
    const label = (p: Polity, y: number) => ({ name: idx.polityName(p, y), kind: idx.kindAt(p, y) ?? "" });
    for (let year = y0 + 1; year <= y1; year++) {
      const a = label(polity, year - 1);
      const b = label(polity, year);
      if (a.name === b.name && a.kind === b.kind) continue;
      const kind = b.kind.replace(/（.*?）/g, "");
      slot(year).name = a.name !== b.name ? `「${b.name}」に` : `${kind || b.kind}に`;
    }

    // 2. 出来事
    const evs = atlas.events.filter((e) => e.year >= y0 && e.year <= y1 && (e.polities ?? []).includes(polityId));
    const addEvents = (imp: number) => {
      for (const e of evs) if ((e.importance ?? 3) === imp) slot(e.year).events.push(e);
    };
    addEvents(1);
    if ([...byYear.values()].length < FEW) addEvents(2);

    // 年ごとに1つにまとめる。ラベルは 領土 → 出来事 → 国名 の順で選ぶ（出来事は関わる国の少ないものを優先）
    const out: PolityMilestone[] = [];
    for (const [year, s] of byYear) {
      // 条約・分割・併合の出来事と、（領土が変わった年は）相手国が多く関わる出来事を先にする
      const others = new Set(s.others ?? []);
      const score = (e: HistEvent) =>
        (e.polities ?? []).filter((x) => others.has(x)).length + (/条約|議定書|和約|分割|併合/.test(e.title) ? 2 : 0);
      const evSorted = [...s.events].sort(
        (a, b) =>
          (a.importance ?? 3) - (b.importance ?? 3) ||
          score(b) - score(a) ||
          (a.polities?.length ?? 0) - (b.polities?.length ?? 0),
      );
      const evTitles = evSorted.map((e) => e.title);
      if (s.terr) {
        const t = s.terr;
        const terr = t.kind as PolityMilestone["terr"];
        // 地域がいくつにもまたがる・長いときは、同じ年の重要度1の出来事（条約名など）をラベルにする
        const ev1 = evSorted.find((e) => (e.importance ?? 3) === 1);
        if (ev1 && (t.kind === "gain" || t.kind === "loss") && (t.title.includes("など") || t.title.length > 12)) {
          const rest = evTitles.filter((x) => x !== ev1.title);
          out.push({ year, title: ev1.title, detail: [...t.detail, ...(s.name ? [s.name] : []), ...rest], kind: "event", terr });
        } else out.push({ ...t, detail: [...t.detail, ...(s.name ? [s.name] : []), ...evTitles], terr });
      } else if (evSorted.length) {
        out.push({ year, title: evTitles[0], detail: [...evTitles.slice(1), ...(s.name ? [s.name] : [])], kind: "event" });
      } else if (s.name) {
        out.push({ year, title: s.name, detail: [], kind: "name" });
      }
    }
    return out.sort((a, b) => a.year - b.year);
  }
}
