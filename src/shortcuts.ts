// キーボードショートカット（一覧は index.html の #help。? キーで表示）
//
// 2文字のもの（NA・AF・AS）は、先頭の文字（N・A）が単独では何もしないので、待たずに確定できる。
// 先頭の文字を押してから 1 秒以内に次の文字を押すと 2 文字のショートカットになり、
// それ以外のキーを押したときは先頭の文字を忘れて、そのキー本来の動作をする（例：A → C は C の動作）。

import type { DistKey } from "./data";
import type { AtlasMap } from "./map";
import type { Search } from "./search";

export interface ShortcutActions {
  map: AtlasMap;
  search: Search;
  stepYear(d: number): void;
  milestone(dir: -1 | 1): void;
  majorEvent(dir: -1 | 1): void;
  edgeYear(which: "first" | "last"): void;
  togglePlay(): void;
  startYearInput(digit: string): void;
  toggleModern(): void;
  /** 宗教・言語の分布の表示を切り替える（revert：長押しを離したので元に戻す） */
  toggleLayer(layer: DistKey, revert?: boolean): void;
  /** 潮流の年表（スライダーの下の帯）を開く／閉じる */
  toggleBand(): void;
  compare(on: boolean): void;
  focusSelected(): void;
  copyUrl(): void;
  /** 国の選択を解除する。解除するものがなければ false */
  deselect(): boolean;
}

type Region = "world" | "europe" | "na" | "af" | "as";
const COMBOS: Record<string, Region> = { NA: "na", AF: "af", AS: "as" };
const PREFIXES = new Set(["N", "A"]);
const COMBO_MS = 1000;

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** 入力欄（文字を打つもの）にフォーカスがあるか。スライダーやボタンは含めない */
function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  if (t instanceof HTMLTextAreaElement || (t as HTMLElement).isContentEditable) return true;
  if (t instanceof HTMLInputElement) return !["range", "button", "checkbox", "radio", "submit", "reset"].includes(t.type);
  return t instanceof HTMLSelectElement;
}

/** 画面下に小さく出す一言（「URLをコピーしました」など） */
let toastTimer = 0;
export function toast(text: string, ms = 1600) {
  let el = document.querySelector<HTMLElement>("#key-hint");
  if (!el) {
    el = document.createElement("div");
    el.id = "key-hint";
    el.className = "key-hint";
    el.setAttribute("role", "status");
    document.querySelector("#map")?.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("show"), ms);
}

