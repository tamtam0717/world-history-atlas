// スマホ用の下からのシート。上下になぞって高さを切り替える。
// - つまみと操作部（年のボタンなどの帯）は、どこを上下になぞってもシートが動く（ボタン・スライダー・入力欄の上は除く）。
// - 本文は、いちばん上までスクロールした状態で下へなぞるとシートが下がる。上へなぞると、full でなければシートが上がる。
// - iOS Safari でも確実に動くよう、Pointer Events ではなく Touch Events（passive: false）で扱う。
// PC（幅の広い画面）では右パネルとして常に表示されるので何もしない。

type Snap = "peek" | "half" | "full";

export function setupSheet(panel: HTMLElement, handle: HTMLElement) {
  const mq = matchMedia("(max-width: 799px)");
  let snap: Snap = "peek";
  const body = panel.querySelector(".panel-body") as HTMLElement | null;
  const controls = panel.querySelector(".controls") as HTMLElement;

  const heights = (): Record<Snap, number> => {
    const vh = window.innerHeight;
    const peek = controls.offsetHeight + 28;
    return { peek, half: Math.round(vh * 0.5), full: Math.round(vh * 0.88) };
  };

  const apply = (s: Snap, animate = true) => {
    snap = s;
    panel.dataset.snap = s;
    if (!mq.matches) {
      panel.style.height = "";
      return;
    }
    panel.style.transition = animate ? "height .25s ease" : "none";
    panel.style.height = `${heights()[s]}px`;
  };

  const snapTo = (cur: number, velocity: number) => {
    const h = heights();
    const order: Snap[] = ["peek", "half", "full"];
    // すばやくはじいたときは、その向きの次の段階へ
    if (Math.abs(velocity) > 0.5) {
      const i = order.indexOf(snap);
      const next = velocity > 0 ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
      // ドラッグの途中で段階をまたいだ場合も考え、今の高さに近い方向へ
      const fromCur = order.reduce((a, b) => (Math.abs(h[a] - cur) < Math.abs(h[b] - cur) ? a : b));
      const j = order.indexOf(fromCur);
      const k = velocity > 0 ? Math.max(next, h[fromCur] < cur ? Math.min(order.length - 1, j + 1) : j) : Math.min(next, h[fromCur] > cur ? Math.max(0, j - 1) : j);
      apply(order[k]);
      return;
    }
    apply(order.reduce((a, b) => (Math.abs(h[a] - cur) < Math.abs(h[b] - cur) ? a : b)));
  };

  // ボタン・スライダー・入力欄・リンクの上から始めたタッチは、その部品の操作に任せる
  const INTERACTIVE = "button, input, select, textarea, a, label.year-box, [data-no-drag]";

  type Drag = { startY: number; startH: number; lastY: number; lastT: number; v: number; active: boolean; fromBody: boolean };
  let drag: Drag | null = null;

  const onStart = (e: TouchEvent) => {
    if (!mq.matches || e.touches.length !== 1) return;
    const t = e.target as Element;
    const inHeader = handle.contains(t) || controls.contains(t);
    const inBody = !!body && body.contains(t);
    if (!inHeader && !inBody) return;
    if (inHeader && t.closest(INTERACTIVE) && !handle.contains(t)) return;
    const y = e.touches[0].clientY;
    drag = { startY: y, startH: panel.offsetHeight, lastY: y, lastT: performance.now(), v: 0, active: false, fromBody: inBody };
  };

  const onMove = (e: TouchEvent) => {
    if (!drag || !mq.matches) return;
    const y = e.touches[0].clientY;
    const dy = drag.startY - y; // 上へなぞると正
    if (!drag.active) {
      if (Math.abs(dy) < 6) return;
      if (drag.fromBody) {
        // 本文：上端で下へなぞったときと、full でないときに上へなぞったときだけシートを動かす
        const atTop = (body?.scrollTop ?? 0) <= 0;
        const wantDown = dy < 0 && atTop;
        const wantUp = dy > 0 && snap !== "full";
        if (!wantDown && !wantUp) {
          drag = null; // ふつうのスクロールに任せる
          return;
        }
      }
      drag.active = true;
      panel.style.transition = "none";
    }
    e.preventDefault(); // 地図や本文のスクロールに渡さない
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    drag.v = (drag.lastY - y) / dt; // px/ms（上向きが正）
    drag.lastY = y;
    drag.lastT = now;
    const h = heights();
    panel.style.height = `${Math.max(h.peek, Math.min(h.full, drag.startH + dy))}px`;
  };

  const onEnd = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.active) return;
    snapTo(panel.offsetHeight, d.v);
  };

  panel.addEventListener("touchstart", onStart, { passive: true });
  panel.addEventListener("touchmove", onMove, { passive: false });
  panel.addEventListener("touchend", onEnd);
  panel.addEventListener("touchcancel", onEnd);

  // つまみのタップで段階を切り替える（マウスでも使えるように click で）
  handle.addEventListener("click", () => {
    if (!mq.matches) return;
    apply(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");
  });

  // マウス（PC のブラウザを狭くしたとき）でもつまみをドラッグできるように
  let mouse: { startY: number; startH: number } | null = null;
  handle.addEventListener("mousedown", (e) => {
    if (!mq.matches) return;
    mouse = { startY: e.clientY, startH: panel.offsetHeight };
    panel.style.transition = "none";
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!mouse) return;
    const h = heights();
    panel.style.height = `${Math.max(h.peek, Math.min(h.full, mouse.startH + mouse.startY - e.clientY))}px`;
  });
  window.addEventListener("mouseup", (e) => {
    if (!mouse) return;
    const moved = Math.abs(e.clientY - mouse.startY) > 4;
    mouse = null;
    if (moved) snapTo(panel.offsetHeight, 0);
  });

  mq.addEventListener("change", () => apply(snap, false));
  window.addEventListener("resize", () => apply(snap, false));
  apply("peek", false);

  return {
    /** 国を選んだときなど、中身が見えるところまで引き上げる */
    reveal() {
      if (mq.matches && snap === "peek") apply("half");
    },
    /** 操作部（.controls）の高さが変わったとき：今の段階のまま高さを合わせ直す */
    refresh() {
      if (mq.matches && snap === "peek") apply("peek", false);
    },
  };
}
