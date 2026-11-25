// 右パネル（スマホでは下からのシート）の中身：その年の出来事・国境の変化・分布の変化・潮流。
// 選んだ国（所属なしの土地・宗教／言語の地域）の情報は、地図の上に浮かぶカード（#polity）に出す

import { AtlasIndex, curveAt, curveMax, sourcesOf, type BorderChange, type CurvePoint, type DistKey, type HistEvent, type Movement, type Polity, type ReligionEntry, type Ruler } from "./data";
import { MOVEMENT_COLORS, secularColor, secularText, type BlankInfo, type ReligionPick, type ViewProbe } from "./map";
import { hydrateImages, imageSlot, refKey, wikiRefs, type WikiRef } from "./images";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 押すとその年へ移動する年 */
const yl = (y: number | string) => `<a href="#" class="ylink" data-year="${esc(y)}">${esc(y)}</a>`;
const yearRange = (from: number, to?: number) => (to == null ? `${yl(from)}–` : from === to ? yl(from) : `${yl(from)}–${yl(to)}`);
/** 文章中の4桁の年（「1620年」「1756–63」の 1756 など）を、押せる年にする。text はエスケープ済みのもの */
const linkYears = (html: string) =>
  html.replace(/(?<![\d.,，])(1[0-9]{3}|20[0-9]{2})(?=年|[–\-−〜~）)、。,，\s]|$)/g, (m) => yl(m));
const escY = (s: unknown) => linkYears(esc(s));

const DIST_LABEL: Record<DistKey, string> = { religion: "宗教", language: "言語" };
export const MOVEMENT_KIND_LABEL: Record<string, string> = { thought: "思想・学問", art: "芸術", religion: "宗教運動", system: "経済・政治" };

export class Panel {
  /** 潮流の小さな曲線（スパークライン）の横軸にする年の範囲 */
  range: [number, number] = [1648, 1815];
  /** 地図に映っているかを調べる関数を返す（main.ts が地図とつなぐ。地図の準備前は null） */
  viewProbe: () => ViewProbe | null = () => null;
  /** 選んでいる国（その国に関係する出来事・国境の変化を一覧のいちばん上に出す） */
  private selected: string | null = null;
  private year = 0;

  constructor(
    private polityEl: HTMLElement,
    private eventsEl: HTMLElement,
    private idx: AtlasIndex,
    private onPolity: (id: string | null) => void,
    private onYear: (year: number) => void = () => {},
    private onMovement: (id: string | null) => void = () => {},
    /** 変化の行にマウスを乗せた／押したとき、その地域群を地図で強調する（null で解除） */
    private onRegions: (kind: "political" | DistKey, regions: number[] | null) => void = () => {},
  ) {
    // 変化の行（まとめた行も）：マウスを乗せると地図で強調、押すと強調を固定（もう一度押すと解除）
    let pinned: HTMLElement | null = null;
    const regionsOf = (el: Element) => ({
      kind: el.getAttribute("data-rkind") as "political" | DistKey,
      ids: el.getAttribute("data-regions")!.split(",").map(Number),
    });
    const show = (el: Element | null) => {
      if (el) {
        const r = regionsOf(el);
        this.onRegions(r.kind, r.ids);
      } else if (pinned && pinned.isConnected) show(pinned);
      else this.onRegions("political", null);
    };
    eventsEl.addEventListener("mouseover", (e) => {
      const el = (e.target as Element).closest("[data-regions]");
      if (el) show(el);
    });
    eventsEl.addEventListener("mouseout", (e) => {
      const el = (e.target as Element).closest("[data-regions]");
      if (el && !el.contains(e.relatedTarget as Node)) show(null);
    });
    eventsEl.addEventListener("click", (e) => {
      const t = e.target as Element;
      if (t.closest("a")) return;
      const el = t.closest<HTMLElement>("[data-regions]");
      if (!el) return;
      for (const x of eventsEl.querySelectorAll(".change.pinned")) x.classList.remove("pinned");
      if (pinned === el) pinned = null;
      else {
        pinned = el;
        el.classList.add("pinned");
      }
      show(pinned);
    });
    for (const el of [polityEl, eventsEl]) {
      el.addEventListener("click", (e) => {
        const y = (e.target as Element).closest("[data-year]");
        if (y) {
          e.preventDefault();
          this.onYear(Number(y.getAttribute("data-year")));
          return;
        }
        const mv = (e.target as Element).closest("[data-movement]");
        if (mv) {
          e.preventDefault();
          this.onMovement(mv.getAttribute("data-movement") || null);
          return;
        }
        const t = (e.target as Element).closest("[data-polity]");
        if (t) {
          e.preventDefault();
          this.onPolity(t.getAttribute("data-polity"));
        }
        if ((e.target as Element).closest("[data-close]")) this.onPolity(null);
      });
    }
    // スマホ：カードの見出し・要約を押すと、折りたたみ／展開を切り替える（リンク・ボタンの上は除く）
    polityEl.addEventListener("click", (e) => {
      const t = e.target as Element;
      if (!matchMedia("(max-width: 799px)").matches) return;
      if (t.closest("a, button, [data-year], [data-polity]") || !t.closest("[data-card-toggle]")) return;
      polityEl.classList.toggle("expanded");
      polityEl.querySelector<HTMLElement>(".card-body")?.scrollTo(0, 0);
      this.onCardChange();
    });
  }

