// atlas.json（tools/build_data.mjs が生成）の型と、年ごとの問い合わせ

export interface Sourced {
  source?: string | string[];
}

/** データに手で書く画像（Wikimedia Commons のファイル名と説明）。ギャラリーの先頭に出す */
export interface DataImage {
  file: string;
  caption?: string;
}

export interface Illustrated {
  images?: DataImage[];
}

export interface Named {
  from?: number;
  to?: number;
  name: string;
  /** その時期の地図ラベル（省略時は name） */
  short?: string;
  /** その時期の種別（省略時は政体の kind） */
  kind?: string;
}

export interface Ruler extends Sourced {
  name: string;
  title?: string;
  from: number;
  to?: number;
  note?: string;
}

export interface Period extends Sourced, Illustrated {
  from: number;
  to?: number;
  text: string;
}

export interface Polity extends Sourced {
  id: string;
  name: string;
  names?: Named[];
  short?: string;
  color?: string;
  kind?: string;
  rulers?: Ruler[];
  periods?: Period[];
  note?: string;
}

export interface TimelineEntry extends Sourced {
  from: number;
  owner?: string | null;
  overlord?: string | null;
  /** 確からしさ：certain（省略時）/ uncertain / nominal / occupied / indirect（間接統治。持ち主の色を薄く塗る） */
  certainty?: "certain" | "uncertain" | "nominal" | "occupied" | "indirect";
  cause?: string;
  note?: string;
  /**
   * 地図の副ラベル（任意）。宗主国の色で塗る保護国・植民地などで、元の国・地域の名前を
   * 宗主国の色の中に小さく出すときに使う（例：「チュニジア」）。空文字なら副ラベルを出さない
   */
  label?: string;
}

export interface Region {
  id: string;
  name: string;
  /** 時期による名前（範囲外は name） */
  names?: { from?: number; to?: number; name: string }[];
  timeline: TimelineEntry[];
  /** 地域の中心 [経度, 緯度]（build_data.mjs が計算。パネルで地図に映っている変化を先に並べる） */
  c?: [number, number];
}

export interface HistEvent extends Sourced, Illustrated {
  year: number;
  date?: string;
  title: string;
  text?: string;
  polities?: string[];
  importance?: number;
  /** 出来事の代表点 [経度, 緯度] の列（関係国の首都・領域から build_data.mjs が計算） */
  pts?: [number, number][];
  /** 場所（at / lon・lat）が書いてある出来事。代表点だけで「地図の範囲内」を判定する */
  fixed?: boolean;
  /** 関係国の領土で判定するときに数える範囲（atlas.eventBoxes の番号） */
  bx?: number;
}

/** [開始年, 所属政体 index, 上位政体 index, 確からしさ index, 地域 index] */
export type PieceState = [number, number, number, number, number];

export interface Sea {
  name: string;
  kind: "ocean" | "sea" | "gulf" | "strait";
  lon: number;
  lat: number;
}

export interface Milestone {
  year: number;
  title: string;
}

export interface City extends Illustrated {
  id: string;
  name: string;
  modern?: string;
  names?: Named[];
  lon: number;
  lat: number;
  founded?: number;
  /** この年の後は表示しない（合併などで消えた都市） */
  until?: number;
  pop?: Record<string, number>;
  capital?: { polity: string; from?: number; to?: number }[];
}

export interface ModernCity {
  name: string;
  /** 英語名（検索用） */
  en?: string;
  lon: number;
  lat: number;
  pop: number;
  capital: boolean;
}

// ---- 宗教（docs/religion-format.md） ----

export interface ReligionKind {
  id: string;
  name: string;
  color: string;
  /** 語族（言語のみ） */
  family?: string;
}

export interface ReligionEntry extends Sourced {
  from: number;
  main: string;
  minor?: string | null;
  /** 世俗化（無宗教・宗教離れ）の割合の目安 0〜1（宗教のみ） */
  secular?: number;
  note?: string;
}

