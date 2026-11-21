// スマホ用の下からのシート。つまみをドラッグ／タップして高さを切り替える。
// PC（幅の広い画面）では右パネルとして常に表示されるので何もしない。

type Snap = "peek" | "half" | "full";

export function setupSheet(panel: HTMLElement, handle: HTMLElement) {
  const mq = matchMedia("(max-width: 799px)");
  let snap: Snap = "peek";

  const heights = (): Record<Snap, number> => {
    const vh = window.innerHeight;
    const peek = (panel.querySelector(".controls") as HTMLElement).offsetHeight + 28;
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

  let startY = 0;
  let startH = 0;
  let moved = false;
  handle.addEventListener("pointerdown", (e) => {
    if (!mq.matches) return;
    startY = e.clientY;
    startH = panel.offsetHeight;
    moved = false;
    handle.setPointerCapture(e.pointerId);
    panel.style.transition = "none";
  });
  handle.addEventListener("pointermove", (e) => {
    if (!mq.matches || !handle.hasPointerCapture(e.pointerId)) return;
    const dy = startY - e.clientY;
    if (Math.abs(dy) > 4) moved = true;
    const h = heights();
    panel.style.height = `${Math.max(h.peek, Math.min(h.full, startH + dy))}px`;
  });
  handle.addEventListener("pointerup", (e) => {
    if (!mq.matches) return;
    handle.releasePointerCapture(e.pointerId);
    if (!moved) {
      apply(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");
      return;
    }
    const cur = panel.offsetHeight;
    const h = heights();
    const best = (Object.keys(h) as Snap[]).reduce((a, b) => (Math.abs(h[a] - cur) < Math.abs(h[b] - cur) ? a : b));
    apply(best);
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