  private link(id: string | null | undefined, year: number) {
    if (!id) return "（なし）";
    const p = this.idx.polityById.get(id);
    if (!p) return esc(id);
    const color = p.color ?? "#ccc";
    return `<a href="#" class="plink" data-polity="${esc(id)}"><span class="swatch" style="background:${esc(color)}"></span>${esc(this.idx.polityName(p, year))}</a>`;
  }

  /** 変化の本文（地域名を除いた部分）と、同じ変化をまとめるためのキー */
  private changeBody(c: BorderChange, year: number): { body: string; key: string } {
    const note = c.cur.cause ? `<span class="cause">${escY(c.cur.cause)}</span>` : "";
    const ov =
      c.prev.owner === c.cur.owner && c.prev.overlord !== c.cur.overlord
        ? `（上位：${this.link(c.prev.overlord, year)} → ${this.link(c.cur.overlord, year)}）`
        : "";
    const owners = c.prev.owner === c.cur.owner ? this.link(c.cur.owner, year) : `${this.link(c.prev.owner, year - 1)} → ${this.link(c.cur.owner, year)}`;
    return {
      body: `${owners}${ov} ${note}`,
      key: [c.prev.owner, c.cur.owner, c.prev.overlord, c.cur.overlord, c.cur.cause ?? ""].join("|"),
    };
  }

  /**
   * 同じ変化（前後の所属・上位の枠・理由が同じ）をまとめた一覧。
   * 2件以上は「代表の地域ほか N 地域：本文」の1行にし、押すと全地域を展開する
   */
  private groupedChanges(kind: "political" | DistKey, items: { name: string; region: number; key: string; body: string; ps?: string[] }[]): string {
    const groups = new Map<string, typeof items>();
    for (const it of items) {
      if (!groups.has(it.key)) groups.set(it.key, []);
      groups.get(it.key)!.push(it);
    }
    let html = "";
    let k = 0;
    for (const g of groups.values()) {
      const ids = g.map((x) => x.region).join(",");
      const pts = kind === "political" ? ptsAttr(g.map((x) => this.idx.atlas.regions[x.region]?.c).filter((c): c is [number, number] => !!c)) : "";
      const ps = [...new Set(g.flatMap((x) => x.ps ?? []))];
      const sortAttr = kind === "political" ? ` data-k="${k++}" data-imp="0"${pts}${ps.length ? ` data-ps="${esc(ps.join(","))}"` : ""}` : "";
      if (g.length === 1) {
        html += `<li class="change" data-rkind="${kind}" data-regions="${ids}"${sortAttr}><b>${esc(g[0].name)}</b>：${g[0].body}</li>`;
        continue;
      }
      // 代表は、いちばん広い地域
      const sorted = [...g].sort((a, b) => this.idx.regionPieceCount(kind, b.region) - this.idx.regionPieceCount(kind, a.region));
      html += `<li class="change group" data-rkind="${kind}" data-regions="${ids}"${sortAttr}><details><summary><b>${esc(sorted[0].name)}</b>ほか<span class="grp-n">${
        g.length - 1
      }</span>地域：${g[0].body}</summary><div class="grp-list">${sorted.map((x) => esc(x.name)).join("、")}</div></details></li>`;
    }
    return html;
  }

