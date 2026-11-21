import "./style.css";
import type { Topology } from "topojson-specification";
import { AtlasIndex, curveAt, fallbackColor, type Atlas, type DistKey } from "./data";
import { AtlasMap, isDist, secularColor, stripeColor, type MapLayer, type ReligionPick } from "./map";
import { MovementBand } from "./movements";
import { Panel } from "./panel";
import { PolityMilestones } from "./polity-milestones";
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
  // 確認用：?range=1648-1914 で表示範囲を一時的に広げられる（データ作成中の年を見るため）
  const rangeParam = new URLSearchParams(location.search).get("range")?.split("-").map(Number);
  const [minYear, maxYear] =
    rangeParam && rangeParam.length === 2 && rangeParam.every(Number.isFinite) ? (rangeParam as [number, number]) : atlas.range;

  const state = {
    year: minYear,
    polity: null as string | null,
    layer: "political" as MapLayer,
    /** 宗教・言語の表示でクリックした場所 */
    relPick: null as ReligionPick | null,
    /** 選んでいる潮流（地図に広がりを重ねる） */
    movement: null as string | null,
  };
  const LAYER_IDS: MapLayer[] = ["political", "religion", "language"];
  const parseLayer = (v: string | null): MapLayer => (LAYER_IDS.includes(v as MapLayer) ? (v as MapLayer) : "political");
  const hash = new URLSearchParams(location.hash.slice(1));
  const hy = Number(hash.get("y"));
  if (Number.isFinite(hy) && hy >= minYear && hy <= maxYear) state.year = hy;
  if (hash.get("p") && idx.polityById.has(hash.get("p")!)) state.polity = hash.get("p");
  state.layer = parseLayer(hash.get("l"));
  if (hash.get("mv") && idx.movement(hash.get("mv"))) state.movement = hash.get("mv");

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
    mv?: string | null;
    view?: { lon: number; lat: number; zoom: number };
  }
  const STEP_MS = 1200;
  let nextNav: Nav = "replace";
  let lastStepAt = 0;
  /** 次の更新では URL が変わらなくても積む（宗教の地域の選択など、URL に出ない移動） */
  let nextForce = false;
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
      nextForce = true;
      updateUi();
      if (pick) {
        sheet.reveal();
        // スマホでは凡例が地図を広く覆うので、場所を選んだら畳む
        if (matchMedia("(max-width: 799px)").matches) {
          $("#rel-legend").classList.add("collapsed");
          legendKey = "";
        }
      }
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
    (id) => selectMovement(id),
    (kind, regions) => map.flashRegions(kind, regions),
  );
  panel.range = [minYear, maxYear];

  // スライダーの下の潮流の帯（年表）
  const band = new MovementBand($("#mv-band"), idx, [minYear, maxYear], (id) => selectMovement(id), () => sheet.refresh());

  function update() {
    map.render(state.year);
    updateUi();
  }

  /** 地図以外（パネル・凡例・URL）を今の状態に合わせる */
  function updateUi() {
    yearInput.value = String(state.year);
    slider.value = String(state.year);
    const dist = isDist(state.layer) ? state.layer : null;
    map.setSelected(state.polity);
    map.setReligionSelected(dist && state.relPick ? state.relPick.region : -1);
    map.setMovement(idx.movement(state.movement) ?? null);
    map.flashRegions("political", null);
    panel.renderYear(state.year, { dist, movement: state.movement });
    if (dist) panel.renderReligion(state.relPick, state.year, dist);
    else panel.renderPolity(state.polity, state.year, state.polity ? map.overlordOf(state.polity) : null);
    band.render(state.year, state.movement);
    renderLegend();
    map.whenIdle(renderLegend);
    writeHistory();
    document.title = `${state.year}年 ― 世界歴史地図`;
    updateMilestones();
  }

  function currentHash() {
    const h = new URLSearchParams({ y: String(state.year) });
    if (state.polity) h.set("p", state.polity);
    if (state.layer !== "political") h.set("l", state.layer);
    if (state.movement) h.set("mv", state.movement);
    if (modernBase) h.set("m", "1");
    return `#${h}`;
  }
  function histState(): HistState {
    return { y: state.year, p: state.polity, l: state.layer, m: modernBase, rp: state.relPick, mv: state.movement, view: map.getView() };
  }
  /** 今の状態を履歴に書く（nextNav に従って積む／置き換える） */
  function writeHistory(nav: Nav = nextNav, force = nextForce) {
    nextNav = "replace";
    nextForce = false;
    if (restoring) nav = "replace";
    const now = performance.now();
    if (nav === "step") {
      nav = now - lastStepAt < STEP_MS ? "replace" : "push";
      lastStepAt = now;
    } else if (nav === "push") lastStepAt = 0;
    const url = currentHash();
    if (nav === "push" && (force || url !== location.hash)) history.pushState(histState(), "", url);
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
    // 宗教・言語の表示中にパネルの × を押したときは、その地域の選択を解除する
    if (!id && isDist(state.layer) && state.relPick) {
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

  /** 潮流を選ぶ（null で解除）。勢いのない年にいるときは、最盛期の年へ移動する */
  function selectMovement(id: string | null, jumpToPeak = false) {
    if (id === state.movement) return;
    state.movement = id;
    markPush();
    const m = idx.movement(id);
    if (m && jumpToPeak && curveAt(m.curve, state.year) <= 0) {
      let best = m.curve[0][0];
      let v = -1;
      for (const [y, x] of m.curve) if (x > v && y >= minYear && y <= maxYear) [best, v] = [y, x];
      state.year = Math.min(maxYear, Math.max(minYear, best));
      update();
    } else {
      update();
    }
    if (m) {
      sheet.reveal();
      // パネルの中の、選んだ潮流の説明が見えるようにする
      requestAnimationFrame(() => document.querySelector("#events .mv.sel")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
  }

  // ---- 年の操作 ----
  const step = (d: number) => () => setYear(state.year + d, "step");
  $("#prev").addEventListener("click", step(-1));
  $("#next").addEventListener("click", step(1));
  // «» は前後の「節目」へジャンプ。国を選んでいる間は、その国の節目（領土の大きな変化・重要な出来事・国名の変化）へ
  const milestones = atlas.milestones ?? [];
  const polityMs = new PolityMilestones(topo, idx, [minYear, maxYear]);
  type Ms = { year: number; title: string; detail?: string[]; terr?: string };
  /** 領土の増減の印（▲ 拡大・▼ 縮小。現れた／消えた年は ◆／◇） */
  const terrMark = (m: Ms) =>
    m.terr ? `<i class="ms-terr ms-${m.terr}">${{ gain: "▲", loss: "▼", appear: "◆", vanish: "◇" }[m.terr] ?? ""}</i>` : "";
  /** 今使う節目の一覧と、国の節目なら国の ID */
  const currentMs = (): { list: Ms[]; polity: string | null } => {
    if (state.polity) {
      const list = polityMs.get(state.polity);
      if (list.length) return { list, polity: state.polity };
    }
    return { list: milestones, polity: null };
  };
  const prevMs = () => [...currentMs().list].reverse().find((m) => m.year < state.year);
  const nextMs = () => currentMs().list.find((m) => m.year > state.year);
  $("#prev10").addEventListener("click", () => {
    const m = prevMs();
    if (m) setYear(m.year);
  });
  $("#next10").addEventListener("click", () => {
    const m = nextMs();
    if (m) setYear(m.year);
  });
  const msLabel = $("#milestone");
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  function updateMilestones() {
    const { list, polity } = currentMs();
    const p = prevMs();
    const n = nextMs();
    const here = list.find((m) => m.year === state.year);
    const pol = polity ? idx.polityById.get(polity)! : null;
    const controls = msLabel.closest<HTMLElement>(".controls") ?? msLabel.parentElement!;
    // 国の節目のときは、国の色の印（ラベルの丸・« » の縁取り）と国名の札で、全体の節目と見分けられるようにする
    controls.classList.toggle("ms-polity", !!pol);
    if (pol) controls.style.setProperty("--ms-color", pol.color ?? fallbackColor(pol.id));
    else controls.style.removeProperty("--ms-color");
    const tip = (m: Ms) => esc([`${m.year} ${m.title}`, ...(m.detail ?? [])].join("\n"));
    const center = here
      ? `<span class="ms-here" title="${tip(here)}">${pol ? '<i class="ms-dot"></i>' : ""}${terrMark(here)}${esc(here.title)}</span>`
      : pol
        ? `<span class="ms-who" title="${esc(idx.shortName(pol, state.year))}を選んでいる間は、« » でこの国の節目へ移ります"><i class="ms-dot"></i>${esc(idx.shortName(pol, state.year))}<span class="ms-who-long">の節目</span></span>`
        : "";
    msLabel.innerHTML = [
      p ? `<span class="ms-prev" title="${tip(p)}">« ${p.year} ${terrMark(p)}${esc(p.title)}</span>` : "<span></span>",
      center,
      n ? `<span class="ms-next" title="${tip(n)}">${n.year} ${terrMark(n)}${esc(n.title)} »</span>` : "<span></span>",
    ].join("");
    const name = pol ? idx.shortName(pol, state.year) : "";
    const pb = $<HTMLButtonElement>("#prev10");
    const nb = $<HTMLButtonElement>("#next10");
    pb.disabled = !p;
    nb.disabled = !n;
    pb.setAttribute("aria-label", pol ? `${name}の前の節目へ` : "前の節目へ");
    nb.setAttribute("aria-label", pol ? `${name}の次の節目へ` : "次の節目へ");
    pb.title = p ? `${p.year} ${p.title}` : "";
    nb.title = n ? `${n.year} ${n.title}` : "";
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

  // ---- 地図の種類（政治／宗教／言語）。分布を足すときは LAYERS に項目を増やし、map.ts の MapLayer・data.ts の DistKey に足す ----
  const LAYERS: { id: MapLayer; label: string; title: string }[] = [
    { id: "political", label: "政治", title: "国ごとの塗り分け（P キー）" },
    { id: "religion", label: "宗教", title: "宗教の分布（R キー）" },
    { id: "language", label: "言語", title: "言語（民族）の分布（L キー）" },
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
  /** 言語の凡例で開いている語族（一度に1つだけ。null なら語族の見出しだけ） */
  let openFam: string | null = null;
  function setLayer(l: MapLayer, refresh = true) {
    if (l === state.layer && refresh) return;
    if (l !== state.layer) state.relPick = null;
    state.layer = l;
    map.setLayer(l);
    // 言語は種類が多いので、スマホでは凡例を畳んでおく（PC でも語族の見出しだけを出す）
    if (l === "language" && mobile.matches) relLegend.classList.add("collapsed");
    openFam = null;
    legendKey = "";
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
      isDist(state.layer)
        ? "重ねる国境を現代のものに切り替え（C キーを押している間は逆の表示）"
        : "現代の国境に切り替え（C キーを押している間は逆の表示）";
  }

  // 宗教・言語の凡例（その年の、画面に見えている地域に出てくる種類だけ）
  const relLegend = $("#rel-legend");
  let legendKey = "";
  relLegend.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest(".rl-toggle")) {
      relLegend.classList.toggle("collapsed");
      legendKey = "";
      renderLegend();
      return;
    }
    const fam = t.closest<HTMLElement>(".rl-fam-head")?.dataset.fam;
    if (fam !== undefined) {
      openFam = openFam === fam ? null : fam;
      legendKey = "";
      renderLegend();
    }
  });
  function renderLegend() {
    const dist = isDist(state.layer) ? (state.layer as DistKey) : null;
    relLegend.hidden = !dist;
    if (!dist) return;
    const kinds = idx.dist(dist)?.kinds ?? [];
    const shown = map.religionKindsShown(true);
    const key = dist + JSON.stringify(shown) + relLegend.classList.contains("collapsed") + openFam;
    if (key === legendKey) return;
    legendKey = key;
    relLegend.dataset.dist = dist;
    const item = (i: number) => `<li><i style="background:${kinds[i].color}"></i>${kinds[i].name}</li>`;
    const hatchSample = kinds.length
      ? `<li class="rl-hatch"><i style="background:repeating-linear-gradient(135deg, ${stripeColor(kinds[0].color)} 0 2px, #f1efe9 2px 6px)"></i>斜線＝少数派も多い地域<span class="rl-long">（斜線の色が少数派）</span></li>`
      : "";
    // 世俗化：同じ宗派の色の、濃い→薄いのグラデーションで「薄い色＝信仰が弱まった」を見せる
    const secKind = kinds[shown.kinds[0] ?? 0];
    const secularSample =
      dist === "religion" && shown.secular && secKind
        ? `<li class="rl-secular"><i style="background:linear-gradient(90deg, ${secKind.color}, ${secularColor(secKind.color, 0.7)})"></i>薄い色＝世俗化（宗教離れ）</li>`
        : "";
    const notes = `${shown.minors ? hatchSample : ""}${secularSample}${shown.nodata ? `<li><i class="rl-nodata"></i>データ作成中</li>` : ""}${shown.pending ? `<li><i class="rl-pending"></i>現代の国境（データ準備中）</li>` : ""}`;
    const toggle = (label: string) =>
      `<button type="button" class="rl-toggle" aria-label="凡例を開く／閉じる">${label}<span class="rl-caret"></span></button>`;
    if (dist === "religion") {
      relLegend.innerHTML = `${toggle("宗教")}<ul>${shown.kinds.map(item).join("")}${notes}</ul>`;
      return;
    }
    // 言語：語族ごとにまとめる（語族の見出しの色見本は、その語族の言語の色を並べたグラデーション）。
    // 言語は種類が多く、全部を並べると地図を大きく隠すので、ふだんは語族の見出しだけを段組みで並べ、
    // 見出しを押した語族だけ言語の一覧を開く
    const fams = new Map<string, number[]>();
    for (const i of shown.kinds) {
      const f = kinds[i].family ?? "その他";
      if (!fams.has(f)) fams.set(f, []);
      fams.get(f)!.push(i);
    }
    const famHtml = [...fams]
      .map(([f, is]) => {
        const cs = is.map((i) => kinds[i].color);
        const grad = cs.length > 1 ? `linear-gradient(90deg, ${cs.join(", ")})` : cs[0];
        const open = openFam === f;
        const head = `<button type="button" class="rl-fam-head" data-fam="${f}" aria-expanded="${open}"><i style="background:${grad}"></i>${f}<span class="rl-n">${is.length}</span></button>`;
        return `<div class="rl-fam${open ? " open" : ""}">${head}${open ? `<ul>${is.map(item).join("")}</ul>` : ""}</div>`;
      })
      .join("");
    relLegend.innerHTML = `${toggle("言語（民族）")}<div class="rl-fams">${famHtml || `<div class="rl-empty">データ作成中</div>`}</div>${notes ? `<ul class="rl-notes">${notes}</ul>` : ""}`;
  }
  map.onMoveEnd(() => {
    if (isDist(state.layer)) renderLegend();
  });

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
    beforeJump: () => writeHistory("push", true),
    selectMovement: (id) => {
      nextNav = "replace";
      state.movement = null;
      selectMovement(id, true);
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
    toggleLayer: (layer, revert) => {
      // 長押しを離したときは、押したときに積んだ履歴を1つ戻して元の表示にする
      if (revert) {
        if ((history.state as HistState | null)?.l === state.layer) history.back();
        return true;
      }
      const before = state.layer;
      setLayer(state.layer === layer ? "political" : layer);
      if (state.layer === before) return false;
      const keyOf = { religion: "R", language: "L" } as const;
      toast(
        state.layer === "religion"
          ? `宗教の分布（${keyOf.religion} で戻す）`
          : state.layer === "language"
            ? `言語（民族）の分布（${keyOf.language} で戻す）`
            : "政治の地図（P）",
      );
      return true;
    },
    toggleBand: () => {
      band.setCollapsed(!band.collapsed);
      toast(band.collapsed ? "潮流の年表を閉じました（T で開く）" : "潮流の年表");
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
      if (isDist(state.layer) && state.relPick) {
        state.relPick = null;
        markPush();
        updateUi();
        return true;
      }
      if (state.polity) {
        selectPolity(null, false);
        return true;
      }
      if (state.movement) {
        selectMovement(null);
        return true;
      }
      return false;
    },
  });

  // 戻る／進む（ブラウザのボタン・スワイプ・⌘[ ⌘]）と、URL のハッシュを手で書き換えたとき（チャットからのリンクなど）
  function restore(s: HistState) {
    restoring = true;
    try {
      if (Number.isFinite(s.y) && s.y >= minYear && s.y <= maxYear) state.year = s.y;
      state.polity = s.p && idx.polityById.has(s.p) ? s.p : null;
      if (s.l !== state.layer) setLayer(s.l, false);
      state.relPick = isDist(s.l) ? (s.rp ?? null) : null;
      state.movement = s.mv && idx.movement(s.mv) ? s.mv : null;
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
      l: parseLayer(h.get("l")),
      m: h.get("m") === "1",
      rp: null,
      mv: h.get("mv"),
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
  (window as unknown as { __polityMs: unknown }).__polityMs = polityMs; // 確認用（国の節目の一覧）
  await map.ready;
  document.body.classList.add("ready");
  void map.loadWater(base);
}

main().catch((e) => {
  console.error(e);
  document.querySelector("#map")!.innerHTML = `<p class="error">読み込みに失敗しました：${String(e)}</p>`;
});
