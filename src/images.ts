// Wikipedia の記事から代表画像（肖像画・国旗・出来事の絵）を取ってきてパネルに表示する。
// 画像はリポジトリに入れず、閲覧時に Wikipedia の REST API（page/summary）から取得する。
//
// 使い方：
//   1. パネルの HTML を組み立てるときに imageSlot(...) で空の差し込み口を置く（場所は取らない）
//   2. innerHTML を入れたあとで hydrateImages(container) を呼ぶ
//      → 画面に入った差し込み口だけ、API を引いて画像を入れる（取れなければ差し込み口ごと消す）
//   3. 画像のクリックで大きく表示（ライトボックス）

import "./images.css";

export interface WikiRef {
  /** 言語（ja / en / de / it …） */
  lang: string;
  /** 記事名（空白は "_" ではなく " " にそろえる） */
  title: string;
  /** 記事の要約にこの文字列が含まれるときだけ使う（記事名を推測したときの確認用） */
  check?: string[];
}

export interface WikiImage {
  thumb: string;
  large: string;
  width?: number;
  height?: number;
  pageUrl: string;
  pageTitle: string;
  lang: string;
}

export type ImageKind = "portrait" | "emblem" | "event" | "event-wide";

const LANG_ORDER = ["ja", "en"];

// ---------------------------------------------------------------------------
// 記事名の取り出し

/** source の文字列 1 つから記事を取り出す。Wikipedia でなければ null */
export function parseWikiSource(s: string): WikiRef | null {
  if (!s) return null;
  const str = s.trim();
  // https://ja.wikipedia.org/wiki/記事名 （モバイル版 ja.m.wikipedia.org も可）
  const m = str.match(/^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^?]+)/i);
  if (m) {
    let title = m[2];
    try {
      title = decodeURIComponent(title);
    } catch {
      /* 壊れた % はそのまま */
    }
    return mk(m[1].toLowerCase(), title);
  }
  // https://ja.wikipedia.org/w/index.php?title=記事名
  const q = str.match(/^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/w\/index\.php\?(.*)$/i);
  if (q) {
    const t = new URLSearchParams(q[2]).get("title");
    return t ? mk(q[1].toLowerCase(), t) : null;
  }
  // 「ja.wikipedia: 記事名」「en.wikipedia：記事名」
  const t = str.match(/^([a-z-]+)\.wikipedia\s*[:：]\s*(.+)$/i);
  if (t) return mk(t[1].toLowerCase(), t[2]);
  return null;
}

function mk(lang: string, raw: string): WikiRef | null {
  const title = normTitle(raw);
  return title ? { lang, title } : null;
}