  private eventLine(e: HistEvent, year: number, k?: number) {
    const date = e.date && String(e.date).length > 4 ? `<span class="date"><a href="#" class="ylink" data-year="${e.year}">${esc(formatDate(String(e.date)))}</a></span>` : "";
    const ps = (e.polities ?? []).map((p) => this.link(p, year)).join(" ");
    const imp = e.importance ?? 2;
    const img = imp <= 2 ? imageSlot(wikiRefs(e.source), imp === 1 ? "event-wide" : "event", e.title) : "";
    // 領土による判定（関係国が画面の中にまとまった領土を持つか）に使う政体と範囲。場所が書いてある出来事は点だけで判定する
    const terr = !e.fixed && e.polities?.length ? ` data-pol="${esc(e.polities.join(","))}"${e.bx != null ? ` data-bx="${e.bx}"` : ""}` : "";
    const psAttr = e.polities?.length ? ` data-ps="${esc(e.polities.join(","))}"` : "";
    const sortAttr = k == null ? "" : ` data-k="${k}" data-imp="${imp}"${ptsAttr(e.pts)}${terr}${psAttr}`;
    return `<li class="event imp${imp}"${sortAttr}>${img}
      <div class="ev-title">${date}${esc(e.title)}</div>
      ${e.text ? `<div class="ev-text">${escY(e.text)}</div>` : ""}
      ${ps ? `<div class="ev-polities">${ps}</div>` : ""}
      ${srcList(e)}
    </li>`;
  }

  /** 宗教・言語の種類の名前（色の見本つき） */
  private relKind(id: string | null | undefined, key: DistKey = "religion") {
    const k = this.idx.distKind(key, id);
    if (!k) return esc(id ?? "");
    return `<span class="rel-kind"><span class="swatch" style="background:${esc(k.color)}"></span>${esc(k.name)}</span>`;
  }

  /** 世俗化の割合（濃い→薄いの帯の上に、いまの位置を示す） */
  private secularRow(s: number, color: string) {
    const pct = Math.round(s * 100);
    return `<dt>宗教離れ</dt><dd><span class="rel-secular" title="無宗教・宗教離れの割合の目安：${pct}%"><span class="bar" style="background:linear-gradient(90deg, ${esc(color)}, ${esc(secularColor(color, 1))})"><span class="mark" style="left:${pct}%"></span></span>${secularText(s)}</span></dd>`;
  }

  private relSummary(e: ReligionEntry, key: DistKey = "religion") {
    return `${this.relKind(e.main, key)}${e.minor ? `<span class="rel-minor">＋${this.relKind(e.minor, key)}</span>` : ""}${
      key === "religion" && e.secular ? `<span class="rel-minor">・宗教離れ${secularText(e.secular)}</span>` : ""
    }`;
  }

  renderYear(year: number, opts: { dist?: DistKey | null; movement?: string | null; polity?: string | null } = {}) {
    this.selected = opts.polity ?? null;
    this.year = year;
    const events = this.idx.eventsIn(year).sort((a, b) => (a.importance ?? 2) - (b.importance ?? 2));
    const changes = this.idx.borderChangesIn(year);
    const dk = opts.dist ?? null;
    const relChanges = dk ? this.idx.distChangesIn(dk, year) : [];
    let html = `<h2>${year}年の出来事</h2>`;
    if (events.length) html += `<ul class="events" data-sort>${events.map((e, k) => this.eventLine(e, year, k)).join("")}</ul>`;
    if (relChanges.length) {
      const regs = this.idx.dist(dk!)!.regions;
      html += `<h3>${DIST_LABEL[dk!]}分布の変化</h3><ul class="changes">${this.groupedChanges(
        dk!,
        relChanges.map((c) => ({
          name: c.region.name,
          region: regs.indexOf(c.region),
          key: [c.prev.main, c.prev.minor ?? "", c.cur.main, c.cur.minor ?? "", c.cur.note ?? ""].join("|"),
          body: `${this.relSummary(c.prev, dk!)} → ${this.relSummary(c.cur, dk!)}${c.cur.note ? ` <span class="cause">${escY(c.cur.note)}</span>` : ""}`,
        })),
      )}</ul>`;
    }
    if (changes.length) {
      const regs = this.idx.atlas.regions;
      html += `<h3>国境の変化</h3><ul class="changes" data-sort>${this.groupedChanges(
        "political",
        changes.map((c) => ({
          name: this.idx.regionName(c.region, year),
          region: regs.indexOf(c.region),
          ps: [c.prev.owner, c.cur.owner, c.prev.overlord, c.cur.overlord].filter((x): x is string => !!x),
          ...this.changeBody(c, year),
        })),
      )}</ul>`;
    }
    if (!events.length && !changes.length && !relChanges.length) {
      html += `<p class="empty">この年に登録された出来事はありません。</p>`;
      const recent = this.idx.atlas.events.filter((e) => e.year < year && e.year >= year - 10).slice(-4).reverse();
      if (recent.length) {
        html += `<h3>直近の出来事</h3><ul class="events recent">${recent
          .map((e) => `<li class="event"><div class="ev-title"><span class="date">${yl(e.year)}</span>${esc(e.title)}</div></li>`)
          .join("")}</ul>`;
      }
    }
    html += this.movementsHtml(year, opts.movement ?? null);
    this.eventsEl.innerHTML = html;
    this.arrangeByView(false);
    hydrateImages(this.eventsEl);
  }

