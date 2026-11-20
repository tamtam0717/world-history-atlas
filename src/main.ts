import "./style.css";
import type { Topology } from "topojson-specification";
import { AtlasIndex, type Atlas } from "./data";
import { AtlasMap } from "./map";
import { Panel } from "./panel";
import { setupSheet } from "./sheet";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

async function main() {
  const base = import.meta.env.BASE_URL;
  const [topo, atlas] = await Promise.all([
    fetch(`${base}data/pieces.topo.json`).then((r) => r.json() as Promise<Topology>),
    fetch(`${base}data/atlas.json`).then((r) => r.json() as Promise<Atlas>),
  ]);
  const idx = new AtlasIndex(atlas);
  const [minYear, maxYear] = atlas.range;

  const state = { year: minYear, polity: null as string | null };
  const hash = new URLSearchParams(location.hash.slice(1));
  const hy = Number(hash.get("y"));
  if (Number.isFinite(hy) && hy >= minYear && hy <= maxYear) state.year = hy;
  if (hash.get("p") && idx.polityById.has(hash.get("p")!)) state.polity = hash.get("p");

  const yearInput = $<HTMLInputElement>("#year");
  const slider = $<HTMLInputElement>("#slider");
  for (const el of [yearInput, slider]) {
    el.min = String(minYear);
    el.max = String(maxYear);
  }
  $("#range-label").textContent = `${minYear}〜${maxYear}年`;

  const sheet = setupSheet($("#panel"), $("#sheet-handle"));

  const map = new AtlasMap($("#map"), topo, idx, {
    onSelect: (id) => selectPolity(id, false),
    onPiece: (p) => {
      if (p) $("#debug-info").textContent = `${p.id}\t${p.name}\t${p.adm1 ?? ""}\t${p.adm2 ?? ""}`;
    },
  });
  const mobile = matchMedia("(max-width: 799px)");
  const syncInset = () => map.setBottomInset(mobile.matches ? 150 : 0);
  mobile.addEventListener("change", syncInset);
  syncInset();
  map.debug = new URLSearchParams(location.search).get("debug") === "pieces";
  if (map.debug) document.body.classList.add("debug");

  const panel = new Panel($("#polity"), $("#events"), idx, (id) => selectPolity(id, true));

  function update() {
    yearInput.value = String(state.year);
    slider.value = String(state.year);
    map.render(state.year);
    map.setSelected(state.polity);
    panel.renderYear(state.year);
    panel.renderPolity(state.polity, state.year, state.polity ? map.overlordOf(state.polity) : null);
    const h = new URLSearchParams({ y: String(state.year) });
    if (state.polity) h.set("p", state.polity);
    history.replaceState(null, "", `#${h}`);
    document.title = `${state.year}年 ― ヨーロッパ歴史地図`;
  }

  function setYear(y: number) {
    y = Math.round(Math.min(maxYear, Math.max(minYear, y)));
    if (!Number.isFinite(y) || y === state.year) {
      yearInput.value = String(state.year);
      return;
    }
    state.year = y;
    update();
  }

  function selectPolity(id: string | null, focus: boolean) {
    state.polity = id;
    update();
    if (id) {
      sheet.reveal();
      if (focus) map.focus(id);
    }
  }

  // ---- 年の操作 ----
  const step = (d: number) => () => setYear(state.year + d);
  $("#prev").addEventListener("click", step(-1));
  $("#next").addEventListener("click", step(1));
  $("#prev10").addEventListener("click", step(-10));
  $("#next10").addEventListener("click", step(10));
  yearInput.addEventListener("change", () => setYear(Number(yearInput.value)));
  yearInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      setYear(Number(yearInput.value));
      yearInput.blur();
    }
  });
  yearInput.addEventListener("focus", () => yearInput.select());
  slider.addEventListener("input", () => setYear(Number(slider.value)));

  let timer = 0;
  const playBtn = $<HTMLButtonElement>("#play");
  const stop = () => {
    clearInterval(timer);
    timer = 0;
    playBtn.textContent = "▶";
    playBtn.setAttribute("aria-label", "再生");
  };
  playBtn.addEventListener("click", () => {
    if (timer) return stop();
    if (state.year >= maxYear) setYear(minYear);
    playBtn.textContent = "❚❚";
    playBtn.setAttribute("aria-label", "停止");
    timer = window.setInterval(() => {
      if (state.year >= maxYear) return stop();
      setYear(state.year + 1);
    }, 450);
  });

  document.addEventListener("keydown", (e) => {
    if ((e.target as Element).matches("input, textarea")) return;
    const d = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") setYear(state.year - d);
    else if (e.key === "ArrowRight") setYear(state.year + d);
    else if (e.key === "Escape") selectPolity(null, false);
    else return;
    e.preventDefault();
  });

  $("#zoom-in").addEventListener("click", () => map.zoomBy(1.6));
  $("#zoom-out").addEventListener("click", () => map.zoomBy(1 / 1.6));
  $("#zoom-reset").addEventListener("click", () => map.resetZoom());

  // URL のハッシュを手で書き換えたとき（チャットからのリンクなど）にも追従する
  window.addEventListener("hashchange", () => {
    const h = new URLSearchParams(location.hash.slice(1));
    const y = Number(h.get("y"));
    const p = h.get("p");
    if (Number.isFinite(y) && y >= minYear && y <= maxYear) state.year = y;
    state.polity = p && idx.polityById.has(p) ? p : null;
    update();
  });

  update();
  (window as unknown as { __atlas: unknown }).__atlas = map;
  document.body.classList.add("ready");
}

main().catch((e) => {
  console.error(e);
  document.querySelector("#map")!.innerHTML = `<p class="error">読み込みに失敗しました：${String(e)}</p>`;
});