/** 記事名の正規化："_" → 空白、#節 を除く、前後の空白を除く */
export function normTitle(raw: string): string {
  return raw.replace(/#.*$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/** source（文字列または配列）から記事を取り出し、ja → en → その他の順に並べる（同じ記事は 1 回） */
export function wikiRefs(source: string | string[] | undefined | null): WikiRef[] {
  const arr = source == null ? [] : Array.isArray(source) ? source : [source];
  const seen = new Set<string>();
  const out: WikiRef[] = [];
  for (const s of arr) {
    const r = typeof s === "string" ? parseWikiSource(s) : null;
    if (!r) continue;
    const k = refKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  const rank = (l: string) => {
    const i = LANG_ORDER.indexOf(l);
    return i < 0 ? LANG_ORDER.length : i;
  };
  return out.map((r, i) => [r, i] as const).sort((a, b) => rank(a[0].lang) - rank(b[0].lang) || a[1] - b[1]).map((x) => x[0]);
}

export const refKey = (r: WikiRef) => `${r.lang}:${r.title}`;

export function articleUrl(r: { lang: string; title: string }) {
  return `https://${r.lang}.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`;
}

// ---------------------------------------------------------------------------
// REST API の取得とキャッシュ

interface Summary {
  type?: string;
  title?: string;
  extract?: string;
  thumbnail?: { source: string; width?: number; height?: number };
  originalimage?: { source: string; width?: number; height?: number };
  content_urls?: { desktop?: { page?: string } };
}

/** 記事ごとの要約（取得中は Promise、失敗は null）。同じ記事は二度取りに行かない */
const summaryCache = new Map<string, Promise<Summary | null>>();
/** 差し込み口（refs の組）ごとの結果。描き直しのとき、取得済みならすぐに出す */
const resolved = new Map<string, WikiImage | null>();

const MAX_CONCURRENT = 4;
let active = 0;
const waiting: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function fetchSummary(r: WikiRef): Promise<Summary | null> {
  const k = refKey(r);
  let p = summaryCache.get(k);
  if (!p) {
    const url = `https://${r.lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(r.title.replace(/ /g, "_"))}`;
    p = limited(async () => {
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return null;
        return (await res.json()) as Summary;
      } catch {
        return null;
      }
    });
    summaryCache.set(k, p);
  }
  return p;
}

/** 大きく表示する用の画像 URL。サムネイル URL の幅を差し替える（元画像が巨大なことがあるため） */
function largeUrl(s: Summary): string {
  const th = s.thumbnail?.source ?? "";
  const orig = s.originalimage;
  const W = 1280;
  if (orig?.source && (!orig.width || orig.width <= W || /\.svg$/i.test(orig.source))) return orig.source;
  const m = th.match(/^(.*\/)(\d+)px-([^/]+)$/);
  if (m) return `${m[1]}${W}px-${m[3]}`;
  return orig?.source ?? th;
}

/** refs を順に試し、画像のある最初の記事を返す */
export async function resolveImage(refs: WikiRef[]): Promise<WikiImage | null> {
  for (const r of refs) {
    const s = await fetchSummary(r);
    if (!s || s.type === "disambiguation" || !s.thumbnail?.source) continue;
    if (r.check?.length && !r.check.some((c) => (s.extract ?? "").includes(c))) continue;
    return {
      thumb: s.thumbnail.source,
      large: largeUrl(s),
      width: s.originalimage?.width ?? s.thumbnail.width,
      height: s.originalimage?.height ?? s.thumbnail.height,
      pageUrl: s.content_urls?.desktop?.page ?? articleUrl(r),
      pageTitle: s.title ?? r.title,
      lang: r.lang,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 差し込み口と遅延読み込み

const escAttr = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** パネルの HTML に置く差し込み口。refs が空なら空文字 */
export function imageSlot(refs: WikiRef[], kind: ImageKind, alt = ""): string {
  if (!refs.length) return "";
  const data = JSON.stringify(refs.map((r) => (r.check ? [r.lang, r.title, r.check] : [r.lang, r.title])));
  const hit = resolved.get(data);
  if (hit === null) return ""; // 取れないことがわかっている
  const cls = `wimg wimg-${kind}`;
  if (hit) return filled(cls, hit, alt);
  return `<span class="${cls} pending" data-wimg="${escAttr(data)}" data-alt="${escAttr(alt)}"></span>`;
}

function filled(cls: string, img: WikiImage, alt: string) {
  return `<button type="button" class="${cls} ok" data-large="${escAttr(img.large)}" data-page="${escAttr(img.pageUrl)}" data-title="${escAttr(
    img.pageTitle,
  )}" aria-label="${escAttr(alt || img.pageTitle)}の画像を拡大"><img src="${escAttr(img.thumb)}" alt="${escAttr(alt || img.pageTitle)}" decoding="async"></button>`;
}

let observer: IntersectionObserver | null = null;

function getObserver() {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          observer!.unobserve(e.target);
          load(e.target as HTMLElement);
        }
      },
      { rootMargin: "300px 0px" },
    );
  }
  return observer;
}

const observed = new Set<Element>();

/** innerHTML を入れたあとに呼ぶ。画面内（とその少し先）の差し込み口だけ読み込む */
export function hydrateImages(root: HTMLElement) {
  setupLightbox();
  const ob = getObserver();
  for (const el of observed) {
    if (!el.isConnected) {
      ob.unobserve(el);
      observed.delete(el);
    }
  }
  root.querySelectorAll<HTMLElement>(".wimg.pending[data-wimg]").forEach((el) => {
    observed.add(el);
    ob.observe(el);
  });
}

async function load(el: HTMLElement) {
  observed.delete(el);
  const data = el.dataset.wimg!;
  let img = resolved.get(data);
  if (img === undefined) {
    let refs: WikiRef[] = [];
    try {
      refs = (JSON.parse(data) as [string, string, string[]?][]).map(([lang, title, check]) => ({ lang, title, check }));
    } catch {
      /* 壊れたデータ */
    }
    img = await resolveImage(refs);
    resolved.set(data, img);
  }
  if (!el.isConnected) return;
  if (!img) {
    el.remove();
    return;
  }
  // 画像そのものが読めてから表示する（読めなければ差し込み口ごと消す）
  const pre = new Image();
  pre.decoding = "async";
  pre.onload = () => {
    if (!el.isConnected) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = filled(el.className.replace(/\s*pending\b/, ""), img!, el.dataset.alt ?? "");
    const btn = tmp.firstElementChild as HTMLElement;
    btn.classList.add("fade-in");
    el.replaceWith(btn);
  };
  pre.onerror = () => {
    resolved.set(data, null);
    el.remove();
  };
  pre.src = img.thumb;
}

// ---------------------------------------------------------------------------
// ライトボックス

let lightbox: HTMLElement | null = null;
let lastFocus: HTMLElement | null = null;
let openCount = 0;

function setupLightbox() {
  if (lightbox) return;
  lightbox = document.createElement("div");
  lightbox.className = "wlightbox";
  lightbox.hidden = true;
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.innerHTML = `<figure>
      <img alt="">
      <figcaption><span class="wl-title"></span><span class="wl-credit">画像：<a target="_blank" rel="noopener">Wikipedia</a></span></figcaption>
    </figure>
    <button type="button" class="wl-close" aria-label="閉じる">×</button>`;
  document.body.appendChild(lightbox);

  lightbox.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest("a")) return; // 元記事へのリンク
    if (t.closest(".wl-close") || !t.closest("figure img, figcaption")) closeLightbox();
  });

  document.addEventListener("click", (e) => {
    const b = (e.target as Element).closest?.<HTMLElement>(".wimg.ok");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    openLightbox(b);
  });

  // 開いている間のキーは地図側（年の移動など）に渡さない
  window.addEventListener(
    "keydown",
    (e) => {
      if (!lightbox || lightbox.hidden) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key !== "Tab") {
        e.stopPropagation();
        if (e.key === "Escape" || e.key.startsWith("Arrow")) e.preventDefault();
      }
    },
    true,
  );
}

function openLightbox(b: HTMLElement) {
  if (!lightbox) return;
  const img = lightbox.querySelector("img")!;
  const thumb = b.querySelector("img")?.getAttribute("src") ?? "";
  // まずサムネイルを出し、大きい画像が読めたら差し替える
  const token = ++openCount;
  img.src = thumb;
  img.alt = b.dataset.title ?? "";
  const large = b.dataset.large;
  if (large && large !== thumb) {
    const pre = new Image();
    pre.onload = () => {
      if (!lightbox!.hidden && token === openCount) img.src = large;
    };
    pre.src = large;
  }
  lightbox.querySelector(".wl-title")!.textContent = b.dataset.title ?? "";
  const a = lightbox.querySelector<HTMLAnchorElement>(".wl-credit a")!;
  a.href = b.dataset.page ?? "#";
  lastFocus = b;
  lightbox.hidden = false;
  document.documentElement.classList.add("wlightbox-open");
  lightbox.querySelector<HTMLElement>(".wl-close")!.focus();
}

function closeLightbox() {
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  document.documentElement.classList.remove("wlightbox-open");
  lightbox.querySelector("img")!.removeAttribute("src");
  lastFocus?.focus({ preventScroll: true });
  lastFocus = null;
}
