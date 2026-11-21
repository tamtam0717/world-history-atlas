"""中国（CHN）のピースを地級（地区・市・州・盟）単位で作る。build_pieces.py から呼ぶ。

なぜ専用の処理が要るか:
  - CGAZ の CHN ADM2 は県級（約2,400）で細かすぎ、ADM1（省）は粗すぎる。地級の公開データは
    geoBoundaries にない。
  - CGAZ の CHN は海岸線が粗く、遼東半島の先端（大連・旅順）、上海の浦東、香港島・九龍などが欠けている。

方法:
  1. 県（CGAZ ADM2）を、1990年代の「中国地州界」（地級の区画。国家測絵局のデータを
     Revolutionary GIS が公開、PDDL。geoBoundaries の CHN ADM2 と同じ出典）のどの区画に入るかで束ねる。
     同じ地級コード（県の GB1999 コードの上4桁）の区画が隣り合っていれば1つにまとめる
     （島の県だけが別の区画になっているものなど）。
  2. 租借地を取るために、pieces_config.json の chn.keep_counties の県は地級に束ねず、そのまま1ピースにする。
  3. 海岸の欠け：Natural Earth admin-1 の中国の形から、CGAZ の他国の区画と県を引いた残り（欠け）を
     小さな格子に分け、最も近い県に足す。
  4. 香港・マカオは CGAZ の ADM1 を元に、Natural Earth の香港・マカオの形で欠けを補う（ID は変えない）。
"""

import json
import re
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
from shapely.geometry import box
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".cache" / "src"

HK_NAME = "Hong Kong Special Administrative Region"
MO_NAME = "Macau Special Administrative Region"

# 中国地州界の名前の誤字など
NAME_FIX = {"叶鲁番市": "吐鲁番市", "扶顺市": "抚顺市", "株州市": "株洲市", "烏海市": "乌海市", "崇明県": "崇明县",
            "市辖区(南通市)": "南通市", "市辖区(石嘴山市)": "石嘴山市"}
# 多音字などで pypinyin が誤る読み
PINYIN_FIX = {"长治": "Changzhi", "朝阳": "Chaoyang", "昌都": "Changdu", "漯河": "Luohe", "阿勒泰": "Aletai",
              "六安": "Luan", "库尔勒": "Kuerle", "阿图什": "Atushi", "重庆": "Chongqing", "长春": "Changchun",
              "长沙": "Changsha", "乐山": "Leshan", "蚌埠": "Bengbu", "厦门": "Xiamen", "巴中": "Bazhong", "锡林郭勒": "Xilinguole"}


def _valid(geom):
    return geom.buffer(0) if not geom.is_valid else geom


def _polys(geom):
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


def pinyin_name(zh: str) -> str:
    from pypinyin import lazy_pinyin

    s = NAME_FIX.get(zh, zh)
    m = re.match(r"市辖区\((.+)\)", s)
    if m:
        s = m.group(1)
    s = re.sub(r"(([一-鿿]{1,3}族)+)?自治(县|州|旗)?$", "", s)
    s = re.sub(r"(林区|地区|市|县|旗|区|盟)$", "", s)
    if s in PINYIN_FIX:
        return PINYIN_FIX[s]
    return "".join(lazy_pinyin(s, v_to_u=True)).capitalize()


