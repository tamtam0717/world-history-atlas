// 植民地（副ラベルの単位）の選択：宗主国の色で塗る土地のうち、副ラベル（label）の出ている所を
// 「本国とは別の、本国の色の下にある土地」として選べるようにする。
//
// - データのある植民地（data/colonies、atlas.colonies）：match（副ラベル・地域・国）で、どのピースがその植民地かを決める。
//   キーは植民地の ID（URL の c=portuguese_brazil）。
// - データのない植民地：同じ owner・同じ副ラベル（1行目）のピースのまとまり。キーは "~" + 副ラベル（URL の c=~チュニジア）。
//   副ラベルが自動で付いたもの（「○○の保護下」など。map.ts の subUnits）も、その名前で同じように選べる。

import type { AtlasIndex, Colony, Period, PieceState, Ruler, TimelineEntry } from "./data";

/** 選んでいる植民地：本国（parent の政体 ID）と、植民地のキー（データの ID、または "~副ラベル"） */
export interface ColonyRef {
  parent: string;
  key: string;
}

export const sameColony = (a: ColonyRef | null | undefined, b: ColonyRef | null | undefined) =>
  !!a && !!b && a.parent === b.parent && a.key === b.key;

/** 副ラベルの1行目（改行の後ろは2行目の補足） */
export const labelName = (label: string | undefined | null) => (label ? label.split("\n")[0] : "");

/**
 * 本国の政体の「別の姿」：この政体が owner の年も、本国（値）の植民地データに当てはめる。
 * ヴィシー政府（1940–44）・フランコ側（1936–39）の時期の植民地を、同じ植民地（仏領西アフリカ・スペイン領モロッコなど）として選び続けるため
 */
export const PARENT_ALIASES: Record<string, string> = { vichy_france: "france", nationalist_spain: "spain" };

export class Colonies {
  readonly list: Colony[];
  readonly byId = new Map<string, Colony>();
  /** 本国の政体番号 → その本国の植民地（データの順） */
  private byParent = new Map<number, Colony[]>();
  /** 植民地 → match の regions・iso のピース番号 */
  private pieceSets = new Map<Colony, Set<number>>();
  /** 別の姿の政体番号 → 本国の政体番号（PARENT_ALIASES） */
  private alias = new Map<number, number>();

  constructor(private idx: AtlasIndex) {
    this.list = idx.atlas.colonies ?? [];
    for (const c of this.list) {
      this.byId.set(c.id, c);
      const pi = idx.polityIndex.get(c.parent);
      if (pi === undefined) continue;
      if (!this.byParent.has(pi)) this.byParent.set(pi, []);
      this.byParent.get(pi)!.push(c);
      if (c.pieces?.length) this.pieceSets.set(c, new Set(c.pieces));
    }
    for (const [a, p] of Object.entries(PARENT_ALIASES)) {
      const ai = idx.polityIndex.get(a);
      const pi = idx.polityIndex.get(p);
      if (ai === undefined || pi === undefined) continue;
      this.alias.set(ai, pi);
      const list = this.byParent.get(pi);
      if (list) this.byParent.set(ai, list);
    }
  }

  /** owner（政体番号）が本国 parent（政体番号）か、その別の姿か */
  ownedBy(owner: number, parent: number) {
    return owner === parent || this.alias.get(owner) === parent;
  }

  /** その本国の植民地データがあるか（なければ判定を省ける） */
  hasParent(polityIndex: number) {
    return this.byParent.has(polityIndex);
  }

  /** 地域の、その年に効いている記述 */
  entryOf(region: number, year: number): TimelineEntry | null {
    let cur: TimelineEntry | null = null;
    for (const e of this.idx.atlas.regions[region]?.timeline ?? []) {
      if (e.from > year) break;
      cur = e;
    }
    return cur;
  }

  /** 状態（ピースの所属）と地域の記述が、その植民地に当てはまるか（年の範囲は呼ぶ側で確かめる） */
  private matches(c: Colony, piece: number, s: PieceState, e: TimelineEntry | null): boolean {
    const m = c.match;
    const label = labelName(e?.label);
    if (m.exclude_certainty?.length && m.exclude_certainty.includes(this.idx.atlas.certainty[s[3]])) return false;
    if (label && m.exclude_labels?.includes(label)) return false;
    if (label && (m.labels?.includes(label) || m.labels?.includes(e!.label!) || m.contains?.some((x) => label.includes(x)))) return true;
    return this.pieceSets.get(c)?.has(piece) ?? false;
  }

  /** ピースの状態から、その年に当てはまるデータの植民地（なければ null）。同じピースに複数が当てはまれば、データの順で先のもの */
  dataAtState(piece: number, s: PieceState | null, year: number, e?: TimelineEntry | null): Colony | null {
    if (!s || s[1] < 0) return null;
    const list = this.byParent.get(s[1]);
    if (!list) return null;
    const entry = e === undefined ? this.entryOf(s[4], year) : e;
    for (const c of list) {
      if ((c.from ?? -Infinity) > year || (c.to ?? Infinity) < year) continue;
      if (this.matches(c, piece, s, entry)) return c;
    }
    return null;
  }

