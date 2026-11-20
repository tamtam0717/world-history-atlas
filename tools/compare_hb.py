"""所属データを aourednik/historical-basemaps（GPL-3.0）のスナップショットと照合する。

照合専用。historical-basemaps のデータをこのリポジトリのデータに取り込んではいけない（ライセンスが GPL のため）。

使い方:
  ~/venv/bin/python tools/compare_hb.py 1700            # 1700年のスナップショットと照合
  ~/venv/bin/python tools/compare_hb.py 1700 --iso DEU  # 現代のドイツのピースだけ
  ~/venv/bin/python tools/compare_hb.py all             # 全スナップショット

出力（標準出力）:
  1. 政体ごとに、historical-basemaps でどの国に当たっているか（面積の割合）
  2. 食い違いの疑いがあるピース（その政体の主な対応先と違う国に当たっているもの）
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

from shapely import STRtree
from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parent.parent
HB = ROOT / ".cache" / "hb"
SNAPSHOTS = [1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880]
BASE_URL = "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson"


def load_hb(year):
    f = HB / f"world_{year}.geojson"
    if not f.exists():
        import urllib.request

        HB.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(f"{BASE_URL}/world_{year}.geojson", f)
    d = json.loads(f.read_text())
    geoms, names = [], []
    for ft in d["features"]:
        if not ft.get("geometry"):
            continue
        p = ft["properties"]
        name = p.get("NAME") or "?"
        subj = p.get("SUBJECTO") or ""
        label = name if not subj or subj == name else f"{name} [{subj}]"
        geoms.append(shape(ft["geometry"]).buffer(0))
        names.append(label)
    return STRtree(geoms), geoms, names


def state_at(tl, year):
    cur = None
    for s in tl:
        if s[0] <= year:
            cur = s
    return cur


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("year")
    ap.add_argument("--iso", help="現代の国コードで絞る（カンマ区切り）")
    ap.add_argument("--polity", help="政体 ID で絞る（カンマ区切り）")
    ap.add_argument("--min-area", type=float, default=300, help="報告するピースの最小面積 km²")
    args = ap.parse_args()

    atlas = json.loads((ROOT / "public" / "data" / "atlas.json").read_text())
    rows = (ROOT / "data" / "generated" / "pieces.tsv").read_text().strip().split("\n")
    head = rows[0].split("\t")
    pieces = [dict(zip(head, r.split("\t"))) for r in rows[1:]]
    pos = {p: i for i, p in enumerate(atlas["pieceIds"])}
    pol = [p["id"] for p in atlas["polities"]]
    isos = set(args.iso.split(",")) if args.iso else None
    pfilter = set(args.polity.split(",")) if args.polity else None

    years = SNAPSHOTS if args.year == "all" else [int(args.year)]
    for year in years:
        tree, geoms, names = load_hb(year)
        by_polity = defaultdict(lambda: defaultdict(float))
        hits = []
        for p in pieces:
            if isos and p["iso"] not in isos:
                continue
            i = pos.get(p["id"])
            st = state_at(atlas["pieceTimelines"][i], year) if i is not None else None
            ours = pol[st[1]] if st and st[1] >= 0 else "（データなし）"
            if pfilter and ours not in pfilter:
                continue
            pt = Point(float(p["lon"]), float(p["lat"]))
            hb = "（空白）"
            for j in tree.query(pt):
                if geoms[j].contains(pt):
                    hb = names[j]
                    break
            a = float(p["area_km2"])
            by_polity[ours][hb] += a
            hits.append((p, ours, hb, a))

        print(f"\n===== {year}年 =====")
        main_of = {}
        for ours, d in sorted(by_polity.items(), key=lambda kv: -sum(kv[1].values())):
            total = sum(d.values())
            top = sorted(d.items(), key=lambda kv: -kv[1])
            main_of[ours] = top[0][0]
            dist = "、".join(f"{k} {v / total:.0%}" for k, v in top[:5] if v / total >= 0.02)
            print(f"- {ours}（{total:,.0f} km²）→ {dist}")
        print("\n食い違いの疑い（政体の主な対応先と違う国に当たっているピース）:")
        sus = [(p, o, h, a) for p, o, h, a in hits if h != main_of.get(o) and a >= args.min_area]
        sus.sort(key=lambda x: (x[1], x[2], -x[3]))
        for p, o, h, a in sus:
            print(f"  {o:<22} hb={h:<36} {p['id']}（{p['name']}, {p['adm1']}）{a:,.0f} km²")


if __name__ == "__main__":
    sys.exit(main())
