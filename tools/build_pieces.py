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
        if iso in cfg["fine"]:
            parts.append(build_fine(iso, cfg["fine"][iso], base))
        else:
            b = base[["shapeName", "geometry"]].copy()
            b["iso"] = iso
            b["src"] = f"geoBoundaries CGAZ {lvl}"
            parts.append(b)

    g = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs="EPSG:4326")
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