export interface ReligionRegion {
  id: string;
  name: string;
  timeline: ReligionEntry[];
}

/** [開始年, main の index, minor の index（なければ -1）, 宗教の地域 index, 世俗化の割合 0〜1（宗教のみ。なければ省略）] */
export type ReligionState = [number, number, number, number, number?];

export interface Religion {
  kinds: ReligionKind[];
  regions: ReligionRegion[];
  pieceTimelines: ReligionState[][];
}

/** 言語（民族）の分布（docs/language-format.md）。形は宗教と同じ */
export type LanguageKind = ReligionKind;
export type Language = Religion;

/** 分布の主題（宗教・言語）。同じ形のデータを同じ仕組みで描く */
export type DistKey = "religion" | "language";

// ---- 潮流（docs/movements-format.md） ----

export type MovementKind = "thought" | "art" | "religion" | "system";
/** [年, 強さ 0〜1] */
export type CurvePoint = [number, number];

export interface MovementSpread {
  /** 政体（既定では本国 movementHome だけ。占領地は除く） */
  polities: string[];
  regions: string[];
  /** 除く政治の地域（movementRegions のキー） */
  exclude?: string[];
  /** true なら政体の全領域（植民地・占領地を含む） */
  colonies?: boolean;
  center: boolean;
  curve: CurvePoint[];
}

export interface Movement extends Sourced, Illustrated {
  id: string;
  name: string;
  kind: MovementKind;
  curve: CurvePoint[];
  spread: MovementSpread[];
  people?: string[];
  works?: string[];
  events?: string[];
  text?: string;
}

export interface Atlas {
  range: [number, number];
  certainty: string[];
  pieceIds: string[];
  polities: Polity[];
  regions: Region[];
  pieceTimelines: PieceState[][];
  events: HistEvent[];
  /** 出来事の領土判定の範囲 [西, 南, 東, 北]（古い atlas.json にはない） */
  eventBoxes?: [number, number, number, number][];
  seas: Sea[];
  milestones: Milestone[];
  cities: City[];
  citiesModern: ModernCity[];
  /** 宗教の分布（古い atlas.json にはない） */
  religion?: Religion;
  /** 言語の分布（古い atlas.json にはない） */
  language?: Language;
  /** 潮流（古い atlas.json にはない） */
  movements?: Movement[];
  /** 潮流の spread で使う政治の地域 → ピース index の一覧 */
  movementRegions?: Record<string, number[]>;
  /** 潮流で使う政体の本国：政体 ID → [開始年|null, 終了年|null（両端を含む）, ピース index の一覧][] */
  movementHome?: Record<string, [number | null, number | null, number[]][]>;
}

export class AtlasIndex {
  readonly polityById = new Map<string, Polity>();
  readonly polityIndex = new Map<string, number>();

  constructor(readonly atlas: Atlas) {
    atlas.polities.forEach((p, i) => {
      this.polityById.set(p.id, p);
      this.polityIndex.set(p.id, i);
    });
  }

  /** その年のピースの状態（データがなければ null） */
  pieceState(piece: number, year: number): PieceState | null {
    return stateAt(this.atlas.pieceTimelines[piece], year);
  }

  /** その年のピースの宗教（データがなければ null） */
  religionState(piece: number, year: number): ReligionState | null {
    return stateAt(this.atlas.religion?.pieceTimelines[piece], year);
  }

  /** 指定した年に始まる宗教分布の変化（宗教の地域の timeline で、その年に始まる2つ目以降の項目） */
  religionChangesIn(year: number): { region: ReligionRegion; prev: ReligionEntry; cur: ReligionEntry }[] {
    const out: { region: ReligionRegion; prev: ReligionEntry; cur: ReligionEntry }[] = [];
    for (const r of this.atlas.religion?.regions ?? []) {
      const i = r.timeline.findIndex((e) => e.from === year);
      if (i > 0) out.push({ region: r, prev: r.timeline[i - 1], cur: r.timeline[i] });
    }
    return out;
  }

