"""ピース（地図の最小区画）の元データを作る。

入力（.cache/src/ 以下。tools/fetch_sources.sh で取得）:
  - geoBoundaries CGAZ ADM1 / ADM2（国境が全世界で整合済み）
  - 一部の国だけ、より細かい geoBoundaries の国別データ（pieces_config.json の "fine"）

出力:
  - .cache/pieces_raw.geojson（簡略化前）。この後 mapshaper で位相を整理・簡略化して
    public/data/pieces.topo.json を作る（tools/build_pieces.sh）。

ピースの ID は「国コード-名前のスラッグ」。所属データがこの ID を参照するので、
一度決めた ID は変えないこと（変える場合は data/ 側も一括で書き換える）。
"""

import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".cache" / "src"
OUT = ROOT / ".cache" / "pieces_raw.geojson"

# CGAZ の係争地などは国コードが数字になっている
DISPUTED_NAMES = {}


def slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")
    return s or "x"


def read_cgaz(level: str, bbox) -> gpd.GeoDataFrame:
    g = gpd.read_file(SRC / "cgaz" / f"geoBoundariesCGAZ_{level}.shp", bbox=bbox, engine="pyogrio")
    g["level"] = level
    return g


def main():
    cfg = json.loads((ROOT / "tools" / "pieces_config.json").read_text())
    w, s, e, n = cfg["bbox"]
    clip = box(w, s, e, n)
    bbox = (w, s, e, n)

    adm1 = read_cgaz("ADM1", bbox)
    adm2 = read_cgaz("ADM2", bbox)
    countries = sorted(set(adm1.shapeGroup) | set(adm2.shapeGroup))

    parts = []
    for iso in countries:
        lvl = cfg["cgaz_level"].get(iso, cfg["default_level"])
        base = (adm1 if lvl == "ADM1" else adm2)
        base = base[base.shapeGroup == iso]
        if len(base) == 0:
            base = adm1[adm1.shapeGroup == iso]
            lvl = "ADM1"
        if iso in cfg.get("adm2_within", {}):
            names = set(cfg["adm2_within"][iso])
            a1c = adm1[adm1.shapeGroup == iso]
            keep = a1c[~a1c.shapeName.isin(names)]
            a2c = adm2[adm2.shapeGroup == iso]
            pts = gpd.GeoDataFrame(a2c[["shapeName"]], geometry=a2c.geometry.representative_point(), crs=a2c.crs)
            inside = gpd.sjoin(pts, a1c[a1c.shapeName.isin(names)][["geometry"]], predicate="within")
            sub = a2c.loc[sorted(set(inside.index))]
            base = pd.concat([keep, sub])
            lvl = "ADM1+ADM2"
        if iso in cfg["fine"]:
            parts.append(build_fine(iso, cfg["fine"][iso], base))
        else:
            b = base[["shapeName", "geometry"]].copy()
            b["iso"] = iso
            b["src"] = f"geoBoundaries CGAZ {lvl}"
            parts.append(b)

    g = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs="EPSG:4326")
    g = apply_splits(g, cfg.get("split", []))
    for spec in cfg.get("clip", []):
        g = apply_clip(g, spec)
    g["geometry"] = g.geometry.make_valid().intersection(clip)
    g = g[~g.geometry.is_empty & g.geometry.notna()]
    g = g[g.geometry.geom_type.isin(["Polygon", "MultiPolygon", "GeometryCollection"])]
    g["geometry"] = g.geometry.apply(polys_only)
    g = g[~g.geometry.is_empty]
    # 面積が極端に小さい断片（bbox の端など）は捨てる
    g = g[g.to_crs("EPSG:3035").area > 2e5]

    # ID を付ける（同名は重心の西→東順で _2, _3 ...）
    g["shapeName"] = g["shapeName"].fillna("").astype(str).replace("", "unnamed")
    g["cx"] = g.geometry.representative_point().x
    g = g.sort_values(["iso", "shapeName", "cx"]).reset_index(drop=True)
    seen = defaultdict(int)
    ids = []
    for iso, name in zip(g.iso, g.shapeName):
        base_id = f"{iso}-{slug(name)}"
        seen[base_id] += 1
        ids.append(base_id if seen[base_id] == 1 else f"{base_id}_{seen[base_id]}")
    g["id"] = ids
    # 現代の第1級行政区（州・県など）の名前を付ける。地域を定義するときの絞り込みに使う
    pts = gpd.GeoDataFrame(geometry=g.geometry.representative_point(), crs=g.crs)
    a1 = adm1[["shapeName", "shapeGroup", "geometry"]].rename(columns={"shapeName": "adm1", "shapeGroup": "a1iso"})
    j = gpd.sjoin(pts, a1, how="left", predicate="within")
    j = j[~j.index.duplicated()]
    g["adm1"] = j["adm1"].where(j["a1iso"] == g["iso"]).fillna("")
    # 細かいデータを使った国では、CGAZ ADM2（例：ドイツの県、フランスの県、イタリアの州）を adm2 として付ける
    a2 = adm2[adm2.shapeGroup.isin(list(cfg["fine"].keys()))][["shapeName", "shapeGroup", "geometry"]]
    a2 = a2.rename(columns={"shapeName": "adm2", "shapeGroup": "a2iso"})
    j2 = gpd.sjoin(pts, a2, how="left", predicate="within")
    j2 = j2[~j2.index.duplicated()]
    g["adm2"] = j2["adm2"].where(j2["a2iso"] == g["iso"]).fillna("")
    g = g.rename(columns={"shapeName": "name"})[["id", "name", "iso", "adm1", "adm2", "src", "geometry"]]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    g.to_file(OUT, driver="GeoJSON", engine="pyogrio")
    counts = g.groupby("iso").size().sort_values(ascending=False)
    print(f"pieces: {len(g)}", file=sys.stderr)
    print(counts.head(40).to_string(), file=sys.stderr)


