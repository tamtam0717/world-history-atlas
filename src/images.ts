// Wikipedia の記事から画像（君主の肖像・国旗・出来事や潮流の絵）を取ってきてパネルに表示する。
// 画像はリポジトリに入れず、閲覧時に Wikipedia の REST API（代表画像は page/summary、ギャラリーは page/media-list）から取得する。
//
// 使い方：
//   1. パネルの HTML を組み立てるときに imageSlot(...) で空の差し込み口を置く（場所は取らない）
//   2. innerHTML を入れたあとで hydrateImages(container) を呼ぶ
//      → 画面に入った差し込み口だけ、API を引いて画像を入れる（取れなければ差し込み口ごと消す）
//   3. 画像のクリックで大きく表示（ライトボックス）
//
// ギャラリー（出来事・潮流・情勢）：gallerySlot(...) で差し込み口を置く。
//   記事の中の画像の一覧（REST API の page/media-list）から、絵画・写真・地図などを説明文つきで複数並べる。
//   データに images: [{ file, caption }]（Wikimedia Commons のファイル名）が書いてあれば、それを先頭に出す。
//   ライトボックスでは、同じギャラリーの前後の画像へ ← → ・スワイプで移れる。

import "./images.css";
import type { DataImage } from "./data";

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

export type ImageKind = "portrait" | "emblem";

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
  if (!orig?.source) return th;
  if (!orig.width || orig.width <= W || /\.svg$/i.test(orig.source)) return orig.source;
  const m = th.match(/^(.*\/)(\d+)px-([^/]+)$/);
  return m ? `${m[1]}${W}px-${m[3]}` : orig.source;
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
  const src = img.thumb;
  return `<button type="button" class="${cls} ok" data-large="${escAttr(img.large)}" data-page="${escAttr(img.pageUrl)}" data-title="${escAttr(
    img.pageTitle,
  )}" aria-label="${escAttr(alt || img.pageTitle)}の画像を拡大"><img src="${escAttr(src)}" alt="${escAttr(alt || img.pageTitle)}" decoding="async"></button>`;
}

let observer: IntersectionObserver | null = null;

function getObserver() {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          observer!.unobserve(e.target);
          const el = e.target as HTMLElement;
          observed.delete(el);
          if (el.dataset.wgal != null) loadGallery(el);
          else load(el);
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
  root.querySelectorAll<HTMLElement>(".wimg.pending[data-wimg], .wimg.pending[data-wgal]").forEach((el) => {
    observed.add(el);
    ob.observe(el);
  });
}

