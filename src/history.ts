// 「〇〇史」：国・植民地を選んでいる間、« » と ⌘←→ は、選んだものの「舞台」（現代の国の範囲）の歴史の節目へ移る。
// 清を選んで進めると、清が滅んだ後も中華民国・中華人民共和国の節目で止まる（中国史）。
//
// - 舞台：現代の国コードのピースの集まり。国（政体）を選んだら本国（polities の home_iso の先頭、なければその年の首都の国、
//   それもなければ選んだ年にその国が最も広く持つ国）、植民地を選んだら植民地の範囲で最も広い国。
//   手で書いた「〇〇史」（data/histories）があればそれを使う（当事者に選んだ政体があり舞台が本国と重なるもの → 舞台の国が同じもの）。
// - 当事者：年ごとに、舞台の面積の CORE 以上を持つ単位（植民地・副ラベルのまとまりがあればその単位、なければ owner の政体）。
//   一度当事者になった単位は、KEEP 以上を持つ間は当事者のまま（しきい値の前後で出入りしないように）。
//   手で書いた members は舞台に土地がある間、選んだもの（anchor）は KEEP 以上を持つ間（小さな国はいちばん広い時の半分以上の間）は当事者。
// - 節目：当事者それぞれの節目（polity-milestones.ts。舞台の中の領土の変化・舞台の中の出来事だけ）を、当事者だった年の分だけ合わせる。
// 計算は舞台と anchor ごとに一度だけ（全年 1453–2025）。

import type { Topology } from "topojson-specification";
import type { AtlasIndex, History } from "./data";
import { labelName, type Colonies, type ColonyRef } from "./colonies";
import { MODERN_NAMES } from "./modern";
import type { PolityMilestone, PolityMilestones, StageMask } from "./polity-milestones";

/** 当事者の単位：政体か植民地 */
export type Unit = { kind: "polity"; id: string } | { kind: "colony"; ref: ColonyRef };
export const unitKey = (u: Unit) => (u.kind === "polity" ? `p:${u.id}` : `c:${u.ref.parent}|${u.ref.key}`);
export const sameUnit = (a: Unit | null | undefined, b: Unit | null | undefined) => !!a && !!b && unitKey(a) === unitKey(b);

/** 舞台の面積のこの割合以上を持つと当事者になる */
const CORE = 0.3;
/** 当事者になった単位は、この割合以上を持つ間は当事者のまま */
const KEEP = 0.1;

export interface Stage extends StageMask {
  /** URL の h=（自動の舞台は国コード、手で書いたものは ID） */
  key: string;
  name: string;
  /** 舞台の国コード（自動のものは1つ） */
  isos: string[];
  /** 舞台のピース（atlas のピース番号） */
  pieces: number[];
  hist?: History;
}

/** 節目の一覧の項目（だれの節目か） */
export interface HistoryMilestone extends PolityMilestone {
  /** その年の主な当事者 */
  unit?: Unit;
}

interface Track {
  unit: Unit;
  /** 年ごとの舞台の中の面積（km²） */
  area: Float64Array;
  member: Uint8Array;
}

export class StageInfo {
  private ms: HistoryMilestone[] | null = null;
  constructor(
    readonly stage: Stage,
    readonly anchor: Unit | null,
    private tracks: Map<string, Track>,
    readonly total: number,
    private y0: number,
    private owner: Histories,
  ) {}

  /** その年に当事者か */
  isMember(u: Unit, year: number): boolean {
    const t = this.tracks.get(unitKey(u));
    const k = year - this.y0;
    return !!t && k >= 0 && k < t.member.length && t.member[k] === 1;
  }

  /** その年の当事者（舞台を広く持つ順） */
  membersAt(year: number): { unit: Unit; area: number }[] {
    const k = year - this.y0;
    const out: { unit: Unit; area: number }[] = [];
    for (const t of this.tracks.values()) if (t.member[k]) out.push({ unit: t.unit, area: t.area[k] });
    return out.sort((a, b) => b.area - a.area);
  }

  /** その年に舞台を最も広く持つ当事者（except を除く） */
  leaderAt(year: number, except?: Unit | null): Unit | null {
    const ex = except ? unitKey(except) : "";
    return this.membersAt(year).find((m) => unitKey(m.unit) !== ex)?.unit ?? null;
  }

