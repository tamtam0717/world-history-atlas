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
import { AtlasIndex, cityCapitalOf, cityName, cityPop, fallbackColor } from "./data";
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
const EUROPE: [[number, number], [number, number]] = [
  [-11, 34],
  [42, 61],
];
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const FONT = ["Noto Sans Medium"];
const FONT_REGULAR = ["Noto Sans Regular"];
const LOCAL_FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", "Meiryo", sans-serif';
/** 帝国の枠として描く上位政体（それ以外の overlord は宗主権として細い点線） */
const EMPIRE_FRAMES = new Set(["hre", "rhine_confederation", "german_confederation"]);

export interface MapCallbacks {
  onSelect(polityId: string | null): void;
  onPiece?(piece: PieceProps | null): void;
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
      const f = this.map.queryRenderedFeatures(e.point, { layers: ["fill"] })[0];
      const i = f ? Number(f.id) : -1;
      if (this.debug) this.cb.onPiece?.(i >= 0 ? this.geoms[i].properties! : null);
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

    // ピース（塗りは feature-state "c"、現代版の色は属性 mcolor）
    const fc = feature(this.topo, this.topo.objects.pieces as GeometryCollection<PieceProps>) as unknown as FeatureCollection;
    const mcolors = this.modernColors();
    fc.features.forEach((f, i) => {
      f.id = i;
      const p = f.properties as PieceProps;
      f.properties = { pid: p.id, name: p.name, iso: p.iso, mcolor: mcolors.get(p.iso) };
    });
    map.addSource("pieces", { type: "geojson", data: fc });
    for (const id of ["borders", "overlords", "hatch", "labels", "highlight", "cities"]) {
      map.addSource(id, { type: "geojson", data: EMPTY });
    }
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
    map.addLayer({ id: "hatch", type: "fill", source: "hatch", paint: { "fill-pattern": ["get", "pat"] } });
    map.addLayer({
      id: "debug",
      type: "line",
      source: "pieces",
      layout: { visibility: vis(this.debug) },
      paint: { "line-color": "rgba(0,0,0,.35)", "line-width": 0.4 },
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
          "circle-color": ["case", ["get", "capital"], "#1d1a16", "#fbf9f4"],
          "circle-stroke-color": "#1d1a16",
          "circle-stroke-width": ["case", ["get", "capital"], 1.6, 1.1],
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
        paint: { "text-color": "#2b2620", "text-halo-color": "rgba(255,255,255,.85)", "text-halo-width": 1.2 },
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
          "text-letter-spacing": 0.05,
          "symbol-sort-key": ["get", "rank"],
          "text-padding": 3,
        },
        paint: { "text-color": "#231f1a", "text-halo-color": "rgba(255,255,255,.75)", "text-halo-width": 1.6 },
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
    this.renderHighlight();
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
      if (c.founded && year < c.founded) continue;
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
    const set = (layers: string[], v: boolean) => {
      for (const l of layers) this.map.setLayoutProperty(l, "visibility", v ? "visible" : "none");
    };
    set(["modern-fill", "modern-seam", "modern-borders", "modern-cities-dot"], on);
    set(["modern-labels", "modern-cities-label"], on && lb);
    set(["fill", "seam", "hatch", "borders", "frames", "suzerain", "highlight", "cities-dot"], !on);
    set(["labels", "cities-label"], !on && lb);
    set(["seas"], lb);
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
    const geo = this.selected ? this.polityGeo(this.selected) : null;
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
    const f = this.map.queryRenderedFeatures(point, { layers: [this.modernOn ? "modern-fill" : "fill"] })[0];
    let text = "";
    if (f) {
      const i = Number(f.id);
      if (this.modernOn) text = modernName(this.geoms[i].properties!.iso);
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
      r: capital ? r + 0.8 : r,
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

function hatchImage(color: string, size: number): ImageData {
  const px = size * 2;
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d")!;
  g.strokeStyle = color;
  g.lineWidth = px / 4;
  g.beginPath();
  for (const o of [-px, 0, px]) {
    g.moveTo(o, px);
    g.lineTo(o + px, 0);
  }
  g.stroke();
  return g.getImageData(0, 0, px, px);
}