  /** 宗教の種類 */
  religionKind(id: string | null | undefined): ReligionKind | undefined {
    return id ? this.atlas.religion?.kinds.find((k) => k.id === id) : undefined;
  }

  /** 宗教の地域の、その年の記述 */
  religionEntry(region: number, year: number): ReligionEntry | null {
    const r = this.atlas.religion?.regions[region];
    let cur: ReligionEntry | null = null;
    for (const e of r?.timeline ?? []) if (e.from <= year) cur = e;
    return cur;
  }

  // ---- 分布（宗教・言語）を共通に扱う ----
  dist(key: DistKey): Religion | undefined {
    return key === "religion" ? this.atlas.religion : this.atlas.language;
  }

  distState(key: DistKey, piece: number, year: number): ReligionState | null {
    return stateAt(this.dist(key)?.pieceTimelines[piece], year);
  }

  distChangesIn(key: DistKey, year: number): { region: ReligionRegion; prev: ReligionEntry; cur: ReligionEntry }[] {
    const out: { region: ReligionRegion; prev: ReligionEntry; cur: ReligionEntry }[] = [];
    for (const r of this.dist(key)?.regions ?? []) {
      const i = r.timeline.findIndex((e) => e.from === year);
      if (i > 0) out.push({ region: r, prev: r.timeline[i - 1], cur: r.timeline[i] });
    }
    return out;
  }

  distKind(key: DistKey, id: string | null | undefined): ReligionKind | undefined {
    return id ? this.dist(key)?.kinds.find((k) => k.id === id) : undefined;
  }

  distEntry(key: DistKey, region: number, year: number): ReligionEntry | null {
    const r = this.dist(key)?.regions[region];
    let cur: ReligionEntry | null = null;
    for (const e of r?.timeline ?? []) if (e.from <= year) cur = e;
    return cur;
  }

  private regionCounts = new Map<string, Int32Array>();
  /** 地域（政治の地域、または分布の地域）を使っているピースの数（まとめ表示で代表の地域を選ぶため） */
  regionPieceCount(kind: "political" | DistKey, region: number): number {
    let c = this.regionCounts.get(kind);
    if (!c) {
      const tls = kind === "political" ? this.atlas.pieceTimelines : (this.dist(kind)?.pieceTimelines ?? []);
      const col = kind === "political" ? 4 : 3;
      const n = kind === "political" ? this.atlas.regions.length : (this.dist(kind)?.regions.length ?? 0);
      c = new Int32Array(n);
      for (const tl of tls) {
        const seen = new Set<number>();
        for (const st of tl) seen.add((st as number[])[col]);
        for (const r of seen) if (r >= 0 && r < n) c[r]++;
      }
      this.regionCounts.set(kind, c);
    }
    return c[region] ?? 0;
  }

  // ---- 潮流 ----
  movement(id: string | null | undefined): Movement | undefined {
    return id ? this.atlas.movements?.find((m) => m.id === id) : undefined;
  }