  /** 舞台の中の面積の割合（0〜1） */
  shareOf(u: Unit, year: number): number {
    const t = this.tracks.get(unitKey(u));
    const k = year - this.y0;
    return t && this.total ? (t.area[k] ?? 0) / this.total : 0;
  }

  /** 当事者だったことのある政体の ID（植民地は本国でなく、植民地の出来事として扱う政体） */
  memberPolities(year?: number): string[] {
    const out = new Set<string>();
    for (const t of this.tracks.values()) {
      if (year != null ? !t.member[year - this.y0] : !t.member.some((x) => x)) continue;
      if (t.unit.kind === "polity") out.add(t.unit.id);
      else for (const p of this.owner.colonies.eventPolities(t.unit.ref)) out.add(p);
    }
    return [...out];
  }

  /** 「〇〇史」の節目（年の昇順） */
  milestones(): HistoryMilestone[] {
    if (!this.ms) this.ms = this.owner.mergeMilestones(this, [...this.tracks.values()]);
    return this.ms;
  }
}

export class Histories {
  private isoOf: string[];
  private byIso = new Map<string, number[]>();
  private infoCache = new Map<string, StageInfo>();
  private stageCache = new Map<string, Stage>();
  readonly list: History[];

  constructor(
    topo: Topology,
    private idx: AtlasIndex,
    readonly colonies: Colonies,
    private pms: PolityMilestones,
    private range: [number, number],
  ) {
    const geoms = (topo.objects.pieces as unknown as { geometries: { properties?: { iso?: string } }[] }).geometries;
    this.isoOf = geoms.map((g) => g.properties?.iso ?? "");
    this.isoOf.forEach((iso, i) => {
      if (!this.byIso.has(iso)) this.byIso.set(iso, []);
      this.byIso.get(iso)!.push(i);
    });
    this.list = idx.atlas.histories ?? [];
  }

  /** ピースの現代の国コード */
  iso(piece: number) {
    return this.isoOf[piece] ?? "";
  }

  // ---- 舞台 ----

  /** URL の h= から舞台を作る（国コードか、手で書いた「〇〇史」の ID） */
  stageByKey(key: string | null | undefined): Stage | null {
    if (!key) return null;
    const hit = this.stageCache.get(key);
    if (hit) return hit;
    const h = this.list.find((x) => x.id === key);
    let st: Stage | null = null;
    if (h) st = this.makeStage(h.id, h.name, h.stage.iso ?? [], h.pieces, h);
    else if (this.byIso.has(key) && /^[A-Z0-9]{3}$/.test(key)) st = this.makeStage(key, `${MODERN_NAMES[key] ?? key}史`, [key], this.byIso.get(key)!);
    if (st) this.stageCache.set(key, st);
    return st;
  }

  private makeStage(key: string, name: string, isos: string[], pieces: number[], hist?: History): Stage {
    const mask = new Uint8Array(this.isoOf.length);
    for (const i of pieces) mask[i] = 1;
    return { key, name, isos, pieces, mask, hist };
  }

  /** 手で書いた「〇〇史」で、舞台の国に iso を含むもの */
  private histByIso(iso: string) {
    return this.list.find((h) => h.stage.iso?.includes(iso));
  }

  /** 国（政体）を選んだときの舞台 */
  stageForPolity(id: string, year: number): Stage | null {
    const iso = this.idx.atlas.polityStage?.[id] ?? this.capitalIso(id, year) ?? this.largestIso(this.ownedPieces(id, year));
    // 1. 当事者に選んだ政体がある「〇〇史」（舞台が本国と重なるものを優先）
    const listed = this.list.filter((h) => h.members.some((m) => m.polity === id));
    const home = iso ? this.byIso.get(iso) ?? [] : [];
    const hit =
      listed.find((h) => (iso && h.stage.iso?.includes(iso)) || home.some((p) => binHas(h.pieces, p))) ??
      // 2. 舞台の国が同じ「〇〇史」
      (iso ? this.histByIso(iso) : undefined) ??
      listed[0];
    if (hit) return this.stageByKey(hit.id);
    return iso ? this.stageByKey(iso) : null;
  }

  /** 植民地を選んだときの舞台（その年の植民地の範囲で最も広い国） */
  stageForColony(pieces: Iterable<number>): Stage | null {
    const iso = this.largestIso(pieces);
    if (!iso) return null;
    const h = this.histByIso(iso);
    return this.stageByKey(h ? h.id : iso);
  }

