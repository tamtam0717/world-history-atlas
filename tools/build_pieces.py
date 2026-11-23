"""ピース（地図の最小区画）の元データを作る。

入力（.cache/src/ 以下。tools/fetch_sources.sh で取得）:
  - geoBoundaries CGAZ ADM1 / ADM2（国境が全世界で整合済み）
  - 一部の国だけ、より細かい geoBoundaries の国別データ（pieces_config.json の "fine"）

範囲:
  - pieces_config.json の bbox（ヨーロッパと周辺）の中は、国ごとの設定（ADM2・細かいデータ・
    adm2_within・split・clip）で細かく作る（zone=eu）。bbox の端で切られる区画も、形は切らずに全体を使う。
  - bbox の外（全世界）は CGAZ ADM1 を基本にする（zone=world）。中国は地級単位（tools/chn_pieces.py、
    pieces_config.json の "chn"）。南アジア・東南アジアの一部の国（州）は CGAZ ADM2 単位（"world_adm2"）。CGAZ に欠けている区画は Natural Earth で補う（"add_from_ne"）。bbox にかかる国で ADM2 を使う国は、
    範囲外の ADM2 を親の ADM1 ごとにまとめる。

出力:
  - .cache/pieces_raw.geojson（簡略化前）。この後 mapshaper で位相を整理・簡略化して
    public/data/pieces.topo.json を作る（tools/build_pieces.sh）。

ピースの ID は「国コード-名前のスラッグ」。所属データがこの ID を参照するので、
一度決めた ID は変えないこと（変える場合は data/ 側も一括で書き換える）。
zone=eu の ID は、全世界に広げる前と同じ手順（bbox で切った形の重心で同名を並べる）で決める。
zone=world の ID は、zone=eu の ID と重ならないように後から付ける。
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


def read_cgaz(level: str, bbox=None) -> gpd.GeoDataFrame:
    g = gpd.read_file(SRC / "cgaz" / f"geoBoundariesCGAZ_{level}.shp", bbox=bbox, engine="pyogrio")
    g["level"] = level
    return g


def country_base(iso, cfg, adm1, adm2):
    """国のピースの元になる区画（設定の行政レベル）。行ごとに level（ADM1/ADM2）を持つ"""
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
    return base, lvl


def main():
    cfg = json.loads((ROOT / "tools" / "pieces_config.json").read_text())
    w, s, e, n = cfg["bbox"]
    clip = box(w, s, e, n)
    bbox = (w, s, e, n)

    # ---- 範囲内（zone=eu）：全世界に広げる前と同じ手順。ID もここで決める ----
    adm1 = read_cgaz("ADM1", bbox)
    adm2 = read_cgaz("ADM2", bbox)
    countries = sorted(set(adm1.shapeGroup) | set(adm2.shapeGroup))

    parts = []
    used = set()  # 範囲内のピースに使った CGAZ の区画（shapeID）
    for iso in countries:
        base, lvl = country_base(iso, cfg, adm1, adm2)
        if iso in cfg["fine"]:
            parts.append(build_fine(iso, cfg["fine"][iso], base))
            used |= set(base.shapeID)
        else:
            b = base[["shapeName", "shapeID", "geometry"]].copy()
            b["iso"] = iso
            b["src"] = f"geoBoundaries CGAZ {lvl}"
            parts.append(b)

    g = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), crs="EPSG:4326")
    g = apply_splits(g, cfg.get("split", []))
    for spec in cfg.get("clip", []):
        g = apply_clip(g, spec)
    g["geometry"] = g.geometry.make_valid()
    g["full"] = g.geometry  # bbox で切る前の形（地図にはこちらを使う）
    g["geometry"] = g.geometry.intersection(clip)
    # split で分けたピースは、bbox の外にあっても捨てない（西サハラ南部・ビル・タウィールなど。
    # 元の区画の shapeID は範囲内で使ったことになるので、範囲外のピースとしては作られないため）
    sp = g["_split"].fillna(False).astype(bool) if "_split" in g else pd.Series(False, index=g.index)
    small = g.geometry.is_empty | (g.geometry.area < 1e-4)
    g.loc[sp & small, "geometry"] = g.loc[sp & small, "full"]
    g = g[~g.geometry.is_empty & g.geometry.notna()]
    g = g[g.geometry.geom_type.isin(["Polygon", "MultiPolygon", "GeometryCollection"])]
    g["geometry"] = g.geometry.apply(polys_only)
    g = g[~g.geometry.is_empty]
    # 面積が極端に小さい断片（bbox の端など）は捨てる（その区画は範囲外のピースになる）
    g = g[(g.to_crs("EPSG:3035").area > 2e5) | sp.reindex(g.index, fill_value=False)]
    used |= set(g.shapeID.dropna())

    # ID を付ける（同名は bbox で切った形の重心の西→東順で _2, _3 ...）
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
    g["geometry"] = g["full"].apply(polys_only)
    g = g.rename(columns={"shapeName": "name"})
    g["zone"] = "eu"
    g = g[["id", "name", "iso", "adm1", "adm2", "src", "zone", "geometry"]]
    inner_countries = set(g.iso)

    # ---- 範囲外（zone=world） ----
    world = build_world(cfg, inner_countries, used, set(g.id), clip)
    g = gpd.GeoDataFrame(pd.concat([g, world], ignore_index=True), crs="EPSG:4326")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    g.to_file(OUT, driver="GeoJSON", engine="pyogrio")
    print(f"pieces: {len(g)}（範囲内 {int((g.zone == 'eu').sum())}、範囲外 {int((g.zone == 'world').sum())}）", file=sys.stderr)
    counts = g.groupby("iso").size().sort_values(ascending=False)
    print(counts.head(40).to_string(), file=sys.stderr)


def build_world(cfg, inner_countries, used, taken, clip):
    """bbox の外のピース。範囲内のピースに使っていない CGAZ の区画から作る"""
    adm1 = read_cgaz("ADM1")
    adm2 = read_cgaz("ADM2")
    adm1["geometry"] = adm1.geometry.make_valid()
    rows = []
    for iso in sorted(set(adm1.shapeGroup) | set(adm2.shapeGroup)):
        if iso == "CHN" and "chn" in cfg:
            # 中国は地級（地区・市）単位。専用の処理（tools/chn_pieces.py）
            from chn_pieces import build_chn

            rows.extend(build_chn(cfg, adm1, adm2).to_dict("records"))
            continue
        if iso in cfg.get("world_adm2", {}):
            # 範囲外でも ADM2 単位にする国（南アジア・東南アジアなど）。ADM2 を1つずつピースにする
            rows.extend(world_adm2_rows(iso, cfg, adm1, adm2, used))
            continue
        if iso in inner_countries:
            base, lvl = country_base(iso, cfg, adm1, adm2)
        else:
            base = adm1[adm1.shapeGroup == iso]
            lvl = "ADM1"
            if len(base) == 0:
                base, lvl = adm2[adm2.shapeGroup == iso], "ADM2"
        rest = base[~base.shapeID.isin(used)]
        if len(rest) == 0:
            continue
        r1 = rest[rest.level == "ADM1"]
        r2 = rest[rest.level == "ADM2"]
        for t in r1.itertuples():
            rows.append({"name": t.shapeName, "iso": iso, "adm1": t.shapeName, "src": "geoBoundaries CGAZ ADM1", "geometry": t.geometry})
        if len(r2):
            # ADM2 を使う国の範囲外の部分は、親の ADM1 ごとにまとめる（範囲外は粗くてよいので）
            a1c = adm1[adm1.shapeGroup == iso][["shapeName", "geometry"]].rename(columns={"shapeName": "parent"})
            pts = gpd.GeoDataFrame(r2[["shapeName"]], geometry=r2.geometry.representative_point(), crs=r2.crs)
            j = gpd.sjoin(pts, a1c, how="left", predicate="within")
            j = j[~j.index.duplicated()]
            parent = j["parent"].fillna(r2["shapeName"])
            single = iso not in inner_countries
            for pname, grp in r2.groupby(parent):
                geom = unary_union(grp.geometry.make_valid().values)
                rows.append({"name": pname, "iso": iso, "adm1": "" if single else pname,
                             "src": "geoBoundaries CGAZ ADM2（ADM1 ごとに結合）", "geometry": geom})
    w = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    w["adm2"] = w["adm2"].fillna("") if "adm2" in w else ""
    for spec in cfg.get("add_from_ne", []):
        w = add_from_ne(w, spec, adm1)
    w = add_ne_pieces(w, cfg.get("add_ne_pieces", []), adm1)
    # 島などを別ピースに分ける（範囲内と同じ設定。範囲外のピースに当たるものだけが効く）
    w = w.rename(columns={"name": "shapeName"})
    w = apply_splits(w, cfg.get("split", []))
    w = w.rename(columns={"shapeName": "name"})
    # 南極点のまわり（南緯 85 度より南）は、地図（Web メルカトルの範囲外）で形が崩れるので切り落とす
    w["geometry"] = w.geometry.make_valid().intersection(box(-180, -85, 180, 90))
    w["geometry"] = w.geometry.apply(polys_only)
    w = w[~w.geometry.is_empty]
    # bbox の中にすっぽり入る区画は、範囲内で小さすぎて捨てた断片なので、ここでも捨てる
    w = w[~w.geometry.within(clip)]
    w["name"] = w["name"].fillna("").astype(str).replace("", "unnamed")
    w["cx"] = w.geometry.representative_point().x
    w = w.sort_values(["iso", "name", "cx"]).reset_index(drop=True)
    ids = []
    taken = set(taken)
    for iso, name in zip(w.iso, w.name):
        base_id = f"{iso}-{slug(name)}"
        pid, k = base_id, 1
        while pid in taken:
            k += 1
            pid = f"{base_id}_{k}"
        taken.add(pid)
        ids.append(pid)
    w["id"] = ids
    # adm1 が空のもの（ADM1 がない国）は名前を入れておく
    w["adm1"] = w["adm1"].where(w["adm1"] != "", w["name"])
    w["zone"] = "world"
    return w[["id", "name", "iso", "adm1", "adm2", "src", "zone", "geometry"]]


def world_adm2_rows(iso, cfg, adm1, adm2, used):
    """pieces_config.json の world_adm2 の国。指定の ADM1 の中は CGAZ ADM2 を1つずつピースにし、
    残りの ADM1 はそのまま。範囲内のピースに使った区画（used）は除く"""
    spec = cfg["world_adm2"][iso]
    fix = cfg.get("adm1_fix", {}).get(iso, {})
    a1c = adm1[adm1.shapeGroup == iso]
    if spec == "all":
        fine1 = a1c
    elif "only" in spec:
        fine1 = a1c[a1c.shapeName.isin(spec["only"])]
    else:
        fine1 = a1c[~a1c.shapeName.isin(spec["except"])]
    missing = set(spec.get("only", []) if isinstance(spec, dict) else []) - set(fine1.shapeName)
    if missing:
        raise SystemExit(f"world_adm2 {iso}: ADM1 が見つからない {sorted(missing)}")
    rows = []
    for t in a1c[~a1c.index.isin(fine1.index)].itertuples():
        if t.shapeID in used:
            continue
        rows.append({"name": t.shapeName, "iso": iso, "adm1": t.shapeName, "src": "geoBoundaries CGAZ ADM1", "geometry": t.geometry})
    a2c = adm2[(adm2.shapeGroup == iso) & ~adm2.shapeID.isin(used)].copy()
    a2c["geometry"] = a2c.geometry.make_valid()
    # 親の ADM1：代表点が入る ADM1。どれにも入らない（海岸のずれなど）ものは最も近い ADM1
    pts = gpd.GeoDataFrame(a2c[["shapeName"]], geometry=a2c.geometry.representative_point(), crs=a2c.crs)
    par = a1c[["shapeName", "geometry"]].rename(columns={"shapeName": "parent"})
    j = gpd.sjoin_nearest(pts, par, how="left")
    j = j[~j.index.duplicated()]
    for r in cfg.get("adm2_rename", []):
        if r["iso"] != iso:
            continue
        m = a2c.shapeName == r["name"]
        if "bbox" in r:
            m &= pts.geometry.within(box(*r["bbox"]))
        if not m.any():
            raise SystemExit(f"adm2_rename: 見つからない {r}")
        a2c.loc[m, "shapeName"] = r["to"]
    # adm2_suffix：同名の多い国（アメリカの郡など）は、名前に親の州の略号を付ける（"Washington, PA"）
    suffix = cfg.get("adm2_suffix", {}).get(iso, {})
    for idx, t in zip(a2c.index, a2c.itertuples()):
        p = j.at[idx, "parent"]
        if p not in set(fine1.shapeName):
            continue
        name = fix_mojibake(t.shapeName)
        if p in suffix:
            name = f"{name}, {suffix[p]}"
        rows.append({"name": name, "iso": iso, "adm1": fix_mojibake(fix.get(p, p)).strip(), "src": "geoBoundaries CGAZ ADM2",
                     "geometry": t.geometry})
    return rows


def fix_mojibake(s):
    """CGAZ の UTF-8 が Latin-1 として読まれた文字化け（"RegiÃ³n"）を直す"""
    if s and "Ã" in s:
        try:
            return s.encode("latin1").decode("utf8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s
    return s


def add_ne_pieces(w, specs, adm1):
    """CGAZ にない地域（海外領土など）を Natural Earth admin-1 から新しいピースとして足す。
    ne_adm0 の区画のうち、bbox に代表点が入るもの（ne_names があればその名前だけ）を使う。
    dissolve: true なら1つのピース（name）にまとめる。clip: true なら bbox にかかる区画を bbox で切って使う。carve: true なら、重なる既存のピースから切り取る
    （グアンタナモ基地のように CGAZ では隣の区画に含まれているもの）。そうでなければ既存のピースと重ならない部分だけを使う"""
    ne_all = gpd.read_file(SRC / "ne_admin1.geojson", engine="pyogrio")
    new_rows = []
    for spec in specs:
        bb = box(*spec["bbox"])
        ne = ne_all[ne_all.adm0_a3 == spec["ne_adm0"]]
        if spec.get("clip"):
            # clip: true なら bbox にかかる区画を bbox で切って使う（1つの区画に散らばった島々の一部だけを取る）
            ne = ne[ne.intersects(bb)].copy()
            ne["geometry"] = ne.geometry.make_valid().intersection(bb)
        else:
            ne = ne[ne.geometry.representative_point().within(bb)]
        if "ne_names" in spec:
            ne = ne[ne.name.isin(spec["ne_names"])]
        if len(ne) == 0:
            raise SystemExit(f"add_ne_pieces: 見つからない {spec}")
        groups = [(spec["name"], unary_union(ne.geometry.make_valid().values))] if spec.get("dissolve") else \
            [(spec.get("names", {}).get(n, n), gm) for n, gm in zip(ne.name, ne.geometry.make_valid())]
        for name, gm in groups:
            gm = polys_only(gm)
            near = w[w.geometry.intersects(gm.envelope.buffer(0.05))]
            if spec.get("carve"):
                for idx in near.index:
                    w.at[idx, "geometry"] = polys_only(w.at[idx, "geometry"].difference(gm))
            elif len(near):
                gm = polys_only(gm.difference(unary_union(near.geometry.make_valid().values)))
            if gm.is_empty:
                continue
            new_rows.append({"name": name, "iso": spec["iso"], "adm1": name, "adm2": "",
                             "src": "Natural Earth admin-1", "geometry": gm})
    if new_rows:
        w = gpd.GeoDataFrame(pd.concat([w, gpd.GeoDataFrame(new_rows, geometry="geometry", crs=w.crs)], ignore_index=True),
                             crs=w.crs)
    return w


_UNITS_CACHE = {}


def _unmojibake(s):
    """units の照合用：UTF-8 が Latin-1 として読まれた文字化けを直す（fix_mojibake より広く、Å・Ä なども。
    ピース ID には使わないので、既存の ID は変わらない）"""
    if not isinstance(s, str) or not any("\u00c0" <= ch <= "\u00ff" for ch in s):
        return s
    try:
        return s.encode("latin1").decode("utf8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def load_units(src):
    """split の units に使う区画（既定は CGAZ ADM2。"gb/....geojson" なども可）"""
    if src not in _UNITS_CACHE:
        if src == "cgaz_adm2":
            u = read_cgaz("ADM2")[["shapeName", "shapeGroup", "geometry"]]
        else:
            u = gpd.read_file(SRC / src, engine="pyogrio")[["shapeName", "geometry"]]
            u["shapeGroup"] = ""
        u = u.copy()
        u["shapeName"] = u.shapeName.map(_unmojibake)  # CGAZ の文字化け（"Å\x8ctorohanga District"）を直して照合する
        u["geometry"] = u.geometry.make_valid()
        u["rp"] = u.geometry.representative_point()
        _UNITS_CACHE[src] = u
    return _UNITS_CACHE[src]


def units_geom(part, iso, piece_geom):
    """part["units"] の区画（名前のリスト）を結合した形。代表点がピースの中にあるものだけを使う。
    units_bbox があれば代表点がその中にあるものだけ、units_clip（名前 → bbox）はその区画を bbox で切る"""
    u = load_units(part.get("units_src", "cgaz_adm2"))
    if part.get("units_src", "cgaz_adm2") == "cgaz_adm2":
        u = u[u.shapeGroup == part.get("units_iso", iso)]
    u = u[u.shapeName.isin(part["units"])]
    u = u[u.rp.within(piece_geom.buffer(0.01))]
    if "units_bbox" in part:
        u = u[u.rp.within(box(*part["units_bbox"]))]
    missing = set(part["units"]) - set(u.shapeName)
    if missing:
        raise SystemExit(f"split units: 見つからない {sorted(missing)}（{part.get('suffix') or part.get('rename')}）")
    geoms = []
    for name, gm in zip(u.shapeName, u.geometry):
        if name in part.get("units_clip", {}):
            gm = gm.intersection(box(*part["units_clip"][name]))
        geoms.append(gm)
    return polys_only(unary_union(geoms))


def apply_splits(g, specs):
    """島などを別ピースに分ける。分けた部分の名前は「元の名前 + suffix」（rename があればその名前）になる。
    name が "*" なら、その国のすべてのピースに当てる（切り取る部分がないピースはそのまま）。
    merge_into があれば、新しいピースにせず、同じ国のその名前のピースに足す。
    分けた結果、元のピースが空になる場合は分けない（元の ID を消さないため）"""
    from shapely.geometry import MultiPolygon, Polygon, box as sbox

    rows = []
    merges = []
    for spec in specs:
        m = g.iso == spec["iso"]
        if spec["name"] != "*":
            m &= g.shapeName == spec["name"]
        for idx in g[m].index:
            geom = g.at[idx, "geometry"]
            polys = list(getattr(geom, "geoms", [geom]))
            for part in spec["parts"]:
                if "units" in part:
                    bb = units_geom(part, spec["iso"], MultiPolygon(polys))
                elif "line" in part:
                    # 線（経度・緯度の点列）から km の幅の帯で切り取る（パナマ運河地帯など）
                    bb = line_buffer(part["line"], part["km"])
                elif "poly" in part:
                    bb = Polygon(part["poly"])
                else:
                    bb = sbox(*part.get("bbox", [-180, -90, 180, 90]))
                if part.get("islands"):
                    # 最も大きい多角形（本土）以外（bbox があればその中に代表点があるもの）を取る（北極諸島など）
                    big = max(polys, key=lambda p: p.area)
                    taken = [p for p in polys if p is not big and bb.contains(p.representative_point())]
                    if not taken:
                        continue
                    rest = [p for p in polys if p is big or not bb.contains(p.representative_point())]
                elif part.get("cut") or "line" in part or "poly" in part or "units" in part:
                    # bbox で切り取る（陸続きの部分を線で分ける）
                    cur = MultiPolygon(polys)
                    inter = poly_list(cur.intersection(bb))
                    taken = [p for p in inter if p.area > part.get("min_area", 1e-9)]
                    if not taken:
                        continue
                    # min_area より小さい切れ端は元のピースに残す
                    tiny = [p for p in inter if p.area > 1e-9 and p.area <= part.get("min_area", 1e-9)]
                    rest = poly_list(cur.difference(bb.difference(unary_union(tiny).buffer(1e-7)) if tiny else bb))
                    if "units" in part:
                        # 区画の外形と元のピースの外形の小さなずれで残った細片は、切り取る側に付ける
                        tk = MultiPolygon(taken)
                        big = max((p.area for p in rest), default=0)
                        moved = [p for p in rest if p.area < 0.02 * big and p.distance(tk) < 1e-6]
                        if moved:
                            taken = poly_list(unary_union(taken + moved))
                            rest = [p for p in rest if not any(p is q for q in moved)]
                else:
                    taken = [p for p in polys if bb.contains(p.representative_point())]
                    if not taken:
                        continue
                    rest = [p for p in polys if p not in taken]
                if not [p for p in rest if p.area > 1e-9]:
                    continue  # すべてが切り取られる（元のピースが消える）ので分けない
                polys = rest
                if part.get("merge_into"):
                    merges.append((spec["iso"], part["merge_into"], MultiPolygon(taken)))
                    continue
                r = g.loc[idx].copy()
                r["shapeName"] = part.get("rename") or f'{g.at[idx, "shapeName"]} {part["suffix"]}'
                if part.get("iso"):
                    # 分けた部分を別の国コードにする（オーストラリアの外部領土のクリスマス島など）
                    r["iso"] = part["iso"]
                    if "adm1" in r:
                        r["adm1"] = r["shapeName"]
                r["geometry"] = MultiPolygon(taken)
                r["_split"] = True
                rows.append(r)
            g.at[idx, "geometry"] = MultiPolygon(polys)
    for iso, target, gm in merges:
        t = g[(g.iso == iso) & (g.shapeName == target)].index
        if len(t) != 1:
            raise SystemExit(f"split merge_into: {iso} {target} が {len(t)} 個")
        g.at[t[0], "geometry"] = polys_only(unary_union([g.at[t[0], "geometry"], gm]))
    if rows:
        g = gpd.GeoDataFrame(pd.concat([g, gpd.GeoDataFrame(rows, crs=g.crs)], ignore_index=True), crs=g.crs)
    return g


def line_buffer(coords, km):
    """経度・緯度の点列から、両側 km の帯（多角形、経度・緯度）を作る"""
    from shapely.geometry import LineString

    ln = gpd.GeoSeries([LineString(coords)], crs="EPSG:4326")
    lon, lat = coords[0]
    aeqd = f"+proj=aeqd +lat_0={lat} +lon_0={lon} +units=m"
    return ln.to_crs(aeqd).buffer(km * 1000, cap_style="flat").to_crs("EPSG:4326").iloc[0]


def add_from_ne(w, spec, adm1):
    """CGAZ に欠けている区画（係争地など）を Natural Earth admin-1 から補い、既存のピースに足す。
    bbox に代表点が入る Natural Earth の多角形のうち、CGAZ のどの区画とも重ならない部分を使う"""
    ne = gpd.read_file(SRC / "ne_admin1.geojson", bbox=tuple(spec["bbox"]), engine="pyogrio")
    ne = ne[ne.adm0_a3 == spec["ne_adm0"]]
    bb = box(*spec["bbox"])
    polys = []
    for gm in ne.geometry.make_valid():
        polys += [p for p in getattr(polys_only(gm), "geoms", [gm]) if bb.contains(p.representative_point())]
    if not polys:
        return w
    cg = adm1[adm1.intersects(bb)]
    extra = polys_only(unary_union(polys).difference(unary_union(cg.geometry.make_valid().values)))
    m = (w.iso == spec["iso"]) & (w.name == spec["name"])
    for idx in w[m].index:
        w.at[idx, "geometry"] = polys_only(unary_union([w.at[idx, "geometry"], extra]))
    return w


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


def poly_list(geom):
    """形を Polygon のリストにする"""
    g = polys_only(geom)
    return [p for p in getattr(g, "geoms", [g]) if not p.is_empty]


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