def build_chn(cfg, adm1, adm2):
    """CHN の行（name, iso, adm1, adm2, src, geometry）を返す"""
    spec = cfg["chn"]
    bb = spec["bbox"]
    region = box(*bb)
    a1 = adm1[adm1.shapeGroup == "CHN"].copy()
    others = adm1[(adm1.shapeGroup != "CHN") & adm1.intersects(region)]
    others_u = unary_union(others.geometry.make_valid().values)
    hk1 = _valid(a1[a1.shapeName == HK_NAME].geometry.iloc[0])
    mo1 = _valid(a1[a1.shapeName == MO_NAME].geometry.iloc[0])
    prov = a1[~a1.shapeName.isin([HK_NAME, MO_NAME])]

    cty = adm2[adm2.shapeGroup == "CHN"][["shapeName", "shapeID", "geometry"]].copy().reset_index(drop=True)
    cty["geometry"] = cty.geometry.make_valid().apply(_polys)
    rp = cty.geometry.representative_point()
    in_hk = rp.within(hk1) | (cty.shapeName == "Xianggang")
    in_mo = rp.within(mo1)
    hk_cty = unary_union(cty[in_hk].geometry.values)
    cty = cty[~in_hk & ~in_mo].reset_index(drop=True)
    # CGAZ の ADM2 は国境で隣国の ADM1 と少しずれて重なるので、隣国（ADM1）の部分を除く
    og = list(others.geometry.make_valid().values)
    osi = others.sindex
    cty["geometry"] = [
        _polys(gm.difference(unary_union([og[k] for k in hit]))) if len(hit := osi.query(gm, predicate="intersects")) else gm
        for gm in cty.geometry
    ]
    cty = cty[~cty.geometry.is_empty & (cty.geometry.area > 1e-8)].reset_index(drop=True)
    cty_u = unary_union(cty.geometry.values)

    ne = gpd.read_file(SRC / "ne_admin1.geojson", bbox=tuple(bb), engine="pyogrio")
    ne["geometry"] = ne.geometry.make_valid()
    ne_u = lambda a3: unary_union(ne[ne.adm0_a3 == a3].geometry.values)

    # 香港・マカオ（CGAZ に Natural Earth で欠けを補う。中国本土の県・他国とは重ねない）
    hk = _polys(unary_union([hk1, hk_cty, ne_u("HKG")]).difference(others_u).difference(cty_u))
    mo = _polys(unary_union([mo1, ne_u("MAC")]).difference(others_u).difference(cty_u).difference(hk))

    # 中国本土の海岸の欠けを、最も近い県に足す
    outline = unary_union([ne_u("CHN"), unary_union(prov.geometry.make_valid().values)])
    gaps = outline.difference(others_u).difference(cty_u).difference(hk).difference(mo).difference(hk1).difference(mo1)
    cty = _fill_gaps(cty, gaps, spec.get("gap_cell", 0.05), spec.get("gap_max_dist", 0.3))

    # 県 → GB1999 コード（geoBoundaries CHN ADM2 と属性表は同じ並び）
    gb = gpd.read_file(SRC / spec["counties_geo"], engine="pyogrio")[["shapeName", "geometry"]]
    attr = pyogrio.read_dataframe(SRC / spec["counties_attr"], read_geometry=False)
    gb["code"] = attr["GB1999"].astype(str).values
    pts = gpd.GeoDataFrame({"i": cty.index}, geometry=cty.geometry.representative_point(), crs=cty.crs)
    j = gpd.sjoin_nearest(pts, gb[["code", "geometry"]], how="left")
    j = j[~j.index.duplicated()]
    cty["code4"] = j["code"].where(j["code"].str.len() == 6, "").str[:4]

    # 県 → 地級の区画（中国地州界）
    pf = gpd.read_file(SRC / spec["prefectures"], engine="pyogrio").to_crs("EPSG:4326")
    pf["pid"] = range(len(pf))
    j = gpd.sjoin_nearest(pts, pf[["NAME", "pid", "geometry"]], how="left")
    j = j[~j.index.duplicated()]
    cty["pid"] = j["pid"].values
    cty["pname"] = j["NAME"].values

    # 同じ地級コードで隣り合う（または近い島の）区画をまとめる
    grp = {}
    for pid, g in cty.groupby("pid"):
        codes = g.code4[g.code4 != ""]
        grp[pid] = {"code": codes.mode().iloc[0] if len(codes) else "", "n": len(g),
                    "geom": unary_union(g.geometry.values), "name": g.pname.iloc[0]}
    parent = {p: p for p in grp}

    def find(p):
        while parent[p] != p:
            p = parent[p]
        return p

    pids = sorted(grp, key=lambda p: -grp[p]["n"])
    near = spec.get("merge_dist", 0.3)
    for i, p in enumerate(pids):
        for q in pids[i + 1:]:
            if grp[p]["code"] and grp[p]["code"] == grp[q]["code"] and grp[p]["geom"].distance(grp[q]["geom"]) < near:
                rp_, rq = find(p), find(q)
                if rp_ != rq:
                    # 県の数が多い方を親（名前）にする
                    a, b = (rp_, rq) if grp[rp_]["n"] >= grp[rq]["n"] else (rq, rp_)
                    parent[b] = a
    cty["group"] = cty["pid"].map(lambda p: find(p))

    # 省（CGAZ ADM1 の名前）。CGAZ の省は海岸が粗いので、県コードの上2桁 → 省名を多数決で決めて使う
    jp = gpd.sjoin_nearest(pts, prov[["shapeName", "geometry"]], how="left")
    jp = jp[~jp.index.duplicated()]
    cty["prov_geo"] = jp["shapeName"].values
    cty["code2"] = cty["code4"].str[:2]
    c2name = cty[cty.code2 != ""].groupby("code2")["prov_geo"].agg(lambda x: x.mode().iloc[0])
    cty["prov"] = cty["code2"].map(c2name).fillna(cty["prov_geo"])

    keep = spec.get("keep_counties", {})
    rows = []
    # 租借地などのために残す県（同じ名前の県は1つにまとめる）
    kept = cty[cty.shapeName.isin(set(keep))]
    for nm, g in kept.groupby("shapeName"):
        rows.append({"name": keep[nm], "geom": unary_union(g.geometry.values), "zh": "", "adm1": g.prov.mode().iloc[0]})
    rest = cty[~cty.shapeName.isin(set(keep))]
    for gid, g in rest.groupby("group"):
        zh = NAME_FIX.get(grp[gid]["name"], grp[gid]["name"])
        code = grp[gid]["code"]
        nb = spec.get("names_by_code", {})
        zh = nb.get(f"{code}:{zh}", nb.get(code, zh))
        rows.append({"name": pinyin_name(zh), "geom": unary_union(g.geometry.values), "zh": zh,
                     "adm1": g.prov.mode().iloc[0], "code": code, "members": " ".join(g.shapeName.astype(str))})
    out = gpd.GeoDataFrame(rows, geometry="geom", crs="EPSG:4326").rename_geometry("geometry")
    out["geometry"] = out.geometry.apply(_polys)
    # 同じ読みの別の地（蘇州・宿州など）は省名を付けて区別する
    dup = out.duplicated("name", keep=False)
    out.loc[dup, "name"] = out.loc[dup, "name"] + " " + out.loc[dup, "adm1"].str.split().str[0]
    out["adm2"] = out["zh"]
    out["src"] = "geoBoundaries CGAZ ADM2（中国地州界で地級に結合）＋Natural Earth（海岸の補い）"
    out["iso"] = "CHN"
    hkmo = gpd.GeoDataFrame([
        {"name": HK_NAME, "adm1": HK_NAME, "adm2": "", "src": "geoBoundaries CGAZ ADM1＋Natural Earth", "iso": "CHN", "geometry": hk},
        {"name": MO_NAME, "adm1": MO_NAME, "adm2": "", "src": "geoBoundaries CGAZ ADM1＋Natural Earth", "iso": "CHN", "geometry": mo},
    ], geometry="geometry", crs="EPSG:4326")
    cols = ["name", "iso", "adm1", "adm2", "src", "geometry"] + (["code", "members"] if spec.get("_debug") else [])
    return pd.concat([out[cols], hkmo], ignore_index=True)


