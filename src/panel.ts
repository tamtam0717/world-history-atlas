// 右パネル（スマホでは下からのシート）の中身：その年の出来事・国境の変化・選んだ国の情報

import { AtlasIndex, sourcesOf, type BorderChange, type HistEvent, type Polity } from "./data";

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
    return `<li class="event imp${e.importance ?? 2}">
      <div class="ev-title">${date}${esc(e.title)}</div>
      ${e.text ? `<div class="ev-text">${esc(e.text)}</div>` : ""}
      ${ps ? `<div class="ev-polities">${ps}</div>` : ""}
      ${srcList(e)}
    </li>`;
  }

  renderYear(year: number) {
    const events = this.idx.eventsIn(year).sort((a, b) => (a.importance ?? 2) - (b.importance ?? 2));
    const changes = this.idx.borderChangesIn(year);
    let html = `<h2>${year}年の出来事</h2>`;
    if (events.length) html += `<ul class="events">${events.map((e) => this.eventLine(e, year)).join("")}</ul>`;
    if (changes.length) {
      html += `<h3>国境の変化</h3><ul class="changes">${changes.map((c) => this.changeLine(c, year)).join("")}</ul>`;
    }
    if (!events.length && !changes.length) {
      html += `<p class="empty">この年に登録された出来事はありません。</p>`;
      const recent = this.idx.atlas.events.filter((e) => e.year < year && e.year >= year - 10).slice(-4).reverse();
      if (recent.length) {
        html += `<h3>直近の出来事</h3><ul class="events recent">${recent
          .map((e) => `<li class="event"><div class="ev-title"><span class="date">${e.year}</span>${esc(e.title)}</div></li>`)
          .join("")}</ul>`;
      }
    }
    this.eventsEl.innerHTML = html;
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
        <button class="close" data-close aria-label="閉じる">×</button>
      </div>`;
    html += `<h3>君主</h3>`;
    html += rulers.length
      ? `<ul class="rulers">${rulers
          .map(
            (r) =>
              `<li><b>${esc(r.name)}</b>${r.title ? `<span class="title">${esc(r.title)}</span>` : ""}<span class="years">${yearRange(r.from, r.to)}</span>${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}${srcList(r)}</li>`,
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
  }
}

function srcList(x: { source?: string | string[] }) {
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
