// 地名検索（F キー／虫眼鏡ボタン）。その時代の政体・都市、現代の国・都市、海の名前を日本語・英語で引き、
// 選んだ場所へ地図を動かす。

import { cityName, type AtlasIndex } from "./data";
import type { AtlasMap } from "./map";
import { MODERN_ALIASES_JA, MODERN_NAMES, MODERN_NAMES_EN } from "./modern";

type Kind = "polity" | "movement" | "city" | "country" | "mcity" | "sea";

const KIND_LABEL: Record<Kind, string> = {
  polity: "国",
  movement: "潮流",
  city: "都市",
  country: "現代の国",
  mcity: "現代の都市",
  sea: "海",
};
const SEA_LABEL: Record<string, string> = { ocean: "大洋", sea: "海", gulf: "湾", strait: "海峡" };
const KIND_ORDER: Record<Kind, number> = { polity: 0, movement: 0.5, city: 1, country: 2, mcity: 3, sea: 4 };
const MAX_RESULTS = 12;

interface Item {
  kind: Kind;
  label: string;
  /** 種類の表示（海峡・湾など、kind より細かくしたいとき） */
  tag?: string;
  /** 名前の後ろに小さく添える補足（英語名・現代名など） */
  sub?: string;
  keys: string[];
  /** 同じ一致度の中での並び（小さいほど先） */
  rank: number;
  go(): void;
}

/**
 * 検索用の正規化：全角半角・大文字小文字・アクセント記号・ひらがな／カタカナの違いを吸収し、
 * 中黒・空白などの記号を取り除く。ヴァ行はバ行に寄せる（長音の有無は matchScore で吸収）。
 */