  /** その年（なければいちばん近い年）の首都の国コード */
  private capitalIso(id: string, year: number): string | null {
    let best: string | null = null;
    let gap = Infinity;
    for (const [f, t, iso] of this.idx.atlas.polityCapitalIso?.[id] ?? []) {
      const g = f != null && year < f ? f - year : t != null && year > t ? year - t : 0;
      if (g < gap) [best, gap] = [iso, g];
    }
    return best;
  }

  private ownedPieces(id: string, year: number): number[] {
    const pi = this.idx.polityIndex.get(id);
    const out: number[] = [];
    if (pi === undefined) return out;
    for (let i = 0; i < this.idx.atlas.pieceTimelines.length; i++) if (this.idx.pieceState(i, year)?.[1] === pi) out.push(i);
    return out;
  }

  private largestIso(pieces: Iterable<number>): string | null {
    const areas = this.pms.pieceAreas();
    const m = new Map<string, number>();
    for (const i of pieces) {
      const iso = this.isoOf[i];
      if (iso) m.set(iso, (m.get(iso) ?? 0) + areas[i]);
    }
    let best: string | null = null;
    let v = 0;
    for (const [k, a] of m) if (a > v) [best, v] = [k, a];
    return best;
  }

  // ---- 当事者 ----

  /** 本国（その国の色で塗っても植民地として数えない土地）か */
  private isHome(polityId: string, iso: string, year: number) {
    const groups = this.idx.atlas.polityHomeIso?.[polityId];
    if (groups) return groups.some(([f, t, isos]) => (f == null || f <= year) && (t == null || year <= t) && isos.includes(iso));
    return (this.idx.atlas.polityStage?.[polityId] ?? this.capitalIso(polityId, year)) === iso;
  }

  /** 舞台と選んだもの（anchor）の当事者の一覧。計算は一度だけ */
  info(stage: Stage, anchor: Unit | null): StageInfo {
    const key = `${stage.key}|${anchor ? unitKey(anchor) : ""}`;
    let inf = this.infoCache.get(key);
    if (!inf) {
      inf = this.compute(stage, anchor);
      this.infoCache.set(key, inf);
    }
    return inf;
  }