  /**
   * 出来事・国境の変化の一覧を、地図に映っている地域のものから先に並べ直す（地図を動かし終えたときにも呼ぶ）。
   * 映っているもの（重要度順）→「地図の範囲の外」の見出し → 外のもの（重要度順、同じなら画面の中心に近い順）。
   * 外のものは薄く表示する。並びが変わらなければ何もしない。
   */
  arrangeByView(keepScroll = true) {
    const probe = this.viewProbe();
    const sel = this.selected;
    const scroller = keepScroll ? scrollParent(this.eventsEl) : null;
    const top0 = scroller?.scrollTop ?? 0;
    let shift = 0;
    for (const ul of this.eventsEl.querySelectorAll<HTMLUListElement>("ul[data-sort]")) {
      const lis = [...ul.querySelectorAll<HTMLLIElement>(":scope > li[data-k]")];
      const items = lis.map((li) => {
        const pts = parsePts(li.getAttribute("data-pts"));
        const pol = li.getAttribute("data-pol");
        let inView = true;
        let dist = 0;
        if (probe && pts.length) {
          const r = pts.map((p) => probe.at(p[0], p[1]));
          inView = r.some((x) => x.inView);
          dist = Math.min(...r.map((x) => x.dist));
        }
        // 代表点（首都など）が画面の外でも、関係国の領土が画面にまとまって映っていれば範囲内（例：アメリカ中西部を見ているときのアメリカの出来事）。
        // 数える領土は出来事のファイルの地域の中だけ（英領インドが映っていてもロンドンの出来事は範囲外のまま）
        if (probe && !inView && pol) {
          const bx = li.getAttribute("data-bx");
          const box = bx != null ? this.idx.atlas.eventBoxes?.[Number(bx)] : null;
          if (probe.holds(pol.split(","), box)) inView = true;
        }
        const rel = !!sel && (li.getAttribute("data-ps") ?? "").split(",").includes(sel);
        return { li, k: Number(li.getAttribute("data-k")), imp: Number(li.getAttribute("data-imp")) || 0, inView, dist, rel };
      });
      // 並び：選んでいる国に関係するもの → 地図に映っているもの → 外のもの
      const tier = (x: { rel: boolean; inView: boolean }) => (x.rel ? 0 : x.inView ? 1 : 2);
      const order = [...items].sort((a, b) => {
        if (tier(a) !== tier(b)) return tier(a) - tier(b);
        if (a.imp !== b.imp) return a.imp - b.imp;
        if (!a.inView && Math.abs(a.dist - b.dist) > 1) return a.dist - b.dist;
        return a.k - b.k;
      });
      const nRel = order.filter((x) => x.rel).length;
      const nIn = order.filter((x) => tier(x) <= 1).length;
      const head = ul.querySelector<HTMLLIElement>(":scope > li.out-head");
      const relHead = ul.querySelector<HTMLLIElement>(":scope > li.rel-head");
      const key = order.map((x) => x.k).join(",") + "|" + nRel + "|" + nIn + "|" + (sel ?? "");
      if (ul.dataset.order === key) continue;
      ul.dataset.order = key;
      // 一覧より下を読んでいるときは、一覧の高さの変化だけスクロールを補正する
      const below = scroller ? ul.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().top : false;
      const h0 = ul.offsetHeight;
      head?.remove();
      relHead?.remove();
      order.forEach((x, i) => {
        if (i === 0 && nRel > 0 && sel) {
          const h = relHead ?? document.createElement("li");
          h.className = "rel-head";
          const p = this.idx.polityById.get(sel);
          h.style.setProperty("--rel", p?.color ?? "var(--accent)");
          h.textContent = `${p ? this.idx.polityName(p, this.year) : ""}に関係`;
          ul.appendChild(h);
        }
        if (i === nRel && nRel > 0 && nRel < order.length) {
          const h = document.createElement("li");
          h.className = "out-head rel-end";
          h.textContent = nRel < nIn ? "地図の範囲" : "地図の範囲の外";
          ul.appendChild(h);
        }
        if (i === nIn && nIn < order.length && !(i === nRel && nRel > 0)) {
          const h = head ?? document.createElement("li");
          h.className = "out-head";
          h.textContent = "地図の範囲の外";
          ul.appendChild(h);
        }
        x.li.classList.toggle("outside", tier(x) === 2);
        x.li.classList.toggle("related", x.rel);
        if (x.rel) x.li.style.setProperty("--rel", this.idx.polityById.get(sel!)?.color ?? "");
        else x.li.style.removeProperty("--rel");
        ul.appendChild(x.li);
      });
      if (below) shift += ul.offsetHeight - h0;
    }
    if (scroller) scroller.scrollTop = top0 + shift;
  }