export function normalize(s: string): string {
  let t = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFKC")
    .toLowerCase();
  t = t.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  t = t
    .replace(/ゔぁ/g, "ば")
    .replace(/ゔぃ/g, "び")
    .replace(/ゔぇ/g, "べ")
    .replace(/ゔぉ/g, "ぼ")
    .replace(/ゔ/g, "ぶ")
    .replace(/ぢ/g, "じ")
    .replace(/づ/g, "ず");
  return t.replace(/[\s・･\-‐－–—'’`.,()（）「」『』〔〕［］[\]]/g, "");
}

/** 長音（ー）も無視した、ゆるい比較用 */
const loose = (s: string) => s.replace(/[ー〜~]/g, "");

/** 一致度：0 完全一致、1 前方一致、2 部分一致（長音を無視して一致したときは +0.5）。一致しなければ 9 */
function matchScore(key: string, q: string, lq: string): number {
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.includes(q)) return 2;
  const lk = loose(key);
  if (!lq) return 9;
  if (lk === lq) return 0.5;
  if (lk.startsWith(lq)) return 1.5;
  if (lk.includes(lq)) return 2.5;
  return 9;
}

export interface SearchDeps {
  map: AtlasMap;
  idx: AtlasIndex;
  year(): number;
  selectPolity(id: string): void;
  /** 潮流を選ぶ（勢いのない年なら最盛期の年へ） */
  selectMovement?(id: string): void;
  /** 候補を選んで移動する直前（履歴に積むため） */
  beforeJump?(): void;
}

export class Search {
  private root: HTMLElement;
  private input: HTMLInputElement;
  private list: HTMLUListElement;
  private items: Item[] = [];
  private results: Item[] = [];
  private active = 0;
  private builtFor = NaN;

  constructor(
    root: HTMLElement,
    private deps: SearchDeps,
  ) {
    this.root = root;
    this.input = root.querySelector("input")!;
    this.list = root.querySelector("ul")!;

    this.input.addEventListener("input", () => this.query());
    this.input.addEventListener("keydown", (e) => {
      // 日本語入力の変換中の Enter・矢印は IME に任せる
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Escape") this.close();
      else if (e.key === "ArrowDown") this.move(1);
      else if (e.key === "ArrowUp") this.move(-1);
      else if (e.key === "Enter") this.choose(this.active);
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    // 候補のクリックで入力欄のフォーカスが外れないようにする
    this.list.addEventListener("mousedown", (e) => e.preventDefault());
    this.list.addEventListener("click", (e) => {
      const li = (e.target as Element).closest("li[data-i]") as HTMLElement | null;
      if (li) this.choose(Number(li.dataset.i));
    });
    root.querySelector(".search-close")?.addEventListener("click", () => this.close());
    // 検索バーの外を押したら閉じる
    document.addEventListener("pointerdown", (e) => {
      if (!this.isOpen) return;
      const t = e.target as Element;
      if (!root.contains(t) && !t.closest("#search-btn")) this.close();
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open() {
    if (this.deps.year() !== this.builtFor) this.build();
    this.root.hidden = false;
    this.input.focus();
    this.input.select();
    this.query();
  }

  close() {
    this.root.hidden = true;
    this.input.blur();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  // ---- 候補の一覧を作る ----
  private build() {
    const { map, idx } = this.deps;
    const year = this.deps.year();
    this.builtFor = year;
    const items: Item[] = [];
    const norm = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x).map(normalize))].filter(Boolean);

    // その時代の政体（いま地図に出ているもの）
    for (const id of map.politiesOnMap()) {
      const p = idx.polityById.get(id)!;
      const name = idx.polityName(p, year);
      const short = idx.shortName(p, year);
      items.push({
        kind: "polity",
        label: name,
        sub: short !== name ? short : undefined,
        keys: norm([name, short, p.name, p.short]),
        rank: 0,
        go: () => this.deps.selectPolity(id),
      });
    }

    // 潮流（名前のほか、代表的な人物・作品でも引ける）
    if (this.deps.selectMovement) {
      for (const m of idx.atlas.movements ?? []) {
        items.push({
          kind: "movement",
          label: m.name,
          keys: norm([m.name, m.id.replace(/_/g, " ")]),
          rank: 0,
          go: () => this.deps.selectMovement!(m.id),
        });
        // 人物・作品は一致度を下げる（名前の一致より後に並ぶよう、別の項目として足す）
        const extra = norm([...(m.people ?? []), ...(m.works ?? [])]);
        if (extra.length)
          items.push({
            kind: "movement",
            label: m.name,
            sub: (m.people ?? []).slice(0, 3).join("・"),
            keys: extra,
            rank: 1,
            go: () => this.deps.selectMovement!(m.id),
          });
      }
    }

    // その時代の都市
    const histCities: { name: string; lon: number; lat: number }[] = [];
    for (const c of idx.atlas.cities ?? []) {
      if ((c.founded && year < c.founded) || (c.until && year > c.until)) continue;
      const name = cityName(c, year);
      histCities.push({ name, lon: c.lon, lat: c.lat });
      const others = [c.name, c.modern, ...(c.names ?? []).map((n) => n.name)].filter((n) => n && n !== name);
      items.push({
        kind: "city",
        label: name,
        sub: c.modern && c.modern !== name ? `現 ${c.modern}` : undefined,
        keys: norm([name, ...others]),
        rank: 0,
        go: () => this.goPoint(c.lon, c.lat),
      });
    }

    // 現代の国
    for (const iso of map.modernIsos()) {
      const ja = MODERN_NAMES[iso];
      if (!ja) continue;
      const en = MODERN_NAMES_EN[iso] ?? [];
      items.push({
        kind: "country",
        label: ja,
        sub: en[0],
        keys: norm([ja, ...(MODERN_ALIASES_JA[iso] ?? []), ...en]),
        rank: 0,
        go: () => {
          const b = map.modernBox(iso);
          if (b) map.fitBox(b, 6);
        },
      });
    }

    // 現代の都市（その時代の都市と同じ名前・ほぼ同じ場所のものは省く）
    for (const c of idx.atlas.citiesModern ?? []) {
      const dup = histCities.some((h) => h.name === c.name && Math.abs(h.lon - c.lon) < 0.5 && Math.abs(h.lat - c.lat) < 0.5);
      if (dup) continue;
      items.push({
        kind: "mcity",
        label: c.name,
        sub: c.en,
        keys: norm([c.name, c.en]),
        rank: -c.pop,
        go: () => this.goPoint(c.lon, c.lat),
      });
    }
    // 同じ名前の現代の都市が、英語名で引いたときにも出るように（例：Vienna → ウィーン）
    for (const c of idx.atlas.citiesModern ?? []) {
      if (!c.en) continue;
      const h = items.find(
        (it) => it.kind === "city" && it.label === c.name && Math.abs(histCities.find((x) => x.name === c.name)!.lon - c.lon) < 0.5,
      );
      if (h) h.keys.push(normalize(c.en));
    }

    // 海・海峡
    const seaZoom: Record<string, number> = { ocean: 3, sea: 4.3, gulf: 5.3, strait: 6.3 };
    for (const s of idx.atlas.seas ?? []) {
      items.push({
        kind: "sea",
        tag: SEA_LABEL[s.kind] ?? "海",
        label: s.name,
        keys: norm([s.name]),
        rank: 0,
        go: () => {
          map.flyTo(s.lon, s.lat, seaZoom[s.kind] ?? 4.3);
          map.pulse(s.lon, s.lat);
        },
      });
    }
    this.items = items;
  }

  private goPoint(lon: number, lat: number) {
    this.deps.map.flyTo(lon, lat, undefined, 5.6);
    this.deps.map.pulse(lon, lat);
  }

  // ---- 絞り込みと表示 ----
  private query() {
    const q = normalize(this.input.value);
    if (!q) {
      this.results = [];
      this.render(this.input.value ? "" : "国名・地名・潮流を入力（日本語／英語）");
      return;
    }
    const lq = loose(q);
    const scored: { it: Item; s: number }[] = [];
    for (const it of this.items) {
      let best = 9;
      for (const k of it.keys) {
        const s = matchScore(k, q, lq);
        if (s < best) best = s;
      }
      if (best < 9) scored.push({ it, s: best });
    }
    scored.sort((a, b) => a.s - b.s || KIND_ORDER[a.it.kind] - KIND_ORDER[b.it.kind] || a.it.rank - b.it.rank || a.it.label.length - b.it.label.length);
    const seenMv = new Set<string>();
    this.results = scored
      .filter(({ it }) => {
        if (it.kind !== "movement") return true;
        if (seenMv.has(it.label)) return false;
        seenMv.add(it.label);
        return true;
      })
      .slice(0, MAX_RESULTS)
      .map((x) => x.it);
    this.active = 0;
    this.render(this.results.length ? "" : "見つかりません");
  }

  private render(message: string) {
    this.list.innerHTML = "";
    if (message) {
      const li = document.createElement("li");
      li.className = "search-msg";
      li.textContent = message;
      this.list.appendChild(li);
      return;
    }
    this.results.forEach((it, i) => {
      const li = document.createElement("li");
      li.dataset.i = String(i);
      li.setAttribute("role", "option");
      li.className = `search-item k-${it.kind}${i === this.active ? " active" : ""}`;
      const name = document.createElement("span");
      name.className = "search-name";
      name.textContent = it.label;
      li.appendChild(name);
      if (it.sub) {
        const sub = document.createElement("span");
        sub.className = "search-sub";
        sub.textContent = it.sub;
        li.appendChild(sub);
      }
      const tag = document.createElement("span");
      tag.className = "search-tag";
      tag.textContent = it.tag ?? KIND_LABEL[it.kind];
      li.appendChild(tag);
      this.list.appendChild(li);
    });
  }

  private move(d: number) {
    if (!this.results.length) return;
    this.active = (this.active + d + this.results.length) % this.results.length;
    this.list.querySelectorAll("li").forEach((li, i) => li.classList.toggle("active", i === this.active));
    this.list.children[this.active]?.scrollIntoView({ block: "nearest" });
  }

  private choose(i: number) {
    const it = this.results[i];
    if (!it) return;
    this.close();
    this.deps.beforeJump?.();
    it.go();
  }
}
