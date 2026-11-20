// 地図の描画：ピースを年ごとの所属で塗り分け、同じ国のピースを結合して描く

import { geoAzimuthalEqualArea, geoBounds, geoContains, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { select, type Selection } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import polylabel from "polylabel";
import { feature, merge, mesh } from "topojson-client";
import type { GeometryCollection, Polygon, MultiPolygon, Topology } from "topojson-specification";
import type { Feature as GeoFeature, MultiPolygon as GeoMultiPolygon } from "geojson";
import { AtlasIndex, fallbackColor } from "./data";

type PieceProps = { id: string; name: string; iso: string; adm1?: string; adm2?: string };
type PieceGeom = (Polygon<PieceProps> | MultiPolygon<PieceProps>) & { id?: string };

interface Group {
  owner: number; // 政体 index（-1 = データなし）
  certainty: number;
  pieces: PieceGeom[];
}

interface Label {
  el: SVGTextElement;
  x: number;
  y: number;
  area: number; // 投影後の面積（px²、拡大率1のとき）
  width: number; // 文字列の幅（em 単位の目安）
}

const NODATA = "#e6e2d8";

export interface MapCallbacks {
  onSelect(polityId: string | null): void;
  onPiece?(piece: PieceProps | null): void;
}

export class AtlasMap {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private root: Selection<SVGGElement, unknown, null, undefined>;
  private fills: Selection<SVGGElement, unknown, null, undefined>;
  private hatches: Selection<SVGGElement, unknown, null, undefined>;
  private borders: Selection<SVGPathElement, unknown, null, undefined>;
  private overlords: Selection<SVGGElement, unknown, null, undefined>;
  private highlight: Selection<SVGPathElement, unknown, null, undefined>;
  private labelLayer: Selection<SVGGElement, unknown, null, undefined>;
  private debugLayer: Selection<SVGGElement, unknown, null, undefined>;
  private tooltip: HTMLDivElement;
  private zoomer: ZoomBehavior<SVGSVGElement, unknown>;
  private transform: ZoomTransform = zoomIdentity;
  private projection = geoAzimuthalEqualArea().rotate([-13, -50]);
  private path = geoPath(this.projection);
  private geoms: PieceGeom[];
  private atlasIdx: number[]; // topo のピース番号 → atlas のピース番号
  private ownerOf: Int32Array;
  private ovOf: Int32Array;
  private labels: Label[] = [];
  private year = 0;
  private selected: string | null = null;
  private width = 0;
  private height = 0;
  debug = false;
  /** 地図の下側で、シートに隠れる高さ（px）。スマホのとき main から設定する */
  bottomInset = 0;

  constructor(
    private container: HTMLElement,
    private topo: Topology,
    private idx: AtlasIndex,
    private cb: MapCallbacks,
  ) {
    const obj = topo.objects.pieces as GeometryCollection<PieceProps>;
    this.geoms = obj.geometries as PieceGeom[];
    const atlasPos = new Map(idx.atlas.pieceIds.map((id, i) => [id, i]));
    this.atlasIdx = this.geoms.map((g) => atlasPos.get(g.properties!.id) ?? -1);
    this.ownerOf = new Int32Array(this.geoms.length);
    this.ovOf = new Int32Array(this.geoms.length);

    this.svg = select(container).append("svg").attr("class", "map");
    const defs = this.svg.append("defs");
    hatchPattern(defs, "hatch-uncertain", "rgba(60,50,40,.45)", 6);
    hatchPattern(defs, "hatch-nominal", "rgba(255,255,255,.75)", 5);
    hatchPattern(defs, "hatch-occupied", "rgba(120,20,20,.5)", 4);

    this.svg.append("rect").attr("class", "sea").attr("width", "100%").attr("height", "100%");
    this.root = this.svg.append("g");
    this.fills = this.root.append("g").attr("class", "fills");
    this.hatches = this.root.append("g").attr("class", "hatches");
    this.borders = this.root.append("path").attr("class", "borders");
    this.overlords = this.root.append("g").attr("class", "overlords");
    this.highlight = this.root.append("path").attr("class", "highlight");
    this.debugLayer = this.root.append("g").attr("class", "debug");
    this.labelLayer = this.root.append("g").attr("class", "labels");

    this.tooltip = document.createElement("div");
    this.tooltip.className = "tooltip";
    container.appendChild(this.tooltip);

    this.zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 16])
      .on("zoom", (e) => {
        this.transform = e.transform;
        this.root.attr("transform", e.transform.toString());
        this.updateLabels();
      });
    this.svg.call(this.zoomer).on("dblclick.zoom", null);

    this.svg.on("click", (e: MouseEvent) => {
      const t = e.target as Element;
      const owner = t.getAttribute("data-owner");
      if (this.debug) this.cb.onPiece?.(this.pieceAt(e));
      this.cb.onSelect(owner && owner !== "-1" ? owner : null);
    });
    this.svg.on("mousemove", (e: MouseEvent) => this.hover(e));
    this.svg.on("mouseleave", () => (this.tooltip.style.display = "none"));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  private resize(force = false) {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0 || (!force && w === this.width && h === this.height)) return;
    this.width = w;
    this.height = h;
    // 大西洋岸〜ウラル手前、北アフリカ沿岸〜スカンディナヴィア南部が収まるように
    const frame: GeoPermissibleObjects = {
      type: "MultiPoint",
      coordinates: [
        [-10, 36],
        [36, 36],
        [-8, 58],
        [32, 60],
        [12, 35],
        [12, 61],
      ],
    };
    const pad = Math.min(w, h) * 0.02;
    this.projection.fitExtent(
      [
        [pad, pad + (this.bottomInset ? 40 : 0)],
        [w - pad, h - pad - this.bottomInset],
      ],
      frame,
    );
    this.zoomer.translateExtent([
      [-w * 0.5, -h * 0.5],
      [w * 1.5, h * 1.5],
    ]);
    if (this.year) this.render(this.year);
  }

  render(year: number) {
    this.year = year;
    const idx = this.idx;
    const groups = new Map<string, Group>();
    for (let i = 0; i < this.geoms.length; i++) {
      const s = this.atlasIdx[i] >= 0 ? idx.pieceState(this.atlasIdx[i], year) : null;
      const owner = s ? s[1] : -1;
      const cert = s ? s[3] : 0;
      this.ownerOf[i] = owner;
      this.ovOf[i] = s ? s[2] : -1;
      const key = `${owner}|${cert}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { owner, certainty: cert, pieces: [] }));
      g.pieces.push(this.geoms[i]);
    }

    const topo = this.topo;
    const polities = idx.atlas.polities;
    const fillData = [...groups.values()].map((g) => ({
      g,
      geo: merge(topo, g.pieces as never) as GeoMultiPolygon,
    }));

    this.fills
      .selectAll<SVGPathElement, (typeof fillData)[number]>("path")
      .data(fillData)
      .join("path")
      .attr("d", (d) => this.path(d.geo) ?? "")
      .attr("fill", (d) => (d.g.owner < 0 ? NODATA : polities[d.g.owner].color ?? fallbackColor(polities[d.g.owner].id)))
      .attr("data-owner", (d) => (d.g.owner < 0 ? "-1" : polities[d.g.owner].id));

    const certNames = idx.atlas.certainty;
    this.hatches
      .selectAll<SVGPathElement, (typeof fillData)[number]>("path")
      .data(fillData.filter((d) => d.g.certainty > 0 && d.g.owner >= 0))
      .join("path")
      .attr("d", (d) => this.path(d.geo) ?? "")
      .attr("fill", (d) => `url(#hatch-${certNames[d.g.certainty]})`)
      .attr("data-owner", (d) => polities[d.g.owner].id);

    // 国境線：所属の違うピースの間と、海岸線
    const own = this.ownerOf;
    const pos = new Map(this.geoms.map((g, i) => [g, i]));
    const ownerOfGeom = (g: unknown) => own[pos.get(g as PieceGeom)!];
    const obj = topo.objects.pieces;
    const borders = mesh(topo, obj as never, (a, b) => a === b || ownerOfGeom(a) !== ownerOfGeom(b));
    this.borders.attr("d", this.path(borders) ?? "");

    // 上位政体（神聖ローマ帝国など）の外枠
    const ovGroups = new Map<number, PieceGeom[]>();
    for (let i = 0; i < this.geoms.length; i++) {
      const o = this.ovOf[i];
      if (o < 0) continue;
      if (!ovGroups.has(o)) ovGroups.set(o, []);
      ovGroups.get(o)!.push(this.geoms[i]);
    }
    const ovData = [...ovGroups.entries()].map(([o, ps]) => ({
      o,
      geo: merge(topo, ps as never) as GeoMultiPolygon,
    }));
    this.overlords
      .selectAll<SVGPathElement, (typeof ovData)[number]>("path")
      .data(ovData)
      .join("path")
      .attr("d", (d) => this.path(d.geo) ?? "")
      .attr("stroke", (d) => polities[d.o].color ?? "#7a2e2e");

    this.renderLabels(fillData.filter((d) => d.g.owner >= 0));
    this.renderHighlight();
    if (this.debug) this.renderDebug();
  }

  private renderLabels(fillData: { g: Group; geo: GeoMultiPolygon }[]) {
    // 同じ政体が確からしさ別に分かれている場合もあるので政体ごとにまとめ、最大の塊にラベルを置く
    const best = new Map<number, { poly: number[][][]; area: number }>();
    for (const d of fillData) {
      for (const poly of d.geo.coordinates) {
        const projected = poly.map((ring) => ring.map((c) => this.projection(c as [number, number]) ?? [0, 0]));
        const a = Math.abs(ringArea(projected[0]));
        const cur = best.get(d.g.owner);
        if (!cur || a > cur.area) best.set(d.g.owner, { poly: projected, area: a });
      }
    }
    const polities = this.idx.atlas.polities;
    const data = [...best.entries()].map(([owner, b]) => {
      const p = polylabel(b.poly as [number, number][][], 1);
      const name = this.idx.shortName(polities[owner], this.year);
      return { owner, name, x: p[0], y: p[1], area: b.area };
    });
    const sel = this.labelLayer
      .selectAll<SVGTextElement, (typeof data)[number]>("text")
      .data(data)
      .join("text")
      .attr("x", (d) => d.x)
      .attr("y", (d) => d.y)
      .text((d) => d.name);
    this.labels = [];
    sel.each((d, i, nodes) => {
      this.labels.push({ el: nodes[i], x: d.x, y: d.y, area: d.area, width: [...d.name].length });
    });
    this.updateLabels();
  }

  private updateLabels() {
    const k = this.transform.k;
    for (const l of this.labels) {
      const side = Math.sqrt(l.area) * k; // 画面上での塊の大きさの目安（px）
      const size = Math.max(10, Math.min(20, side / 7));
      const fits = side > size * Math.max(2.2, l.width * 0.85);
      l.el.style.display = fits ? "" : "none";
      l.el.style.fontSize = `${size / k}px`;
    }
  }

  setSelected(id: string | null) {
    this.selected = id;
    this.renderHighlight();
  }

  private renderHighlight() {
    const i = this.selected ? this.idx.polityIndex.get(this.selected) : undefined;
    if (i == null) {
      this.highlight.attr("d", null);
      return;
    }
    const ps = this.geoms.filter((_, j) => this.ownerOf[j] === i);
    this.highlight.attr("d", ps.length ? this.path(merge(this.topo, ps as never)) ?? "" : null);
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

  /** 選んだ政体が画面に入るように寄せる */
  focus(id: string) {
    const i = this.idx.polityIndex.get(id);
    const ps = this.geoms.filter((_, j) => this.ownerOf[j] === i);
    if (!ps.length) return;
    const [[x0, y0], [x1, y1]] = this.path.bounds(merge(this.topo, ps as never));
    const k = Math.min(8, 0.8 / Math.max((x1 - x0) / this.width, (y1 - y0) / this.height));
    if (k < this.transform.k * 1.05 && this.inView(x0, y0, x1, y1)) return;
    const t = zoomIdentity
      .translate(this.width / 2, this.height / 2)
      .scale(Math.max(1, k))
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    this.svg.transition().duration(600).call(this.zoomer.transform as never, t);
  }

  private inView(x0: number, y0: number, x1: number, y1: number) {
    const t = this.transform;
    const [a, b] = t.apply([x0, y0]);
    const [c, d] = t.apply([x1, y1]);
    return a >= 0 && b >= 0 && c <= this.width && d <= this.height;
  }

  /** 経度・緯度を中心に k 倍へ拡大（確認用ツールから使う） */
  zoomTo(lon: number, lat: number, k: number) {
    const [x, y] = this.projection([lon, lat]) ?? [0, 0];
    const t = zoomIdentity.translate(this.width / 2, this.height / 2).scale(k).translate(-x, -y);
    this.svg.transition().duration(0).call(this.zoomer.transform as never, t);
  }

  setBottomInset(px: number) {
    if (px === this.bottomInset) return;
    this.bottomInset = px;
    this.resize(true);
  }

  zoomBy(f: number) {
    this.svg.transition().duration(250).call(this.zoomer.scaleBy as never, f);
  }

  resetZoom() {
    this.svg.transition().duration(400).call(this.zoomer.transform as never, zoomIdentity);
  }

  private hover(e: MouseEvent) {
    if ((e as PointerEvent).pointerType === "touch" || matchMedia("(hover: none)").matches) return;
    const owner = (e.target as Element).getAttribute("data-owner");
    const p = owner && owner !== "-1" ? this.idx.polityById.get(owner) : null;
    let text = p ? this.idx.polityName(p, this.year) : "";
    if (this.debug) {
      const piece = this.pieceAt(e);
      if (piece) text = `${text ? text + "\n" : ""}${piece.id}（${piece.name}）`;
    }
    if (!text) {
      this.tooltip.style.display = "none";
      return;
    }
    const r = this.container.getBoundingClientRect();
    this.tooltip.textContent = text;
    this.tooltip.style.display = "block";
    this.tooltip.style.left = `${e.clientX - r.left + 14}px`;
    this.tooltip.style.top = `${e.clientY - r.top + 14}px`;
  }

  private pieceFeatures: { f: GeoFeature; b: [[number, number], [number, number]] }[] | null = null;

  /** マウス位置にあるピース（デバッグ表示用。投影を逆算して点の内外判定をする） */
  private pieceAt(e: MouseEvent): PieceProps | null {
    const r = this.container.getBoundingClientRect();
    const [x, y] = this.transform.invert([e.clientX - r.left, e.clientY - r.top]);
    const lonlat = this.projection.invert?.([x, y]);
    if (!lonlat) return null;
    if (!this.pieceFeatures) {
      const fc = feature(this.topo, this.topo.objects.pieces) as unknown as { features: GeoFeature[] };
      this.pieceFeatures = fc.features.map((f) => ({ f, b: geoBounds(f) }));
    }
    const [lon, lat] = lonlat;
    for (const { f, b } of this.pieceFeatures) {
      if (lon < b[0][0] || lon > b[1][0] || lat < b[0][1] || lat > b[1][1]) continue;
      if (geoContains(f, lonlat)) return f.properties as PieceProps;
    }
    return null;
  }

  // ---- デバッグ表示（?debug=pieces）：ピースの境界を全部描き、ピースの ID を確認できるようにする ----
  private renderDebug() {
    const all = mesh(this.topo, this.topo.objects.pieces as never);
    this.debugLayer
      .selectAll<SVGPathElement, number>("path")
      .data([0])
      .join("path")
      .attr("d", this.path(all) ?? "");
  }
}

function ringArea(ring: number[][]) {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

function hatchPattern(
  defs: Selection<SVGDefsElement, unknown, null, undefined>,
  id: string,
  color: string,
  size: number,
) {
  defs
    .append("pattern")
    .attr("id", id)
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", size)
    .attr("height", size)
    .attr("patternTransform", "rotate(45)")
    .append("line")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", 0)
    .attr("y2", size)
    .attr("stroke", color)
    .attr("stroke-width", size / 3);
}