async function load(el: HTMLElement) {
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
// ギャラリー（記事の中の画像の一覧：REST API の page/media-list）
//
// media-list の応答（mediawiki-services-mobileapps の lib/media.js・spec/page/media-list.yaml で確認）：
//   { revision, tid, items: [{ title: "File:…"（記事の言語の名前空間名のことがある）, type: "image" | "video" | "audio",
//     leadImage: boolean, section_id, showInGallery, caption?: { html, text },
//     srcset?: [{ src: "//upload.wikimedia.org/wikipedia/commons/thumb/a/ab/名前.jpg/250px-名前.jpg", scale: "1x" | "1.5x" | "2x" }] }] }
//   ・記事に表示される大きさが 48px 未満のもの、.metadata・.noviewer の中のもの（ナビゲーションの小さなアイコンなど）は API の側で除かれている
//   ・srcset の幅は MediaWiki の標準の幅（120・250・330・500・960・1280…）で、元の画像より小さいものだけが入る


/**
 * ギャラリーの種類
 *   g1：大きな代表画像＋横に流せるサムネイル（説明文つき）。重要度 1 の出来事・潮流
 *   g2：小さなサムネイルの帯。重要度 2 の出来事
 *   g3：1 枚だけ小さく右に。重要度 3 の出来事
 *   gp：小さなサムネイルの帯（データに書いた画像だけ。API は引かない）。国の情勢
 */
export type GalleryKind = "g1" | "g2" | "g3" | "gp";

const GALLERY_MAX: Record<GalleryKind, number> = { g1: 6, g2: 4, g3: 1, gp: 4 };

interface GalleryItem {
  /** ファイル名（空白区切り。重複の判定用） */
  file: string;
  /** 幅 {W} を入れるとサムネイルの URL になるもの（Commons の thumb URL か Special:FilePath） */
  tmpl: string;
  /** 確実に取れる最大の幅（これより大きい幅は元の画像を超えるかもしれない）。Infinity は制限なし（SVG・FilePath） */
  safe: number;
  /** 元画像の URL（srcset に入っていたとき） */
  orig?: string;
  caption: string;
  /** Commons のファイルページ */
  filePage: string;
  /** 取ってきた記事（データに書いた画像は undefined） */
  article?: { lang: string; title: string };
}

interface MediaListItem {
  title?: string;
  type?: string;
  leadImage?: boolean;
  caption?: { html?: string; text?: string };
  srcset?: { src: string; scale?: string }[];
}

const WIDTHS = [120, 250, 330, 500, 960, 1280];

const mediaCache = new Map<string, Promise<MediaListItem[] | null>>();
const enTitleCache = new Map<string, Promise<string | null>>();
const galleryResolved = new Map<string, GalleryItem[]>();
/** 読めなかった画像ファイル（以後は出さない） */
const badFiles = new Set<string>();

const wikiPath = (title: string) => encodeURIComponent(title.replace(/ /g, "_"));

function fetchJson<T>(url: string): Promise<T | null> {
  return limited(async () => {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  });
}

function fetchMediaList(r: WikiRef): Promise<MediaListItem[] | null> {
  const k = refKey(r);
  let p = mediaCache.get(k);
  if (!p) {
    p = fetchJson<{ items?: MediaListItem[] }>(`https://${r.lang}.wikipedia.org/api/rest_v1/page/media-list/${wikiPath(r.title)}`).then((j) =>
      j && Array.isArray(j.items) ? j.items : null,
    );
    mediaCache.set(k, p);
  }
  return p;
}

/** 日本語などの記事に対応する英語版の記事名（言語間リンク。MediaWiki の action API、origin=* で CORS） */
function fetchEnTitle(r: WikiRef): Promise<string | null> {
  const k = refKey(r);
  let p = enTitleCache.get(k);
  if (!p) {
    const url = `https://${r.lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1&prop=langlinks&lllang=en&titles=${encodeURIComponent(r.title)}`;
    p = fetchJson<{ query?: { pages?: { langlinks?: { title?: string }[] }[] } }>(url).then((j) => j?.query?.pages?.[0]?.langlinks?.[0]?.title ?? null);
    enTitleCache.set(k, p);
  }
  return p;
}

/** 出さないファイル：国旗・紋章・ロゴ・アイコン・署名・位置図など */
const SKIP_FILE =
  /(^|[_ \-(])(flag|flags|coat[_ ]of[_ ]arms|coa|wappen|escudo|blason|stemma|herb|emblem|logo|icon|symbol|seal|signature|autograph|unterschrift|firma|monogram|cypher|royal[_ ]standard|standard[_ ]of|locator|location[_ ]map|pog|ambox|commons-logo|wikisource|wikiquote|wiktionary|question[_ ]book|edit-clear|padlock|disambig|crystal|nuvola|gnome-|increase|decrease|steady|red[_ ]x|green[_ ]check|yes[_ ]check|x[_ ]mark|blank|placeholder|no[_ ]image|国旗|紋章|花押)([_ .\-)]|$)/i;
const PORTRAIT = /portrait|肖像|bildnis|retrato|ritratto|portret/i;
const MAPLIKE = /(^|[_ \-(])(map|karte|carte|mapa|地図)([_ .\-)]|$)/i;

/** media-list の 1 項目を、出せる画像に直す（出さないものは null） */
function fromMediaItem(it: MediaListItem, r: WikiRef): GalleryItem | null {
  if (it.type !== "image" || !it.srcset?.length) return null;
  let tmpl = "";
  let safe = 0;
  let w1 = 0;
  let orig: string | undefined;
  let file = "";
  for (const s of it.srcset) {
    // 実際の応答は //thumb.wikimedia.org/wikipedia/commons/thumb/…/500px-名前.jpg?utm_source=… の形（2026-11 に確認）。upload.wikimedia.org のこともある
    const url = (s.src.startsWith("//") ? "https:" + s.src : s.src).replace(/[?#].*$/, "");
    if (!/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(url)) return null; // Commons にない（各言語版だけの、自由利用でない画像など）は使わない
    const m = url.match(/^(https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/)thumb\/([0-9a-f]\/[0-9a-f]{2}\/([^/]+))\/((?:[a-z0-9]+-)*?)(\d+)px-([^/]+)$/i);
    if (m) {
      const w = +m[5];
      tmpl = `${m[1]}thumb/${m[2]}/${m[4]}{W}px-${m[6]}`;
      safe = Math.max(safe, w);
      if (!s.scale || s.scale === "1x") w1 = w;
      file = m[3];
    } else {
      const o = url.match(/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)$/i);
      if (o) {
        orig = url;
        file = o[1];
      }
    }
  }
  if (!tmpl || !file) return null; // サムネイルがない＝元の画像が記事の表示より小さい
  try {
    file = decodeURIComponent(file);
  } catch {
    /* そのまま */
  }
  const name = file.replace(/_/g, " ");
  if (SKIP_FILE.test(name) || SKIP_FILE.test(file)) return null;
  const svg = /\.svg$/i.test(file);
  if (w1 && w1 < 100) return null; // 記事の中でも小さく出ているもの（表の中の小さな画像など）
  if (svg && (w1 || safe) < 220) return null; // 小さな SVG は図案・記号のことが多い
  if (svg) safe = Infinity;
  const cap = (it.caption?.text ?? "").replace(/\[\d+\]|\[注釈?\s*\d+\]/g, "").replace(/\s+/g, " ").trim();
  return { file: name, tmpl, safe, orig, caption: cap, filePage: `https://commons.wikimedia.org/wiki/File:${wikiPath(name)}`, article: { lang: r.lang, title: r.title } };
}

function fromData(d: DataImage): GalleryItem | null {
  const name = String(d?.file ?? "")
    .replace(/^(file|image|ファイル|画像)\s*:/i, "")
    .replace(/_/g, " ")
    .trim();
  if (!name) return null;
  return {
    file: name,
    tmpl: `https://commons.wikimedia.org/wiki/Special:FilePath/${wikiPath(name)}?width={W}`,
    safe: Infinity,
    caption: d.caption ?? "",
    filePage: `https://commons.wikimedia.org/wiki/File:${wikiPath(name)}`,
  };
}

/** 記事の画像を、出す順に並べる（記事の代表画像 → 絵・写真 → 地図 → 肖像） */
function rankItems(items: { it: GalleryItem; lead: boolean }[]): GalleryItem[] {
  const score = (x: { it: GalleryItem; lead: boolean }) =>
    (x.lead ? 0 : 1) + (PORTRAIT.test(x.it.file + " " + x.it.caption) ? 3 : MAPLIKE.test(x.it.file) ? 2 : 1);
  return items
    .map((x, i) => [x, i] as const)
    .sort((a, b) => score(a[0]) - score(b[0]) || a[1] - b[1])
    .map((x) => x[0].it);
}

async function articleImages(r: WikiRef): Promise<GalleryItem[]> {
  const list = await fetchMediaList(r);
  if (!list) return [];
  const out: { it: GalleryItem; lead: boolean }[] = [];
  for (const m of list) {
    const it = fromMediaItem(m, r);
    if (it) out.push({ it, lead: !!m.leadImage });
  }
  return rankItems(out);
}

async function resolveGallery(refs: WikiRef[], own: DataImage[], kind: GalleryKind): Promise<GalleryItem[]> {
  const max = GALLERY_MAX[kind];
  const out: GalleryItem[] = [];
  const seen = new Set<string>();
  const add = (list: (GalleryItem | null)[]) => {
    for (const it of list) {
      if (!it || out.length >= max * 2) continue; // 読めない画像のために少し多めに持っておく
      const k = it.file.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
  };
  add(own.map(fromData));
  if (kind === "gp") return out;
  // 記事の数が少ないときは、出典の次の記事（英語版など）からも足す
  const enough = Math.min(max, 3);
  const tried = new Set<string>();
  for (const r of refs) {
    if (out.length >= enough) break;
    tried.add(refKey(r));
    add(await articleImages(r));
  }
  // 出典に英語版の記事がなく、まだ少ないときは、言語間リンクで英語版を探す
  if (out.length < enough && kind !== "g3") {
    const base = refs.find((r) => r.lang !== "en");
    if (base) {
      const t = await fetchEnTitle(base);
      if (t && !tried.has(refKey({ lang: "en", title: normTitle(t) }))) add(await articleImages({ lang: "en", title: normTitle(t) }));
    }
  }
  // 画像の一覧が取れなかったとき（API の障害など）は、これまでどおり記事の代表画像（page/summary）を1枚だけ出す
  if (!out.length && refs.length) {
    const img = await resolveImage(refs).catch(() => null);
    if (img) {
      const m = img.thumb.match(/^(.*\/)(\d+)px-([^/]+)$/);
      const file = decodeURIComponent((img.thumb.split("/").pop() ?? "").replace(/^\d+px-/, "")).replace(/_/g, " ");
      out.push({
        file: file || img.thumb,
        tmpl: m ? `${m[1]}{W}px-${m[3]}` : img.thumb,
        safe: m ? Number(m[2]) : Infinity,
        orig: img.large,
        caption: "",
        filePage: img.pageUrl,
        article: { lang: img.lang, title: img.pageTitle },
      });
    }
  }
  return out;
}

/** 標準の幅のうち、want 以上で最小のもの（元の画像を超えない範囲で） */
function itemUrl(it: GalleryItem, want: number): string {
  let w = WIDTHS.find((x) => x >= want) ?? 1280;
  if (w > it.safe) w = it.safe;
  return it.tmpl.replace("{W}", String(w));
}

/** ライトボックスで試す URL（大きい順。読めなければ次へ） */
function largeCandidates(it: GalleryItem): string[] {
  const c: string[] = [];
  if (it.safe === Infinity) c.push(it.tmpl.replace("{W}", "1280"));
  else {
    if (it.safe < 1280) {
      // 元の画像の大きさはわからないので、大きい幅から試す
      for (const w of [1280, 960]) if (w > it.safe) c.push(it.tmpl.replace("{W}", String(w)));
      if (it.orig) c.push(it.orig);
    } else c.push(it.tmpl.replace("{W}", "1280"));
    c.push(it.tmpl.replace("{W}", String(it.safe)));
  }
  return [...new Set(c)];
}

const ownKey = (own: DataImage[]) => own.map((d) => [d.file, d.caption ?? ""]);

/**
 * ギャラリーの差し込み口。出典の記事も手で書いた画像もなければ空文字。
 * 取れたら、絵・写真が説明文つきで並ぶ（取れなければ何も出さない）
 */
export function gallerySlot(refs: WikiRef[], own: DataImage[] | undefined, kind: GalleryKind, alt = ""): string {
  const mine = (own ?? []).filter((d) => d && typeof d.file === "string" && d.file);
  if (!mine.length && (kind === "gp" || !refs.length)) return "";
  const data = JSON.stringify({ k: kind, r: kind === "gp" ? [] : refs.map((r) => [r.lang, r.title]), o: ownKey(mine) });
  const hit = galleryResolved.get(data);
  if (hit) return galleryHtml(kind, usable(hit, kind), alt);
  return `<span class="wimg wgal-slot wgal-slot-${kind} pending" data-wgal="${escAttr(data)}" data-alt="${escAttr(alt)}"></span>`;
}

const usable = (items: GalleryItem[], kind: GalleryKind) => items.filter((x) => !badFiles.has(x.file)).slice(0, GALLERY_MAX[kind]);

function thumbButton(it: GalleryItem, i: number, cls: string, want: number, alt: string, withCap: boolean): string {
  const cap = it.caption || "";
  const credit = it.article ? articleUrl(it.article) : "";
  const label = cap || alt || it.file;
  return `<button type="button" class="wimg ok ${cls}" data-i="${i}" data-file="${escAttr(it.file)}" data-large="${escAttr(largeCandidates(it).join(" "))}" data-cap="${escAttr(
    cap || it.file.replace(/\.[a-z0-9]+$/i, ""),
  )}" data-fpage="${escAttr(it.filePage)}"${credit ? ` data-page="${escAttr(credit)}" data-title="${escAttr(it.article!.title)}" data-lang="${escAttr(it.article!.lang)}"` : ""} title="${escAttr(
    label,
  )}" aria-label="${escAttr(label)}（拡大）"><span class="wg-img"><img src="${escAttr(itemUrl(it, want))}" alt="${escAttr(label)}" decoding="async"${cls === "wg-th" ? ` loading="lazy"` : ""}></span>${
    withCap && cap ? `<span class="wg-cap">${escAttr(cap)}</span>` : ""
  }</button>`;
}

function galleryHtml(kind: GalleryKind, items: GalleryItem[], alt: string, extra = ""): string {
  if (!items.length) return "";
  const n = items.length;
  let inner = "";
  if (kind === "g1") {
    inner += thumbButton(items[0], 0, "wg-hero", 500, alt, true);
    if (n > 1) inner += `<div class="wg-strip">${items.slice(1).map((it, i) => thumbButton(it, i + 1, "wg-th", 250, alt, true)).join("")}</div>`;
  } else if (kind === "g3") {
    inner += thumbButton(items[0], 0, "wg-one", 250, alt, false);
  } else {
    inner += `<div class="wg-strip">${items.map((it, i) => thumbButton(it, i, "wg-th", 250, alt, kind === "gp")).join("")}</div>`;
  }
  return `<div class="wgal wgal-${kind}${extra}" data-n="${n}">${inner}</div>`;
}

async function loadGallery(el: HTMLElement) {
  const data = el.dataset.wgal!;
  let items = galleryResolved.get(data);
  let kind: GalleryKind = "g2";
  try {
    const j = JSON.parse(data) as { k: GalleryKind; r: [string, string][]; o: [string, string][] };
    kind = j.k;
    if (!items) {
      items = await resolveGallery(
        j.r.map(([lang, title]) => ({ lang, title })),
        j.o.map(([file, caption]) => ({ file, caption })),
        kind,
      );
      galleryResolved.set(data, items);
    }
  } catch {
    items = [];
  }
  // 最初の 1 枚が読めてから出す（読めなければ次の画像で試す）
  for (let tries = 0; tries < 3; tries++) {
    if (!el.isConnected) return;
    const list = usable(items, kind);
    if (!list.length) break;
    const first = list[0];
    const ok = await new Promise<boolean>((res) => {
      const pre = new Image();
      pre.decoding = "async";
      pre.onload = () => res(true);
      pre.onerror = () => res(false);
      pre.src = itemUrl(first, kind === "g1" ? 500 : 250);
    });
    if (!ok) {
      badFiles.add(first.file);
      continue;
    }
    if (!el.isConnected) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = galleryHtml(kind, list, el.dataset.alt ?? "", " fade-in");
    const g = tmp.firstElementChild;
    if (g) {
      el.replaceWith(g);
      return;
    }
    break;
  }
  el.remove();
}

/** ギャラリーの中の画像が読めなかったら、その 1 枚だけ消す（全部消えたらギャラリーごと） */
function onImgError(e: Event) {
  const img = e.target as Element;
  if (!(img instanceof HTMLImageElement)) return;
  const b = img.closest<HTMLElement>(".wgal .wimg.ok");
  if (!b) return;
  const g = b.closest(".wgal")!;
  if (b.dataset.file) badFiles.add(b.dataset.file);
  b.remove();
  g.querySelectorAll(".wg-strip:empty").forEach((s) => s.remove());
  if (!g.querySelector(".wimg.ok")) g.remove();
}

// ---------------------------------------------------------------------------
// ライトボックス（ギャラリーの中は ← → ・スワイプで前後へ）

let lightbox: HTMLElement | null = null;
let lastFocus: HTMLElement | null = null;
let openCount = 0;
let group: HTMLElement[] = [];
let cur = 0;

function setupLightbox() {
  if (lightbox) return;
  lightbox = document.createElement("div");
  lightbox.className = "wlightbox";
  lightbox.hidden = true;
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.innerHTML = `<figure>
      <div class="wl-stage"><img alt=""></div>
      <figcaption><span class="wl-title"></span><span class="wl-credit"></span></figcaption>
    </figure>
    <button type="button" class="wl-nav wl-prev" aria-label="前の画像">‹</button>
    <button type="button" class="wl-nav wl-next" aria-label="次の画像">›</button>
    <span class="wl-count" aria-live="polite"></span>
    <button type="button" class="wl-close" aria-label="閉じる">×</button>`;
  document.body.appendChild(lightbox);
  document.addEventListener("error", onImgError, true);

  lightbox.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest("a")) return; // 元記事・ファイルページへのリンク
    if (t.closest(".wl-prev")) return step(-1);
    if (t.closest(".wl-next")) return step(1);
    if (t.closest(".wl-close") || !t.closest("figure img, figcaption")) closeLightbox();
  });

  // スワイプで前後へ
  let sx = 0;
  let sy = 0;
  let st = 0;
  lightbox.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
    },
    { passive: true },
  );
  lightbox.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    if (!t || !st) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    st = 0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      e.preventDefault(); // 続くクリック（閉じる）を出さない
      step(dx < 0 ? 1 : -1);
    }
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
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      if (e.key !== "Tab") {
        e.stopPropagation();
        if (e.key === "Escape" || e.key.startsWith("Arrow")) e.preventDefault();
      }
    },
    true,
  );
}

