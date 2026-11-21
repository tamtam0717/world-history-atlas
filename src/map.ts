// 地図の描画（MapLibre GL、地球儀表示）
// ピース（現代の行政区画）を年ごとの所属で塗り分ける。塗りは feature-state で切り替え、
// 国境線・帝国の外枠・国名ラベルは年ごとに topojson で作り直して GeoJSON ソースに流す。

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import polylabel from "polylabel";
import { feature, merge, mesh, neighbors } from "topojson-client";
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry, MultiPolygon as GeoMultiPolygon } from "geojson";
import { AtlasIndex, cityCapitalOf, cityName, cityPop, curveAt, fallbackColor, type DistKey, type Movement, type ReligionEntry, type TimelineEntry } from "./data";
import { assignColors, MODERN_NAMES, modernName } from "./modern";

type PieceProps = { id: string; name: string; iso: string; adm1?: string; adm2?: string };
type PieceGeom = (Polygon<PieceProps> | MultiPolygon<PieceProps>) & { id?: string };

interface Merged {
  geo: GeoMultiPolygon;
  /** ラベルを置く点と、塊の面積（km²） */
  label: { lon: number; lat: number; area: number } | null;
  /** 多角形ごとの面積（km²）と、ラベルの点（必要になったときに計算する） */
  areas?: number[];
  plabels?: Map<number, NonNullable<Merged["label"]>>;
}

/** 保護国・植民地の副ラベルの区画（同じ owner の中で、元の国ごとのまとまり） */
interface SubUnit {
  owner: number;
  name: string;
  /** 2行目（「フランスの保護下」など） */
  note: string;
  pieces: number[];
}

const SEA = "#cfdde3";
const NODATA = "#e6e2d8";
/** 宗教表示で、データのないピースの色 */
const REL_NODATA = "#e2e0dc";
/** 世俗化した地域の色を寄せる「地の色」（データのない灰色 REL_NODATA より明るく白に近い） */
export const SECULAR_GROUND = "#f7f5f0";
/**
 * 世俗化の割合 s（0〜1）→ 色を地の色に寄せる割合（0〜0.85）。
 * 線形だと 0.2〜0.4 の違いが見えにくいので、はじめに大きく効く曲線にする（s = 1 でもわずかに色は残す）
 */
export function secularFade(s: number): number {
  const x = Math.max(0, Math.min(1, s));
  return 0.85 * (1 - Math.pow(1 - x, 1.6));
}
/**
 * 間接統治（certainty: indirect。清の藩部など）の地域は、持ち主の色をこの割合だけ残して地の色 SECULAR_GROUND に寄せる。
 * 「同じ国だが支配がゆるい」ことを、斜線ではなく色の薄さで見せる
 */
const INDIRECT_KEEP = 0.5;
export function indirectColor(color: string): string {
  return mix(color, SECULAR_GROUND, INDIRECT_KEEP);
}
/** 斜線で描く確からしさ（indirect は斜線を使わず、色の薄さで見せる） */
const HATCHED_CERT = new Set(["uncertain", "nominal", "occupied"]);
/**
 * 歴史データがまだ1つもない地域（ヨーロッパ以外など）は、現代の国の色をこの色に寄せて淡く・彩度を落として塗る。
 * 「現代の国境で仮に塗ってある（歴史の地図は準備中）」と、ひと目でわかるようにする
 */
const PENDING_BASE = "#ece8e0";
const PENDING_LINE = "#9d9385";
const RIVER = "#7ea6c2";
const EUROPE: [[number, number], [number, number]] = [
  [-11, 34],
  [42, 61],
];
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const FONT = ["Noto Sans Medium"];
const FONT_REGULAR = ["Noto Sans Regular"];
const LOCAL_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", "Meiryo", sans-serif';
/** 帝国の枠として描く上位政体（それ以外の overlord は宗主権として、宗主国の色の帯で描く） */
const EMPIRE_FRAMES = new Set(["hre", "rhine_confederation", "german_confederation", "north_german_confederation", "hungary_crown"]);

/** 地域へのジャンプ（W・E・NA・SA・AF・AS・OC） */
export type MapRegion = "world" | "europe" | "na" | "sa" | "af" | "as" | "oc";

/** 地図の主題（塗り分けの種類）。分布（宗教・言語）を足すときは DistKey にも足す */
export type MapLayer = "political" | DistKey;
export const isDist = (l: MapLayer): l is DistKey => l === "religion" || l === "language";
const DIST_LABEL: Record<DistKey, string> = { religion: "宗教", language: "言語" };

/** 潮流の種類ごとの色（地図の光・パネルの丸・年表の帯で共通） */
export const MOVEMENT_COLORS: Record<string, string> = {
  thought: "#2f6fd0",
  art: "#c93a7c",
  religion: "#d08a10",
  system: "#1f9a6a",
};

/** 分布（宗教・言語）の表示でクリックした場所の情報 */
export interface ReligionPick {
  /** 分布の地域の番号（atlas.religion.regions / atlas.language.regions）。データがなければ -1 */
  region: number;
  /** 現代の地名（ピース名） */
  place: string;
  /** クリックしたピース（atlas.json のピースの番号）。世俗化の割合などピースごとの値を引くのに使う */
  piece?: number;
}

export interface MapCallbacks {
  onSelect(polityId: string | null): void;
  onPiece?(piece: PieceProps | null): void;
  /** 分布（宗教・言語）の表示のときのクリック（何もない所なら null） */
  onReligion?(pick: ReligionPick | null): void;
}

export class AtlasMap {
  private map: MLMap;
  private loaded = false;
  /** 最初の描画が終わったら解決する */
  readonly ready: Promise<void>;
  private geoms: PieceGeom[];
  private atlasIdx: number[]; // topo のピース番号 → atlas のピース番号
  private ownerOf: Int32Array;
  private ovOf: Int32Array;
  /** ピースごとの確からしさ（atlas.certainty の番号） */
  private certOf: Int32Array;
  private colorOf: (string | null | undefined)[];
  private cache = new Map<string, Merged>();
  private meshCache = new Map<string, FeatureCollection>();
  private tooltip: HTMLDivElement;
  private year = 0;
  private selected: string | null = null;
  private modernOn = false;
  private layer: MapLayer = "political";
  /** 宗教表示：ピースごとの main / minor / 地域 */
  private relMain: Int32Array;
  private relRegion: Int32Array;
  private relColorOf: (string | null | undefined)[];
  private relSelected = -1;
  /** 地図上で広がりを見せている潮流 */
  private movement: Movement | null = null;
  private mvTimer = 0;
  private baseZoom = 3;
  /** 歴史データ（政治）がまだ1つもないピース。現代の国境で淡く塗る */
  private pending: boolean[] = [];
  /** 分布（宗教・言語）のデータがまだ1つもないピース */
  private distPending: Record<DistKey, boolean[]> = { religion: [], language: [] };
  debug = false;
  bottomInset = 0;