  // ---- この時代の潮流 ----
  // 勢いは文字でなく見た目で：種類の色の玉が、勢いが強いほど大きく・濃く・つやが出る。最盛期のものは光る。
  // 行の背景の帯の長さ・濃さも勢い。右の小さな曲線で「始まり／最盛期／衰退」のどこにいるかが分かる。
  private movementsHtml(year: number, selected: string | null): string {
    const list = this.idx.movementsAt(year);
    const sel = this.idx.movement(selected);
    if (sel && !list.some((x) => x.m === sel)) list.push({ m: sel, v: 0 });
    if (!list.length) return "";
    const kinds = [...new Set(list.map((x) => x.m.kind))];
    const key = Object.keys(MOVEMENT_KIND_LABEL)
      .filter((k) => kinds.includes(k as Movement["kind"]))
      .map((k) => `<span><i style="--c:${MOVEMENT_COLORS[k]}"></i>${MOVEMENT_KIND_LABEL[k]}</span>`)
      .join("");
    let html = `<h3 class="mv-head">この時代の潮流<span class="mv-key">${key}</span></h3><ul class="movements">`;
    for (const { m, v } of list) {
      const max = curveMax(m.curve) || 1;
      const peak = v > 0 && v >= Math.max(0.85, max * 0.92);
      const rising = curveAt(m.curve, year + 5) > v + 0.01;
      const isSel = m === sel;
      html += `<li class="mv${peak ? " peak" : ""}${isSel ? " sel" : ""}${rising ? " rising" : ""}" style="--c:${MOVEMENT_COLORS[m.kind] ?? "#777"};--v:${v.toFixed(2)}">
        <a href="#" class="mv-row" data-movement="${isSel ? "" : esc(m.id)}" aria-expanded="${isSel}" aria-label="${esc(m.name)}（勢い ${Math.round(v * 100)}%）">
          <span class="mv-orb"></span><span class="mv-name">${esc(m.name)}</span>${this.spark(m.curve, year)}
        </a>${isSel ? this.movementDetail(m) : ""}</li>`;
    }
    return html + `</ul>`;
  }

  /** 潮流の勢いの曲線（表示範囲の全体）と今の年の位置 */
  private spark(c: CurvePoint[], year: number): string {
    const [y0, y1] = this.range;
    const W = 64;
    const H = 18;
    const span = Math.max(1, y1 - y0);
    const x = (y: number) => ((Math.min(y1, Math.max(y0, y)) - y0) / span) * W;
    const pts: string[] = [];
    const step = Math.max(1, Math.round(span / 64));
    for (let y = y0; y <= y1; y += step) pts.push(`${x(y).toFixed(1)},${(H - 1 - curveAt(c, y) * (H - 3)).toFixed(1)}`);
    const v = curveAt(c, year);
    const cx = x(year).toFixed(1);
    const cy = (H - 1 - v * (H - 3)).toFixed(1);
    return `<svg class="mv-spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <polygon points="0,${H} ${pts.join(" ")} ${W},${H}" class="sp-area"/>
      <polyline points="${pts.join(" ")}" class="sp-line"/>
      <line x1="${cx}" x2="${cx}" y1="0" y2="${H}" class="sp-now"/>
      ${v > 0 ? `<circle cx="${cx}" cy="${cy}" r="2.4" class="sp-dot"/>` : ""}
    </svg>`;
  }

