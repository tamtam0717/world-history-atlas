// スライダーの下の帯（潮流の年表）。表示範囲の全期間について、主な潮流の勢いを横長の帯で描く。
// 勢いが強い年ほど濃く、最盛期はつや（上側の明るい筋）と光のにじみが出る。始まりと終わりは自然にぼかす。
// 行は「今の年に勢いの強い上位 ROWS 件」＋「選んでいる潮流」。帯を押すとその潮流を選ぶ。今の年に縦線。

import { curveAt, curveMax, type AtlasIndex, type Movement } from "./data";
import { MOVEMENT_COLORS } from "./map";

const ROWS = 5;
const ROW_H = 13;
const STORE_KEY = "atlas.mvband";

export class MovementBand {
  private rowsEl: HTMLDivElement;
  private cursor: HTMLDivElement;
  private toggle: HTMLButtonElement;
  private year = 0;
  private selected: string | null = null;
  private key = "";
  private width = 0;
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(
    private root: HTMLElement,
    private idx: AtlasIndex,
    private range: [number, number],
    private onSelect: (id: string | null) => void,
    private onResize: () => void = () => {},
  ) {
    root.innerHTML = `<button type="button" class="mvb-toggle" aria-expanded="true" title="潮流の年表を開く／閉じる（T）"><span class="mvb-caret"></span>潮流<span class="mvb-mini"></span></button>
      <div class="mvb-body"><div class="mvb-rows"></div><div class="mvb-cursor"></div></div>`;
    this.toggle = root.querySelector(".mvb-toggle")!;
    this.rowsEl = root.querySelector(".mvb-rows")!;
    this.cursor = root.querySelector(".mvb-cursor")!;
    let collapsed: boolean | null = null;
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (v) collapsed = v === "closed";
    } catch {
      /* 保存できない環境でも動くように */
    }
    // スマホでは場所をとりすぎないよう、最初は畳んでおく
    this.setCollapsed(collapsed ?? matchMedia("(max-width: 799px)").matches, false);
    this.toggle.addEventListener("click", () => this.setCollapsed(!this.collapsed));
    this.rowsEl.addEventListener("click", (e) => {
      const row = (e.target as Element).closest<HTMLElement>("[data-mv]");
      if (!row) return;
      const id = row.dataset.mv!;
      this.onSelect(id === this.selected ? null : id);
    });
    new ResizeObserver(() => {
      const w = this.rowsEl.clientWidth;
      if (w && w !== this.width) {
        this.width = w;
        this.cache.clear();
        this.key = "";
        this.render(this.year, this.selected);
      }
    }).observe(this.rowsEl);
  }

  get collapsed() {
    return this.root.classList.contains("collapsed");
  }

  setCollapsed(on: boolean, save = true) {
    this.root.classList.toggle("collapsed", on);
    this.toggle.setAttribute("aria-expanded", String(!on));
    if (save) {
      try {
        localStorage.setItem(STORE_KEY, on ? "closed" : "open");
      } catch {
        /* 無視 */
      }
    }
    this.key = "";
    this.render(this.year, this.selected);
    this.onResize();
  }

  render(year: number, selected: string | null) {
    this.year = year;
    this.selected = selected;
    const active = this.idx.movementsAt(year);
    const mini = this.root.querySelector<HTMLElement>(".mvb-mini")!;
    // 畳んでいるときも、今の年の上位の潮流を色の点で小さく見せる
    mini.innerHTML = active
      .slice(0, 6)
      .map((x) => `<i style="--c:${MOVEMENT_COLORS[x.m.kind]};--v:${x.v.toFixed(2)}" title="${x.m.name}"></i>`)
      .join("");
    const [y0, y1] = this.range;
    this.cursor.style.left = `${((year - y0) / Math.max(1, y1 - y0)) * 100}%`;
    if (this.collapsed || !this.width) return;
    const rows: Movement[] = active.slice(0, ROWS).map((x) => x.m);
    const sel = this.idx.movement(selected);
    if (sel && !rows.includes(sel)) rows.push(sel);
    // 行の並びは最盛期の年の順（年表として読みやすいように）
    rows.sort((a, b) => peakYear(a) - peakYear(b));
    const key = rows.map((m) => m.id).join(",") + "|" + selected;
    if (key === this.key) return;
    this.key = key;
    this.rowsEl.innerHTML = "";
    for (const m of rows) {
      const row = document.createElement("div");
      row.className = `mvb-row${m.id === selected ? " sel" : ""}`;
      row.dataset.mv = m.id;
      row.title = m.name;
      row.appendChild(this.canvas(m));
      const lbl = document.createElement("span");
      lbl.className = "mvb-label";
      lbl.textContent = m.name;
      // 名前は勢いのある期間の中ほどに置く（端からはみ出さないよう寄せる）
      const [a, b] = activeSpan(m, this.range);
      const mid = (a + b) / 2;
      const frac = (mid - y0) / Math.max(1, y1 - y0);
      lbl.style.left = `${Math.min(0.82, Math.max(0.0, frac - 0.08)) * 100}%`;
      row.appendChild(lbl);
      this.rowsEl.appendChild(row);
    }
    this.onResize();
  }

  /** 潮流1件の帯を描いたキャンバス（幅ごとにキャッシュ） */
  private canvas(m: Movement): HTMLCanvasElement {
    const k = m.id;
    let c = this.cache.get(k);
    if (c) return c;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = this.width;
    c = document.createElement("canvas");
    c.width = Math.round(W * dpr);
    c.height = Math.round(ROW_H * dpr);
    c.style.width = `${W}px`;
    c.style.height = `${ROW_H}px`;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const [y0, y1] = this.range;
    const span = Math.max(1, y1 - y0);
    const color = MOVEMENT_COLORS[m.kind] ?? "#777";
    const max = curveMax(m.curve) || 1;
    // 端をぼかすため、少しにじませて描く
    g.filter = "blur(1.6px)";
    const step = W / span;
    for (let y = y0; y <= y1; y++) {
      const v = curveAt(m.curve, y);
      if (v <= 0) continue;
      const x = (y - y0) * step;
      g.globalAlpha = Math.pow(v, 0.85) * 0.95;
      g.fillStyle = color;
      g.fillRect(x - 0.5, 2, step + 1, ROW_H - 4);
    }
    // 最盛期：上側に白いつやの筋と、光のにじみ
    g.filter = "blur(2.5px)";
    for (let y = y0; y <= y1; y++) {
      const v = curveAt(m.curve, y);
      const p = (v - Math.max(0.6, max * 0.75)) / Math.max(0.05, 1 - Math.max(0.6, max * 0.75));
      if (p <= 0) continue;
      const x = (y - y0) * step;
      g.globalAlpha = Math.min(1, p) * 0.55;
      g.fillStyle = "#ffffff";
      g.fillRect(x - 0.5, 3, step + 1, 3);
    }
    g.filter = "none";
    g.globalAlpha = 1;
    this.cache.set(k, c);
    return c;
  }
}

function peakYear(m: Movement): number {
  let best = m.curve[0]?.[0] ?? 0;
  let v = -1;
  for (const [y, s] of m.curve) if (s > v) [best, v] = [y, s];
  return best;
}

/** 勢いが 0 より大きい期間（表示範囲で切る） */
function activeSpan(m: Movement, [y0, y1]: [number, number]): [number, number] {
  const a = Math.max(y0, m.curve[0]?.[0] ?? y0);
  const b = Math.min(y1, m.curve[m.curve.length - 1]?.[0] ?? y1);
  return a <= b ? [a, b] : [y0, y1];
}
