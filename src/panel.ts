// 右パネル（スマホでは下からのシート）の中身：その年の出来事・国境の変化・選んだ国の情報

import { AtlasIndex, curveAt, curveMax, sourcesOf, type BorderChange, type CurvePoint, type DistKey, type HistEvent, type Movement, type Polity, type ReligionEntry, type Ruler } from "./data";
import { MOVEMENT_COLORS, type ReligionPick } from "./map";
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

  constructor(
    private polityEl: HTMLElement,
    private eventsEl: HTMLElement,
    private idx: AtlasIndex,
    private onPolity: (id: string | null) => void,
    private onYear: (year: number) => void = () => {},
    private onMovement: (id: string | null) => void = () => {},
  ) {
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
  }

  private link(id: string | null | undefined, year: number) {
    if (!id) return "（なし）";
    const p = this.idx.polityById.get(id);
    if (!p) return esc(id);
    const color = p.color ?? "#ccc";
    return `<a href="#" class="plink" data-polity="${esc(id)}"><span class="swatch" style="background:${esc(color)}"></span>${esc(this.idx.polityName(p, year))}</a>`;
  }

  private changeLine(c: BorderChange, year: number) {
    const note = c.cur.cause ? `<span class="cause">${escY(c.cur.cause)}</span>` : "";
    const ov =
      c.prev.owner === c.cur.owner && c.prev.overlord !== c.cur.overlord
        ? `（上位：${this.link(c.prev.overlord, year)} → ${this.link(c.cur.overlord, year)}）`
        : "";
    const owners = c.prev.owner === c.cur.owner ? this.link(c.cur.owner, year) : `${this.link(c.prev.owner, year - 1)} → ${this.link(c.cur.owner, year)}`;
    return `<li class="change"><b>${esc(c.region.name)}</b>：${owners}${ov} ${note}${srcList(c.cur)}</li>`;
  }

  private eventLine(e: HistEvent, year: number) {
    const date = e.date && String(e.date).length > 4 ? `<span class="date"><a href="#" class="ylink" data-year="${e.year}">${esc(formatDate(String(e.date)))}</a></span>` : "";
    const ps = (e.polities ?? []).map((p) => this.link(p, year)).join(" ");
    const imp = e.importance ?? 2;
    const img = imp <= 2 ? imageSlot(wikiRefs(e.source), imp === 1 ? "event-wide" : "event", e.title) : "";
    return `<li class="event imp${imp}">${img}
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

  private relSummary(e: ReligionEntry, key: DistKey = "religion") {
    return `${this.relKind(e.main, key)}${e.minor ? `<span class="rel-minor">＋${this.relKind(e.minor, key)}</span>` : ""}`;
  }

  renderYear(year: number, opts: { dist?: DistKey | null; movement?: string | null } = {}) {
    const events = this.idx.eventsIn(year).sort((a, b) => (a.importance ?? 2) - (b.importance ?? 2));
    const changes = this.idx.borderChangesIn(year);
    const dk = opts.dist ?? null;
    const relChanges = dk ? this.idx.distChangesIn(dk, year) : [];
    let html = `<h2>${year}年の出来事</h2>`;
    if (events.length) html += `<ul class="events">${events.map((e) => this.eventLine(e, year)).join("")}</ul>`;
    if (relChanges.length) {
      html += `<h3>${DIST_LABEL[dk!]}分布の変化</h3><ul class="changes">${relChanges
        .map(
          (c) =>
            `<li class="change"><b>${esc(c.region.name)}</b>：${this.relSummary(c.prev, dk!)} → ${this.relSummary(c.cur, dk!)}${
              c.cur.note ? ` <span class="cause">${escY(c.cur.note)}</span>` : ""
            }</li>`,
        )
        .join("")}</ul>`;
    }
    if (changes.length) {
      html += `<h3>国境の変化</h3><ul class="changes">${changes.map((c) => this.changeLine(c, year)).join("")}</ul>`;
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
    hydrateImages(this.eventsEl);
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
      this.polityEl.hidden = true;
      this.polityEl.innerHTML = "";
      return;
    }
    this.polityEl.hidden = false;
    const label = DIST_LABEL[key];
    const r = pick.region >= 0 ? this.idx.dist(key)?.regions[pick.region] : undefined;
    const cur = r ? this.idx.distEntry(key, pick.region, year) : null;
    const fam = key === "language" ? this.idx.distKind(key, cur?.main)?.family : undefined;
    let html = `<div class="card-head">
        <span class="swatch big" style="background:${esc(this.idx.distKind(key, cur?.main)?.color ?? "#e2e0dc")}"></span>
        <div><h2>${esc(r?.name ?? pick.place)}</h2>
        <div class="meta">${key === "language" ? "言語（民族）" : "宗教"}の分布${r ? ` ・ ${esc(pick.place)}付近` : ""}${fam ? ` ・ ${esc(fam)}` : ""}</div></div>
        <button class="close" data-close aria-label="閉じる">×</button>
      </div>`;
    if (!r || !cur) {
      html += `<p class="empty">${year}年の${label}データはまだありません（作成中）。</p>`;
    } else {
      html += `<h3>${year}年</h3>
        <dl class="rel-now"><dt>多数派</dt><dd>${this.relKind(cur.main, key)}</dd>${
          cur.minor ? `<dt>少数派</dt><dd>${this.relKind(cur.minor, key)}</dd>` : ""
        }</dl>`;
      if (cur.note) html += `<p class="period">${escY(cur.note)}</p>`;
      if (r.timeline.length > 1) {
        html += `<h3>変遷</h3><ul class="rel-timeline">${r.timeline
          .map(
            (e) =>
              `<li class="${e === cur ? "now" : ""}"><span class="years">${yl(e.from)}–</span>${this.relSummary(e, key)}${
                e.note ? `<div class="note">${escY(e.note)}</div>` : ""
              }</li>`,
          )
          .join("")}</ul>`;
      }
    }
    this.polityEl.innerHTML = html;
  }

  renderPolity(id: string | null, year: number, overlord: { id: string; partial: boolean } | null) {
    const p = id ? this.idx.polityById.get(id) : undefined;
    if (!p) {
      this.polityEl.hidden = true;
      this.polityEl.innerHTML = "";
      return;
    }
    this.polityEl.hidden = false;
    const rulers = this.idx.rulersAt(p, year);
    const periods = this.idx.periodsAt(p, year);
    const events = this.idx.eventsIn(year).filter((e) => e.polities?.includes(p.id));
    const changes = this.idx.borderChangesIn(year).filter((c) => c.prev.owner === p.id || c.cur.owner === p.id);

    let html = `<div class="card-head">
        <span class="swatch big" style="background:${esc(p.color ?? "#ccc")}"></span>
        <div><h2>${esc(this.idx.polityName(p, year))}</h2>
        <div class="meta">${[this.idx.kindAt(p, year), overlord ? `${overlord.partial ? "一部が" : ""}${this.link(overlord.id, year)}に所属` : ""].filter(Boolean).join(" ・ ")}</div></div>
        ${imageSlot(wikiRefs(p.source), "emblem", this.idx.polityName(p, year))}
        <button class="close" data-close aria-label="閉じる">×</button>
      </div>`;
    html += `<h3>君主</h3>`;
    html += rulers.length
      ? `<ul class="rulers">${rulers
          .map(
            (r) =>
              `<li class="ruler">${imageSlot(portraitRefs(p, r), "portrait", baseName(r.name))}<div class="r-body"><b>${esc(r.name)}</b>${
                r.title ? `<span class="title">${esc(r.title)}</span>` : ""
              }<span class="years">${yearRange(r.from, r.to)}</span>${r.note ? `<div class="note">${escY(r.note)}</div>` : ""}${srcList(r)}</div></li>`,
          )
          .join("")}</ul>`
      : `<p class="empty">データ未登録</p>`;
    html += `<h3>情勢</h3>`;
    html += periods.length
      ? periods.map((x) => `<p class="period"><span class="years">${yearRange(x.from, x.to)}</span>${escY(x.text)}${srcList(x)}</p>`).join("")
      : `<p class="empty">データ未登録</p>`;
    if (events.length || changes.length) {
      html += `<h3>${year}年の出来事</h3><ul class="events">${events.map((e) => this.eventLine(e, year)).join("")}${changes
        .map((c) => this.changeLine(c, year))
        .join("")}</ul>`;
    }
    if (p.note) html += `<p class="note">${escY(p.note)}</p>`;
    html += srcList(p);
    this.polityEl.innerHTML = html;
    hydrateImages(this.polityEl);
  }
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

function formatDate(d: string) {
  const m = d.match(/^(-?\d+)-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!m) return d;
  return m[3] ? `${+m[2]}月${+m[3]}日` : `${+m[2]}月`;
}

export type { Polity };
