// atlas.json（tools/build_data.mjs が生成）の型と、年ごとの問い合わせ

export interface Sourced {
  source?: string | string[];
}

export interface Named {
  from?: number;
  to?: number;
  name: string;
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

export interface Atlas {
  range: [number, number];
  certainty: string[];
  pieceIds: string[];
  polities: Polity[];
  regions: Region[];
  pieceTimelines: PieceState[][];
  events: HistEvent[];
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
    const tl = this.atlas.pieceTimelines[piece];
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

  polityName(p: Polity, year: number): string {
    for (const n of p.names ?? []) {
      if ((n.from ?? -Infinity) <= year && year <= (n.to ?? Infinity)) return n.name;
    }
    return p.name;
  }

  shortName(p: Polity, year: number): string {
    return p.short ?? this.polityName(p, year);
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