  /** その年に勢いのある潮流（強い順） */
  movementsAt(year: number): { m: Movement; v: number }[] {
    return (this.atlas.movements ?? [])
      .map((m) => ({ m, v: curveAt(m.curve, year) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v);
  }

  /** 題名から出来事を探す */
  eventByTitle(title: string): HistEvent | undefined {
    return this.atlas.events.find((e) => e.title === title);
  }

  /** その年に当てはまる names の項目 */
  private nameEntry(p: Polity, year: number): Named | undefined {
    return (p.names ?? []).find((n) => (n.from ?? -Infinity) <= year && year <= (n.to ?? Infinity));
  }

  /** 地域のその年の名前（names に当てはまる項目があればそれ、なければ name） */
  regionName(r: { name: string; names?: { from?: number; to?: number; name: string }[] }, year: number): string {
    return (r.names ?? []).find((n) => (n.from ?? -Infinity) <= year && year <= (n.to ?? Infinity))?.name ?? r.name;
  }

  polityName(p: Polity, year: number): string {
    return this.nameEntry(p, year)?.name ?? p.name;
  }

  /** 地図ラベル。時期別の short → 政体の short → 時期別の name → 政体の name の順 */
  shortName(p: Polity, year: number): string {
    const n = this.nameEntry(p, year);
    return n?.short ?? p.short ?? n?.name ?? p.name;
  }

  kindAt(p: Polity, year: number): string | undefined {
    return this.nameEntry(p, year)?.kind ?? p.kind;
  }

  rulersAt(p: Polity, year: number): Ruler[] {
    return (p.rulers ?? []).filter((r) => r.from <= year && year <= (r.to ?? Infinity));
  }

  periodsAt(p: Polity, year: number): Period[] {
    return (p.periods ?? []).filter((r) => r.from <= year && year <= (r.to ?? Infinity));
  }

  eventsIn(year: number): HistEvent[] {
    return this.atlas.events.filter((e) => e.year === year);
  }

  /** 指定した年に起きた国境の変化（地域の timeline で、その年に始まる項目） */
  borderChangesIn(year: number): BorderChange[] {
    const out: BorderChange[] = [];
    for (const r of this.atlas.regions) {
      const i = r.timeline.findIndex((e) => e.from === year);
      if (i <= 0) continue;
      const prev = r.timeline[i - 1];
      const cur = r.timeline[i];
      if (prev.owner === cur.owner && prev.overlord === cur.overlord) continue;
      out.push({ region: r, prev, cur });
    }
    return out;
  }
}

export interface BorderChange {
  region: Region;
  prev: TimelineEntry;
  cur: TimelineEntry;
}

export function sourcesOf(x: Sourced): string[] {
  if (!x.source) return [];
  return Array.isArray(x.source) ? x.source : [x.source];
}

/** 色が指定されていない政体のための、ID から決まる淡い色 */
export function fallbackColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 38% 72%)`;
}

/** 都市の、その年の推定人口（推計のある年の間を線形補間。範囲外は端の値） */
export function cityPop(c: City, year: number): number {
  const pts = Object.entries(c.pop ?? {})
    .map(([y, v]) => [Number(y), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (!pts.length) return 0;
  if (year <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [y1, v1] = pts[i];
    const [y0, v0] = pts[i - 1];
    if (year <= y1) return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

/** その年に首都としている政体（あれば） */
export function cityCapitalOf(c: City, year: number): string | null {
  for (const k of c.capital ?? []) {
    if ((k.from ?? -Infinity) <= year && year <= (k.to ?? Infinity)) return k.polity;
  }
  return null;
}

export function cityName(c: City, year: number): string {
  for (const n of c.names ?? []) {
    if ((n.from ?? -Infinity) <= year && year <= (n.to ?? Infinity)) return n.name;
  }
  return c.name;
}

/** 強さの曲線の、その年の値（点の間は線形補間、範囲外は 0） */
export function curveAt(c: CurvePoint[], year: number): number {
  if (!c.length || year < c[0][0] || year > c[c.length - 1][0]) return 0;
  for (let i = 1; i < c.length; i++) {
    const [y1, v1] = c[i];
    const [y0, v0] = c[i - 1];
    if (year <= y1) return y1 === y0 ? v1 : v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
  }
  return c[c.length - 1][1];
}

/** 曲線の最大値 */
export function curveMax(c: CurvePoint[]): number {
  return c.reduce((m, p) => Math.max(m, p[1]), 0);
}

/** 年の昇順の [開始年, ...] の並びから、その年に有効なものを二分探索で探す */
function stateAt<T extends readonly (number | undefined)[]>(tl: T[] | undefined, year: number): T | null {
  if (!tl || tl.length === 0) return null;
  let lo = 0;
  let hi = tl.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tl[mid][0] as number) <= year) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans < 0 ? null : tl[ans];
}