  constructor(
    container: HTMLElement,
    private topo: Topology,
    private idx: AtlasIndex,
    private cb: MapCallbacks,
  ) {
    const obj = topo.objects.pieces as GeometryCollection<PieceProps>;
    this.geoms = obj.geometries as PieceGeom[];
    const atlasPos = new Map(idx.atlas.pieceIds.map((id, i) => [id, i]));
    this.atlasIdx = this.geoms.map((g) => atlasPos.get(g.properties!.id) ?? -1);
    const n = this.geoms.length;
    const noTl = (tls: unknown[][] | undefined) => this.atlasIdx.map((a) => a < 0 || !tls?.[a]?.length);
    this.pending = noTl(idx.atlas.pieceTimelines);
    this.distPending = { religion: noTl(idx.dist("religion")?.pieceTimelines), language: noTl(idx.dist("language")?.pieceTimelines) };
    this.ownerOf = new Int32Array(n).fill(-2);
    this.ovOf = new Int32Array(n);
    this.colorOf = new Array(n).fill(undefined);
    this.certOf = new Int32Array(n);
    this.relMain = new Int32Array(n).fill(-2);
    this.relRegion = new Int32Array(n).fill(-1);
    this.relColorOf = new Array(n).fill(undefined);

    const mapEl = document.createElement("div");
    mapEl.className = "map";
    container.prepend(mapEl);
    this.tooltip = document.createElement("div");
    this.tooltip.className = "tooltip";
    container.appendChild(this.tooltip);

    maplibregl.setWorkerUrl(new URL("maplibre/maplibre-gl-worker.mjs", document.baseURI).href);
    this.map = new maplibregl.Map({
      container: mapEl,
      style: this.style(),
      bounds: EUROPE,
      minZoom: 0,
      maxZoom: 10,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      localIdeographFontFamily: LOCAL_FONT,
      fadeDuration: 0,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disable(); // キー操作は shortcuts.ts で扱う

    this.ready = new Promise((resolve) => {
      this.map.on("load", () => {
        this.setup();
        this.setupZoomFilters();
        this.updateMinZoom();
        this.map.on("resize", () => this.updateMinZoom());
        this.loaded = true;
        this.baseZoom = this.map.getZoom();
        if (this.year) this.render(this.year);
        this.map.once("idle", () => resolve());
      });
    });

    this.map.on("click", (e) => {
      const f = this.map.queryRenderedFeatures(e.point, { layers: [isDist(this.layer) ? "rel-fill" : "fill"] })[0];
      const i = f ? Number(f.id) : -1;
      if (this.debug) this.cb.onPiece?.(i >= 0 ? this.geoms[i].properties! : null);
      if (isDist(this.layer)) {
        this.cb.onReligion?.(i >= 0 ? { region: this.relRegion[i], place: this.geoms[i].properties!.name, piece: this.atlasIdx[i] >= 0 ? this.atlasIdx[i] : undefined } : null);
        return;
      }
      const o = i >= 0 ? this.ownerOf[i] : -1;
      this.cb.onSelect(o >= 0 ? this.idx.atlas.polities[o].id : null);
    });
    this.map.on("mousemove", (e) => this.hover(e.point, e.originalEvent));
    this.map.on("mouseout", () => (this.tooltip.style.display = "none"));
  }

  private style(): StyleSpecification {
    const glyphs = new URL("fonts/", document.baseURI).href + "{fontstack}/{range}.pbf";
    return {
      version: 8,
      projection: { type: "globe" },
      glyphs,
      sky: {
        "sky-color": "#eef2f3",
        "horizon-color": "#f6f3ec",
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 5, 0.2, 7, 0],
      },
      sources: {},
      layers: [{ id: "sea", type: "background", paint: { "background-color": SEA } }],
    };
  }

  private setup() {
    const map = this.map;
    for (const [name, color, size] of [
      ["uncertain", "rgba(60,50,40,.45)", 8],
      ["nominal", "rgba(255,255,255,.8)", 7],
      ["occupied", "rgba(130,20,20,.55)", 6],
    ] as const) {
      map.addImage(`hatch-${name}`, hatchImage(color, size), { pixelRatio: 2 });
    }
    // 宗教・言語の少数派の斜線（種類ごとに1枚）
    for (const key of ["religion", "language"] as const) {
      (this.idx.dist(key)?.kinds ?? []).forEach((k, i) => {
        map.addImage(`${key}-hatch-${i}`, hatchImage(stripeColor(k.color), 8, 0.32), { pixelRatio: 2 });
      });
    }

    // ピース（塗りは feature-state "c"、現代版の色は属性 mcolor）
    const fc = feature(this.topo, this.topo.objects.pieces as GeometryCollection<PieceProps>) as unknown as FeatureCollection;
    const mcolors = this.modernColors();
    fc.features.forEach((f, i) => {
      f.id = i;
      const p = f.properties as PieceProps;
      const mc = mcolors.get(p.iso) ?? "#dddddd";
      // データのない年の色：歴史データがまだないピースは現代の国の色を淡くしたもの、あるピースは灰色（データの抜け）
      f.properties = {
        pid: p.id,
        name: p.name,
        iso: p.iso,
        mcolor: mc,
        pc: this.pending[i] ? mix(mc, PENDING_BASE, 0.42) : NODATA,
        rc: this.distPending.religion[i] ? mix(mc, PENDING_BASE, 0.25) : REL_NODATA,
        lc: this.distPending.language[i] ? mix(mc, PENDING_BASE, 0.25) : REL_NODATA,
      };
    });
    map.addSource("pieces", { type: "geojson", data: fc });
    for (const id of ["borders", "overlords", "suz", "subunits", "sublabels", "hatch", "labels", "highlight", "cities", "rel-hatch", "rel-borders", "rivers", "lakes", "mv", "flash"]) {
      map.addSource(id, { type: "geojson", data: EMPTY });
    }
    // 川の名前用：細かく曲がる線のままだと線に沿った文字が置けないので、強めに単純化した別のソースを使う
    map.addSource("rivers-lbl", { type: "geojson", data: EMPTY, tolerance: 8 });
    map.addSource("modern-borders", { type: "geojson", data: this.modernBorders() });
    map.addSource("pending-borders", { type: "geojson", data: this.pendingBorders() });
    map.addSource("pending-labels", { type: "geojson", data: this.pendingLabels() });
    map.addSource("pending-coast", { type: "geojson", data: { type: "FeatureCollection", features: [this.pendingCoast(this.pending)] } });
    map.addSource("modern-labels", { type: "geojson", data: this.modernLabels() });
    map.addSource("modern-cities", { type: "geojson", data: this.modernCities() });
    map.addSource("seas", { type: "geojson", data: this.seas() });

    const vis = (v: boolean) => (v ? "visible" : "none");
    map.addLayer({
      id: "fill",
      type: "fill",
      source: "pieces",
      paint: { "fill-color": ["coalesce", ["feature-state", "c"], ["get", "pc"]] },
    });
    // 隣り合うピースの継ぎ目に出る細い隙間を、同じ色の細い線で埋める
    map.addLayer({
      id: "seam",
      type: "line",
      source: "pieces",
      paint: { "line-color": ["coalesce", ["feature-state", "c"], ["get", "pc"]], "line-width": 0.8 },
    });
    map.addLayer({
      id: "modern-fill",
      type: "fill",
      source: "pieces",
      layout: { visibility: "none" },
      paint: { "fill-color": ["get", "mcolor"] },
    });
    map.addLayer({
      id: "modern-seam",
      type: "line",
      source: "pieces",
      layout: { visibility: "none" },
      paint: { "line-color": ["get", "mcolor"], "line-width": 0.8 },
    });
    // 宗教の塗り（feature-state "r"）と少数派の斜線
    map.addLayer({
      id: "rel-fill",
      type: "fill",
      source: "pieces",
      layout: { visibility: "none" },
      paint: { "fill-color": ["coalesce", ["feature-state", "r"], ["get", "rc"]] },
    });
    map.addLayer({
      id: "rel-seam",
      type: "line",
      source: "pieces",
      layout: { visibility: "none" },
      paint: { "line-color": ["coalesce", ["feature-state", "r"], ["get", "rc"]], "line-width": 0.8 },
    });
    map.addLayer({ id: "hatch", type: "fill", source: "hatch", paint: { "fill-pattern": ["get", "pat"] } });
    map.addLayer({
      id: "rel-hatch",
      type: "fill",
      source: "rel-hatch",
      layout: { visibility: "none" },
      paint: { "fill-pattern": ["get", "pat"], "fill-opacity": ["coalesce", ["get", "op"], 1] },
    });
    // 湖と川（塗りより上、国境線より下）。データは地図の初回表示の後に読み込む（loadWater）
    map.addLayer({ id: "lakes", type: "fill", source: "lakes", paint: { "fill-color": SEA } });
    map.addLayer({
      id: "lakes-line",
      type: "line",
      source: "lakes",
      paint: { "line-color": RIVER, "line-width": 0.5, "line-opacity": 0.6 },
    });
    map.addLayer({
      id: "rivers",
      type: "line",
      source: "rivers",
      filter: this.riverFilter(0),
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": RIVER,
        // 大河（rank の小さいもの）ほど太く
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          ["max", 0.35, ["-", 1.3, ["*", 0.1, ["get", "rank"]]]],
          7,
          ["max", 0.9, ["-", 3, ["*", 0.18, ["get", "rank"]]]],
        ],
      },
    });
    // 宗主権：宗主国の色の帯。宗主権下の国の境界の内側に沿って、外側ほど濃く内側へぼかした帯を描く。
    // 「宗主国の色に縁取られている＝その傘の下にある」と見えるようにする（輪は内側が右になる向きにそろえてある）
    const bandW = (k: number) => ["interpolate", ["exponential", 1.4], ["zoom"], 2, 5 * k, 5, 10 * k, 8, 20 * k];
    map.addLayer({
      id: "suz-band",
      type: "line",
      source: "suz",
      layout: { "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": 0.85,
        "line-width": bandW(1) as never,
        "line-offset": bandW(0.5) as never,
        "line-blur": bandW(0.85) as never,
      },
    });
    map.addLayer({
      id: "debug",
      type: "line",
      source: "pieces",
      layout: { visibility: vis(this.debug) },
      paint: { "line-color": "rgba(0,0,0,.35)", "line-width": 0.4 },
    });
    map.addLayer({
      id: "rel-borders",
      type: "line",
      source: "rel-borders",
      layout: { visibility: "none", "line-join": "round" },
      paint: {
        "line-color": "#5b4a38",
        "line-opacity": 0.75,
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 6, 0.9, 9, 1.3],
      },
    });
    // 歴史データのない地域の、現代の国境（淡い細線。歴史の国境と見分けられるように）
    map.addLayer({
      id: "pending-borders",
      type: "line",
      source: "pending-borders",
      layout: { "line-join": "round" },
      paint: {
        "line-color": PENDING_LINE,
        "line-opacity": 0.75,
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.3, 4, 0.6, 8, 1],
      },
    });
    // 国境線。歴史データのない地域の海岸線（とデータのある地域との境）は年で変わらないので、別のソースで一度だけ渡す
    for (const id of ["pending-coast", "borders"]) {
      map.addLayer({
        id,
        type: "line",
        source: id,
        layout: { "line-join": "round" },
        paint: {
          "line-color": "#4a4038",
          "line-opacity": 0.85,
          "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 6, 1.1, 9, 1.6],
        },
      });
    }
    // 保護国・植民地など、同じ国の色の中の「元の国」の境界（細い破線）
    map.addLayer({
      id: "subunit-borders",
      type: "line",
      source: "subunits",
      layout: { "line-join": "round" },
      paint: {
        "line-color": "#4a4038",
        "line-opacity": 0.6,
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 6, 1, 9, 1.4],
        "line-dasharray": [3, 2],
      },
    });
    map.addLayer({
      id: "modern-borders",
      type: "line",
      source: "modern-borders",
      layout: { visibility: "none", "line-join": "round" },
      paint: { "line-color": "#3b3530", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.7, 6, 1.4] },
    });
    map.addLayer({
      id: "frames",
      type: "line",
      source: "overlords",
      filter: ["==", ["get", "kind"], "empire"],
      layout: { "line-join": "round" },
      paint: {
        "line-color": "#7a2e2e",
        "line-opacity": 0.9,
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.6, 6, 3],
        "line-dasharray": [3, 1.6],
      },
    });
    // 宗主権下の国の境界：帯の外べりに、宗主国の濃い色の細い線
    map.addLayer({
      id: "suzerain",
      type: "line",
      source: "suz",
      layout: { "line-join": "round" },
      paint: {
        "line-color": ["get", "edge"],
        "line-opacity": 0.9,
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 6, 1.6],
      },
    });
    map.addLayer({
      id: "highlight",
      type: "line",
      source: "highlight",
      paint: { "line-color": "#1d1a16", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.6, 6, 3] },
    });

    // パネルの変化の行で指した地域群（マウスを乗せる／押す）
    map.addLayer({
      id: "flash-fill",
      type: "fill",
      source: "flash",
      paint: { "fill-color": "#c0392b", "fill-opacity": 0.28 },
    });
    map.addLayer({
      id: "flash-line",
      type: "line",
      source: "flash",
      layout: { "line-join": "round" },
      paint: { "line-color": "#8a1f12", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.5, 6, 3] },
    });

    // 潮流の広がり：地図全体を薄いベールで沈め、盛んな地域を種類の色で光らせる。
    // 勢い（lvl 0〜1）が強いほど濃く、光のにじみ（ぼかした太い線）も広く明るい。発信地（center）はさらに強く光らせる
    map.addLayer({
      id: "mv-veil",
      type: "fill",
      source: "pieces",
      layout: { visibility: "none" },
      paint: { "fill-color": "#f7f4ee", "fill-opacity": 0.5 },
    }, "lakes");
    map.addLayer({
      id: "mv-fill",
      type: "fill",
      source: "mv",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["interpolate", ["linear"], ["get", "lvl"], 0, 0.05, 1, 0.6],
      },
    });
    map.addLayer({
      id: "mv-glow",
      type: "line",
      source: "mv",
      layout: { "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": ["interpolate", ["linear"], ["get", "lvl"], 0, 0.1, 1, 0.75],
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, ["+", 2, ["*", 10, ["get", "lvl"]]], 7, ["+", 6, ["*", 26, ["get", "lvl"]]]],
        "line-blur": ["interpolate", ["linear"], ["zoom"], 2, ["+", 2, ["*", 8, ["get", "lvl"]]], 7, ["+", 6, ["*", 22, ["get", "lvl"]]]],
      },
    });
    map.addLayer({
      id: "mv-core",
      type: "line",
      source: "mv",
      filter: ["get", "center"],
      layout: { "line-join": "round" },
      paint: {
        "line-color": "#fffbe8",
        "line-opacity": 0.9,
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.2, 7, 2.5],
        "line-blur": 0.6,
      },
    });
    map.addLayer({
      id: "mv-center-glow",
      type: "line",
      source: "mv",
      filter: ["get", "center"],
      layout: { "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": 0.8,
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 10, 7, 34],
        "line-blur": ["interpolate", ["linear"], ["zoom"], 2, 9, 7, 30],
      },
    });

    // 海・海峡の名前
    map.addLayer({
      id: "seas",
      type: "symbol",
      source: "seas",
      filter: [">=", ["zoom"], ["get", "minz"]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_REGULAR,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, ["*", ["get", "s"], 0.8], 6, ["*", ["get", "s"], 1.25]],
        "text-letter-spacing": 0.15,
        "text-max-width": 30,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: { "text-color": "#5f7f90", "text-halo-color": "rgba(220,232,236,.8)", "text-halo-width": 1 },
    });

    // 川・湖の名前
    map.addLayer({
      id: "rivers-label",
      type: "symbol",
      source: "rivers-lbl",
      filter: this.riverFilter(0, 1.2),
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": FONT_REGULAR,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 7, 12.5],
        "text-letter-spacing": 0.1,
        "symbol-spacing": 320,
        "text-max-angle": 60,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: { "text-color": "#4a7894", "text-halo-color": "rgba(255,255,255,.75)", "text-halo-width": 1.2 },
    });
    map.addLayer({
      id: "lakes-label",
      type: "symbol",
      source: "lakes",
      filter: ["all", ["has", "name"], [">=", ["zoom"], ["+", ["get", "minz"], 1.5]]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_REGULAR,
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 7, 12.5],
        "text-max-width": 6,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: { "text-color": "#4a7894", "text-halo-color": "rgba(255,255,255,.75)", "text-halo-width": 1.2 },
    });

    // 都市（その時代版と現代版）
    for (const [src, on] of [
      ["cities", true],
      ["modern-cities", false],
    ] as const) {
      map.addLayer({
        id: `${src}-dot`,
        type: "circle",
        source: src,
        filter: [">=", ["zoom"], ["get", "minz"]],
        layout: { visibility: vis(on), "circle-sort-key": ["get", "rank"] },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, ["*", ["get", "r"], 0.7], 7, ["*", ["get", "r"], 1.3]],
          // 都市は白丸。首都は白丸に赤いリング
          "circle-color": "#ffffff",
          "circle-stroke-color": ["case", ["get", "capital"], "#c0392b", "#3a332c"],
          "circle-stroke-width": ["case", ["get", "capital"], 2, 1],
        },
      });
      map.addLayer({
        id: `${src}-label`,
        type: "symbol",
        source: src,
        filter: [">=", ["zoom"], ["+", ["get", "minz"], 0.3]],
        layout: {
          visibility: vis(on),
          "text-field": ["get", "name"],
          "text-font": FONT,
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            ["case", ["get", "capital"], 11.5, 10.5],
            7,
            ["case", ["get", "capital"], 14, 12.5],
          ],
          "text-variable-anchor": ["left", "right", "top", "bottom"],
          "text-radial-offset": 0.55,
          "text-justify": "auto",
          "symbol-sort-key": ["get", "rank"],
        },
        // 都市名は「前景」：詰めた字間・はっきりした色と白いふち。首都はやや赤みのある色
        paint: {
          "text-color": ["case", ["get", "capital"], "#6e1f17", "#1d1a16"],
          "text-halo-color": "rgba(255,255,255,.95)",
          "text-halo-width": 1.5,
        },
      });
    }

    // 保護国・植民地の名前（宗主国の色の中に、国名より小さく。自動のものは2行目に「○○の保護下」など）
    map.addLayer({
      id: "sublabels",
      type: "symbol",
      source: "sublabels",
      filter: [">=", ["zoom"], ["get", "minz"]],
      layout: {
        "text-field": [
          "case",
          ["==", ["get", "note"], ""],
          ["get", "name"],
          ["format", ["get", "name"], {}, "\n", {}, ["get", "note"], { "font-scale": 0.72 }],
        ],
        "text-font": FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, ["*", ["max", 1, ["get", "s"]], 10.5], 5, ["*", ["max", 1, ["get", "s"]], 13.5], 8, ["*", ["max", 1, ["get", "s"]], 17]],
        "text-max-width": 30,
        "text-letter-spacing": 0.15,
        "text-line-height": 1.15,
        "symbol-sort-key": ["get", "rank"],
        "text-padding": 2,
      },
      paint: {
        "text-color": "#3d3128",
        "text-opacity": 0.72,
        "text-halo-color": "rgba(255,255,255,.55)",
        "text-halo-width": 1.1,
        "text-halo-blur": 0.6,
      },
    });

    // 歴史データのない地域の現代の国名（歴史の国名より淡く小さく。「仮の地図」とわかるように）
    map.addLayer({
      id: "pending-labels",
      type: "symbol",
      source: "pending-labels",
      filter: [">=", ["zoom"], ["get", "minz"]],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_REGULAR,
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, ["*", ["get", "s"], 8.5], 5, ["*", ["get", "s"], 13], 8, ["*", ["get", "s"], 17]],
        "text-max-width": 30,
        "text-letter-spacing": 0.2,
        "symbol-sort-key": ["get", "rank"],
        "text-padding": 2,
      },
      paint: {
        "text-color": "#6f665a",
        "text-opacity": 0.6,
        "text-halo-color": "rgba(255,255,255,.5)",
        "text-halo-width": 1,
      },
    });

    // 国名ラベル（その時代版と現代版）
    for (const [src, on] of [
      ["labels", true],
      ["modern-labels", false],
    ] as const) {
      map.addLayer({
        id: src,
        type: "symbol",
        source: src,
        filter: [">=", ["zoom"], ["get", "minz"]],
        layout: {
          visibility: vis(on),
          "text-field": ["get", "name"],
          "text-font": FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 2, ["*", ["get", "s"], 11], 5, ["*", ["get", "s"], 16], 8, ["*", ["get", "s"], 21]],
          "text-max-width": 30,
          // 国名は「背景」：字間を広げ、半透明でやわらかく
          "text-letter-spacing": 0.3,
          // 国名は「背景」なので、都市名などとぶつかっても消さない（都市名の配置にも影響させない）
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "symbol-sort-key": ["get", "rank"],
          "text-padding": 3,
        },
        paint: {
          "text-color": "#3d3128",
          "text-opacity": 0.62,
          "text-halo-color": "rgba(255,255,255,.45)",
          "text-halo-width": 1.2,
          "text-halo-blur": 0.8,
        },
      });
    }
  }

  /**
   * MapLibre はレイヤーの filter の ["zoom"] をタイルの整数の拡大率で評価するため、
   * 「拡大率 3.2 から出す」のような細かい出し分けが効かない（3.9 でも 3 として扱われる）。
   * そこで ["zoom"] を含む filter を覚えておき、拡大率が変わるたびに今の拡大率の数値へ置き換える。
   */
  private zoomFilters = new Map<string, unknown>();
  private lastFilterZoom = NaN;
  private setupZoomFilters() {
    const hasZoom = (x: unknown): boolean =>
      Array.isArray(x) ? (x.length === 1 && x[0] === "zoom") || x.some(hasZoom) : false;
    for (const l of this.map.getStyle().layers) {
      const f = this.map.getFilter(l.id);
      if (f && hasZoom(f)) this.zoomFilters.set(l.id, f);
    }
    const apply = () => {
      const z = Math.round(this.map.getZoom() * 10) / 10;
      if (z === this.lastFilterZoom) return;
      this.lastFilterZoom = z;
      const sub = (x: unknown): unknown =>
        Array.isArray(x) ? (x.length === 1 && x[0] === "zoom" ? z : x.map(sub)) : x;
      for (const [id, f] of this.zoomFilters) this.map.setFilter(id, sub(f) as never);
    };
    this.map.on("zoom", apply);
    apply();
  }

  render(year: number) {
    this.year = year;
    if (!this.loaded) return;
    const idx = this.idx;
    const polities = idx.atlas.polities;
    const certOf = this.certOf;
    const indirect = idx.atlas.certainty.indexOf("indirect");
    for (let i = 0; i < this.geoms.length; i++) {
      const s = this.atlasIdx[i] >= 0 ? idx.pieceState(this.atlasIdx[i], year) : null;
      const owner = s ? s[1] : -1;
      certOf[i] = s ? s[3] : 0;
      this.ownerOf[i] = owner;
      this.ovOf[i] = s ? s[2] : -1;
      let color = owner >= 0 ? (polities[owner].color ?? fallbackColor(polities[owner].id)) : null;
      if (color && certOf[i] === indirect) color = indirectColor(color);
      if (color !== this.colorOf[i]) {
        this.map.setFeatureState({ source: "pieces", id: i }, { c: color });
        this.colorOf[i] = color;
      }
    }

    // 保護国・植民地の区画（副ラベルを出すまとまり）
    const subs = this.subUnits(year);
    const subOf = new Int32Array(this.geoms.length).fill(-1);
    subs.forEach((u, k) => {
      for (const i of u.pieces) subOf[i] = k;
    });

    // 所属と確からしさの同じピースのまとまり（保護国などの区画は分けておき、国名ラベルを置かない）。
    // 間接統治（indirect）は斜線を描かないので、持ち主の直轄地と同じまとまりにする（国名ラベル・外形が1つの国になる）
    const groups = new Map<string, { owner: number; cert: number; sub: boolean; pieces: number[] }>();
    for (let i = 0; i < this.geoms.length; i++) {
      const owner = this.ownerOf[i];
      const sub = subOf[i] >= 0;
      const cert = certOf[i] === indirect ? 0 : certOf[i];
      const key = `${owner}|${cert}${sub ? "|s" : ""}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { owner, cert, sub, pieces: [] }));
      g.pieces.push(i);
    }

    // 斜線（不確実・名目的・占領）と、国名ラベルの位置
    const certNames = idx.atlas.certainty;
    const hatch: Feature[] = [];
    // 政体ごとの多角形（どの結合結果の何番目か）
    const polys = new Map<number, { m: Merged; k: number; area: number }[]>();
    for (const [key, g] of groups) {
      if (g.owner < 0) continue;
      const m = this.merged(key, g.pieces);
      if (HATCHED_CERT.has(certNames[g.cert])) hatch.push({ type: "Feature", properties: { pat: `hatch-${certNames[g.cert]}` }, geometry: m.geo });
      if (g.sub) continue;
      let list = polys.get(g.owner);
      if (!list) polys.set(g.owner, (list = []));
      polyAreas(m).forEach((area, k) => list.push({ m, k, area }));
    }
    this.setData("hatch", { type: "FeatureCollection", features: hatch });
    // 国名は首都のある塊に置く（植民地のほうが広い国でも、本国に名前が出るように）。
    // 首都のない塊のほうが広ければ、そこにも同じ名前を出す
    const capitals = this.capitalPoints(year);
    const labels: Feature[] = [];
    for (const [owner, list] of polys) {
      const name = idx.shortName(polities[owner], year);
      let big = list[0];
      for (const p of list) if (p.area > big.area) big = p;
      const cap = capitals.get(owner);
      let home = big;
      if (cap) {
        const c = list.find((p) => p.area >= big.area * 0.03 && inRing(cap, p.m.geo.coordinates[p.k][0]));
        if (c) home = c;
      }
      for (const p of home === big ? [big] : [home, big]) {
        const l = polyLabelOf(p.m, p.k);
        if (l) labels.push(labelFeature(name, l));
      }
    }
    this.setData("labels", { type: "FeatureCollection", features: labels });

    // 保護国・植民地の副ラベルと、その範囲の境界
    const sublabels: Feature[] = [];
    subs.forEach((u) => {
      const l = this.merged(`sub${u.owner}|${u.name}`, u.pieces).label;
      if (l) sublabels.push(labelFeature(u.name, l, { note: u.note, scale: 0.9, chars: Math.max([...u.name].length, [...u.note].length * 0.72) }));
    });
    this.setData("sublabels", { type: "FeatureCollection", features: sublabels });
    const subKey = "sub" + hashInts(subOf) + hashInts(this.ownerOf);
    let sb = this.meshCache.get(subKey);
    if (!sb) {
      sb = EMPTY;
      if (subs.length) {
        const pos = this.posMap();
        const own = this.ownerOf;
        const geom = mesh(this.topo, this.dataObj(this.pending), (a, b) => {
          const i = pos.get(a)!;
          const j = pos.get(b)!;
          return a !== b && own[i] === own[j] && subOf[i] !== subOf[j];
        });
        sb = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geom as Geometry }] };
      }
      this.meshCache.set(subKey, sb);
    }
    this.setData("subunits", sb);

    // 国境線（所属の違うピースの間と、海岸線）
    const own = this.ownerOf;
    const key = hashInts(own);
    let bd = this.meshCache.get(key);
    if (!bd) {
      const pos = this.posMap();
      const geom = mesh(this.topo, this.dataObj(this.pending), (a, b) => a === b || own[pos.get(a)!] !== own[pos.get(b)!]);
      bd = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: dropArtificialEdges(geom as Geometry) }] };
      if (this.meshCache.size > 300) this.meshCache.clear();
      this.meshCache.set(key, bd);
    }
    this.setData("borders", bd);

    // 上位政体の外枠
    const ovKey = "ov" + hashInts(this.ovOf);
    let ov = this.meshCache.get(ovKey);
    if (!ov) {
      const pos = this.posMap();
      const ovs = new Set(Array.from(this.ovOf).filter((o) => o >= 0 && EMPIRE_FRAMES.has(polities[o].id)));
      const features: Feature[] = [];
      for (const o of ovs) {
        const is = (g: unknown) => this.ovOf[pos.get(g)!] === o;
        const geom = mesh(this.topo, this.dataObj(this.pending), (a, b) => (a === b ? is(a) : is(a) !== is(b)));
        features.push({
          type: "Feature",
          properties: { kind: "empire" },
          geometry: geom as Geometry,
        });
      }
      ov = { type: "FeatureCollection", features };
      this.meshCache.set(ovKey, ov);
    }
    this.setData("overlords", ov);

    // 宗主権：宗主権下の国（owner と overlord の組）ごとの塊。帯は輪の内側に描く
    const suzGroups = new Map<string, { o: number; owner: number; pieces: number[] }>();
    for (let i = 0; i < this.geoms.length; i++) {
      const o = this.ovOf[i];
      if (o < 0 || EMPIRE_FRAMES.has(polities[o].id) || this.ownerOf[i] < 0) continue;
      const k = `${o}|${this.ownerOf[i]}`;
      let g = suzGroups.get(k);
      if (!g) suzGroups.set(k, (g = { o, owner: this.ownerOf[i], pieces: [] }));
      g.pieces.push(i);
    }
    const suz: Feature[] = [];
    for (const [k, g] of suzGroups) {
      const color = polities[g.o].color ?? fallbackColor(polities[g.o].id);
      const m = this.merged(`suz${k}`, g.pieces);
      suz.push({
        type: "Feature",
        properties: { color: shade(color, 0.82), edge: shade(color, 0.55) },
        geometry: inwardRings(m),
      });
    }
    this.setData("suz", { type: "FeatureCollection", features: suz });

    this.setData("cities", this.historicCities(year));
    this.map.setFilter("rivers", this.riverFilter(year));
    this.map.setFilter("rivers-label", this.riverFilter(year, 1.2));
    if (isDist(this.layer)) this.renderReligion(year);
    this.renderMovement();
    this.renderHighlight();
  }

  /** その年の首都の位置（政体 index → [経度, 緯度]）。首都が複数あれば人口の多いほう */
  private capitalPoints(year: number): Map<number, [number, number]> {
    const out = new Map<number, [number, number]>();
    const best = new Map<number, number>();
    for (const c of this.idx.atlas.cities ?? []) {
      const pid = cityCapitalOf(c, year);
      if (!pid) continue;
      const i = this.idx.polityIndex.get(pid);
      if (i === undefined) continue;
      const pop = cityPop(c, year);
      if ((best.get(i) ?? -1) >= pop) continue;
      best.set(i, pop);
      out.set(i, [c.lon, c.lat]);
    }
    return out;
  }

  private subCache = new Map<number, SubUnit[]>();
  /**
   * 保護国・植民地の副ラベルの区画。宗主国の色で塗る保護国（チュニジア・モロッコ・エジプトなど）の名前を
   * 地図に残すため、データから次のように自動で求める。
   * - ピースごとに、今の owner になる前の owner（元の国）をたどる
   * - 同じ owner・同じ元の国のピースを1つのまとまりにする。元の国がもう地図にほとんど残っていないこと
   *   （残りのピースがまとまりより少ない）と、owner の全体ではないこと
   * - そのうち、効いている地域の記述（地域名・cause・note）に「（owner の名前）…保護／委任統治／植民地」と
   *   あるピースが4分の1以上あるものだけを出す（ふつうの併合・割譲は出さない）。2行目の文言は記述と certainty から
   *   「○○の保護下」「○○の委任統治」「○○の植民地」を選び、certainty が occupied のピースが過半なら「○○の占領下」にする
   *   （「占領」の語では判定しない。解放の記述「ドイツによる○○占領が終わる」などで誤って出るため）
   * - 地域の timeline の項目に label があれば、それを優先する（空文字なら出さない）。このときは2行目を自動では
   *   付けない（必要な情報は label に書く。label に改行があれば、改行の後ろを2行目として小さく出す）
   */
  private subUnits(year: number): SubUnit[] {
    const hit = this.subCache.get(year);
    if (hit) return hit;
    const idx = this.idx;
    const polities = idx.atlas.polities;
    const regions = idx.atlas.regions;
    const n = this.geoms.length;
    const count = new Map<number, number>();
    for (let i = 0; i < n; i++) if (this.ownerOf[i] >= 0) count.set(this.ownerOf[i], (count.get(this.ownerOf[i]) ?? 0) + 1);
    const entryOf = (r: number) => {
      let cur: TimelineEntry | null = null;
      for (const e of regions[r]?.timeline ?? []) if (e.from <= year) cur = e;
      return cur;
    };
    type Kind = "prot" | "mandate" | "colony" | "occ";
    const auto = new Map<string, { owner: number; pred: number; pieces: number[]; hit: number; occ: number; kinds: Record<"prot" | "mandate" | "colony", number> }>();
    const explicit = new Map<string, SubUnit>();
    const reCache = new Map<number, RegExp>();
    for (let i = 0; i < n; i++) {
      const a = this.atlasIdx[i];
      const owner = this.ownerOf[i];
      if (a < 0 || owner < 0) continue;
      const tl = idx.atlas.pieceTimelines[a];
      const s = idx.pieceState(a, year)!;
      const e = entryOf(s[4]);
      if (e?.label !== undefined) {
        if (!e.label) continue;
        const k = `${owner}|${e.label}`;
        let u = explicit.get(k);
        if (!u) {
          const [name, ...rest] = e.label.split("\n");
          explicit.set(k, (u = { owner, name, note: rest.join(" ").trim(), pieces: [] }));
        }
        u.pieces.push(i);
        continue;
      }
      let pred = -1;
      for (let j = tl.indexOf(s) - 1; j >= 0; j--) {
        const o = tl[j][1];
        if (o >= 0 && o !== owner) {
          pred = o;
          break;
        }
      }
      if (pred < 0) continue;
      const k = `${owner}|${pred}`;
      let g = auto.get(k);
      if (!g) auto.set(k, (g = { owner, pred, pieces: [], hit: 0, occ: 0, kinds: { prot: 0, mandate: 0, colony: 0 } }));
      g.pieces.push(i);
      let re = reCache.get(owner);
      if (!re) {
        const ownerShort = idx.shortName(polities[owner], year);
        reCache.set(owner, (re = new RegExp(`${escapeRe([...ownerShort].slice(0, 3).join(""))}[^。、]{0,14}(委任統治|植民地|保護)`)));
      }
      const m = re.exec(`${regions[s[4]]?.name ?? ""} ${e?.cause ?? ""} ${e?.note ?? ""}`);
      if (m) {
        g.hit++;
        g.kinds[m[1] === "委任統治" ? "mandate" : m[1] === "植民地" ? "colony" : "prot"]++;
      }
      if (idx.atlas.certainty[s[3]] === "occupied") g.occ++;
    }
    const out: SubUnit[] = [...explicit.values()];
    for (const g of auto.values()) {
      const len = g.pieces.length;
      if (g.hit * 4 < len || (count.get(g.pred) ?? 0) >= len || count.get(g.owner) === len) continue;
      const ownerShort = idx.shortName(polities[g.owner], year);
      // certainty が occupied のピースが過半なら占領下。そうでなければ記述でいちばん多い語
      const kd = g.kinds;
      const kind: Kind =
        g.occ * 2 > len ? "occ" : kd.mandate > kd.prot && kd.mandate >= kd.colony ? "mandate" : kd.colony > kd.prot ? "colony" : "prot";
      const word: Record<Kind, string> = { prot: "の保護下", mandate: "の委任統治", colony: "の植民地", occ: "の占領下" };
      out.push({
        owner: g.owner,
        name: idx.shortName(polities[g.pred], year),
        note: `${ownerShort}${word[kind]}`,
        pieces: g.pieces,
      });
    }
    if (this.subCache.size > 400) this.subCache.clear();
    this.subCache.set(year, out);
    return out;
  }

  /** 川の表示条件：拡大率が minz（+ extra）以上で、運河は開通年（from）以降 */
  private riverFilter(year: number, extra = 0): maplibregl.FilterSpecification {
    return [
      "all",
      [">=", ["zoom"], ["+", ["get", "minz"], extra]],
      ["any", ["!", ["has", "from"]], ["<=", ["get", "from"], year]],
    ] as maplibregl.FilterSpecification;
  }

  // ---- 分布（宗教・言語）の表示 ----
  private renderReligion(year: number) {
    const key = this.layer as DistKey;
    const kinds = this.idx.dist(key)?.kinds ?? [];
    const groups = new Map<string, number[]>();
    for (let i = 0; i < this.geoms.length; i++) {
      const s = this.atlasIdx[i] >= 0 ? this.idx.distState(key, this.atlasIdx[i], year) : null;
      const main = s ? s[1] : -1;
      this.relMain[i] = main;
      this.relRegion[i] = s ? s[3] : -1;
      // 世俗化した地域は、宗派の色を地の色に寄せて薄くする
      const sec = s && s[4] ? s[4] : 0;
      const color = main >= 0 ? secularColor(kinds[main].color, sec) : null;
      if (color !== this.relColorOf[i]) {
        this.map.setFeatureState({ source: "pieces", id: i }, { r: color });
        this.relColorOf[i] = color;
      }
      if (s && s[2] >= 0) {
        const k = `${s[2]}:${Math.round(sec * 10)}`;
        let g = groups.get(k);
        if (!g) groups.set(k, (g = []));
        g.push(i);
      }
    }
    // 少数派の斜線（同じ minor のピースを結合）
    const hatch: Feature[] = [];
    for (const [k, ps] of groups) {
      const [minor, sec10] = k.split(":");
      // 斜線も、世俗化の度合いに合わせて薄くする
      const op = 1 - secularFade(Number(sec10) / 10);
      hatch.push({ type: "Feature", properties: { pat: `${key}-hatch-${minor}`, op }, geometry: this.merged(`${key}h${k}`, ps).geo });
    }
    this.setData("rel-hatch", { type: "FeatureCollection", features: hatch });

    // 宗教・言語の境界（main の違うピースの間と、海岸線）
    const own = this.relMain;
    const mkey = key + hashInts(own);
    let bd = this.meshCache.get(mkey);
    if (!bd) {
      const pos = this.posMap();
      const geom = mesh(this.topo, this.dataObj(this.distPending[key]), (a, b) => a === b || own[pos.get(a)!] !== own[pos.get(b)!]);
      bd = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: dropArtificialEdges(geom as Geometry) }] };
      if (this.meshCache.size > 300) this.meshCache.clear();
      this.meshCache.set(mkey, bd);
    }
    this.setData("rel-borders", bd);
  }

  /** 地図の主題（政治／宗教／言語）を切り替える */
  setLayer(layer: MapLayer) {
    if (layer === this.layer) return;
    this.layer = layer;
    this.relSelected = -1;
    this.tooltip.style.display = "none";
    if (!this.loaded) {
      this.ready.then(() => {
        if (this.year) this.render(this.year);
        this.applyModern();
      });
      return;
    }
    if (this.year) this.render(this.year);
    this.applyModern();
  }

  private idleWaiting = new Set<() => void>();
  /** 次に地図の描画が落ち着いたとき（同じ関数は1回だけ） */
  whenIdle(cb: () => void) {
    if (!this.loaded || this.idleWaiting.has(cb)) return;
    this.idleWaiting.add(cb);
    this.map.once("idle", () => {
      this.idleWaiting.delete(cb);
      cb();
    });
  }

  /** 地図を動かし終えたとき（ドラッグ・拡大・移動のアニメーションの終わり） */
  onMoveEnd(cb: () => void) {
    this.map.on("moveend", cb);
  }

  /** 地図の位置（中心・拡大率）。履歴で戻るときに使う */
  getView(): { lon: number; lat: number; zoom: number } {
    const c = this.map.getCenter();
    return { lon: c.lng, lat: c.lat, zoom: this.map.getZoom() };
  }

  /**
   * 地図に映っているかを調べる関数（地図の準備前は null）。
   * visibleBottom：地図の上端から、見えている部分の下端までのピクセル（省略時は下のシートの最小の高さを除いた範囲）。
   * 返す関数は、点が画面に映っているか、と画面の中心からの角距離（度）を返す。
   * 地球儀の裏側（地平線の向こう）は除く。
   */
  viewProbe(visibleBottom?: number): ((lon: number, lat: number) => { inView: boolean; dist: number }) | null {
    if (!this.loaded) return null;
    const c = this.map.getCenter();
    const { width } = this.viewSize();
    // スマホでは下のシートの上端（引き上げたときはその分だけ地図が隠れる）
    const height = visibleBottom ?? this.viewSize().height;
    const rad = Math.PI / 180;
    const lat0 = c.lat * rad;
    const lon0 = c.lng * rad;
    return (lon, lat) => {
      const la = lat * rad;
      const cosd = Math.sin(lat0) * Math.sin(la) + Math.cos(lat0) * Math.cos(la) * Math.cos(lon * rad - lon0);
      const dist = Math.acos(Math.max(-1, Math.min(1, cosd))) / rad;
      if (dist > 85) return { inView: false, dist };
      const p = this.map.project([lon, lat]);
      if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) return { inView: false, dist };
      // 地球儀の地平線の向こうの点も画面内に投影されるので、画面の点から逆に求めた経緯度と比べて除く
      const back = this.map.unproject(p);
      const near = Math.abs(back.lat - lat) < 0.5 && Math.abs((((back.lng - lon + 540) % 360) - 180)) < 0.5;
      return { inView: near, dist };
    };
  }

  setView(v: { lon: number; lat: number; zoom: number }) {
    this.map.jumpTo({ center: [v.lon, v.lat], zoom: v.zoom });
  }

  get currentLayer(): MapLayer {
    return this.layer;
  }

  /**
   * いま分布の表示で描いている種類（凡例用。データのないピースがあれば nodata = true）。
   * onScreen なら、画面に見えているピースだけを数える（地図の準備前は全体）
   */
  religionKindsShown(onScreen = false): { kinds: number[]; minors: boolean; nodata: boolean; pending: boolean; secular: boolean } {
    const key: DistKey = isDist(this.layer) ? this.layer : "religion";
    const set = new Set<number>();
    let nodata = false;
    let pending = false;
    let minors = false;
    let secular = false;
    let visible: Iterable<number> | null = null;
    if (onScreen && this.loaded) {
      const seen = new Set<number>();
      for (const f of this.map.queryRenderedFeatures({ layers: ["rel-fill"] })) seen.add(Number(f.id));
      if (seen.size) visible = seen;
    }
    const all = visible ?? this.geoms.keys();
    for (const i of all) {
      const s = this.atlasIdx[i] >= 0 ? this.idx.distState(key, this.atlasIdx[i], this.year) : null;
      if (!s || s[1] < 0) {
        if (this.distPending[key][i]) pending = true;
        else nodata = true;
        continue;
      }
      set.add(s[1]);
      if (s[4] && s[4] >= 0.2) secular = true;
      if (s[2] >= 0) {
        minors = true;
        set.add(s[2]); // minor にしか出てこない種類も凡例に入れる
      }
    }
    return { kinds: [...set].sort((a, b) => a - b), minors, nodata, pending, secular };
  }

  /** 宗教表示で選んでいる地域（枠で強調する）。-1 で解除 */
  setReligionSelected(region: number) {
    this.relSelected = region;
    this.renderHighlight();
  }

  /** 分布の地域の、その年の記述 */
  religionEntry(region: number): ReligionEntry | null {
    return isDist(this.layer) ? this.idx.distEntry(this.layer, region, this.year) : null;
  }

  /** パネルの変化の行で指した地域群を強調する（その年に、その地域の記述が効いているピース）。null で解除 */
  flashRegions(kind: MapLayer, regions: number[] | null) {
    if (!this.loaded) return;
    if (!regions || !regions.length) {
      this.setData("flash", EMPTY);
      return;
    }
    const set = new Set(regions);
    const ps: number[] = [];
    for (let i = 0; i < this.geoms.length; i++) {
      const a = this.atlasIdx[i];
      if (a < 0) continue;
      const st = kind === "political" ? this.idx.pieceState(a, this.year) : this.idx.distState(kind, a, this.year);
      const r = st ? (st as number[])[kind === "political" ? 4 : 3] : -1;
      if (set.has(r)) ps.push(i);
    }
    this.setData(
      "flash",
      ps.length ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: this.merged(`fl${kind}`, ps).geo }] } : EMPTY,
    );
  }

  // ---- 潮流の広がり ----
  /** 地図上で広がりを見せる潮流（null で解除） */
  setMovement(m: Movement | null) {
    if (m === this.movement) return;
    this.movement = m;
    if (this.loaded) this.renderMovement();
    else this.ready.then(() => this.renderMovement());
  }

  private renderMovement() {
    if (!this.loaded) return;
    const m = this.movement;
    const on = !!m;
    for (const l of ["mv-veil", "mv-fill", "mv-glow", "mv-core", "mv-center-glow"]) {
      this.map.setLayoutProperty(l, "visibility", on ? "visible" : "none");
    }
    clearInterval(this.mvTimer);
    this.mvTimer = 0;
    if (!m) {
      this.setData("mv", EMPTY);
      return;
    }
    const year = this.year;
    const n = this.geoms.length;
    const level = new Float32Array(n);
    const center = new Uint8Array(n);
    const regionPieces = this.idx.atlas.movementRegions ?? {};
    const homes = this.idx.atlas.movementHome ?? {};
    const occupied = this.idx.atlas.certainty.indexOf("occupied");
    const topoOf = this.topoIndexOfAtlas();
    for (const sp of m.spread) {
      const v = curveAt(sp.curve, year);
      if (v <= 0) continue;
      // 政体 index → その年の本国のピース（atlas の index。null なら全領域）
      const pol = new Map<number | undefined, Set<number> | null>();
      for (const id of sp.polities) {
        const h = sp.colonies ? undefined : homes[id];
        let set: Set<number> | null = null;
        if (h) {
          set = new Set();
          for (const [from, to, ps] of h) if ((from == null || from <= year) && (to == null || year <= to)) for (const a of ps) set.add(a);
        }
        pol.set(this.idx.polityIndex.get(id), set);
      }
      const excluded = new Set<number>();
      for (const r of sp.exclude ?? []) for (const a of regionPieces[r] ?? []) excluded.add(a);
      const apply = (i: number) => {
        if (excluded.size && excluded.has(this.atlasIdx[i])) return;
        if (v > level[i]) level[i] = v;
        if (sp.center) center[i] = 1;
      };
      if (pol.size)
        for (let i = 0; i < n; i++) {
          if (!pol.has(this.ownerOf[i])) continue;
          if (!sp.colonies) {
            if (this.certOf[i] === occupied) continue;
            const home = pol.get(this.ownerOf[i]);
            if (home && !home.has(this.atlasIdx[i])) continue;
          }
          apply(i);
        }
      for (const r of sp.regions) for (const a of regionPieces[r] ?? []) {
        const i = topoOf[a];
        if (i >= 0) apply(i);
      }
    }
    // 勢いを 6 段階にまとめ、同じ段階・発信地かどうかの同じピースを結合する
    const groups = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      if (level[i] <= 0) continue;
      const lvl = Math.max(1, Math.round(level[i] * 6));
      const k = `${lvl}|${center[i]}`;
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(i);
    }
    const color = MOVEMENT_COLORS[m.kind] ?? "#777";
    const features: Feature[] = [];
    for (const [k, ps] of groups) {
      const [lvl, c] = k.split("|").map(Number);
      features.push({
        type: "Feature",
        properties: { lvl: lvl / 6, center: c === 1, color },
        geometry: this.merged(`mv${k}`, ps).geo,
      });
    }
    // 弱いものから描いて、強いものを上に重ねる
    features.sort((a, b) => (a.properties!.lvl as number) - (b.properties!.lvl as number));
    this.setData("mv", { type: "FeatureCollection", features });
    // 発信地は、ゆっくり明滅させる（脈打つ光）
    if (features.some((f) => f.properties!.center)) {
      const t0 = performance.now();
      this.mvTimer = window.setInterval(() => {
        if (document.hidden) return;
        const ph = (Math.sin(((performance.now() - t0) / 1600) * Math.PI * 2) + 1) / 2;
        this.map.setPaintProperty("mv-center-glow", "line-opacity", 0.45 + 0.45 * ph);
      }, 90);
    }
  }

  private topoOfAtlasCache: Int32Array | null = null;
  /** atlas のピース番号 → topo のピース番号 */
  private topoIndexOfAtlas(): Int32Array {
    if (!this.topoOfAtlasCache) {
      const a = new Int32Array(this.idx.atlas.pieceIds.length).fill(-1);
      this.atlasIdx.forEach((ai, ti) => {
        if (ai >= 0) a[ai] = ti;
      });
      this.topoOfAtlasCache = a;
    }
    return this.topoOfAtlasCache;
  }

  /**
   * 歴史データのあるピースだけの GeometryCollection。年ごとの境界線（mesh）はこれだけで計算して軽くする。
   * データのないピースとの境は、この中では1つのピースだけが使う弧（a === b）になるので、境界として描かれる
   */
  private dataObjCache = new Map<boolean[], GeometryCollection>();
  private dataObj(pend: boolean[]): never {
    let o = this.dataObjCache.get(pend);
    if (!o) {
      const gs = (this.topo.objects.pieces as GeometryCollection).geometries;
      o = { type: "GeometryCollection", geometries: gs.filter((_, i) => !pend[i]) };
      this.dataObjCache.set(pend, o);
    }
    return o as never;
  }

  /** 歴史データのないピースの海岸線（とデータのある地域との境）。年によって変わらないので一度だけ作る */
  private coastCache = new Map<boolean[], Feature>();
  private pendingCoast(pend: boolean[]): Feature {
    let f = this.coastCache.get(pend);
    if (!f) {
      const gs = (this.topo.objects.pieces as GeometryCollection).geometries;
      const obj = { type: "GeometryCollection", geometries: gs.filter((_, i) => pend[i]) };
      f = { type: "Feature", properties: {}, geometry: dropArtificialEdges(mesh(this.topo, obj as never, (a, b) => a === b) as Geometry) };
      this.coastCache.set(pend, f);
    }
    return f;
  }

  private posMapCache: Map<unknown, number> | null = null;
  private posMap() {
    if (!this.posMapCache) {
      const gs = (this.topo.objects.pieces as GeometryCollection).geometries;
      this.posMapCache = new Map(gs.map((g, i) => [g, i]));
    }
    return this.posMapCache;
  }

  private setData(source: string, data: FeatureCollection) {
    (this.map.getSource(source) as GeoJSONSource | undefined)?.setData(data);
  }

  /** ピースの集まりを結合した結果。同じ集まりはキャッシュから返す */
  private merged(prefix: string, pieces: number[]): Merged {
    const key = `${prefix}|${pieces.length}|${hashInts(pieces)}`;
    let m = this.cache.get(key);
    if (m) return m;
    const geo = merge(this.topo, pieces.map((i) => this.geoms[i]) as never) as GeoMultiPolygon;
    m = { geo, label: labelPoint(geo) };
    if (this.cache.size > 3000) this.cache.clear();
    this.cache.set(key, m);
    return m;
  }

  // ---- 都市 ----
  private historicCities(year: number): FeatureCollection {
    const features: Feature[] = [];
    for (const c of this.idx.atlas.cities ?? []) {
      if ((c.founded && year < c.founded) || (c.until && year > c.until)) continue;
      features.push(cityFeature(cityName(c, year), c.lon, c.lat, cityPop(c, year), !!cityCapitalOf(c, year)));
    }
    declutterCities(features);
    return { type: "FeatureCollection", features };
  }

  private modernCities(): FeatureCollection {
    // 現代の都市は人口が桁違いに多いので、表示の段階をそろえるために縮めて扱う
    return {
      type: "FeatureCollection",
      features: (this.idx.atlas.citiesModern ?? []).map((c) => cityFeature(c.name, c.lon, c.lat, c.pop / 8, c.capital)),
    };
  }

  private seas(): FeatureCollection {
    const style = { ocean: [16, 1, 0], sea: [13, 2.6, 1], gulf: [11, 4, 2], strait: [10, 4.8, 3] } as const;
    return {
      type: "FeatureCollection",
      features: (this.idx.atlas.seas ?? []).map((s) => {
        const [size, minz, rank] = style[s.kind] ?? style.sea;
        return {
          type: "Feature",
          properties: { name: s.name, s: size, minz, rank },
          geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        };
      }),
    };
  }

  // ---- 現代の国境 ----
  private modernColors(): Map<string, string> {
    const nb = neighbors(this.geoms as never);
    const adj = new Map<string, Set<string>>();
    nb.forEach((list, i) => {
      const a = this.geoms[i].properties!.iso;
      for (const j of list) {
        const b = this.geoms[j].properties!.iso;
        if (a === b) continue;
        if (!adj.has(a)) adj.set(a, new Set());
        adj.get(a)!.add(b);
      }
    });
    return assignColors([...new Set(this.geoms.map((g) => g.properties!.iso))], adj);
  }

  private modernBorders(): FeatureCollection {
    const pos = this.posMap();
    const iso = (g: unknown) => this.geoms[pos.get(g)!].properties!.iso;
    const geom = mesh(this.topo, this.topo.objects.pieces as never, (a, b) => a === b || iso(a) !== iso(b));
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: dropArtificialEdges(geom as Geometry) }] };
  }

  private modernLabels(): FeatureCollection {
    const byIso = new Map<string, number[]>();
    this.geoms.forEach((g, i) => {
      const iso = g.properties!.iso;
      if (!byIso.has(iso)) byIso.set(iso, []);
      byIso.get(iso)!.push(i);
    });
    const features: Feature[] = [];
    for (const [iso, ps] of byIso) {
      const l = this.merged(`modern${iso}`, ps).label;
      if (l) features.push(labelFeature(modernName(iso), l));
    }
    return { type: "FeatureCollection", features };
  }

  /** 歴史データのない地域の、現代の国どうしの境界（データのある地域との境と海岸線は、ふつうの国境線で描く） */
  private pendingBorders(): FeatureCollection {
    const pos = this.posMap();
    const pend = this.pending;
    const iso = (i: number) => this.geoms[i].properties!.iso;
    const geom = mesh(this.topo, this.topo.objects.pieces as never, (a, b) => {
      const i = pos.get(a)!;
      const j = pos.get(b)!;
      return a !== b && pend[i] && pend[j] && iso(i) !== iso(j);
    });
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geom as Geometry }] };
  }

  /** 歴史データのない地域の、現代の国名（国のうちデータのない部分に置く） */
  private pendingLabels(): FeatureCollection {
    const byIso = new Map<string, number[]>();
    this.geoms.forEach((g, i) => {
      if (!this.pending[i]) return;
      const iso = g.properties!.iso;
      if (!(iso in MODERN_NAMES)) return; // 係争地の小さな区画には名前を出さない
      if (!byIso.has(iso)) byIso.set(iso, []);
      byIso.get(iso)!.push(i);
    });
    const features: Feature[] = [];
    for (const [iso, ps] of byIso) {
      const l = this.merged(`pending${iso}`, ps).label;
      if (l) features.push(labelFeature(modernName(iso), l, { scale: 0.85 }));
    }
    return { type: "FeatureCollection", features };
  }

  /** 現代の国境を表示するかどうか */
  setModern(on: boolean) {
    this.modernOn = on;
    if (!this.loaded) {
      this.ready.then(() => this.applyModern());
      return;
    }
    this.applyModern();
  }

  private applyModern() {
    const on = this.modernOn;
    const lb = this.labelsOn;
    const rel = isDist(this.layer);
    const set = (layers: string[], v: boolean) => {
      for (const l of layers) this.map.setLayoutProperty(l, "visibility", v ? "visible" : "none");
    };
    // 塗り：宗教表示なら宗教、そうでなければ現代／その時代
    set(["rel-fill", "rel-seam", "rel-hatch", "rel-borders"], rel);
    set(["modern-fill", "modern-seam"], on && !rel);
    set(["fill", "seam", "hatch"], !on && !rel);
    // 線・ラベル：宗教表示でも、重ねる国境は現代／その時代を切り替えられる
    set(["modern-borders", "modern-cities-dot"], on);
    set(["modern-labels", "modern-cities-label"], on && lb);
    set(["borders", "pending-coast", "cities-dot", "highlight"], !on || rel);
    set(["frames", "suz-band", "suzerain", "subunit-borders"], !on && !rel);
    set(["pending-borders"], !on);
    set(["pending-labels"], !on && lb);
    if (rel) {
      const prop = this.layer === "language" ? "lc" : "rc";
      this.map.setPaintProperty("rel-fill", "fill-color", ["coalesce", ["feature-state", "r"], ["get", prop]]);
      this.map.setPaintProperty("rel-seam", "line-color", ["coalesce", ["feature-state", "r"], ["get", prop]]);
    }
    set(["labels", "cities-label", "sublabels"], !on && lb);
    set(["seas", "rivers-label", "lakes-label"], lb);
    // 宗教表示では、国境と国名を薄くして宗教の塗り分けを主役にする
    for (const l of ["borders", "pending-coast"]) {
      this.map.setPaintProperty(l, "line-opacity", rel ? 0.35 : 0.85);
      this.map.setPaintProperty(l, "line-color", rel ? "#2e2822" : "#4a4038");
    }
    this.map.setPaintProperty("modern-borders", "line-opacity", rel ? 0.45 : 1);
    for (const l of ["labels", "modern-labels"]) {
      this.map.setPaintProperty(l, "text-opacity", rel ? 0.4 : 0.62);
      this.map.setPaintProperty(l, "text-halo-color", rel ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.45)");
    }
    this.map.setPaintProperty("sublabels", "text-opacity", rel ? 0.45 : 0.72);
  }

  private labelsOn = true;

  /** 国名・都市名・海の名前を表示するかどうか（H キー） */
  setLabels(on: boolean) {
    this.labelsOn = on;
    if (this.loaded) this.applyModern();
    else this.ready.then(() => this.applyModern());
  }

  get labelsVisible() {
    return this.labelsOn;
  }

  get isModern() {
    return this.modernOn;
  }

  // ---- 選択・移動 ----
  setSelected(id: string | null) {
    this.selected = id;
    this.renderHighlight();
  }

  private polityGeo(id: string): GeoMultiPolygon | null {
    const i = this.idx.polityIndex.get(id);
    const ps: number[] = [];
    for (let j = 0; j < this.geoms.length; j++) if (this.ownerOf[j] === i) ps.push(j);
    return ps.length ? this.merged(`sel${i}`, ps).geo : null;
  }

  private renderHighlight() {
    if (!this.loaded) return;
    let geo: GeoMultiPolygon | null = null;
    if (isDist(this.layer)) {
      const r = this.relSelected;
      const ps: number[] = [];
      if (r >= 0) for (let j = 0; j < this.geoms.length; j++) if (this.relRegion[j] === r) ps.push(j);
      geo = ps.length ? this.merged(`${this.layer}sel${r}`, ps).geo : null;
    } else geo = this.selected ? this.polityGeo(this.selected) : null;
    this.setData("highlight", geo ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geo }] } : EMPTY);
  }

  /** そのピースが今の年に間接統治（certainty: indirect）か */
  private isIndirect(i: number): boolean {
    return this.ownerOf[i] >= 0 && this.idx.atlas.certainty[this.certOf[i]] === "indirect";
  }

  /** そのピースの、今の年に効いている地域の名前 */
  private regionOf(i: number): string {
    const a = this.atlasIdx[i];
    const s = a >= 0 ? this.idx.pieceState(a, this.year) : null;
    const r = s ? this.idx.atlas.regions[s[4]] : undefined;
    return r ? this.idx.regionName(r, this.year) : "";
  }

  /**
   * その政体の、今の年に間接統治（藩部など）の地域の名前（広い順）。
   * all = true なら、その政体の全体が間接統治
   */
  indirectOf(id: string): { names: string[]; all: boolean } | null {
    const o = this.idx.polityIndex.get(id);
    if (o === undefined) return null;
    const count = new Map<string, number>();
    let total = 0;
    let n = 0;
    for (let i = 0; i < this.geoms.length; i++) {
      if (this.ownerOf[i] !== o) continue;
      total++;
      if (!this.isIndirect(i)) continue;
      n++;
      const r = this.regionOf(i);
      if (r) count.set(r, (count.get(r) ?? 0) + 1);
    }
    if (!n) return null;
    return { names: [...count.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]), all: n === total };
  }

  /** 間接統治の地域が、今の年の地図に（onScreen なら画面に見えている範囲に）あるか */
  indirectShown(onScreen = false): boolean {
    if (!this.loaded || isDist(this.layer) || this.modernOn) return false;
    if (onScreen) {
      for (const f of this.map.queryRenderedFeatures({ layers: ["fill"] })) if (this.isIndirect(Number(f.id))) return true;
      return false;
    }
    for (let i = 0; i < this.geoms.length; i++) if (this.isIndirect(i)) return true;
    return false;
  }

  /** その政体の領域の上位政体（いちばん多いもの）。一部だけが属していれば partial = true */
  overlordOf(id: string): { id: string; partial: boolean } | null {
    const i = this.idx.polityIndex.get(id);
    const count = new Map<number, number>();
    let total = 0;
    for (let j = 0; j < this.geoms.length; j++) {
      if (this.ownerOf[j] !== i) continue;
      total++;
      const o = this.ovOf[j];
      if (o >= 0) count.set(o, (count.get(o) ?? 0) + 1);
    }
    let best = -1;
    let n = 0;
    for (const [o, c] of count) if (c > n) [best, n] = [o, c];
    if (best < 0) return null;
    return { id: this.idx.atlas.polities[best].id, partial: n < total };
  }

  /** 選んだ政体が画面に入るように寄せる（すでに十分な大きさで収まっていれば動かさない） */
  focus(id: string) {
    if (!this.loaded) return;
    const geo = this.polityGeo(id);
    if (!geo) return;
    const b = bbox(geo);
    const view = this.map.getBounds();
    const inView = view.contains([b[0], b[1]]) && view.contains([b[2], b[3]]);
    const viewW = view.getEast() - view.getWest();
    if (inView && b[2] - b[0] > viewW * 0.08) return;
    this.map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 60, maxZoom: 6.5, duration: 700 },
    );
  }

  zoomBy(f: number) {
    this.map.easeTo({ zoom: this.map.getZoom() + Math.log2(f), duration: 250 });
  }

  resetZoom() {
    this.map.fitBounds(EUROPE, { duration: 500 });
  }

  /** 経度・緯度を中心に、最初の表示の k 倍へ拡大（確認用ツールから使う） */
  zoomTo(lon: number, lat: number, k: number) {
    this.map.jumpTo({ center: [lon, lat], zoom: this.baseZoom + Math.log2(k) });
  }

  /** 画面上で (dx, dy) ピクセルだけ動かす。duration 0 なら即座に */
  panBy(dx: number, dy: number, duration = 250) {
    this.map.panBy([dx, dy], duration ? { duration } : { duration: 0, animate: false });
  }

  /** 地図の表示部分の大きさ（ピクセル） */
  viewSize(): { width: number; height: number } {
    const c = this.map.getContainer();
    return { width: c.clientWidth, height: c.clientHeight - this.bottomInset };
  }

  /**
   * 見かけの半径が r_app ピクセルになる地球儀の半径 R（ピクセル）。MapLibre のカメラは中心の地表から
   * D = 1.5 × キャンバスの高さ（視野角 36.87°）の距離にあり、輪郭は遠近法で r_app = R / √(1 + 2R/D) に縮んで見える。
   */
  private globeRadiusFor(rApp: number): number {
    const D = 1.5 * this.map.getContainer().clientHeight;
    return (rApp * rApp) / D + Math.sqrt((rApp * rApp * rApp * rApp) / (D * D) + rApp * rApp);
  }

  /** 地球儀の半径が R ピクセルになる拡大率（MapLibre の地球儀の半径は 512·2^zoom / (2π cos 緯度)） */
  private zoomForRadius(R: number, lat: number): number {
    return Math.log2((2 * Math.PI * R * Math.cos((lat * Math.PI) / 180)) / 512);
  }

  /** 地球儀の見かけの直径が、見えている範囲の高さの frac 倍（幅の 94% には収まるように）になる拡大率 */
  private globeZoom(lat: number, frac: number): number {
    const { width, height } = this.viewSize();
    const d = Math.max(50, Math.min(frac * height, 0.94 * width));
    return this.zoomForRadius(this.globeRadiusFor(d / 2), lat);
  }

  /** いちばん引いたときに地球儀全体が見えるよう、画面の大きさから minZoom を決める */
  private updateMinZoom() {
    // 緯度 60 度を中心にしたとき（同じ拡大率で赤道中心の2倍の大きさになる）でも、直径が範囲の 9 割に収まる値
    const { width, height } = this.viewSize();
    const d = Math.max(50, 0.9 * Math.min(width, height));
    this.map.setMinZoom(Math.max(-2, this.zoomForRadius(this.globeRadiusFor(d / 2), 60)));
  }

  /** 経度・緯度へ移動する。zoom を省略したときは今の拡大率のまま（ただし minZoom より引いていれば寄せる） */
  flyTo(lon: number, lat: number, zoom?: number, minZoom = 0) {
    const z = zoom ?? Math.max(this.map.getZoom(), minZoom);
    this.map.flyTo({ center: [lon, lat], zoom: z, duration: 900, essential: true });
  }

  /** 範囲 [西, 南, 東, 北] が収まるように寄せる */
  fitBox(b: [number, number, number, number], maxZoom = 7) {
    this.map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 40, maxZoom, duration: 900, essential: true },
    );
  }

  /** 地域へ移動する（W：地球全体、E：ヨーロッパ、NA・SA・AF・AS・OC：北米・南米・アフリカ・アジア・オセアニア） */
  flyToRegion(region: MapRegion) {
    if (region === "world") {
      const c = this.map.getCenter();
      const lat = Math.max(-30, Math.min(30, c.lat));
      this.map.flyTo({ center: [c.lng, lat], zoom: Math.max(this.map.getMinZoom(), this.globeZoom(lat, 0.86)), duration: 900, essential: true });
      return;
    }
    const boxes: Record<string, [number, number, number, number]> = {
      europe: [EUROPE[0][0], EUROPE[0][1], EUROPE[1][0], EUROPE[1][1]],
      na: [-128, 14, -60, 58],
      sa: [-82, -56, -34, 13],
      af: [-18, -35, 52, 37],
      as: [40, 0, 145, 60],
      oc: [112, -47, 179, 0],
    };
    this.fitBox(boxes[region]);
  }

  /** 現代の国（ピースの iso）の範囲。ピースがなければ null */
  modernBox(iso: string): [number, number, number, number] | null {
    const ps: number[] = [];
    this.geoms.forEach((g, i) => {
      if (g.properties!.iso === iso) ps.push(i);
    });
    return ps.length ? bbox(this.merged(`modern${iso}`, ps).geo) : null;
  }

  /** 現代の国（ピースの iso）の一覧 */
  modernIsos(): string[] {
    return [...new Set(this.geoms.map((g) => g.properties!.iso))];
  }

  /** いま地図に出ている（いずれかのピースを持つ）政体の ID */
  politiesOnMap(): string[] {
    const set = new Set<number>();
    for (const o of this.ownerOf) if (o >= 0) set.add(o);
    return [...set].map((o) => this.idx.atlas.polities[o].id);
  }

  /** 検索で選んだ場所に、しばらく目印を出す */
  pulse(lon: number, lat: number) {
    // MapLibre は目印の要素そのものの transform で位置を決めるので、動きは内側の要素につける
    const el = document.createElement("div");
    el.className = "search-pulse";
    el.appendChild(document.createElement("span"));
    const m = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(this.map);
    setTimeout(() => m.remove(), 3500);
  }

  setBottomInset(px: number) {
    if (px === this.bottomInset) return;
    this.bottomInset = px;
    this.map.setPadding({ top: 0, left: 0, right: 0, bottom: px });
    if (this.loaded) this.updateMinZoom();
  }

  private hover(point: maplibregl.Point, ev: MouseEvent) {
    if (!this.loaded || (ev as PointerEvent).pointerType === "touch" || matchMedia("(hover: none)").matches) return;
    const f = this.map.queryRenderedFeatures(point, { layers: [isDist(this.layer) ? "rel-fill" : this.modernOn ? "modern-fill" : "fill"] })[0];
    let text = "";
    if (f) {
      const i = Number(f.id);
      if (isDist(this.layer)) text = this.religionHoverText(i);
      else if (this.modernOn) text = modernName(this.geoms[i].properties!.iso);
      else if (this.ownerOf[i] >= 0) {
        text = this.idx.polityName(this.idx.atlas.polities[this.ownerOf[i]], this.year);
        if (this.isIndirect(i)) {
          const r = this.regionOf(i);
          text += `\n${r ? `${r}：` : ""}間接統治`;
        }
      }
      else if (this.pending[i]) text = `${modernName(this.geoms[i].properties!.iso)}（現代の国境）\nこの地域の歴史の地図は準備中`;
      if (this.debug) {
        const p = this.geoms[i].properties!;
        text = `${text ? text + "\n" : ""}${p.id}（${p.name}）`;
      }
    }
    if (!text) {
      this.tooltip.style.display = "none";
      return;
    }
    this.tooltip.textContent = text;
    this.tooltip.style.display = "block";
    this.tooltip.style.left = `${point.x + 14}px`;
    this.tooltip.style.top = `${point.y + 14}px`;
  }

  private religionHoverText(i: number): string {
    const key = this.layer as DistKey;
    const r = this.relRegion[i];
    const e = r >= 0 ? this.idx.distEntry(key, r, this.year) : null;
    if (!e && this.distPending[key][i]) return `${modernName(this.geoms[i].properties!.iso)}（現代の国境）\n${DIST_LABEL[key]}の地図は準備中`;
    if (!e) return `${DIST_LABEL[key]}データ未整備`;
    const d = this.idx.dist(key)!;
    const nm = (id: string | null | undefined) => d.kinds.find((k) => k.id === id)?.name ?? id ?? "";
    const s = key === "religion" && this.atlasIdx[i] >= 0 ? this.idx.distState(key, this.atlasIdx[i], this.year)?.[4] : 0;
    const sec = s ? `・宗教離れ${secularText(s)}` : "";
    return `${d.regions[r].name}：${nm(e.main)}${e.minor ? `（${nm(e.minor)}も多い）` : ""}${sec}`;
  }

  /** 川と湖を読み込む（地図の初回表示の後に呼ぶ） */
  async loadWater(base: string) {
    await this.ready;
    const get = (f: string) =>
      fetch(`${base}data/${f}`)
        .then((r) => (r.ok ? (r.json() as Promise<FeatureCollection>) : null))
        .catch(() => null);
    const [rivers, lakes] = await Promise.all([get("rivers.json"), get("lakes.json")]);
    if (lakes) this.setData("lakes", lakes);
    if (rivers) {
      this.setData("rivers", rivers);
      this.setData("rivers-lbl", rivers);
    }
  }

  setDebug(on: boolean) {
    this.debug = on;
    const apply = () => this.map.setLayoutProperty("debug", "visibility", on ? "visible" : "none");
    if (this.loaded) apply();
    else this.ready.then(apply);
  }
}

// ---- 補助 ----

const KM_PER_DEG = 111.32;

/** 塊の中でラベルを置く点（最大の多角形の「内側の中心」）。経度は緯度で縮めて計算する */
function labelPoint(geo: GeoMultiPolygon): Merged["label"] {
  let best: number[][][] | null = null;
  let bestArea = 0;
  for (const poly of geo.coordinates) {
    const a = Math.abs(ringAreaKm2(poly[0]));
    if (a > bestArea) [best, bestArea] = [poly, a];
  }
  if (!best) return null;
  const k = Math.cos((best[0][0][1] * Math.PI) / 180);
  const scaled = best.map((ring) => ring.map(([x, y]) => [x * k, y] as [number, number]));
  const p = polylabel(scaled, 0.05);
  return { lon: p[0] / k, lat: p[1], area: bestArea };
}

function ringAreaKm2(ring: number[][]) {
  // 環の平均緯度で経度を縮めた平面座標に直してから、ふつうの多角形の面積（シューレース公式）を求める。
  // （以前は辺ごとに違う係数を掛けていたため、平行移動で値が変わり、面積が大きくずれていた）
  let latSum = 0;
  for (const p of ring) latSum += p[1];
  const k = Math.cos(((latSum / Math.max(1, ring.length)) * Math.PI) / 180);
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    s += x1 * k * y2 - x2 * k * y1;
  }
  return (s / 2) * KM_PER_DEG * KM_PER_DEG;
}

/** 結合結果の多角形ごとの面積（km²） */
function polyAreas(m: Merged): number[] {
  if (!m.areas) m.areas = m.geo.coordinates.map((poly) => Math.abs(ringAreaKm2(poly[0])));
  return m.areas;
}

/** 結合結果の k 番目の多角形のラベルの点 */
function polyLabelOf(m: Merged, k: number): Merged["label"] {
  if (!m.plabels) m.plabels = new Map();
  let l = m.plabels.get(k);
  if (!l) {
    const one = labelPoint({ type: "MultiPolygon", coordinates: [m.geo.coordinates[k]] });
    if (!one) return null;
    m.plabels.set(k, (l = one));
  }
  return l;
}

/** 点が輪の内側にあるか（経度・緯度の平面で判定） */
function inRing([x, y]: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inwardCache = new WeakMap<Merged, GeoMultiPolygon>();
/**
 * 輪の向きを「内側が進む向きの右」にそろえた多角形（外周は反時計回り、穴は時計回り）。
 * MapLibre の line-offset（正の値で右へずらす）で、帯を境界の内側に描くために使う
 */
function inwardRings(m: Merged): GeoMultiPolygon {
  let g = inwardCache.get(m);
  if (!g) {
    const signed = (r: number[][]) => {
      let s = 0;
      for (let i = 0, n = r.length; i < n; i++) {
        const [x1, y1] = r[i];
        const [x2, y2] = r[(i + 1) % n];
        s += x1 * y2 - x2 * y1;
      }
      return s;
    };
    g = {
      type: "MultiPolygon",
      coordinates: m.geo.coordinates.map((poly) =>
        poly.map((ring, k) => ((signed(ring) > 0) === (k === 0) ? ring : [...ring].reverse())),
      ),
    };
    inwardCache.set(m, g);
  }
  return g;
}

/** 色を暗く（f < 1）する */
/** 色 a を色 b に寄せる（t = a の割合） */
function mix(a: string, b: string, t: number): string {
  const rgb = (c: string) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    return m ? [m[1], m[2], m[3]].map((v) => parseInt(v, 16)) : [221, 221, 221];
  };
  const [x, y] = [rgb(a), rgb(b)];
  const hex = x.map((v, k) => Math.round(v * t + y[k] * (1 - t)).toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}

function shade(color: string, f: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return color;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.round(parseInt(v, 16) * f));
  return `rgb(${r},${g},${b})`;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 国名ラベル。面積から文字の大きさ（s）と、文字が塊に収まる拡大率（minz）を決める。
 * opt.scale で文字を小さめに（副ラベル）、opt.chars で幅の見積もりに使う文字数を変える
 */
function labelFeature(name: string, l: NonNullable<Merged["label"]>, opt: { note?: string; scale?: number; chars?: number } = {}): Feature {
  const side = Math.sqrt(l.area); // km
  const s = Math.max(0.85, Math.min(1.8, side / 400)) * (opt.scale ?? 1);
  const chars = Math.max(2, opt.chars ?? [...name].length);
  // 拡大率 z で 1px ≒ 40075·cos(緯度) / (512·2^z) km。文字列の幅（px）≒ 文字数 × 13·s
  const kmPx = (40075 * Math.cos((l.lat * Math.PI) / 180)) / 512;
  const minz = Math.log2((chars * 15 * s * 1.0 * kmPx) / side);
  return {
    type: "Feature",
    properties: { name, note: opt.note ?? "", s, minz: Math.max(0, minz), rank: -l.area },
    geometry: { type: "Point", coordinates: [l.lon, l.lat] },
  };
}

function cityFeature(name: string, lon: number, lat: number, pop: number, capital: boolean): Feature {
  const minz = pop >= 300000 ? 2.6 : pop >= 120000 ? 3.6 : pop >= 50000 ? 4.6 : pop >= 20000 ? 5.4 : 6.2;
  const r = pop >= 300000 ? 4.5 : pop >= 120000 ? 3.6 : pop >= 50000 ? 3 : 2.4;
  return {
    type: "Feature",
    properties: {
      name,
      capital,
      pop,
      // 大きな国の首都は早めに出す。小さな領邦の首都は、人口なりの拡大率より少し早めに出す程度にする
      minz: capital ? (pop >= 40000 ? Math.min(minz, 3.4) : minz - 0.7) : minz,
      r: capital ? r * 0.9 : r * 0.8,
      rank: -(pop + (capital ? 1e7 : 0)),
    },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

/**
 * 近すぎる都市（例：1871 年のパリとヴェルサイユ）の重なりを防ぐ。2つの都市の点が画面上で
 * CITY_GAP px より近くなる拡大率では、重要度の低いほう（人口、首都は4倍で比べる）を出さない
 * （minz を引き上げる）。都市名どうしの重なりは MapLibre が隠すが、点と名前の重なりは防げないため
 */
const CITY_GAP = 30;
function declutterCities(features: Feature[]) {
  const pts = features.map((f) => {
    const [lon, lat] = (f.geometry as { coordinates: number[] }).coordinates;
    const p = f.properties!;
    return { lon, lat, p, imp: p.pop * (p.capital ? 4 : 1) };
  });
  pts.sort((a, b) => b.imp - a.imp);
  for (let j = 1; j < pts.length; j++) {
    const b = pts[j];
    const k = Math.cos((b.lat * Math.PI) / 180);
    for (let i = 0; i < j; i++) {
      const a = pts[i];
      const dLat = a.lat - b.lat;
      if (Math.abs(dLat) > 1.5) continue;
      const dLon = (a.lon - b.lon) * k;
      if (Math.abs(dLon) > 1.5) continue;
      const km = Math.max(0.5, Math.hypot(dLon, dLat) * KM_PER_DEG);
      // 拡大率 z で 1px ≒ 40075·cos(緯度) / (512·2^z) km
      const z = Math.log2((CITY_GAP * 40075 * k) / (512 * km));
      // 重要なほうが z より手前の拡大率で出るときだけ、重なる範囲で隠す
      if (a.p.minz < z && z > b.p.minz) b.p.minz = z;
    }
  }
}

/**
 * 範囲 [西, 南, 東, 北]。日付変更線（経度 ±180）をまたぐもの（ロシア・フィジーなど）は、
 * 西経を +360 して東端が 180 を超える形のほうが狭ければ、そちらを返す
 */
function bbox(geo: GeoMultiPolygon): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  let [s0, s1] = [Infinity, -Infinity];
  for (const poly of geo.coordinates)
    for (const [x, y] of poly[0]) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      const xs = x < 0 ? x + 360 : x;
      if (xs < s0) s0 = xs;
      if (xs > s1) s1 = xs;
    }
  if (s1 - s0 < x1 - x0 - 1e-9) return [s0, y0, s1, y1];
  return [x0, y0, x1, y1];
}

/**
 * 境界線（mesh）から、データの都合でできた見かけの線を除く：日付変更線（経度 ±180）に沿った線と、
 * 南極点のまわりを切り落とした縁（南緯 84.9 度より南）
 */
function dropArtificialEdges(g: Geometry): Geometry {
  if (g.type !== "MultiLineString") return g;
  const bad = (a: number[], b: number[]) =>
    (Math.abs(a[0]) >= 179.999 && Math.abs(b[0]) >= 179.999 && Math.sign(a[0]) === Math.sign(b[0])) || (a[1] < -84.9 && b[1] < -84.9);
  const out: number[][][] = [];
  for (const line of g.coordinates) {
    let cur: number[][] = [line[0]];
    for (let k = 1; k < line.length; k++) {
      if (bad(line[k - 1], line[k])) {
        if (cur.length > 1) out.push(cur);
        cur = [line[k]];
      } else cur.push(line[k]);
    }
    if (cur.length > 1) out.push(cur);
  }
  return { type: "MultiLineString", coordinates: out };
}

/** 整数の並びの簡易ハッシュ（FNV-1a を2本） */
function hashInts(a: ArrayLike<number>): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] + 2;
    h1 = Math.imul(h1 ^ v, 16777619);
    h2 = Math.imul(h2 ^ (v * 31 + i), 2246822519);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

function hatchImage(color: string, size: number, weight = 0.25): ImageData {
  const px = size * 2;
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d")!;
  g.strokeStyle = color;
  g.lineWidth = px * weight;
  g.beginPath();
  for (const o of [-px, 0, px]) {
    g.moveTo(o, px);
    g.lineTo(o + px, 0);
  }
  g.stroke();
  return g.getImageData(0, 0, px, px);
}

/** 少数派の斜線の色：凡例の色を少し濃くして、淡い塗りの上でも見えるようにする */
/** 世俗化の割合 s の地域で、宗派の色 color をどこまで薄くして塗るか */
export function secularColor(color: string, s: number): string {
  return s > 0 ? mix(color, SECULAR_GROUND, 1 - secularFade(s)) : color;
}

/** 世俗化の割合を「約6割」のような言い方にする */
export function secularText(s: number): string {
  if (s < 0.1) return "わずか";
  return `約${Math.round(s * 10)}割`;
}

export function stripeColor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.round(parseInt(v, 16) * 0.85));
  return `rgb(${r},${g},${b})`;
}