  /** ピース（atlas のピース番号）がその年に属するデータの植民地 */
  dataAt(piece: number, year: number): Colony | null {
    return this.dataAtState(piece, this.idx.pieceState(piece, year), year);
  }

  /**
   * ピースがその年に、その植民地に属するか。データのない植民地は「owner が本国・副ラベルの1行目が同じ・データの植民地ではない」。
   * （自動で付いた副ラベルは、ここでは判定できない。地図の subUnits で引く）
   */
  belongs(piece: number, year: number, ref: ColonyRef): boolean {
    const s = this.idx.pieceState(piece, year);
    if (!s || s[1] < 0) return false;
    const e = this.entryOf(s[4], year);
    if (!ref.key.startsWith("~")) {
      const pi = this.idx.polityIndex.get(ref.parent);
      return pi !== undefined && this.ownedBy(s[1], pi) && this.dataAtState(piece, s, year, e)?.id === ref.key;
    }
    if (this.idx.atlas.polities[s[1]].id !== ref.parent) return false;
    const d = this.dataAtState(piece, s, year, e);
    return !d && labelName(e?.label) === ref.key.slice(1);
  }

  /**
   * そのピースが、ある年の範囲で植民地に属する区間（[開始年, 終了年+1) の列、隣り合う区間はまとめる）と、そのときの地域。
   * 国の節目（polity-milestones.ts）が、植民地の範囲の増減を数えるのに使う
   */
  segments(piece: number, ref: ColonyRef, y0: number, y1: number): { from: number; to: number; region: number }[] {
    const tl = this.idx.atlas.pieceTimelines[piece];
    const pi = this.idx.polityIndex.get(ref.parent);
    if (!tl?.length || pi === undefined) return [];
    const data = ref.key.startsWith("~") ? null : this.byId.get(ref.key);
    if (!ref.key.startsWith("~") && !data) return [];
    const cols = this.byParent.get(pi) ?? [];
    const out: { from: number; to: number; region: number }[] = [];
    for (let k = 0; k < tl.length; k++) {
      const s = tl[k];
      if (data ? !this.ownedBy(s[1], pi) : s[1] !== pi) continue;
      const from = Math.max(y0, s[0]);
      const to = Math.min(y1 + 1, k + 1 < tl.length ? tl[k + 1][0] : y1 + 1);
      if (from >= to) continue;
      // 区間の中で、地域の記述が変わる年と、植民地データの年の範囲の境目で分ける
      const cuts = new Set<number>([from]);
      for (const e of this.idx.atlas.regions[s[4]]?.timeline ?? []) if (e.from > from && e.from < to) cuts.add(e.from);
      for (const c of cols) {
        if (c.from != null && c.from > from && c.from < to) cuts.add(c.from);
        if (c.to != null && c.to + 1 > from && c.to + 1 < to) cuts.add(c.to + 1);
      }
      const ys = [...cuts].sort((a, b) => a - b);
      ys.forEach((y, j) => {
        const end = j + 1 < ys.length ? ys[j + 1] : to;
        const e = this.entryOf(s[4], y);
        const d = this.dataAtState(piece, s, y, e);
        const hit = data ? d === data : !d && labelName(e?.label) === ref.key.slice(1);
        if (!hit) return;
        const last = out[out.length - 1];
        if (last && last.to === y) {
          last.to = end;
          last.region = s[4];
        } else out.push({ from: y, to: end, region: s[4] });
      });
    }
    return out;
  }

  /** 植民地の、その年の名前（データの names → name。データのないものは副ラベル） */
  nameOf(ref: ColonyRef, year: number): string {
    const c = this.byId.get(ref.key);
    if (!c) return ref.key.replace(/^~/, "");
    return (c.names ?? []).find((n) => (n.from ?? -Infinity) <= year && year <= (n.to ?? Infinity))?.name ?? c.name;
  }

  /** 植民地の、その年の種類（names の kind → kind） */
  kindOf(c: Colony, year: number): string | undefined {
    return (c.names ?? []).find((n) => (n.from ?? -Infinity) <= year && year <= (n.to ?? Infinity))?.kind ?? c.kind;
  }

  governorsAt(c: Colony, year: number): Ruler[] {
    return (c.governors ?? []).filter((r) => r.from <= year && year <= (r.to ?? Infinity));
  }

  periodsAt(c: Colony, year: number): Period[] {
    return (c.periods ?? []).filter((r) => r.from <= year && year <= (r.to ?? Infinity));
  }

  /** 植民地の出来事として扱う政体 ID（植民地の ID と、データの polities） */
  eventPolities(ref: ColonyRef): string[] {
    const c = this.byId.get(ref.key);
    return c ? [c.id, ...(c.polities ?? [])] : [];
  }
}
