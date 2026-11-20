// 右パネル（スマホでは下からのシート）の中身：その年の出来事・国境の変化・選んだ国の情報

import { AtlasIndex, sourcesOf, type BorderChange, type HistEvent, type Polity, type ReligionEntry, type Ruler } from "./data";
import type { ReligionPick } from "./map";
import { hydrateImages, imageSlot, refKey, wikiRefs, type WikiRef } from "./images";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const yearRange = (from: number, to?: number) => (to == null ? `${from}–` : from === to ? `${from}` : `${from}–${to}`);

export class Panel {
  constructor(
    private polityEl: HTMLElement,
    private eventsEl: HTMLElement,
    private idx: AtlasIndex,
    private onPolity: (id: string | null) => void,
  ) {
    for (const el of [polityEl, eventsEl]) {
      el.addEventListener("click", (e) => {
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
    const note = c.cur.cause ? `<span class="cause">${esc(c.cur.cause)}</span>` : "";
    const ov =
      c.prev.owner === c.cur.owner && c.prev.overlord !== c.cur.overlord
        ? `（上位：${this.link(c.prev.overlord, year)} → ${this.link(c.cur.overlord, year)}）`
        : "";
    const owners = c.prev.owner === c.cur.owner ? this.link(c.cur.owner, year) : `${this.link(c.prev.owner, year - 1)} → ${this.link(c.cur.owner, year)}`;
    return `<li class="change"><b>${esc(c.region.name)}</b>：${owners}${ov} ${note}${srcList(c.cur)}</li>`;
  }

  private eventLine(e: HistEvent, year: number) {
    const date = e.date && String(e.date).length > 4 ? `<span class="date">${esc(formatDate(String(e.date)))}</span>` : "";
    const ps = (e.polities ?? []).map((p) => this.link(p, year)).join(" ");
    const imp = e.importance ?? 2;
    const img = imp <= 2 ? imageSlot(wikiRefs(e.source), imp === 1 ? "event-wide" : "event", e.title) : "";
    return `<li class="event imp${imp}">${img}
      <div class="ev-title">${date}${esc(e.title)}</div>
      ${e.text ? `<div class="ev-text">${esc(e.text)}</div>` : ""}
      ${ps ? `<div class="ev-polities">${ps}</div>` : ""}
      ${srcList(e)}
    </li>`;
  }

  /** 宗教の種類の名前（色の見本つき） */
  private relKind(id: string | null | undefined) {
    const k = this.idx.religionKind(id);
    if (!k) return esc(id ?? "");
    return `<span class="rel-kind"><span class="swatch" style="background:${esc(k.color)}"></span>${esc(k.name)}</span>`;
  }

  private relSummary(e: ReligionEntry) {
    return `${this.relKind(e.main)}${e.minor ? `<span class="rel-minor">＋${this.relKind(e.minor)}</span>` : ""}`;
  }

  renderYear(year: number, opts: { religion?: boolean } = {}) {
    const events = this.idx.eventsIn(year).sort((a, b) => (a.importance ?? 2) - (b.importance ?? 2));
    const changes = this.idx.borderChangesIn(year);
    const relChanges = opts.religion ? this.idx.religionChangesIn(year) : [];
    let html = `<h2>${year}年の出来事</h2>`;
    if (events.length) html += `<ul class="events">${events.map((e) => this.eventLine(e, year)).join("")}</ul>`;
    if (relChanges.length) {
      html += `<h3>宗教分布の変化</h3><ul class="changes">${relChanges
        .map(
          (c) =>
            `<li class="change"><b>${esc(c.region.name)}</b>：${this.relSummary(c.prev)} → ${this.relSummary(c.cur)}${
              c.cur.note ? ` <span class="cause">${esc(c.cur.note)}</span>` : ""
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
          .map((e) => `<li class="event"><div class="ev-title"><span class="date">${e.year}</span>${esc(e.title)}</div></li>`)
          .join("")}</ul>`;
      }
    }
    this.eventsEl.innerHTML = html;
    hydrateImages(this.eventsEl);
  }

  /** 宗教表示でクリックした地域の説明（pick が null なら閉じる） */
  renderReligion(pick: ReligionPick | null, year: number) {
    if (!pick) {
      this.polityEl.hidden = true;
      this.polityEl.innerHTML = "";
      return;
    }
    this.polityEl.hidden = false;
    const r = pick.region >= 0 ? this.idx.atlas.religion?.regions[pick.region] : undefined;
    const cur = r ? this.idx.religionEntry(pick.region, year) : null;
    let html = `<div class="card-head">
        <span class="swatch big" style="background:${esc(this.idx.religionKind(cur?.main)?.color ?? "#e2e0dc")}"></span>
        <div><h2>${esc(r?.name ?? pick.place)}</h2>
        <div class="meta">宗教の分布${r ? ` ・ ${esc(pick.place)}付近` : ""}</div></div>
        <button class="close" data-close aria-label="閉じる">×</button>
      </div>`;
    if (!r || !cur) {
      html += `<p class="empty">${year}年の宗教データはまだありません（作成中）。</p>`;
    } else {
      html += `<h3>${year}年</h3>
        <dl class="rel-now"><dt>多数派</dt><dd>${this.relKind(cur.main)}</dd>${
          cur.minor ? `<dt>少数派</dt><dd>${this.relKind(cur.minor)}</dd>` : ""
        }</dl>`;
      if (cur.note) html += `<p class="period">${esc(cur.note)}</p>`;
      if (r.timeline.length > 1) {
        html += `<h3>変遷</h3><ul class="rel-timeline">${r.timeline
          .map(
            (e) =>
              `<li class="${e === cur ? "now" : ""}"><span class="years">${e.from}–</span>${this.relSummary(e)}${
                e.note ? `<div class="note">${esc(e.note)}</div>` : ""
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
              }<span class="years">${yearRange(r.from, r.to)}</span>${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}${srcList(r)}</div></li>`,
          )
          .join("")}</ul>`
      : `<p class="empty">データ未登録</p>`;
    html += `<h3>情勢</h3>`;
    html += periods.length
      ? periods.map((x) => `<p class="period"><span class="years">${yearRange(x.from, x.to)}</span>${esc(x.text)}${srcList(x)}</p>`).join("")
      : `<p class="empty">データ未登録</p>`;
    if (events.length || changes.length) {
      html += `<h3>${year}年の出来事</h3><ul class="events">${events.map((e) => this.eventLine(e, year)).join("")}${changes
        .map((c) => this.changeLine(c, year))
        .join("")}</ul>`;
    }
    if (p.note) html += `<p class="note">${esc(p.note)}</p>`;
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