export function setupShortcuts(a: ShortcutActions) {
  const help = document.querySelector<HTMLElement>("#help")!;
  const toggleHelp = (on = help.hidden) => {
    help.hidden = !on;
  };
  help.querySelector(".help-close")?.addEventListener("click", () => toggleHelp(false));
  document.querySelector("#help-btn")?.addEventListener("click", () => toggleHelp());

  // ---- 2文字のショートカット ----
  let pending = "";
  let pendingAt = 0;
  const clearPending = () => {
    pending = "";
  };

  // ---- 矢印キーでのパン（一押しで画面の 1/4、Shift で 1/2。押しっぱなしで連続移動） ----
  const held = new Map<string, number>(); // キー → 速さの倍率
  let raf = 0;
  let holdTimer = 0;
  let last = 0;
  const stopPan = () => {
    held.clear();
    cancelAnimationFrame(raf);
    raf = 0;
    clearTimeout(holdTimer);
  };
  const tick = (t: number) => {
    if (!held.size) {
      raf = 0;
      return;
    }
    const dt = Math.min(50, t - last);
    last = t;
    const { width, height } = a.map.viewSize();
    let dx = 0;
    let dy = 0;
    for (const [k, f] of held) {
      dx += ARROWS[k][0] * f;
      dy += ARROWS[k][1] * f;
    }
    // 1 秒に画面の 0.8 倍ほど進む
    const v = (0.8 * dt) / 1000;
    a.map.panBy(dx * width * v, dy * height * v, 0);
    raf = requestAnimationFrame(tick);
  };
  const startLoop = () => {
    if (raf || !held.size) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  // ---- 拡大・縮小（押しっぱなしのときは間引く） ----
  let lastZoom = 0;
  const zoom = (f: number, repeat: boolean) => {
    const now = performance.now();
    if (repeat && now - lastZoom < 180) return;
    lastZoom = now;
    a.map.zoomBy(f);
  };

  // R：宗教、Y：言語の表示を切り替え。長押し（HOLD_MS 以上）したときは、離すと元に戻す
  const HOLD_MS = 450;
  const LAYER_KEYS: Record<string, DistKey> = { R: "religion", Y: "language" };
  const downAt: Record<string, number> = {};
  const endLayerHold = (l: string) => {
    if (downAt[l] && performance.now() - downAt[l] >= HOLD_MS) a.toggleLayer(LAYER_KEYS[l], true);
    downAt[l] = 0;
  };

  let comparing = false;
  const endCompare = () => {
    if (!comparing) return;
    comparing = false;
    a.compare(false);
  };

  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || isTyping(e.target)) return;
    const k = e.key;

    if (k === "Escape") {
      clearPending();
      if (!help.hidden) toggleHelp(false);
      else if (a.search.isOpen) a.search.close();
      else if (!a.deselect()) return;
      e.preventDefault();
      return;
    }

    // 矢印キー：修飾キーなし → パン、Option(Alt) → 1年（Shift で10年）、Command/Ctrl → ←→ 節目・↑↓ 最初／最後の年
    if (k in ARROWS) {
      clearPending();
      const horiz = k === "ArrowLeft" || k === "ArrowRight";
      const dir = k === "ArrowLeft" ? -1 : 1;
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (!horiz) return;
        a.stepYear(dir * (e.shiftKey ? 10 : 1));
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        if (horiz) a.milestone(dir);
        else a.edgeYear(k === "ArrowUp" ? "first" : "last"); // Mac の「先頭／末尾へ」に合わせる
      } else if (!e.ctrlKey && !e.metaKey) {
        const f = e.shiftKey ? 2 : 1;
        if (!held.has(k)) {
          held.set(k, f);
          const { width, height } = a.map.viewSize();
          const [ux, uy] = ARROWS[k];
          a.map.panBy(ux * width * 0.25 * f, uy * height * 0.25 * f, 280);
          clearTimeout(holdTimer);
          holdTimer = window.setTimeout(startLoop, 320);
        } else held.set(k, f);
      } else return;
      e.preventDefault();
      return;
    }

    // ⌘[ / ⌘]（Ctrl+[ / Ctrl+]）：戻る／進む（ブラウザの戻る・進むと同じ履歴）
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === "[" || k === "]")) {
      clearPending();
      if (!e.repeat) {
        if (k === "[") history.back();
        else history.forward();
      }
      e.preventDefault();
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // 記号・数字（キーボード配列の違いを考えて e.key で見る）
    if (k === " " || k === "Spacebar") {
      if (!e.repeat) a.togglePlay();
    } else if (/^[0-9]$/.test(k)) {
      a.startYearInput(k);
    } else if (k === "Home") {
      a.edgeYear("first");
    } else if (k === "End") {
      a.edgeYear("last");
    } else if (k === "[" || k === "]") {
      a.majorEvent(k === "[" ? -1 : 1);
    } else if (k === "?" || (e.code === "Slash" && e.shiftKey)) {
      toggleHelp();
    } else if (k === "+" || k === "=" || k === ";" || k === "^") {
      zoom(1.6, e.repeat);
    } else if (k === "-" || k === "_") {
      zoom(1 / 1.6, e.repeat);
    } else {
      // 英字：配列の違いに備えて e.key を優先し、日本語入力中などで取れなければ物理キー（e.code）で見る
      const letter = /^[a-z]$/i.test(k) ? k.toUpperCase() : (/^Key([A-Z])$/.exec(e.code)?.[1] ?? "");
      if (!letter) return;
      // 2文字の待ち状態は handleLetter の中で扱う
      if (handleLetter(letter, e.repeat)) e.preventDefault();
      return;
    }
    clearPending();
    e.preventDefault();
  });

  /** 英字キー。何もしなかったときは false */
  function handleLetter(l: string, repeat: boolean): boolean {
    const now = performance.now();
    if (pending && now - pendingAt <= COMBO_MS) {
      const combo = COMBOS[pending + l];
      pending = "";
      if (combo) {
        a.map.flyToRegion(combo);
        return true;
      }
    }
    pending = "";
    if (repeat) return l === "B" || l in LAYER_KEYS; // 押しっぱなしの繰り返しは無視（B・R は押している間の表示なので既定動作だけ止める）
    if (PREFIXES.has(l)) {
      pending = l;
      pendingAt = now;
      toast(l === "N" ? "N … A で北米" : "A … F でアフリカ／S でアジア", COMBO_MS);
      return true;
    }
    switch (l) {
      case "W":
        a.map.flyToRegion("world");
        return true;
      case "E":
        a.map.flyToRegion("europe");
        return true;
      case "F":
        a.search.open();
        return true;
      case "M":
        a.toggleModern();
        return true;
      case "B":
        if (!comparing) {
          comparing = true;
          a.compare(true);
        }
        return true;
      case "R":
      case "Y":
        if (!downAt[l]) {
          downAt[l] = performance.now();
          a.toggleLayer(LAYER_KEYS[l]);
        }
        return true;
      case "T":
        a.toggleBand();
        return true;
      case "G":
        a.focusSelected();
        return true;
      case "L":
        a.map.setLabels(!a.map.labelsVisible);
        toast(a.map.labelsVisible ? "地名を表示" : "地名を非表示（L で戻す）");
        return true;
      case "U":
        a.copyUrl();
        return true;
      // C は main.ts で扱う（押している間だけ現代の国境）
    }
    return false;
  }

  document.addEventListener("keyup", (e) => {
    if (e.key in ARROWS) {
      held.delete(e.key);
      if (!held.size) stopPan();
    }
    // Mac では Command を押している間、他のキーの keyup が来ないことがあるので念のため
    if (e.key === "Meta" || e.key === "Alt" || e.key === "Control") stopPan();
    if (e.code === "KeyB" || e.key === "b" || e.key === "B") endCompare();
    for (const l of Object.keys(LAYER_KEYS)) if (e.code === `Key${l}` || e.key.toUpperCase() === l) endLayerHold(l);
  });
  window.addEventListener("blur", () => {
    stopPan();
    endCompare();
    for (const l of Object.keys(LAYER_KEYS)) endLayerHold(l);
    clearPending();
  });
}
