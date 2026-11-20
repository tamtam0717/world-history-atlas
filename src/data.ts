// atlas.json（tools/build_data.mjs が生成）の型と、年ごとの問い合わせ

export interface Sourced {
  source?: string | string[];
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

export interface Period extends Sourced {
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
  certainty?: string;
  cause?: string;
  note?: string;
}

export interface Region {
  id: string;
  name: string;
  timeline: TimelineEntry[];
}

export interface HistEvent extends Sourced {
  year: number;
  date?: string;
  title: string;
  text?: string;
  polities?: string[];
  importance?: number;
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

export interface City {
  id: string;
  name: string;
  modern?: string;
  names?: Named[];
  lon: number;
  lat: number;
  founded?: number;
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
}

export interface ReligionEntry extends Sourced {
  from: number;
  main: string;
  minor?: string | null;
  note?: string;
}

export interface ReligionRegion {
  id: string;
  name: string;
  timeline: ReligionEntry[];
}

/** [開始年, main の index, minor の index（なければ -1）, 宗教の地域 index] */
export type ReligionState = [number, number, number, number];

export interface Religion {
  kinds: ReligionKind[];
  regions: ReligionRegion[];
  pieceTimelines: ReligionState[][];
}

export interface Atlas {
  range: [number, number];
  certainty: string[];
  pieceIds: string[];
  polities: Polity[];
  regions: Region[];
  pieceTimelines: PieceState[][];
  events: HistEvent[];
  seas: Sea[];
  milestones: Milestone[];
  cities: City[];
  citiesModern: ModernCity[];
  /** 宗教の分布（古い atlas.json にはない） */
  religion?: Religion;
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

  /** その年に当てはまる names の項目 */
  private nameEntry(p: Polity, year: number): Named | undefined {
    return (p.names ?? []).find((n) => (n.from ?? -Infinity) <= year && year <= (n.to ?? Infinity));
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

/** 年の昇順の [開始年, ...] の並びから、その年に有効なものを二分探索で探す */
function stateAt<T extends number[]>(tl: T[] | undefined, year: number): T | null {
  if (!tl || tl.length === 0) return null;
  let lo = 0;
  let hi = tl.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl[mid][0] <= year) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans < 0 ? null : tl[ans];
}
