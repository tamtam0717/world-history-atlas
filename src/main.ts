import "./style.css";
import type { Topology } from "topojson-specification";
import { AtlasIndex, type Atlas } from "./data";
import { AtlasMap, stripeColor, type MapLayer, type ReligionPick } from "./map";
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

  const state = {
    year: minYear,
    polity: null as string | null,
    layer: "political" as MapLayer,
    /** 宗教表示でクリックした場所 */
    relPick: null as ReligionPick | null,
  };
  const hash = new URLSearchParams(location.hash.slice(1));
  const hy = Number(hash.get("y"));
  if (Number.isFinite(hy) && hy >= minYear && hy <= maxYear) state.year = hy;
  if (hash.get("p") && idx.polityById.has(hash.get("p")!)) state.polity = hash.get("p");
  if (hash.get("l") === "religion") state.layer = "religion";

  // ---- 履歴（戻る／進む） ----
  // 年のジャンプ・国の選択・表示の切り替えなどの「移動」を history.pushState で積む。
  // 1年送り・スライダー・自動再生は、最後の変化から STEP_MS 以内なら1件にまとめる（置き換える）。
  // 各項目の state には地図の位置も入れておき（動かし終えるたびに更新）、戻ったときに復元する。
  type Nav = "push" | "step" | "replace";
  interface HistState {
    y: number;
    p: string | null;
    l: MapLayer;
    m: boolean;
    rp: ReligionPick | null;
    view?: { lon: number; lat: number; zoom: number };
  }
  const STEP_MS = 1000;
  let nextNav: Nav = "replace";
  let lastStepAt = 0;
  let restoring = false;

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
    onReligion: (pick) => {
      state.relPick = pick;
      markPush();
      updateUi();
      if (pick) sheet.reveal();
    },
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

  const panel = new Panel(
    $("#polity"),
    $("#events"),
    idx,
    (id) => selectPolity(id, true),
    (y) => setYear(y),
  );

  function update() {
    map.render(state.year);
    updateUi();
  }

  /** 地図以外（パネル・凡例・URL）を今の状態に合わせる */
  function updateUi() {
    yearInput.value = String(state.year);
    slider.value = String(state.year);
    const rel = state.layer === "religion";
    map.setSelected(state.polity);
    map.setReligionSelected(rel && state.relPick ? state.relPick.region : -1);
    panel.renderYear(state.year, { religion: rel });
    if (rel) panel.renderReligion(state.relPick, state.year);
    else panel.renderPolity(state.polity, state.year, state.polity ? map.overlordOf(state.polity) : null);
    renderLegend();
    writeHistory();
    document.title = `${state.year}年 ― ヨーロッパ歴史地図`;
    updateMilestones();
  }

  function currentHash() {
    const h = new URLSearchParams({ y: String(state.year) });
    if (state.polity) h.set("p", state.polity);
    if (state.layer === "religion") h.set("l", "religion");
    if (modernBase) h.set("m", "1");
    return `#${h}`;
  }
  function histState(): HistState {
    return { y: state.year, p: state.polity, l: state.layer, m: modernBase, rp: state.relPick, view: map.getView() };
  }
  /** 今の状態を履歴に書く（nextNav に従って積む／置き換える） */
  function writeHistory(nav: Nav = nextNav) {
    nextNav = "replace";
    if (restoring) nav = "replace";
    const now = performance.now();
    if (nav === "step") {
      nav = now - lastStepAt < STEP_MS ? "replace" : "push";
      lastStepAt = now;
    } else if (nav === "push") lastStepAt = 0;
    const url = currentHash();
    if (nav === "push" && url !== location.hash) history.pushState(histState(), "", url);
    else history.replaceState(histState(), "", url);
  }
  /** 移動の前に呼ぶ：次の更新を新しい履歴として積む */
  const markPush = () => {
    nextNav = "push";
  };

  function setYear(y: number, nav: Nav = "push") {
    y = Math.round(Math.min(maxYear, Math.max(minYear, y)));
    if (!Number.isFinite(y) || y === state.year) {
      yearInput.value = String(state.year);
      return;
    }
    state.year = y;
    nextNav = nav;
    update();
  }

  function selectPolity(id: string | null, focus: boolean) {
    // 宗教表示中にパネルの × を押したときは、宗教の地域の選択を解除する
    if (!id && state.layer === "religion" && state.relPick) {
      state.relPick = null;
      markPush();
      updateUi();
      return;
    }
    if (id && state.layer !== "political") setLayer("political", false);
    state.polity = id;
    if (nextNav === "replace") markPush();
    update();
    if (id) {
      sheet.reveal();
      if (focus) map.focus(id);
    }
  }

  // ---- 年の操作 ----
  const step = (d: number) => () => setYear(state.year + d, "step");
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
  slider.addEventListener("input", () => setYear(Number(slider.value), "step"));

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
      setYear(state.year + 1, "step");
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
    writeHistory("push");
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

  // ---- 地図の種類（政治／宗教）。言語などを足すときは LAYERS に項目を増やし、map.ts の MapLayer に足す ----
  const LAYERS: { id: MapLayer; label: string; title: string }[] = [
    { id: "political", label: "政治", title: "国ごとの塗り分け" },
    { id: "religion", label: "宗教", title: "宗教の分布（R キー）" },
  ];
  const layerSwitch = $("#layer-switch");
  for (const l of LAYERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.layer = l.id;
    b.textContent = l.label;
    b.title = l.title;
    b.setAttribute("role", "radio");
    b.addEventListener("click", () => setLayer(l.id));
    layerSwitch.appendChild(b);
  }
  function setLayer(l: MapLayer, refresh = true) {
    if (l === state.layer && refresh) return;
    state.layer = l;
    if (l !== "religion") state.relPick = null;
    map.setLayer(l);
    syncLayerButtons();
    if (refresh) {
      markPush();
      updateUi();
    }
  }
  function syncLayerButtons() {
    for (const b of layerSwitch.querySelectorAll<HTMLButtonElement>("button")) {
      const on = b.dataset.layer === state.layer;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", String(on));
    }
    document.body.dataset.layer = state.layer;
    modernBtn.title =
      state.layer === "religion"
        ? "重ねる国境を現代のものに切り替え（C キーを押している間は逆の表示）"
        : "現代の国境に切り替え（C キーを押している間は逆の表示）";
  }

  // 宗教の凡例（その年の地図に出ている種類だけ）
  const relLegend = $("#rel-legend");
  let legendKey = "";
  relLegend.addEventListener("click", (e) => {
    if ((e.target as Element).closest(".rl-toggle")) relLegend.classList.toggle("collapsed");
  });
  function renderLegend() {
    const rel = state.layer === "religion";
    relLegend.hidden = !rel;
    if (!rel) return;
    const kinds = atlas.religion?.kinds ?? [];
    const shown = map.religionKindsShown();
    const key = JSON.stringify(shown);
    if (key === legendKey) return;
    legendKey = key;
    const items = shown.kinds
      .map((i) => `<li><i style="background:${kinds[i].color}"></i>${kinds[i].name}</li>`)
      .join("");
    const hatchSample = kinds.length
      ? `<li class="rl-hatch"><i style="background:repeating-linear-gradient(135deg, ${stripeColor(kinds[0].color)} 0 2px, #f1efe9 2px 6px)"></i>斜線＝少数派も多い地域（斜線の色が少数派）</li>`
      : "";
    relLegend.innerHTML = `<button type="button" class="rl-toggle" aria-label="凡例を開く／閉じる">宗教<span class="rl-caret"></span></button>
      <ul>${items}${shown.minors ? hatchSample : ""}${shown.nodata ? `<li><i class="rl-nodata"></i>データ作成中</li>` : ""}</ul>`;
  }

  // ---- 検索とキーボードショートカット ----
  const search = new Search($("#search"), {
    map,
    idx,
    year: () => state.year,
    selectPolity: (id) => {
      if (modernBase) modernBtn.click(); // 現代の国境の表示中は、その時代の地図に戻してから選ぶ
      nextNav = "replace"; // beforeJump で積んだ項目に書く
      selectPolity(id, true);
    },
    beforeJump: () => writeHistory("push"),
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
    stepYear: (d) => setYear(state.year + d, Math.abs(d) === 1 ? "step" : "push"),
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
    toggleReligion: () => {
      setLayer(state.layer === "religion" ? "political" : "religion");
      toast(state.layer === "religion" ? "宗教の分布（R で戻す）" : "政治の地図");
    },
    compare: (on) => {
      if (on) {
        const target = prevMs()?.year ?? state.year - 1;
        if (target < minYear) return;
        compareFrom = state.year;
        setYear(target, "replace");
        compareBadge.textContent = `${target}年の地図（B を離すと ${compareFrom}年に戻る）`;
        compareBadge.hidden = false;
      } else if (compareFrom !== null) {
        const y = compareFrom;
        compareFrom = null;
        compareBadge.hidden = true;
        setYear(y, "replace");
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
      if (state.layer === "religion" && state.relPick) {
        state.relPick = null;
        markPush();
        updateUi();
        return true;
      }
      if (!state.polity) return false;
      selectPolity(null, false);
      return true;
    },
  });

  // 戻る／進む（ブラウザのボタン・スワイプ・⌘[ ⌘]）と、URL のハッシュを手で書き換えたとき（チャットからのリンクなど）
  function restore(s: HistState) {
    restoring = true;
    try {
      if (Number.isFinite(s.y) && s.y >= minYear && s.y <= maxYear) state.year = s.y;
      state.polity = s.p && idx.polityById.has(s.p) ? s.p : null;
      if (s.l !== state.layer) setLayer(s.l, false);
      state.relPick = s.l === "religion" ? (s.rp ?? null) : null;
      if (s.m !== modernBase) {
        modernBase = s.m;
        applyModern();
      }
      if (s.view) map.setView(s.view);
      update();
    } finally {
      restoring = false;
    }
  }
  const stateFromHash = (): HistState => {
    const h = new URLSearchParams(location.hash.slice(1));
    const y = Number(h.get("y"));
    return {
      y: h.has("y") && Number.isFinite(y) ? y : state.year,
      p: h.get("p"),
      l: h.get("l") === "religion" ? "religion" : "political",
      m: h.get("m") === "1",
      rp: null,
    };
  };
  window.addEventListener("popstate", (e) => {
    stop();
    restore((e.state as HistState | null) ?? stateFromHash());
  });
  // 地図を動かし終えたら、今の履歴項目の位置を更新する（戻ったときにその位置へ戻れるように）
  map.onMoveEnd(() => {
    if (restoring) return;
    const s = history.state as HistState | null;
    if (s) history.replaceState({ ...s, view: map.getView() }, "", location.href);
  });
  if (hash.get("m") === "1") {
    modernBase = true;
    applyModern();
  }

  if (state.layer !== "political") {
    const l = state.layer;
    state.layer = "political";
    setLayer(l, false);
  } else syncLayerButtons();
  update();
  (window as unknown as { __atlas: unknown }).__atlas = map;
  await map.ready;
  document.body.classList.add("ready");
  void map.loadWater(base);
}

main().catch((e) => {
  console.error(e);
  document.querySelector("#map")!.innerHTML = `<p class="error">読み込みに失敗しました：${String(e)}</p>`;
});