function step(d: number) {
  if (group.length < 2) return;
  cur = (cur + d + group.length) % group.length;
  show(group[cur]);
}

function show(b: HTMLElement) {
  if (!lightbox) return;
  const img = lightbox.querySelector("img")!;
  const thumb = b.querySelector("img")?.getAttribute("src") ?? "";
  // まずサムネイルを出し、大きい画像が読めたら差し替える（大きい順に試す）
  const token = ++openCount;
  img.src = thumb;
  img.alt = b.dataset.cap ?? b.dataset.title ?? "";
  const cands = (b.dataset.large ?? "").split(" ").filter((u) => u && u !== thumb);
  const tryNext = () => {
    const u = cands.shift();
    if (!u) return;
    const pre = new Image();
    pre.onload = () => {
      if (!lightbox!.hidden && token === openCount) img.src = u;
    };
    pre.onerror = () => {
      if (token === openCount) tryNext();
    };
    pre.src = u;
  };
  tryNext();
  lightbox.querySelector(".wl-title")!.textContent = b.dataset.cap ?? b.dataset.title ?? "";
  const credit: string[] = [];
  if (b.dataset.fpage) credit.push(`画像：<a target="_blank" rel="noopener" href="${escAttr(b.dataset.fpage)}">Wikimedia Commons</a>`);
  if (b.dataset.page)
    credit.push(
      `${b.dataset.fpage ? "記事" : "画像"}：<a target="_blank" rel="noopener" href="${escAttr(b.dataset.page)}">Wikipedia${
        b.dataset.fpage && b.dataset.title ? `「${escAttr(b.dataset.title)}」${b.dataset.lang && b.dataset.lang !== "ja" ? `（${escAttr(b.dataset.lang)}）` : ""}` : ""
      }</a>`,
    );
  lightbox.querySelector(".wl-credit")!.innerHTML = credit.join("<span class=\"wl-sep\">・</span>");
  const multi = group.length > 1;
  lightbox.classList.toggle("multi", multi);
  lightbox.querySelector(".wl-count")!.textContent = multi ? `${cur + 1} / ${group.length}` : "";
}

function openLightbox(b: HTMLElement) {
  if (!lightbox) return;
  const g = b.closest(".wgal");
  group = g ? [...g.querySelectorAll<HTMLElement>(".wimg.ok")] : [b];
  cur = Math.max(0, group.indexOf(b));
  show(b);
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
  group = [];
  lastFocus?.focus({ preventScroll: true });
  lastFocus = null;
}
