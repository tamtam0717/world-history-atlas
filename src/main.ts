import "./style.css";
import type { Topology } from "topojson-specification";
import { AtlasIndex, type Atlas } from "./data";
import { AtlasMap } from "./map";
import { Panel } from "./panel";
import { Search } from "./search";
import { setupSheet } from "./sheet";
import { setupShortcuts, toast } from "./shortcuts";

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
  if (new URLSearchParams(location.search).get("debug") === "pieces") {
    map.setDebug(true);
    document.body.classList.add("debug");
  }

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
    updateMilestones();
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
  // «» は前後の「節目」へジャンプ
  const milestones = atlas.milestones ?? [];
  const prevMs = () => [...milestones].reverse().find((m) => m.year < state.year);
  const nextMs = () => milestones.find((m) => m.year > state.year);
  $("#prev10").addEventListener("click", () => {
    const m = prevMs();
    if (m) setYear(m.year);
  });
  $("#next10").addEventListener("click", () => {
    const m = nextMs();
    if (m) setYear(m.year);
  });
  const msLabel = $("#milestone");
  function updateMilestones() {
    const p = prevMs();
    const n = nextMs();
    const here = milestones.find((m) => m.year === state.year);
    msLabel.innerHTML = [
      p ? `<span class="ms-prev">« ${p.year} ${p.title}</span>` : "<span></span>",
      here ? `<span class="ms-here">${here.title}</span>` : "",
      n ? `<span class="ms-next">${n.year} ${n.title} »</span>` : "<span></span>",
    ].join("");
    $<HTMLButtonElement>("#prev10").disabled = !p;
    $<HTMLButtonElement>("#next10").disabled = !n;
  }
  yearInput.addEventListener("change", () => setYear(Number(yearInput.value)));
  yearInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      setYear(Number(yearInput.value));
      yearInput.blur();
    } else if (e.key === "Escape") {
      yearInput.value = String(state.year);
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

  $("#zoom-in").addEventListener("click", () => map.zoomBy(1.6));
  $("#zoom-out").addEventListener("click", () => map.zoomBy(1 / 1.6));
  $("#zoom-reset").addEventListener("click", () => map.resetZoom());

  // ---- 現代の国境との切り替え ----
  // 「現代」ボタン：押すたびに切り替え。C キー：押している間だけ、今の表示と逆にする
  const badge = $("#modern-badge");
  const modernBtn = $<HTMLButtonElement>("#modern-btn");
  let modernBase = false; // ボタンで選んでいる表示
  let cHeld = false;
  const applyModern = () => {
    const on = modernBase !== cHeld;
    map.setModern(on);
    badge.hidden = !on;
    modernBtn.classList.toggle("active", modernBase);
    modernBtn.setAttribute("aria-pressed", String(modernBase));
  };
  modernBtn.addEventListener("click", () => {
    modernBase = !modernBase;
    applyModern();
  });
  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.target as Element).matches("input, textarea")) return;
    if (e.key === "c" || e.key === "C") {
      cHeld = true;
      applyModern();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === "c" || e.key === "C") {
      cHeld = false;
      applyModern();
    }
  });
  window.addEventListener("blur", () => {
    cHeld = false;
    applyModern();
  });

  // ---- 検索とキーボードショートカット ----
  const search = new Search($("#search"), {
    map,
    idx,
    year: () => state.year,
    selectPolity: (id) => {
      if (modernBase) modernBtn.click(); // 現代の国境の表示中は、その時代の地図に戻してから選ぶ
      selectPolity(id, true);
    },
  });
  $("#search-btn").addEventListener("click", () => search.toggle());

  // 重要度1の出来事がある年（[ ] で移動）
  const majorYears = [...new Set(atlas.events.filter((e) => e.importance === 1).map((e) => e.year))].sort((a, b) => a - b);
  // B を押している間だけ、1つ前の節目の年を表示する
  const compareBadge = $("#compare-badge");
  let compareFrom: number | null = null;

  setupShortcuts({
    map,
    search,
    stepYear: (d) => setYear(state.year + d),
    milestone: (dir) => {
      const m = dir < 0 ? prevMs() : nextMs();
      if (m) setYear(m.year);
    },
    majorEvent: (dir) => {
      const y = dir < 0 ? [...majorYears].reverse().find((v) => v < state.year) : majorYears.find((v) => v > state.year);
      if (y !== undefined) setYear(y);
    },
    edgeYear: (w) => setYear(w === "first" ? minYear : maxYear),
    togglePlay: () => playBtn.click(),
    startYearInput: (digit) => {
      yearInput.focus();
      yearInput.value = digit;
    },
    toggleModern: () => modernBtn.click(),
    compare: (on) => {
      if (on) {
        const target = prevMs()?.year ?? state.year - 1;
        if (target < minYear) return;
        compareFrom = state.year;
        setYear(target);
        compareBadge.textContent = `${target}年の地図（B を離すと ${compareFrom}年に戻る）`;
        compareBadge.hidden = false;
      } else if (compareFrom !== null) {
        const y = compareFrom;
        compareFrom = null;
        compareBadge.hidden = true;
        setYear(y);
      }
    },
    focusSelected: () => {
      if (state.polity) map.focus(state.polity);
    },
    copyUrl: () => {
      const url = location.href;
      const done = () => toast("URLをコピーしました");
      const fallback = () => {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        if (ok) done();
        else toast("コピーできませんでした");
      };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, fallback);
      else fallback();
    },
    deselect: () => {
      if (!state.polity) return false;
      selectPolity(null, false);
      return true;
    },
  });

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
  await map.ready;
  document.body.classList.add("ready");
}

main().catch((e) => {
  console.error(e);
  document.querySelector("#map")!.innerHTML = `<p class="error">読み込みに失敗しました：${String(e)}</p>`;
});