def _fill_gaps(cty, gaps, cell, max_dist):
    """欠け（gaps）を cell 度の格子に分け、それぞれ最も近い県に足す。県から max_dist 度より遠い島は捨てる"""
    if gaps.is_empty:
        return cty
    comps = [p for p in getattr(gaps, "geoms", [gaps]) if p.geom_type == "Polygon" and p.area > 1e-7]
    sidx = cty.sindex
    add = {i: [] for i in cty.index}
    for comp in comps:
        near = sidx.nearest(comp, return_distance=True)
        if near[1].min() > max_dist:
            continue
        x0, y0, x1, y1 = comp.bounds
        xs = np.arange(x0, x1, cell)
        ys = np.arange(y0, y1, cell)
        cells = [box(x, y, x + cell, y + cell) for x in xs for y in ys]
        from shapely.strtree import STRtree

        hit = STRtree(cells).query(comp, predicate="intersects")
        for k in hit:
            ch = comp.intersection(cells[k])
            if ch.is_empty or ch.area < 1e-10:
                continue
            ni = sidx.nearest(ch.representative_point())[1][0]
            add[cty.index[ni]].append(ch)
    geoms = []
    for i, gm in zip(cty.index, cty.geometry):
        geoms.append(_polys(unary_union([gm] + add[i]).buffer(0)) if add[i] else gm)
    cty = cty.copy()
    cty["geometry"] = geoms
    return cty
