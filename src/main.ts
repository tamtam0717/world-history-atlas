import "./style.css";
import type { Topology } from "topojson-specification";
import { AtlasIndex, curveAt, fallbackColor, type Atlas, type DistKey } from "./data";
import { AtlasMap, isDist, secularColor, stripeColor, type MapLayer, type ReligionPick } from "./map";
import { MovementBand } from "./movements";
import { Panel, type ColonyCard, type PanelColony, type PanelHistory } from "./panel";
import { sameColony, type ColonyRef } from "./colonies";
import { PolityMilestones } from "./polity-milestones";
import { Histories, sameUnit, type Stage, type StageInfo, type Unit } from "./history";
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
    /** 国のない土地（所属なし・データ未整備）をクリックしたときのピース（地図のピース番号。URL には出さない） */
    blank: null as number | null,
    /** 選んでいる植民地（副ラベルの単位。このとき polity は本国）。URL の c= */
    colony: null as ColonyRef | null,
    /** 「〇〇史」の舞台（国・植民地を地図で選んだときに決まり、年を動かして選択が移っても保つ）。URL の h= */
    stage: null as Stage | null,
    /** 舞台を決めたときに選んだもの（その舞台に土地がある間は当事者として数える） */
    anchor: null as Unit | null,
  };
  /** 地図の最初の描画が終わったか（植民地の判定は地図の所属を使うので、それまでは植民地のカードを出さない） */
  let mapReady = false;
  const LAYER_IDS: MapLayer[] = ["political", "religion", "language"];
  const parseLayer = (v: string | null): MapLayer => (LAYER_IDS.includes(v as MapLayer) ? (v as MapLayer) : "political");
  const hash = new URLSearchParams(location.hash.slice(1));
  const hy = Number(hash.get("y"));
  if (Number.isFinite(hy) && hy >= minYear && hy <= maxYear) state.year = hy;
  if (hash.get("p") && idx.polityById.has(hash.get("p")!)) state.polity = hash.get("p");
  /** URL・履歴の植民地のキーを確かめる（データの ID か "~副ラベル"） */
  const parseColony = (p: string | null | undefined, c: string | null | undefined): ColonyRef | null => {
    if (!p || !c || !idx.polityById.has(p)) return null;
    if (c.startsWith("~")) return c.length > 1 ? { parent: p, key: c } : null;
    const d = (atlas.colonies ?? []).find((x) => x.id === c);
    return d ? { parent: d.parent, key: c } : null;
  };
  state.colony = parseColony(state.polity, hash.get("c"));
  // データの植民地は、データの本国を選ぶ（p=vichy_france&c=french_west_africa → フランス。colonies.ts の PARENT_ALIASES）
  if (state.colony) state.polity = state.colony.parent;
  const stageKey0 = hash.get("h");
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
    c?: ColonyRef | null;
    /** 「〇〇史」の舞台の key と、舞台を決めたときに選んだもの */
    h?: string | null;
    a?: Unit | null;
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
    onColony: (ref) => selectColony(ref),
    onBlank: (piece) => selectPolity(null, false, piece),
    onReligion: (pick) => {
      state.relPick = pick;
      markPush();
      nextForce = true;
      updateUi();
      if (pick) {
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

  // ---- 国の情報カード（地図の左下に浮かぶ。スマホでは下シートの上） ----
  // PC：凡例（宗教・言語の表示では #rel-legend）のすぐ上に置き、左上のボタン類の下までに収める。
  // 凡例が高くて場所が足りないときは、凡例の右に並べる。スマホの位置・高さは CSS（--sheet-h）で決める。
  const card = $("#polity");
  const mapEl = $("#map");
  const zoomButtons = $(".zoom-buttons");
  const visibleRect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  };
  function layoutCard() {
    if (mobile.matches) {
      card.style.removeProperty("left");
      card.style.removeProperty("bottom");
      card.style.removeProperty("max-height");
      return;
    }
    if (card.hidden) return;
    const m = mapEl.getBoundingClientRect();
    const anchor = visibleRect($("#rel-legend")) ?? visibleRect($(".legend"));
    const top = (visibleRect(zoomButtons)?.bottom ?? m.top + 48) - m.top + 10;
    let left = 12;
    let bottom = anchor ? m.bottom - anchor.top + 8 : 12;
    let avail = m.height - bottom - top;
    // 凡例が高い（言語の凡例を開いたときなど）：凡例の右に並べる
    if (anchor && avail < 240 && anchor.height > 80) {
      left = anchor.right - m.left + 10;
      bottom = 10;
      avail = m.height - bottom - 48;
    }
    card.style.left = `${left}px`;
    card.style.bottom = `${bottom}px`;
    card.style.maxHeight = `${Math.round(Math.max(120, Math.min(m.height * 0.55, avail)))}px`;
  }
  panel.onCardChange = layoutCard;
  const ro = new ResizeObserver(() => layoutCard());
  for (const el of [mapEl, $(".legend"), $("#rel-legend"), zoomButtons]) ro.observe(el);
  mobile.addEventListener("change", layoutCard);
  /** 国へ寄せるとき、カードに隠れる部分（地図の左端・下端からのピクセル）。カードの幅と高さの、地図を狭めない方を使う */
  function cardAvoid(): { left: number; bottom: number } {
    const r = visibleRect(card);
    if (!r) return { left: 0, bottom: 0 };
    const m = mapEl.getBoundingClientRect();
    if (mobile.matches) return { left: 0, bottom: Math.max(0, m.bottom - r.top - map.bottomInset) };
    const left = r.right - m.left;
    const bottom = m.bottom - r.top;
    return left / m.width < bottom / m.height ? { left, bottom: 0 } : { left: 0, bottom };
  }
  // 出来事・国境の変化は、地図に映っている地域のものから先に並べる（地図を動かし終えたら並べ直す）
  panel.viewProbe = () => {
    if (!mobile.matches) return map.viewProbe();
    // シートを大きく引き上げて読んでいるときに全部が「範囲の外」にならないよう、地図の上 4 割は見えているものとする
    const m = $("#map").getBoundingClientRect();
    return map.viewProbe(Math.max(m.height * 0.4, $("#panel").getBoundingClientRect().top - m.top));
  };
  // 動かし終えた時点では新しい範囲のタイルがまだ描かれていないことがあるので、描画が落ち着いたときにもう一度並べる
  const arrange = () => panel.arrangeByView();
  map.onMoveEnd(() => {
    arrange();
    map.whenIdle(arrange);
  });

  // スライダーの下の潮流の帯（年表）
  const band = new MovementBand($("#mv-band"), idx, [minYear, maxYear], (id) => selectMovement(id), () => sheet.refresh());

  /** 前に描いた年（年を動かしたときだけ「〇〇史」の当事者の引き継ぎを調べる） */
  let shownYear = state.year;
  function update() {
    map.render(state.year);
    const prev = shownYear;
    shownYear = state.year;
    if (prev !== state.year && !reconcileStage(prev)) reconcileColony();
    else if (state.colony) colonyPieces = map.colonyPieces(state.colony);
    updateUi();
  }

  // ---- 「〇〇史」：舞台（現代の国の範囲）と当事者 ----
  // 国・植民地を地図で選ぶと舞台が決まり、« » はその舞台の当事者すべての節目へ。年を動かして選んでいたものが当事者でなくなったら
  // （滅亡・独立・舞台の大部分を失った）、その年に舞台を最も広く持つ当事者へ選択を移す（清 → 中華民国）。舞台は選び直すまで保つ
  const currentUnit = (): Unit | null =>
    state.colony ? { kind: "colony", ref: state.colony } : state.polity ? { kind: "polity", id: state.polity } : null;
  const stageInfo = (): StageInfo | null => (state.stage && state.polity ? histories.info(state.stage, state.anchor) : null);
  /** 選んだもの（国・植民地）から舞台を決め直す */
  function setStageFor(u: Unit | null) {
    state.anchor = u;
    state.stage = !u
      ? null
      : u.kind === "polity"
        ? histories.stageForPolity(u.id, state.year)
        : histories.stageForColony(mapReady ? map.colonyAtlasPieces(u.ref) : []);
  }
  /** 年を動かした後：選んでいたものが当事者でなくなっていれば、舞台を最も広く持つ当事者へ移す。移したら true */
  function reconcileStage(prevYear: number): boolean {
    const inf = stageInfo();
    const cur = currentUnit();
    if (!inf || !cur || !mapReady) return false;
    // 前の年にも当事者でなかったもの（舞台の外の国をリンクで選んだときなど）は移さない
    if (inf.isMember(cur, state.year) || !inf.isMember(cur, prevYear)) return false;
    const next = inf.leaderAt(state.year, cur);
    if (!next || sameUnit(next, cur)) return false;
    const before = histories.unitName(cur, prevYear);
    if (next.kind === "polity") {
      state.polity = next.id;
      state.colony = null;
    } else {
      state.polity = next.ref.parent;
      state.colony = next.ref;
      colonyPieces = map.colonyPieces(next.ref);
      colonyName = map.colonies.nameOf(next.ref, state.year);
      if (!colonyPieces.length) {
        // 地図の上で植民地として選べない（副ラベルが出ていない）ときは本国を選ぶ
        state.colony = null;
      }
    }
    const after = histories.unitName(currentUnit()!, state.year);
    if (before !== after) toast(`${before} → ${after}（${state.stage!.name}）`);
    return true;
  }

  // ---- 植民地の選択 ----
  /** 前に描いた年に、選んでいる植民地だったピース（地図のピース番号）。名前が変わった植民地を同じ土地として続けて選ぶのに使う */
  let colonyPieces: number[] = [];
  let colonyName = "";
  /**
   * 年を変えたあとの植民地の選択：同じ植民地が続いていればそのまま。なくなっていれば、前の年の植民地のピースの半分以上が入っている
   * 植民地（名前が変わった・宗主国が替わった同じ土地）へ移る。それもなければ本国の選択に戻す（独立・併合など）。
   * 解除ではなく本国に戻すのは、« » の節目や右パネルの並びの文脈（どの国の話か）を残すため
   */
  function reconcileColony() {
    if (!state.colony || !mapReady) return;
    let ps = map.colonyPieces(state.colony);
    if (!ps.length) {
      const next = map.colonySuccessor(colonyPieces);
      if (next) {
        state.colony = next;
        state.polity = next.parent;
        ps = map.colonyPieces(next);
      } else {
        if (colonyName) toast(`${colonyName}は${state.year}年の地図にありません（本国の選択に戻りました）`);
        state.colony = null;
      }
    }
    colonyPieces = ps;
    if (state.colony) colonyName = map.colonies.nameOf(state.colony, state.year);
  }
  function selectColony(ref: ColonyRef, focus = false) {
    if (sameColony(ref, state.colony)) return;
    state.blank = null;
    state.polity = ref.parent;
    state.colony = ref;
    colonyPieces = map.colonyPieces(ref);
    colonyName = map.colonies.nameOf(ref, state.year);
    setStageFor({ kind: "colony", ref });
    markPush();
    update();
    if (focus) map.focus(ref.parent, cardAvoid(), ref);
  }
  /** 右パネルの並べ替えに使う植民地の情報 */
  function panelColony(): PanelColony | null {
    const ref = state.colony;
    if (!ref || !mapReady) return null;
    const pieces = map.colonyAtlasPieces(ref);
    const regions = new Set<number>();
    const y = state.year;
    for (const a of pieces) {
      const s = idx.pieceState(a, y);
      if (s) regions.add(s[4]);
    }
    // 前の年に植民地だったピース（失った土地の変化も植民地の変化として先に出す）
    for (let a = 0; a < atlas.pieceTimelines.length; a++) {
      if (pieces.has(a) || !map.colonies.belongs(a, y - 1, ref)) continue;
      const s = idx.pieceState(a, y);
      if (s) regions.add(s[4]);
    }
    return { name: map.colonies.nameOf(ref, y), parent: ref.parent, pieces, regions, polities: map.colonies.eventPolities(ref) };
  }
  /** 植民地のカードの中身 */
  function colonyCard(ref: ColonyRef): ColonyCard {
    const y = state.year;
    const info = map.colonyInfo(ref);
    const data = map.colonies.byId.get(ref.key);
    const parent = idx.polityById.get(ref.parent)!;
    const ps = idx.shortName(parent, y);
    const text = `${info.labels.join(" ")} ${info.cause ?? ""} ${info.note ?? ""}`;
    // 種類：データの kind。なければ確からしさと副ラベル・記述の語から（占領地・保護国・委任統治領・租借地）、それもなければ「〇〇領」
    const kind =
      (data && map.colonies.kindOf(data, y)) ??
      (info.certainty === "occupied"
        ? `${ps}の占領地`
        : /委任統治/.test(text)
          ? `${ps}の委任統治領`
          : /租借/.test(text)
            ? `${ps}の租借地`
            : info.certainty === "indirect" || /保護/.test(text)
              ? `${ps}の保護下${info.certainty === "indirect" ? "（間接統治）" : ""}`
              : (info.autoNote ?? `${ps}領`));
    return {
      parent: ref.parent,
      key: ref.key,
      name: map.colonies.nameOf(ref, y),
      kind,
      exists: info.exists,
      labels: info.labels,
      region: info.region,
      cause: info.cause,
      note: info.note,
      certainty: info.certainty,
      area: info.area,
      data,
      governors: data ? map.colonies.governorsAt(data, y) : [],
      periods: data ? map.colonies.periodsAt(data, y) : [],
    };
  }

  /** 地図以外（パネル・凡例・URL）を今の状態に合わせる */
  function updateUi() {
    yearInput.value = String(state.year);
    slider.value = String(state.year);
    const dist = isDist(state.layer) ? state.layer : null;
    map.setSelected(state.polity, state.colony);
    map.setReligionSelected(dist && state.relPick ? state.relPick.region : -1);
    map.setMovement(idx.movement(state.movement) ?? null);
    map.flashRegions("political", null);
    panel.renderYear(state.year, {
      dist,
      movement: state.movement,
      polity: dist ? null : state.polity,
      colony: dist ? null : panelColony(),
      history: dist ? null : panelHistory(),
    });
    if (dist) panel.renderReligion(state.relPick, state.year, dist);
    else if (!state.polity && state.blank != null) panel.renderBlank(map.blankInfo(state.blank), state.year);
    else if (state.colony && mapReady) panel.renderColony(colonyCard(state.colony), state.year);
    else panel.renderPolity(state.polity, state.year, state.polity ? map.overlordOf(state.polity) : null, state.polity ? map.indirectOf(state.polity) : null);
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
    if (state.polity && state.colony) h.set("c", state.colony.key);
    if (state.polity && state.stage) h.set("h", state.stage.key);
    if (state.layer !== "political") h.set("l", state.layer);
    if (state.movement) h.set("mv", state.movement);
    if (modernBase) h.set("m", "1");
    return `#${h}`;
  }
  function histState(): HistState {
    return {
      y: state.year,
      p: state.polity,
      l: state.layer,
      m: modernBase,
      rp: state.relPick,
      mv: state.movement,
      c: state.colony,
      h: state.stage?.key ?? null,
      a: state.anchor,
      view: map.getView(),
    };
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

  function selectPolity(id: string | null, focus: boolean, blank: number | null = null) {
    state.blank = blank;
    // 宗教・言語の表示中にパネルの × を押したときは、その地域の選択を解除する
    if (!id && isDist(state.layer) && state.relPick) {
      state.relPick = null;
      markPush();
      updateUi();
      return;
    }
    if (id && state.layer !== "political") setLayer("political", false);
    state.polity = id;
    state.colony = null;
    setStageFor(id ? { kind: "polity", id } : null);
    if (nextNav === "replace") markPush();
    update();
    // 国の情報は地図の上のカードに出るので、シート（スマホ）は引き上げない
    if (id && focus) map.focus(id, cardAvoid());
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
  // «» は前後の「節目」へジャンプ。国を選んでいる間は、その国の節目（重要な出来事・領土の大きな変化・国名の変化）へ
  const milestones = atlas.milestones ?? [];
  const polityMs = new PolityMilestones(topo, idx, [minYear, maxYear]);
  const histories = new Histories(topo, idx, map.colonies, polityMs, [minYear, maxYear]);
  type Ms = { year: number; title: string; detail?: string[]; terr?: string };
  /** 領土の増減の印（▲ 拡大・▼ 縮小。現れた／消えた年は ◆／◇） */
  const terrMark = (m: Ms) =>
    m.terr ? `<i class="ms-terr ms-${m.terr}">${{ gain: "▲", loss: "▼", appear: "◆", vanish: "◇" }[m.terr] ?? ""}</i>` : "";
  /** 今使う節目の一覧と、国の節目なら国の ID */
  const currentMs = (): { list: Ms[]; polity: string | null; colony?: string; hist?: StageInfo } => {
    // 「〇〇史」：舞台の当事者すべての節目
    const inf = stageInfo();
    if (inf) {
      const list = inf.milestones();
      if (list.length)
        return { list, polity: state.polity, colony: state.colony && mapReady ? map.colonies.nameOf(state.colony, state.year) : undefined, hist: inf };
    }
    // 植民地を選んでいる間は、植民地の節目（範囲の大きな変化・植民地に関係する重要な出来事・名前の変化）
    if (state.colony && mapReady) {
      const list = polityMs.getColony(state.colony, map.colonies);
      if (list.length) return { list, polity: state.colony.parent, colony: map.colonies.nameOf(state.colony, state.year) };
    }
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
  const histStrip = $("#hist-strip");
  let stripKey = "";
  function updateMilestones() {
    const { list, polity, colony, hist } = currentMs();
    const p = prevMs();
    const n = nextMs();
    const here = list.find((m) => m.year === state.year);
    const pol = polity ? idx.polityById.get(polity)! : null;
    const controls = msLabel.closest<HTMLElement>(".controls") ?? msLabel.parentElement!;
    // 国の節目のときは、国の色の印（ラベルの丸・« » の縁取り）と国名の札で、全体の節目と見分けられるようにする
    controls.classList.toggle("ms-polity", !!pol);
    controls.classList.toggle("ms-colony", !!colony);
    controls.classList.toggle("ms-hist", !!hist);
    if (pol) controls.style.setProperty("--ms-color", pol.color ?? fallbackColor(pol.id));
    else controls.style.removeProperty("--ms-color");
    const tip = (m: Ms) => esc([`${m.year} ${m.title}`, ...(m.detail ?? [])].join("\n"));
    const selName = colony ?? (pol ? idx.shortName(pol, state.year) : "");
    let center: string;
    if (hist) {
      // 「〇〇史」の札：当事者の色を時代順に並べた帯（今の当事者が光る）と名前。節目の年は札の右に節目の題名
      const ms = hist.membersAt(state.year);
      const others = ms.filter((m) => !sameUnit(m.unit, currentUnit())).slice(0, 3).map((m) => histories.unitName(m.unit, state.year));
      const title = `${hist.stage.name}：${selName}${others.length ? `（ほかの当事者：${others.join("・")}）` : ""}を選んでいる間は、« » で${hist.stage.name}の節目へ移ります。年を動かして${selName}が当事者でなくなると、選択はその年の当事者へ移ります`;
      const tag = `<span class="ms-tag" title="${esc(title)}"><i class="ms-dot"></i><b>${esc(hist.stage.name)}</b></span>`;
      center = here
        ? `<span class="ms-here ms-with-tag" title="${tip(here)}">${tag}${terrMark(here)}${esc(here.title)}</span>`
        : `<span class="ms-who ms-with-tag">${tag}<span class="ms-who-long">${esc(selName)}</span></span>`;
    } else
      center = here
        ? `<span class="ms-here" title="${tip(here)}">${pol ? '<i class="ms-dot"></i>' : ""}${terrMark(here)}${esc(here.title)}</span>`
        : pol
          ? `<span class="ms-who" title="${esc(selName)}を選んでいる間は、« » でこの${colony ? "植民地" : "国"}の節目へ移ります"><i class="ms-dot"></i>${esc(selName)}<span class="ms-who-long">の節目</span></span>`
          : "";
    msLabel.innerHTML = [
      p ? `<span class="ms-prev" title="${tip(p)}">« ${p.year} ${terrMark(p)}${esc(p.title)}</span>` : "<span></span>",
      center,
      n ? `<span class="ms-next" title="${tip(n)}">${n.year} ${terrMark(n)}${esc(n.title)} »</span>` : "<span></span>",
    ].join("");
    renderHistStrip(hist ?? null, list);
    const name = hist ? hist.stage.name : selName;
    const pb = $<HTMLButtonElement>("#prev10");
    const nb = $<HTMLButtonElement>("#next10");
    pb.disabled = !p;
    nb.disabled = !n;
    pb.setAttribute("aria-label", pol ? `${name}の前の節目へ` : "前の節目へ");
    nb.setAttribute("aria-label", pol ? `${name}の次の節目へ` : "次の節目へ");
    pb.title = p ? `${p.year} ${p.title}` : "";
    nb.title = n ? `${n.year} ${n.title}` : "";
  }
  /**
   * スライダーの下の「〇〇史」の帯：その年に舞台を最も広く持つ当事者の色を年の順に並べ（清・中華民国・中華人民共和国の時代が色で分かる）、
   * 節目の年に細い刻み、今の年に印。押すとその年へ（いちばん近い節目に吸い付く）
   */
  function renderHistStrip(hist: StageInfo | null, list: Ms[]) {
    histStrip.hidden = !hist;
    if (!hist) {
      stripKey = "";
      return;
    }
    const span = Math.max(1, maxYear - minYear);
    const pct = (y: number) => (((y - minYear) / span) * 100).toFixed(2);
    histStrip.style.setProperty("--now", `${pct(state.year)}%`);
    const key = `${hist.stage.key}|${state.anchor ? JSON.stringify(state.anchor) : ""}`;
    if (key === stripKey) return;
    stripKey = key;
    const stops: string[] = [];
    let cur = "";
    let from = minYear;
    const flush = (to: number) => {
      if (cur) stops.push(`${cur} ${pct(from)}% ${pct(to)}%`);
      else stops.push(`transparent ${pct(from)}% ${pct(to)}%`);
    };
    for (let y = minYear; y <= maxYear + 1; y++) {
      const u = y <= maxYear ? hist.leaderAt(y) : null;
      const c = y > maxYear ? "#end" : u ? (histories.unitColor(u) ?? fallbackColor(u.kind === "polity" ? u.id : u.ref.parent)) : "";
      if (c !== cur || y > maxYear) {
        if (y > minYear) flush(y);
        cur = c;
        from = y;
      }
    }
    const ticks = list.map((m) => `<i class="hs-tick" style="left:${pct(m.year)}%"></i>`).join("");
    histStrip.innerHTML = `<div class="hs-bar" style="background:linear-gradient(90deg, ${stops.join(", ")})"></div>${ticks}<i class="hs-now"></i>`;
    histStrip.title = `${hist.stage.name}：色はその年に舞台を最も広く持つ国、刻みは節目`;
  }
  histStrip.addEventListener("click", (e) => {
    const r = histStrip.getBoundingClientRect();
    const y = Math.round(minYear + ((e.clientX - r.left) / r.width) * (maxYear - minYear));
    const list = currentMs().list;
    // 近い節目（帯の上で 1.5% 以内）があればそこへ
    const near = list.reduce<Ms | null>((b, m) => (!b || Math.abs(m.year - y) < Math.abs(b.year - y) ? m : b), null);
    setYear(near && Math.abs(near.year - y) <= (maxYear - minYear) * 0.015 ? near.year : y);
  });

  /** 右パネルの並べ替えに使う「〇〇史」の情報 */
  function panelHistory(): PanelHistory | null {
    const inf = stageInfo();
    if (!inf) return null;
    const y = state.year;
    const regions = new Set<number>();
    for (const i of inf.stage.pieces) {
      const a = idx.pieceState(i, y);
      const b = idx.pieceState(i, y - 1);
      if (a) regions.add(a[4]);
      if (b) regions.add(b[4]);
    }
    const leader = inf.leaderAt(y);
    return {
      name: inf.stage.name,
      color: (leader && histories.unitColor(leader)) ?? undefined,
      polities: inf.memberPolities(y),
      mask: inf.stage.mask,
      regions,
    };
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
    renderLegend();
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
    const lg = map.legendShown();
    $("#lg-indirect").hidden = !lg.indirect;
    $("#lg-unowned").hidden = !lg.unowned;
    $("#lg-nodata").hidden = !lg.nodata;
    $("#lg-pending").hidden = !lg.pending;
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
    renderLegend();
    map.whenIdle(renderLegend);
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
      if (state.polity) map.focus(state.polity, cardAvoid(), state.colony);
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
      state.colony = state.polity && s.c ? parseColony(state.polity, s.c.key) : null;
      if (state.colony) state.polity = state.colony.parent;
      if (state.colony) colonyPieces = [];
      state.stage = state.polity ? histories.stageByKey(s.h) : null;
      state.anchor = state.polity ? (s.a ?? currentUnit()) : null;
      if (state.polity && !state.stage) setStageFor(currentUnit());
      shownYear = state.year; // 戻る／進むでは、当事者の引き継ぎをしない（その時の選択をそのまま戻す）
      state.blank = null;
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
      c: h.get("p") && h.get("c") ? { parent: h.get("p")!, key: h.get("c")! } : null,
      h: h.get("h"),
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
  // URL の h= の舞台（なければ選んでいる国から決める。植民地は地図の準備ができてから）
  if (state.polity) {
    state.anchor = currentUnit();
    state.stage = histories.stageByKey(stageKey0) ?? (state.colony ? null : histories.stageForPolity(state.polity, state.year));
  }
  update();
  (window as unknown as { __atlas: unknown }).__atlas = map;
  (window as unknown as { __polityMs: unknown }).__polityMs = polityMs; // 確認用（国の節目の一覧）
  // 確認用：「〇〇史」の今の舞台・当事者・節目
  (window as unknown as { __history: unknown }).__history = {
    histories,
    info: () => stageInfo(),
    state: () => ({ year: state.year, polity: state.polity, colony: state.colony, stage: state.stage?.key ?? null, name: state.stage?.name ?? null }),
  };
  await map.ready;
  mapReady = true;
  document.body.classList.add("ready");
  // 植民地は地図の所属から求めるので、最初の描画が終わってから選び直す（URL で植民地を指定して開いたとき）
  if (state.colony) {
    colonyPieces = map.colonyPieces(state.colony);
    if (!colonyPieces.length) state.colony = null;
    else colonyName = map.colonies.nameOf(state.colony, state.year);
    if (!state.stage) setStageFor(currentUnit());
    else state.anchor = currentUnit();
    updateUi();
  }
  panel.arrangeByView(false); // 地図の準備ができたので、映っている地域の出来事を先にする
  // 国の情報の「上位の政体」「間接統治」は地図の所属から求めるので、最初の描画が終わってから出し直す
  if (state.polity && !state.colony && !isDist(state.layer)) panel.renderPolity(state.polity, state.year, map.overlordOf(state.polity), map.indirectOf(state.polity));
  // URL で国を指定して開いたときも、その国へ寄る（カードに隠れない位置に）
  if (state.polity) map.focus(state.polity, cardAvoid(), state.colony);
  void map.loadWater(base);
}

main().catch((e) => {
  console.error(e);
  document.querySelector("#map")!.innerHTML = `<p class="error">読み込みに失敗しました：${String(e)}</p>`;
});