def apply_splits(g, specs):
    """島などを別ピースに分ける。分けた部分の名前は「元の名前 + suffix」になる"""
    from shapely.geometry import MultiPolygon, box as sbox

    rows = []
    for spec in specs:
        m = (g.iso == spec["iso"]) & (g.shapeName == spec["name"])
        for idx in g[m].index:
            geom = g.at[idx, "geometry"]
            polys = list(getattr(geom, "geoms", [geom]))
            for part in spec["parts"]:
                bb = sbox(*part["bbox"])
                taken = [p for p in polys if bb.contains(p.representative_point())]
                if not taken:
                    continue
                polys = [p for p in polys if p not in taken]
                r = g.loc[idx].copy()
                r["shapeName"] = f'{spec["name"]} {part["suffix"]}'
                r["geometry"] = MultiPolygon(taken)
                rows.append(r)
            g.at[idx, "geometry"] = MultiPolygon(polys)
    if rows:
        g = gpd.GeoDataFrame(pd.concat([g, gpd.GeoDataFrame(rows, crs=g.crs)], ignore_index=True), crs=g.crs)
    return g


def apply_clip(g, spec, cell=0.1):
    """壊れたピースを bbox で切り取り、はみ出した部分は小さな格子に分けて、
    それぞれ境界を最も長く共有する隣のピースに吸収させる（穴をあけないため）"""
    import numpy as np

    m = (g.iso == spec["iso"]) & (g.shapeName == spec["name"])
    idxs = list(g[m].index)
    bb = box(*spec["bbox"])
    for idx in idxs:
        geom = g.at[idx, "geometry"]
        rest = geom.difference(bb)
        g.at[idx, "geometry"] = geom.intersection(bb)
        if rest.is_empty:
            continue
        x0, y0, x1, y1 = rest.bounds
        others = g.drop(index=idx)
        sidx = others.sindex
        for x in np.arange(x0, x1, cell):
            for y in np.arange(y0, y1, cell):
                chunk = rest.intersection(box(x, y, x + cell, y + cell))
                if chunk.is_empty or chunk.area < 1e-9:
                    continue
                ring = chunk.buffer(1e-5)
                best, best_len = None, 0.0
                for j in sidx.query(ring):
                    oi = others.index[j]
                    l = ring.intersection(g.at[oi, "geometry"].boundary).length
                    if l > best_len:
                        best, best_len = oi, l
                if best is None:
                    best = others.index[int(np.argmin(others.geometry.distance(chunk).values))]
                g.at[best, "geometry"] = unary_union([g.at[best, "geometry"], chunk])
    return g


def polys_only(geom):
    from shapely.geometry import MultiPolygon, Polygon

    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    ps = []
    for p in getattr(geom, "geoms", []):
        if p.geom_type == "Polygon":
            ps.append(p)
        elif p.geom_type == "MultiPolygon":
            ps.extend(p.geoms)
    return MultiPolygon(ps) if ps else Polygon()


def build_fine(iso, spec, base):
    """細かい国別データを、CGAZ の国の外形に合わせて切り抜く。

    外形からはみ出した部分は捨て、外形の中で細かいデータが覆っていない隙間は、
    境界を最も長く共有する隣のピースに吸収させる。
    """
    outline = unary_union(base.geometry.make_valid().values)
    f = gpd.read_file(SRC / spec["path"], engine="pyogrio")[["shapeName", "geometry"]]
    f["geometry"] = f.geometry.make_valid().intersection(outline).apply(polys_only)
    f = f[~f.geometry.is_empty].reset_index(drop=True)

    covered = unary_union(f.geometry.values)
    gaps = outline.difference(covered)
    gap_list = list(getattr(gaps, "geoms", [gaps])) if not gaps.is_empty else []
    geoms = list(f.geometry.values)
    sindex = f.sindex
    for gp in gap_list:
        if gp.geom_type != "Polygon" or gp.area < 1e-10:
            continue
        cand = list(sindex.query(gp.buffer(1e-6)))
        best, best_len = None, 0.0
        for i in cand:
            l = gp.buffer(1e-6).intersection(geoms[i].boundary).length
            if l > best_len:
                best, best_len = i, l
        if best is None:
            # 接していない島などは、最も近いピースへ
            dists = f.geometry.distance(gp)
            best = int(dists.idxmin())
        geoms[best] = unary_union([geoms[best], gp])
    f["geometry"] = geoms
    f["iso"] = iso
    f["src"] = spec["source"]
    return f


if __name__ == "__main__":
    main()