  private movementDetail(m: Movement): string {
    const evs = (m.events ?? [])
      .map((t) => {
        const e = this.idx.eventByTitle(t);
        return e
          ? `<li><a href="#" class="ylink" data-year="${e.year}">${e.year}</a> ${esc(t)}</li>`
          : `<li>${escY(t)}</li>`;
      })
      .join("");
    const centers = m.spread
      .filter((s) => s.center)
      .flatMap((s) => [...s.polities.map((id) => this.idx.polityById.get(id)?.name ?? id), ...s.regions.map((r) => this.idx.atlas.regions.find((x) => x.id === r)?.name ?? r)]);
    return `<div class="mv-detail">
      ${imageSlot(wikiRefs(m.source), "event-wide", m.name)}
      <div class="mv-meta">${esc(MOVEMENT_KIND_LABEL[m.kind] ?? "")}${centers.length ? ` ・ 発信地：${centers.map(esc).join("・")}` : ""}</div>
      ${m.text ? `<p class="mv-text">${escY(m.text)}</p>` : ""}
      ${m.people?.length ? `<div class="mv-sub"><b>人物</b>${m.people.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      ${m.works?.length ? `<div class="mv-sub"><b>作品</b>${m.works.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
      ${evs ? `<div class="mv-sub mv-events"><b>関連する出来事</b><ul>${evs}</ul></div>` : ""}
      <p class="mv-hint">地図で、この年に盛んだった地域が光っています（発信地は脈打つ光）。</p>
    </div>`;
  }

  /** 宗教・言語の表示でクリックした地域の説明（pick が null なら閉じる） */
  renderReligion(pick: ReligionPick | null, year: number, key: DistKey = "religion") {
    if (!pick) {
      this.closeCard();
      return;
    }
    const label = DIST_LABEL[key];
    const r = pick.region >= 0 ? this.idx.dist(key)?.regions[pick.region] : undefined;
    const cur = r ? this.idx.distEntry(key, pick.region, year) : null;
    const fam = key === "language" ? this.idx.distKind(key, cur?.main)?.family : undefined;
    // 世俗化の割合は、外側の大きい地域に書かれていることもあるのでピースの値から引く
    const secular = key !== "religion" ? 0 : pick.piece != null ? (this.idx.distState(key, pick.piece, year)?.[4] ?? 0) : (cur?.secular ?? 0);
    const head = `<span class="swatch big" style="background:${esc(secularColor(this.idx.distKind(key, cur?.main)?.color ?? "#e2e0dc", secular))}"></span>
        <div><h2>${esc(r?.name ?? pick.place)}</h2>
        <div class="meta">${key === "language" ? "言語（民族）" : "宗教"}の分布${r ? ` ・ ${esc(pick.place)}付近` : ""}${fam ? ` ・ ${esc(fam)}` : ""}</div></div>`;
    let body = "";
    let peek = "";
    if (!r || !cur) {
      body += `<p class="empty">${year}年の${label}データはまだありません（作成中）。</p>`;
      peek = `<span class="muted">${year}年の${label}データはまだありません</span>`;
    } else {
      peek = `<span class="pk-label">多数派</span>${this.relKind(cur.main, key)}${cur.minor ? `<span class="rel-minor">＋${this.relKind(cur.minor, key)}</span>` : ""}`;
      body += `<h3>${year}年</h3>
        <dl class="rel-now"><dt>多数派</dt><dd>${this.relKind(cur.main, key)}</dd>${
          cur.minor ? `<dt>少数派</dt><dd>${this.relKind(cur.minor, key)}</dd>` : ""
        }${secular ? this.secularRow(secular, this.idx.distKind(key, cur.main)?.color ?? "#c8c4bb") : ""}</dl>`;
      if (cur.note) body += `<p class="period">${escY(cur.note)}</p>`;
      if (r.timeline.length > 1) {
        body += `<h3>変遷</h3><ul class="rel-timeline">${r.timeline
          .map(
            (e) =>
              `<li class="${e === cur ? "now" : ""}"><span class="years">${yl(e.from)}–</span>${this.relSummary(e, key)}${
                e.note ? `<div class="note">${escY(e.note)}</div>` : ""
              }</li>`,
          )
          .join("")}</ul>`;
      }
    }
    this.openCard(`d:${key}:${pick.region}:${pick.region < 0 ? pick.place : ""}`, head, peek, body);
  }

  /** 国のない土地（所属なし・データ未整備・準備中）をクリックしたときの説明（info が null なら閉じる） */
  renderBlank(info: BlankInfo | null, year: number) {
    if (!info) {
      this.closeCard();
      return;
    }
    const h = {
      unowned: { cls: "unowned", title: "所属なし", meta: "どの国にも属さない土地" },
      nodata: { cls: "nodata", title: "データ未整備", meta: `${year}年の所属はまだ調べていません` },
      pending: { cls: "pending", title: info.modern, meta: "現代の国境（この地域の歴史の地図は準備中）" },
    }[info.kind];
    const head = `<span class="swatch big blank-${h.cls}"></span>
        <div><h2>${esc(h.title)}</h2>
        <div class="meta">${esc(h.meta)}</div></div>`;
    const place = info.region ? `${esc(info.region)}（${esc(info.place)}付近）` : `${esc(info.place)}（${esc(info.modern)}）`;
    let body = `<p class="period"><span class="years">場所</span>${place}</p>`;
    if (info.kind === "unowned") {
      body += `<p class="period">先住民の暮らす地や無人の地など、${year}年の時点でどの国の支配も及んでいなかった土地として描いています（データ未整備ではありません）。</p>`;
      if (info.note) body += `<p class="period">${escY(info.note)}</p>`;
      if (info.cause) body += `<p class="period"><span class="cause">${escY(info.cause)}</span></p>`;
    }
    if (info.since != null && info.kind === "unowned") body += `<p class="period"><span class="years">${yl(info.since)}–</span>この状態</p>`;
    if (info.next) {
      body += `<p class="period"><span class="years"><a href="#" class="ylink" data-year="${info.next.year}">${info.next.year}年</a></span>${
        info.kind === "nodata" && info.since == null ? "からデータがあります：" : "から："
      }${info.next.owner ? this.link(info.next.owner, info.next.year) : "所属なし"}</p>`;
    }
    this.openCard(`b:${info.kind}:${info.region ?? ""}:${info.place}`, head, `<span class="pk-label">場所</span>${place}`, body);
  }

  renderPolity(
    id: string | null,
    year: number,
    overlord: { id: string; partial: boolean } | null,
    indirect: { names: string[]; all: boolean } | null = null,
  ) {
    const p = id ? this.idx.polityById.get(id) : undefined;
    if (!p) {
      this.closeCard();
      return;
    }
    const rulers = this.idx.rulersAt(p, year);
    const periods = this.idx.periodsAt(p, year);
    // その年の出来事・国境の変化はカードには出さない（右パネルの一覧で、この国に関係するものが先頭に並ぶ）

    const head = `<span class="swatch big" style="background:${esc(p.color ?? "#ccc")}"></span>
        <div><h2>${esc(this.idx.polityName(p, year))}</h2>
        <div class="meta">${[
          this.idx.kindAt(p, year),
          overlord ? `${overlord.partial ? "一部が" : ""}${this.link(overlord.id, year)}に所属` : "",
          indirect?.all ? "間接統治" : "",
        ]
          .filter(Boolean)
          .join(" ・ ")}</div>${
          indirect && !indirect.all
            ? `<div class="meta indirect" title="地図では、その国の色を薄くして塗っている地域">間接統治：${indirect.names.slice(0, 5).map(esc).join("・") || "一部の地域"}${indirect.names.length > 5 ? " など" : ""}</div>`
            : ""
        }</div>
        ${imageSlot(wikiRefs(p.source), "emblem", this.idx.polityName(p, year))}`;
    // 折りたたんだとき（スマホ）の1〜2行：今の君主1人と、情勢の書き出し
    const r0 = rulers[0];
    const peek = [
      r0 ? `<div class="pk-line"><span class="pk-label">君主</span><b>${esc(r0.name)}</b>${r0.title ? `<span class="title">${esc(r0.title)}</span>` : ""}${rulers.length > 1 ? `<span class="pk-more">ほか${rulers.length - 1}人</span>` : ""}</div>` : "",
      periods[0] ? `<div class="pk-line pk-period">${esc(periods[0].text)}</div>` : "",
    ].join("");
    let body = `<h3>君主</h3>`;
    body += rulers.length
      ? `<ul class="rulers">${rulers
          .map(
            (r) =>
              `<li class="ruler">${imageSlot(portraitRefs(p, r), "portrait", baseName(r.name))}<div class="r-body"><b>${esc(r.name)}</b>${
                r.title ? `<span class="title">${esc(r.title)}</span>` : ""
              }<span class="years">${yearRange(r.from, r.to)}</span>${r.note ? `<div class="note">${escY(r.note)}</div>` : ""}${srcList(r)}</div></li>`,
          )
          .join("")}</ul>`
      : `<p class="empty">データ未登録</p>`;
    body += `<h3>情勢</h3>`;
    body += periods.length
      ? periods.map((x) => `<p class="period"><span class="years">${yearRange(x.from, x.to)}</span>${escY(x.text)}${srcList(x)}</p>`).join("")
      : `<p class="empty">データ未登録</p>`;
    if (p.note) body += `<p class="note">${escY(p.note)}</p>`;
    body += srcList(p);
    this.openCard(`p:${p.id}`, head, peek || `<span class="muted">データ未登録</span>`, body);
  }

  // ---- 地図の上に浮かぶ情報カード（国・所属なしの土地・宗教／言語の地域） ----
  /** いまカードに出している対象（変わったら、スマホでは折りたたみに戻す） */
  private cardKey = "";

  /**
   * カードを開く（中身を差し替える）。
   * head：見出し（色の見本・名前・種類）。peek：スマホで折りたたんだときだけ出す1〜2行の要約。body：本文（カードの中でスクロール）
   */
  private openCard(key: string, head: string, peek: string, body: string) {
    const el = this.polityEl;
    if (key !== this.cardKey) {
      el.classList.remove("expanded");
      this.cardKey = key;
    }
    const scroller = el.querySelector<HTMLElement>(".card-body");
    const top = el.hidden ? 0 : (scroller?.scrollTop ?? 0);
    el.hidden = false;
    el.innerHTML = `<div class="card-head" data-card-toggle>${head}
        <span class="card-caret" aria-hidden="true"></span>
        <button class="close" data-close aria-label="閉じる">×</button>
      </div>
      <div class="card-peek" data-card-toggle>${peek}</div>
      <div class="card-body">${body}</div>`;
    // 同じ対象で年を変えたときは、読んでいた位置を保つ
    const sc = el.querySelector<HTMLElement>(".card-body");
    if (sc && top) sc.scrollTop = top;
    hydrateImages(el);
    this.onCardChange();
  }

  private closeCard() {
    this.polityEl.hidden = true;
    this.polityEl.innerHTML = "";
    this.polityEl.classList.remove("expanded");
    this.cardKey = "";
    this.onCardChange();
  }

  /** カードの表示・中身・大きさが変わったとき（main.ts が地図の上の配置を合わせる） */
  onCardChange: () => void = () => {};
}

// ---- 君主の肖像：どの記事の画像を使うか ----

/** 「アウグスト2世（復位）」→「アウグスト2世」 */
function baseName(name: string) {
  return name.replace(/\s*[（(][^）)]*[）)]\s*/g, "").trim();
}

/** 政体ごとの「肖像に使わない記事」：複数の別人が出典にしている記事（一覧・王朝の記事）、政体そのものの記事 */
const listArticles = new WeakMap<Polity, Set<string>>();
function nonPortraitArticles(p: Polity): Set<string> {
  let set = listArticles.get(p);
  if (set) return set;
  set = new Set();
  const people = new Map<string, string[]>();
  for (const r of p.rulers ?? []) {
    for (const ref of wikiRefs(r.source)) {
      const k = refKey(ref);
      people.set(k, [...(people.get(k) ?? []), baseName(r.name)]);
    }
  }
  const samePerson = (a: string, b: string) => a.includes(b) || b.includes(a);
  for (const [k, names] of people) if (names.some((n) => !samePerson(n, names[0]))) set.add(k);
  const distinct = new Set((p.rulers ?? []).map((r) => baseName(r.name)));
  if (distinct.size > 1) for (const ref of wikiRefs(p.source)) set.add(refKey(ref));
  listArticles.set(p, set);
  return set;
}

/** 君主の肖像の候補：出典の記事 → なければ名前から ja の記事を推測（要約に在位年が出てくる場合だけ使う） */
function portraitRefs(p: Polity, r: Ruler): WikiRef[] {
  const skip = nonPortraitArticles(p);
  const refs = wikiRefs(r.source).filter((x) => !skip.has(refKey(x)));
  const guess = baseName(r.name);
  if (guess && !refs.some((x) => x.lang === "ja" && x.title === guess)) {
    refs.push({ lang: "ja", title: guess, check: [String(r.from), ...(r.to != null ? [String(r.to)] : [])] });
  }
  return refs;
}

// 出典は画面には出さない（データには残し、画像の取得に使う）
function srcList(_x: { source?: string | string[] }) {
  return "";
}

export function srcListVisible(x: { source?: string | string[] }) {
  const s = sourcesOf(x);
  if (!s.length) return "";
  return `<div class="src">出典：${s.map((v) => (/^https?:\/\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(shortUrl(v))}</a>` : esc(v))).join("、")}</div>`;
}

function shortUrl(u: string) {
  try {
    const x = new URL(u);
    return decodeURIComponent(x.hostname.replace(/^www\./, "") + x.pathname).slice(0, 60);
  } catch {
    return u;
  }
}


/** 並べ替え用の代表点の属性（ data-pts="経度,緯度;経度,緯度" ） */
function ptsAttr(pts: [number, number][] | undefined): string {
  return pts?.length ? ` data-pts="${pts.map((p) => `${p[0]},${p[1]}`).join(";")}"` : "";
}

function parsePts(s: string | null): [number, number][] {
  if (!s) return [];
  return s.split(";").map((x) => x.split(",").map(Number) as [number, number]);
}

/** いちばん近い、縦にスクロールする親要素 */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

function formatDate(d: string) {
  const m = d.match(/^(-?\d+)-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return d;
  return m[3] ? `${+m[2]}月${+m[3]}日` : `${+m[2]}月`;
}

export type { Polity };
