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
import { AtlasIndex, cityCapitalOf, cityName, cityPop, curveAt, fallbackColor, type DistKey, type Movement, type ReligionEntry } from "./data";
import { assignColors, modernName } from "./modern";

type PieceProps = { id: string; name: string; iso: string; adm1?: string; adm2?: string };
type PieceGeom = (Polygon<PieceProps> | MultiPolygon<PieceProps>) & { id?: string };

interface Merged {
  geo: GeoMultiPolygon;
  /** ラベルを置く点と、塊の面積（km²） */
  label: { lon: number; lat: number; area: number } | null;
}

const SEA = "#cfdde3";
const NODATA = "#e6e2d8";
/** 宗教表示で、データのないピースの色 */
const REL_NODATA = "#e2e0dc";
const RIVER = "#7ea6c2";
const EUROPE: [[number, number], [number, number]] = [
  [-11, 34],
  [42, 61],
];
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const FONT = ["Noto Sans Medium"];
const FONT_REGULAR = ["Noto Sans Regular"];
const LOCAL_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", "Meiryo", sans-serif';
/** 帝国の枠として描く上位政体（それ以外の overlord は宗主権として細い点線） */
const EMPIRE_FRAMES = new Set(["hre", "rhine_confederation", "german_confederation", "north_german_confederation", "hungary_crown"]);

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
    this.ownerOf = new Int32Array(n).fill(-2);
    this.ovOf = new Int32Array(n);
    this.colorOf = new Array(n).fill(undefined);
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
      minZoom: 1.2,
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
        this.cb.onReligion?.(i >= 0 ? { region: this.relRegion[i], place: this.geoms[i].properties!.name } : null);
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
      f.properties = { pid: p.id, name: p.name, iso: p.iso, mcolor: mcolors.get(p.iso) };
    });
    map.addSource("pieces", { type: "geojson", data: fc });
    for (const id of ["borders", "overlords", "hatch", "labels", "highlight", "cities", "rel-hatch", "rel-borders", "rivers", "lakes", "mv", "flash"]) {
      map.addSource(id, { type: "geojson", data: EMPTY });
    }
    // 川の名前用：細かく曲がる線のままだと線に沿った文字が置けないので、強めに単純化した別のソースを使う
    map.addSource("rivers-lbl", { type: "geojson", data: EMPTY, tolerance: 8 });
    map.addSource("modern-borders", { type: "geojson", data: this.modernBorders() });
    map.addSource("modern-labels", { type: "geojson", data: this.modernLabels() });
    map.addSource("modern-cities", { type: "geojson", data: this.modernCities() });
    map.addSource("seas", { type: "geojson", data: this.seas() });

    const vis = (v: boolean) => (v ? "visible" : "none");
    map.addLayer({
      id: "fill",
      type: "fill",
      source: "pieces",
      paint: { "fill-color": ["coalesce", ["feature-state", "c"], NODATA] },
    });
    // 隣り合うピースの継ぎ目に出る細い隙間を、同じ色の細い線で埋める
    map.addLayer({
      id: "seam",
      type: "line",
      source: "pieces",
      paint: { "line-color": ["coalesce", ["feature-state", "c"], NODATA], "line-width": 0.8 },
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
      paint: { "fill-color": ["coalesce", ["feature-state", "r"], REL_NODATA] },
    });
    map.addLayer({
      id: "rel-seam",
      type: "line",
      source: "pieces",
      layout: { visibility: "none" },
      paint: { "line-color": ["coalesce", ["feature-state", "r"], REL_NODATA], "line-width": 0.8 },
    });
    map.addLayer({ id: "hatch", type: "fill", source: "hatch", paint: { "fill-pattern": ["get", "pat"] } });
    map.addLayer({
      id: "rel-hatch",
      type: "fill",
      source: "rel-hatch",
      layout: { visibility: "none" },
      paint: { "fill-pattern": ["get", "pat"] },
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
    map.addLayer({
      id: "borders",
      type: "line",
      source: "borders",
      layout: { "line-join": "round" },
      paint: {
        "line-color": "#4a4038",
        "line-opacity": 0.85,
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.5, 6, 1.1, 9, 1.6],
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
    map.addLayer({
      id: "suzerain",
      type: "line",
      source: "overlords",
      filter: ["==", ["get", "kind"], "suzerain"],
      paint: {
        "line-color": "#4c5a3a",
        "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1, 6, 2],
        "line-dasharray": [1, 1.6],
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

  render(year: number) {
    this.year = year;
    if (!this.loaded) return;
    const idx = this.idx;
    const polities = idx.atlas.polities;
    const groups = new Map<string, { owner: number; cert: number; pieces: number[] }>();
    for (let i = 0; i < this.geoms.length; i++) {
      const s = this.atlasIdx[i] >= 0 ? idx.pieceState(this.atlasIdx[i], year) : null;
      const owner = s ? s[1] : -1;
      const cert = s ? s[3] : 0;
      this.ownerOf[i] = owner;
      this.ovOf[i] = s ? s[2] : -1;
      const color = owner >= 0 ? (polities[owner].color ?? fallbackColor(polities[owner].id)) : null;
      if (color !== this.colorOf[i]) {
        this.map.setFeatureState({ source: "pieces", id: i }, { c: color });
        this.colorOf[i] = color;
      }
      const key = `${owner}|${cert}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { owner, cert, pieces: [] }));
      g.pieces.push(i);
    }

    // 斜線（不確実・名目的・占領）と、国名ラベルの位置
    const certNames = idx.atlas.certainty;
    const hatch: Feature[] = [];
    const labelBest = new Map<number, NonNullable<Merged["label"]>>();
    for (const [key, g] of groups) {
      if (g.owner < 0) continue;
      const m = this.merged(key, g.pieces);
      if (g.cert > 0) hatch.push({ type: "Feature", properties: { pat: `hatch-${certNames[g.cert]}` }, geometry: m.geo });
      const cur = labelBest.get(g.owner);
      if (m.label && (!cur || m.label.area > cur.area)) labelBest.set(g.owner, m.label);
    }
    this.setData("hatch", { type: "FeatureCollection", features: hatch });
    const labels: Feature[] = [];
    for (const [owner, l] of labelBest) labels.push(labelFeature(idx.shortName(polities[owner], year), l));
    this.setData("labels", { type: "FeatureCollection", features: labels });

    // 国境線（所属の違うピースの間と、海岸線）
    const own = this.ownerOf;
    const key = hashInts(own);
    let bd = this.meshCache.get(key);
    if (!bd) {
      const pos = this.posMap();
      const geom = mesh(this.topo, this.topo.objects.pieces as never, (a, b) => a === b || own[pos.get(a)!] !== own[pos.get(b)!]);
      bd = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geom as Geometry }] };
      if (this.meshCache.size > 300) this.meshCache.clear();
      this.meshCache.set(key, bd);
    }
    this.setData("borders", bd);

    // 上位政体の外枠
    const ovKey = "ov" + hashInts(this.ovOf);
    let ov = this.meshCache.get(ovKey);
    if (!ov) {
      const pos = this.posMap();
      const ovs = new Set(Array.from(this.ovOf).filter((o) => o >= 0));
      const features: Feature[] = [];
      for (const o of ovs) {
        const is = (g: unknown) => this.ovOf[pos.get(g)!] === o;
        const geom = mesh(this.topo, this.topo.objects.pieces as never, (a, b) => (a === b ? is(a) : is(a) !== is(b)));
        features.push({
          type: "Feature",
          properties: { kind: EMPIRE_FRAMES.has(polities[o].id) ? "empire" : "suzerain" },
          geometry: geom as Geometry,
        });
      }
      ov = { type: "FeatureCollection", features };
      this.meshCache.set(ovKey, ov);
    }
    this.setData("overlords", ov);

    this.setData("cities", this.historicCities(year));
    this.map.setFilter("rivers", this.riverFilter(year));
    this.map.setFilter("rivers-label", this.riverFilter(year, 1.2));
    if (isDist(this.layer)) this.renderReligion(year);
    this.renderMovement();
    this.renderHighlight();
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
      const color = main >= 0 ? kinds[main].color : null;
      if (color !== this.relColorOf[i]) {
        this.map.setFeatureState({ source: "pieces", id: i }, { r: color });
        this.relColorOf[i] = color;
      }
      if (s && s[2] >= 0) {
        const k = `${s[2]}`;
        let g = groups.get(k);
        if (!g) groups.set(k, (g = []));
        g.push(i);
      }
    }
    // 少数派の斜線（同じ minor のピースを結合）
    const hatch: Feature[] = [];
    for (const [minor, ps] of groups) {
      hatch.push({ type: "Feature", properties: { pat: `${key}-hatch-${minor}` }, geometry: this.merged(`${key}h${minor}`, ps).geo });
    }
    this.setData("rel-hatch", { type: "FeatureCollection", features: hatch });

    // 宗教・言語の境界（main の違うピースの間と、海岸線）
    const own = this.relMain;
    const mkey = key + hashInts(own);
    let bd = this.meshCache.get(mkey);
    if (!bd) {
      const pos = this.posMap();
      const geom = mesh(this.topo, this.topo.objects.pieces as never, (a, b) => a === b || own[pos.get(a)!] !== own[pos.get(b)!]);
      bd = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geom as Geometry }] };
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
  religionKindsShown(onScreen = false): { kinds: number[]; minors: boolean; nodata: boolean } {
    const key: DistKey = isDist(this.layer) ? this.layer : "religion";
    const set = new Set<number>();
    let nodata = false;
    let minors = false;
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
        nodata = true;
        continue;
      }
      set.add(s[1]);
      if (s[2] >= 0) {
        minors = true;
        set.add(s[2]); // minor にしか出てこない種類も凡例に入れる
      }
    }
    return { kinds: [...set].sort((a, b) => a - b), minors, nodata };
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
    const topoOf = this.topoIndexOfAtlas();
    for (const sp of m.spread) {
      const v = curveAt(sp.curve, year);
      if (v <= 0) continue;
      const pol = new Set(sp.polities.map((id) => this.idx.polityIndex.get(id)));
      const apply = (i: number) => {
        if (v > level[i]) level[i] = v;
        if (sp.center) center[i] = 1;
      };
      if (pol.size) for (let i = 0; i < n; i++) if (pol.has(this.ownerOf[i])) apply(i);
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
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geom as Geometry }] };
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
    set(["borders", "cities-dot", "highlight"], !on || rel);
    set(["frames", "suzerain"], !on && !rel);
    set(["labels", "cities-label"], !on && lb);
    set(["seas", "rivers-label", "lakes-label"], lb);
    // 宗教表示では、国境と国名を薄くして宗教の塗り分けを主役にする
    this.map.setPaintProperty("borders", "line-opacity", rel ? 0.35 : 0.85);
    this.map.setPaintProperty("borders", "line-color", rel ? "#2e2822" : "#4a4038");
    this.map.setPaintProperty("modern-borders", "line-opacity", rel ? 0.45 : 1);
    for (const l of ["labels", "modern-labels"]) {
      this.map.setPaintProperty(l, "text-opacity", rel ? 0.4 : 0.62);
      this.map.setPaintProperty(l, "text-halo-color", rel ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.45)");
    }
  }

  private labelsOn = true;

  /** 国名・都市名・海の名前を表示するかどうか（L キー） */
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

  /** 地域へ移動する（W：地球全体、E：ヨーロッパ、NA・AF・AS：北米・アフリカ・アジア） */
  flyToRegion(region: "world" | "europe" | "na" | "af" | "as") {
    if (region === "world") {
      const c = this.map.getCenter();
      this.map.flyTo({ center: [c.lng, Math.max(-30, Math.min(30, c.lat))], zoom: this.map.getMinZoom(), duration: 900, essential: true });
      return;
    }
    const boxes: Record<string, [number, number, number, number]> = {
      europe: [EUROPE[0][0], EUROPE[0][1], EUROPE[1][0], EUROPE[1][1]],
      na: [-128, 14, -60, 58],
      af: [-18, -35, 52, 37],
      as: [40, 0, 145, 60],
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
  }

  private hover(point: maplibregl.Point, ev: MouseEvent) {
    if (!this.loaded || (ev as PointerEvent).pointerType === "touch" || matchMedia("(hover: none)").matches) return;
    const f = this.map.queryRenderedFeatures(point, { layers: [isDist(this.layer) ? "rel-fill" : this.modernOn ? "modern-fill" : "fill"] })[0];
    let text = "";
    if (f) {
      const i = Number(f.id);
      if (isDist(this.layer)) text = this.religionHoverText(i);
      else if (this.modernOn) text = modernName(this.geoms[i].properties!.iso);
      else if (this.ownerOf[i] >= 0) text = this.idx.polityName(this.idx.atlas.polities[this.ownerOf[i]], this.year);
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
    if (!e) return `${DIST_LABEL[key]}データ未整備`;
    const d = this.idx.dist(key)!;
    const nm = (id: string | null | undefined) => d.kinds.find((k) => k.id === id)?.name ?? id ?? "";
    return `${d.regions[r].name}：${nm(e.main)}${e.minor ? `（${nm(e.minor)}も多い）` : ""}`;
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
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const k = Math.cos((((y1 + y2) / 2) * Math.PI) / 180);
    s += x1 * k * y2 - x2 * k * y1;
  }
  return (s / 2) * KM_PER_DEG * KM_PER_DEG;
}

/** 国名ラベル。面積から文字の大きさ（s）と、文字が塊に収まる拡大率（minz）を決める */
function labelFeature(name: string, l: NonNullable<Merged["label"]>): Feature {
  const side = Math.sqrt(l.area); // km
  const s = Math.max(0.85, Math.min(1.8, side / 400));
  const chars = Math.max(2, [...name].length);
  // 拡大率 z で 1px ≒ 40075·cos(緯度) / (512·2^z) km。文字列の幅（px）≒ 文字数 × 13·s
  const kmPx = (40075 * Math.cos((l.lat * Math.PI) / 180)) / 512;
  const minz = Math.log2((chars * 15 * s * 1.0 * kmPx) / side);
  return {
    type: "Feature",
    properties: { name, s, minz: Math.max(0, minz), rank: -l.area },
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
      // 大きな国の首都は早めに出す。小さな領邦の首都は、人口なりの拡大率より少し早めに出す程度にする
      minz: capital ? (pop >= 40000 ? Math.min(minz, 3.4) : minz - 0.7) : minz,
      r: capital ? r * 0.9 : r * 0.8,
      rank: -(pop + (capital ? 1e7 : 0)),
    },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

function bbox(geo: GeoMultiPolygon): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of geo.coordinates)
    for (const [x, y] of poly[0]) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  return [x0, y0, x1, y1];
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
export function stripeColor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => Math.round(parseInt(v, 16) * 0.85));
  return `rgb(${r},${g},${b})`;
}