  private compute(stage: Stage, anchor: Unit | null): StageInfo {
    const { idx, colonies } = this;
    const atlas = idx.atlas;
    const [y0, y1] = this.range;
    const n = y1 - y0 + 1;
    const areas = this.pms.pieceAreas();
    const hist = stage.hist;
    const total = stage.pieces.reduce((s, i) => s + (areas[i] ?? 0), 0);
    const colsOf = new Map<number, { from?: number; to?: number }[]>();
    for (const c of colonies.list) {
      const pi = idx.polityIndex.get(c.parent);
      if (pi === undefined) continue;
      if (!colsOf.has(pi)) colsOf.set(pi, []);
      colsOf.get(pi)!.push(c);
    }

    // 1. 単位ごとの、年ごとの面積（差分の配列に足してから累積する）
    const unitArea = new Map<string, { unit: Unit; d: Float64Array }>();
    const add = (unit: Unit, from: number, to: number, a: number) => {
      const k = unitKey(unit);
      let u = unitArea.get(k);
      if (!u) unitArea.set(k, (u = { unit, d: new Float64Array(n + 1) }));
      u.d[from - y0] += a;
      u.d[to - y0] -= a;
    };
    // 手で書いた当事者・anchor の政体は、owner か overlord の土地（植民地も含む）で数える
    const broadIds = new Set<number>();
    for (const m of hist?.members ?? []) if (m.polity) broadIds.add(idx.polityIndex.get(m.polity) ?? -1);
    if (anchor?.kind === "polity") broadIds.add(idx.polityIndex.get(anchor.id) ?? -1);
    const broad = new Map<number, Float64Array>();
    for (const pi of broadIds) if (pi >= 0) broad.set(pi, new Float64Array(n + 1));

    for (const i of stage.pieces) {
      const tl = atlas.pieceTimelines[i];
      const a = areas[i] ?? 0;
      if (!tl?.length || !a) continue;
      const iso = this.isoOf[i];
      for (let k = 0; k < tl.length; k++) {
        const s = tl[k];
        const from = Math.max(y0, s[0]);
        const to = Math.min(y1 + 1, k + 1 < tl.length ? tl[k + 1][0] : y1 + 1);
        if (from >= to) continue;
        for (const pi of s[1] === s[2] ? [s[1]] : [s[1], s[2]]) {
          const b = broad.get(pi);
          if (b) {
            b[from - y0] += a;
            b[to - y0] -= a;
          }
        }
        const owner = s[1];
        if (owner < 0) continue;
        const ownerId = atlas.polities[owner].id;
        // 区間の中で、地域の記述・植民地データ・本国の範囲が変わる年で分ける
        const cuts = new Set<number>([from]);
        for (const e of atlas.regions[s[4]]?.timeline ?? []) if (e.from > from && e.from < to) cuts.add(e.from);
        for (const c of colsOf.get(owner) ?? []) {
          if (c.from != null && c.from > from && c.from < to) cuts.add(c.from);
          if (c.to != null && c.to + 1 > from && c.to + 1 < to) cuts.add(c.to + 1);
        }
        for (const [f, t] of atlas.polityHomeIso?.[ownerId] ?? []) {
          if (f != null && f > from && f < to) cuts.add(f);
          if (t != null && t + 1 > from && t + 1 < to) cuts.add(t + 1);
        }
        const ys = [...cuts].sort((p, q) => p - q);
        ys.forEach((y, j) => {
          const end = j + 1 < ys.length ? ys[j + 1] : to;
          const e = colonies.entryOf(s[4], y);
          const d = colonies.dataAtState(i, s, y, e);
          const label = labelName(e?.label);
          const unit: Unit = d
            ? { kind: "colony", ref: { parent: ownerId, key: d.id } }
            : label && !this.isHome(ownerId, iso, y)
              ? { kind: "colony", ref: { parent: ownerId, key: "~" + label } }
              : { kind: "polity", id: ownerId };
          add(unit, y, end, a);
        });
      }
    }

    // 2. 当事者の年
    const tracks = new Map<string, Track>();
    const cum = (d: Float64Array) => {
      const out = new Float64Array(n);
      let v = 0;
      for (let k = 0; k < n; k++) out[k] = v += d[k];
      return out;
    };
    const track = (unit: Unit) => {
      const k = unitKey(unit);
      let t = tracks.get(k);
      if (!t) {
        const u = unitArea.get(k);
        tracks.set(k, (t = { unit, area: u ? cum(u.d) : new Float64Array(n), member: new Uint8Array(n) }));
        // 政体は、owner か overlord の土地で数えたほうが広ければそちら（神聖ローマ帝国など）
        if (unit.kind === "polity") {
          const b = broad.get(idx.polityIndex.get(unit.id) ?? -1);
          if (b) {
            const bc = cum(b);
            for (let y = 0; y < n; y++) t.area[y] = Math.max(t.area[y], bc[y]);
          }
        }
      }
      return t;
    };
    if (hist?.mode !== "replace" && total > 0) {
      for (const u of unitArea.values()) {
        const area = cum(u.d);
        const core: number[] = [];
        for (let y = 0; y < n; y++) if (area[y] >= total * CORE) core.push(y);
        if (!core.length) continue;
        const t = track(u.unit);
        for (const y of core) {
          if (t.member[y]) continue;
          t.member[y] = 1;
          for (let z = y + 1; z < n && !t.member[z] && area[z] >= total * KEEP; z++) t.member[z] = 1;
          for (let z = y - 1; z >= 0 && !t.member[z] && area[z] >= total * KEEP; z--) t.member[z] = 1;
        }
      }
    }
    for (const m of hist?.members ?? []) {
      const unit: Unit | null = m.polity
        ? { kind: "polity", id: m.polity }
        : m.colony
          ? { kind: "colony", ref: { parent: colonies.byId.get(m.colony)?.parent ?? "", key: m.colony } }
          : null;
      if (!unit) continue;
      const t = track(unit);
      for (let y = Math.max(0, (m.from ?? y0) - y0); y <= Math.min(n - 1, (m.to ?? y1) - y0); y++) if (t.area[y] > 0) t.member[y] = 1;
    }
    // 選んだもの：舞台の KEEP 以上を持つ間（いちばん広かった時でも KEEP の 2 倍に届かない小さな国は、その半分以上の間）
    if (anchor && total > 0) {
      const t = track(anchor);
      const max = t.area.reduce((m, v) => Math.max(m, v), 0);
      const th = Math.min(total * KEEP, max * 0.5);
      for (let y = 0; y < n; y++) if (t.area[y] > 0 && t.area[y] >= th) t.member[y] = 1;
    }
    for (const [k, t] of tracks) if (!t.member.some((x) => x)) tracks.delete(k);
    return new StageInfo(stage, anchor, tracks, total, y0, this);
  }

  /** 単位の、その年の名前 */
  unitName(u: Unit, year: number): string {
    if (u.kind === "colony") return this.colonies.nameOf(u.ref, year);
    const p = this.idx.polityById.get(u.id);
    return p ? this.idx.shortName(p, year) : u.id;
  }

  /** 単位の色（植民地は本国の色） */
  unitColor(u: Unit): string | undefined {
    return this.idx.polityById.get(u.kind === "polity" ? u.id : u.ref.parent)?.color;
  }

  /** 当事者それぞれの節目を、当事者だった年（とその翌年：消えた年）の分だけ合わせる */
  mergeMilestones(info: StageInfo, tracks: Track[]): HistoryMilestone[] {
    const [y0, y1] = this.range;
    const st = info.stage;
    type Cand = { m: PolityMilestone; unit: Unit; area: number };
    const byYear = new Map<number, Cand[]>();
    for (const t of tracks) {
      const list =
        t.unit.kind === "polity" ? this.pms.get(t.unit.id, st) : this.pms.getColony(t.unit.ref, this.colonies, st);
      for (const m of list) {
        const k = m.year - y0;
        const here = !!t.member[k];
        const before = k > 0 && !!t.member[k - 1];
        if (!here && !before) continue;
        // 消えた・失った年は前年の面積で比べる
        const area = here ? t.area[k] : t.area[k - 1];
        if (!byYear.has(m.year)) byYear.set(m.year, []);
        byYear.get(m.year)!.push({ m, unit: t.unit, area });
      }
    }
    // 当事者の交代（いちばん広い当事者が替わり、どちらかが当事者でなくなった・なった年）。ほかの節目がない年だけ足す
    for (let y = y0 + 1; y <= y1; y++) {
      if (byYear.has(y)) continue;
      const a = info.leaderAt(y - 1);
      const b = info.leaderAt(y);
      if (!a || !b || sameUnit(a, b)) continue;
      if (info.isMember(a, y) && info.isMember(b, y - 1)) continue;
      byYear.set(y, [
        { m: { year: y, title: `${this.unitName(a, y - 1)} → ${this.unitName(b, y)}`, detail: [], kind: "name" }, unit: b, area: 0 },
      ]);
    }
    const rank: Record<PolityMilestone["kind"], number> = { event: 3, appear: 2, vanish: 2, gain: 1, loss: 1, name: 0 };
    const out: HistoryMilestone[] = [];
    for (const [year, cands] of byYear) {
      cands.sort((a, b) => rank[b.m.kind] - rank[a.m.kind] || b.area - a.area);
      const main = cands[0];
      const detail: string[] = [];
      const seen = new Set([main.m.title]);
      const multi = new Set(cands.map((c) => unitKey(c.unit))).size > 1;
      const tag = (c: Cand) => (multi ? `［${this.unitName(c.unit, year)}］` : "");
      for (const d of main.m.detail) if (!seen.has(d)) (seen.add(d), detail.push(d));
      for (const c of cands.slice(1)) {
        for (const d of [c.m.title, ...c.m.detail]) {
          if (seen.has(d)) continue;
          seen.add(d);
          detail.push(`${tag(c)}${d}`);
        }
      }
      // 領土の増減の印は、主な節目になければ、ほかの当事者のもの
      const terr = main.m.terr ?? cands.find((c) => c.m.terr)?.m.terr;
      out.push({ ...main.m, detail, terr, unit: main.unit });
    }
    return out.sort((a, b) => a.year - b.year);
  }
}

/** 昇順の配列に値があるか */
function binHas(a: number[], v: number) {
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (a[m] === v) return true;
    if (a[m] < v) lo = m + 1;
    else hi = m - 1;
  }
  return false;
}
