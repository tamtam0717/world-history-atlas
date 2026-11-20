"""地図に描く川と湖のデータ public/data/rivers.json・lakes.json を作る。

元データ（Natural Earth 10m、パブリックドメイン）を .cache/ne/ にダウンロードし、
範囲（経度 -25〜62、緯度 25〜72）で切り出し、日本語名・表示を始める拡大率（minz）・規模（rank）を付けて、
mapshaper で簡略化して書き出す。

使い方:
  /home/user/venv/bin/python tools/build_rivers.py
前提: geopandas・shapely（/home/user/venv）、npx mapshaper が使えること

出力の属性:
  name    日本語名（なければ空文字）
  name_en 英語名（なければ空文字）
  minz    表示を始める拡大率の目安（MapLibre の zoom。大河 2〜3、主要な支流 4〜5、小さな川 6 以上）
  rank    規模（数字が小さいほど大きい）。Natural Earth の scalerank を基に、歴史上重要な川は引き上げた値
  from    （運河のみ）開通年。この年より前の地図では描かないこと
人工の貯水池（ダム湖）は歴史地図には合わないので湖から除く（もとからある湖をせき止めたものは残す）。
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
import warnings
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box, mapping, shape
from shapely.ops import linemerge, unary_union

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "ne"
OUT = ROOT / "public" / "data"
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
SOURCES = [
    "ne_10m_rivers_lake_centerlines",
    "ne_10m_rivers_europe",
    "ne_10m_lakes",
    "ne_10m_lakes_europe",
]
BBOX = (-25, 25, 62, 72)

# 簡略化の目安（メートル）。拡大率 9 で 1 ピクセル ≒ 100m（北緯50度付近）。数ピクセル程度の誤差にとどめる
SIMPLIFY_INTERVAL_RIVERS = 600
SIMPLIFY_INTERVAL_LAKES = 300
# 補助データ（ne_10m_rivers_europe）の scalerank 12 は細かすぎるので落とす
MAX_RIVER_SCALERANK = 11

# ---------------------------------------------------------------------------
# 川の日本語名（Natural Earth の name / name_en / name_alt をキーにする）
# 高校世界史の表記に寄せる。ここにない川は Natural Earth の name_ja（あれば）を使う。
RIVER_JA: dict[str, str] = {
    # 大河
    "Danube": "ドナウ川", "Donau": "ドナウ川", "Bratul Sulina": "ドナウ川", "Bratul Chillia": "ドナウ川",
    "Bratul Sfintu Gheorghe": "ドナウ川", "Borcea": "ドナウ川", "Soroksari Duna": "ドナウ川",
    "Moson-Danube": "ドナウ川",
    "Rhine": "ライン川", "Rhein": "ライン川", "Rhin": "ライン川",
    "Nederrijn": "ネーデルライン川", "Lek": "レク川", "Waal": "ワール川", "IJssel": "アイセル川",
    "Volga": "ヴォルガ川", "Dnipro": "ドニエプル川", "Dnepre": "ドニエプル川", "Dnieper": "ドニエプル川",
    "Don": "ドン川", "Elbe": "エルベ川", "Oder": "オーデル川", "Vistula": "ヴィスワ川",
    "Nile": "ナイル川", "Damietta Branch": "ナイル川", "Rosetta Branch": "ナイル川",
    "Euphrates": "ユーフラテス川", "Firat": "ユーフラテス川", "Al Furat": "ユーフラテス川",
    "Tigris": "ティグリス川", "Dicle": "ティグリス川", "Shatt al Arab": "シャトル・アラブ川",
    "Seine": "セーヌ川", "Loire": "ロワール川", "Rhône": "ローヌ川", "Rhne": "ローヌ川",
    "Garonne": "ガロンヌ川", "Thames": "テムズ川", "Po": "ポー川", "Tevere": "テヴェレ川", "Tiber": "テヴェレ川",
    "Ebro": "エブロ川", "Tajo": "タホ川", "Tejo": "タホ川", "Tagus": "タホ川", "Duero": "ドウロ川",
    "Guadiana": "グアディアナ川", "Guadalquivir": "グアダルキビル川", "Minho": "ミーニョ川", "Mio": "ミーニョ川",
    "Maas": "マース川", "Meuse": "マース川", "Schelde": "スヘルデ川",
    "Mosel": "モーゼル川", "Main": "マイン川", "Neckar": "ネッカー川", "Weser": "ヴェーザー川", "Ems": "エムス川",
    "Saale": "ザーレ川", "Spree": "シュプレー川", "Lusatian Neisse": "ナイセ川", "Warta": "ヴァルタ川",
    "Noteć": "ノテッチ川", "Narew": "ナレフ川", "Bug": "ブーク川", "San": "サン川", "Pilica": "ピリツァ川",
    "Neman": "ネマン川", "Nemunas": "ネマン川", "Neris": "ネリス川", "Vilija": "ネリス川",
    "Daugava": "西ドヴィナ川", "Zapadnaya Dvina": "西ドヴィナ川",
    "Severnaya Dvina": "北ドヴィナ川", "Northern Dvina": "北ドヴィナ川",
    "Pripyat": "プリピャチ川", "Prypiat": "プリピャチ川", "Berezina": "ベレジナ川", "Desna": "デスナ川",
    "Dniester": "ドニエストル川", "Southern Bug": "南ブーク川", "Prut": "プルト川", "Siret": "シレト川",
    "Olt": "オルト川", "Mures": "ムレシュ川", "Tisa": "ティサ川", "Sava": "サヴァ川",
    "Drau": "ドラヴァ川", "Drava": "ドラヴァ川", "Mur": "ムール川", "Drina": "ドリナ川",
    "Morava": "モラヴァ川", "West Morava": "西モラヴァ川", "Vltava": "ヴルタヴァ川（モルダウ川）",
    "Inn": "イン川", "Isar": "イーザル川", "Salzach": "ザルツァハ川", "Enns": "エンス川",
    "Adige": "アディジェ川", "Ticino": "ティチーノ川", "Mincio": "ミンチョ川", "Adda": "アッダ川",
    "Arno": "アルノ川", "Piave": "ピアーヴェ川", "Volturno": "ヴォルトゥルノ川", "Ofanto": "オファント川",
    "Dora Baltea": "ドーラ・バルテア川", "Tanaro": "タナロ川", "Reno": "レーノ川",
    "Marne": "マルヌ川", "Somme": "ソンム川", "Yonne": "ヨンヌ川", "Saône": "ソーヌ川", "Sane": "ソーヌ川",
    "Doubs": "ドゥー川", "Durance": "デュランス川", "Dordogne": "ドルドーニュ川", "Vienne": "ヴィエンヌ川",
    "Tarn": "タルン川", "Ariège": "アリエージュ川", "Allier": "アリエ川", "Cher": "シェール川",
    "Severn": "セヴァーン川", "Trent": "トレント川", "Shannon": "シャノン川", "Tweed": "ツイード川",
    "Ness": "ネス川",
    "Segre": "セグレ川", "Esla": "エスラ川", "Júcar-Xúquer": "フカル川", "Segura": "セグラ川",
    "Zncara": "サンカラ川",
    "Neva": "ネヴァ川", "Volkhov": "ヴォルホフ川", "Svir": "スヴィリ川", "Narva": "ナルヴァ川",
    "Velikaya": "ヴェリーカヤ川", "Msta": "ムスタ川", "Luga": "ルガ川",
    "Kama": "カマ川", "Oka": "オカ川", "Donets": "ドネツ川", "Khopr": "ホピョル川", "Khopyor": "ホピョル川",
    "Kuban": "クバン川", "Terek": "テレク川", "Kura": "クラ川", "Aras": "アラス川", "Rioni": "リオニ川",
    "Ural": "ウラル川", "Pechora": "ペチョラ川", "Mezen": "メゼニ川", "Onega": "オネガ川",
    "Sukhona": "スホナ川", "Vychegda": "ヴィチェグダ川", "Vyatka": "ヴャトカ川", "Belaya": "ベーラヤ川",
    "Sura": "スラ川", "Tsna": "ツナ川", "Seym": "セイム川", "Sheksna": "シェクスナ川",
    "Glomma": "グロンマ川", "Glma": "グロンマ川", "Göta älv": "イェータ川", "Gta lv": "イェータ川",
    "Dalälven": "ダール川", "Kemijoki": "ケミ川", "Tornelven": "トルネ川", "Torne": "トルネ川",
    "Vuoksi": "ヴオクシ川", "Vuoksa": "ヴオクシ川", "Oulu": "オウル川",
    "Evros": "マリツァ川", "Maritsa": "マリツァ川", "Struma": "ストルマ川", "Strymnas": "ストルマ川",
    "Truma": "ストルマ川", "Haliacmon": "アリアクモン川", "Vardar": "ヴァルダル川",
    "Kiz?lirmak": "クズルウルマク川", "Kızılırmak": "クズルウルマク川", "Sakarya": "サカリヤ川",
    "Byk Menderes": "大メンデレス川", "Büyük Menderes": "大メンデレス川", "Ceyhan": "ジェイハン川",
    "Seyhan": "セイハン川", "Murat": "ムラト川",
    "Jordan": "ヨルダン川", "Karkheh": "カルヘ川", "Amu  Darya": "アム川", "Syr  Darya": "シル川",
    "Atrek": "アトレク川", "Atrak": "アトレク川", "Qezel Owzan": "キジル・ウズン川", "Sefid": "セフィード川",
    "Bojana": "ボヤナ川", "Buna": "ボヤナ川", "Drin": "ドリン川", "Neretva": "ネレトヴァ川",
    "Moulouya": "ムルーヤ川", "Oued Sebou": "セブ川", "Oum Er Rbia": "ウム・エル・ルビア川",
    # 運河
    "Suez Canal": "スエズ運河", "Caledonian Canal": "カレドニア運河", "Ferenc Csatorna": "フランツ運河",
    "Ismailiya Canal": "イスマイリア運河",
}

# 運河の開通年（この年より前の地図では描かない）
CANAL_FROM: dict[str, int] = {
    "Suez Canal": 1869,
    "Caledonian Canal": 1822,
    "Ferenc Csatorna": 1802,
    "Ismailiya Canal": 1863,
}

# 歴史地図として重要な川の表示開始の拡大率（日本語名で指定）。
# Natural Earth の scalerank は流量・長さ基準なので、歴史上よく出てくる川を引き上げる。
RIVER_MINZ: dict[str, float] = {
    # 大河：2
    "ドナウ川": 2, "ライン川": 2, "ヴォルガ川": 2, "ドニエプル川": 2, "ナイル川": 2,
    "ユーフラテス川": 2, "ティグリス川": 2, "エルベ川": 2, "ヴィスワ川": 2, "オーデル川": 2, "ドン川": 2,
    "セーヌ川": 2, "ロワール川": 2,
    # 3
    "ドニエストル川": 3, "ローヌ川": 3, "ポー川": 3, "エブロ川": 3, "タホ川": 3, "ドウロ川": 3,
    "西ドヴィナ川": 3, "ネマン川": 3, "北ドヴィナ川": 3, "ウラル川": 3, "ガロンヌ川": 3,
    "ヴェーザー川": 3, "テムズ川": 3, "マース川": 3, "ティサ川": 3, "クラ川": 3, "シャトル・アラブ川": 3,
    "アム川": 3, "シル川": 3, "カマ川": 3, "オカ川": 3, "ペチョラ川": 3,
    # 主要な支流：4
    "マイン川": 4, "モーゼル川": 4, "サヴァ川": 4, "ドラヴァ川": 4, "プルト川": 4, "ブーク川": 4,
    "テヴェレ川": 4, "ネヴァ川": 4, "アラス川": 4, "スヘルデ川": 4, "グアディアナ川": 4,
    "グアダルキビル川": 4, "南ブーク川": 4, "マリツァ川": 4, "ドネツ川": 4, "プリピャチ川": 4,
    "ヴァルタ川": 4, "ネーデルライン川": 4, "ワール川": 4, "クバン川": 4, "ヨルダン川": 4,
    "クズルウルマク川": 4, "ヴォルホフ川": 4, "スヴィリ川": 4, "デスナ川": 4,
    # 5
    "ネッカー川": 5, "ザーレ川": 5, "ヴルタヴァ川（モルダウ川）": 5, "イン川": 5, "モラヴァ川": 5,
    "ムレシュ川": 5, "オルト川": 5, "シレト川": 5, "アディジェ川": 5, "アルノ川": 5, "エムス川": 5,
    "ナレフ川": 5, "シュプレー川": 5, "ナイセ川": 5, "ソーヌ川": 5, "マルヌ川": 5, "ドルドーニュ川": 5,
    "セヴァーン川": 5, "シャノン川": 5, "ミーニョ川": 5, "ナルヴァ川": 5, "ヴェリーカヤ川": 5,
    "ベレジナ川": 5, "ドリナ川": 5, "ストルマ川": 5, "サカリヤ川": 5, "大メンデレス川": 5,
    "テレク川": 5, "リオニ川": 5, "ムール川": 5, "アイセル川": 5, "レク川": 5, "西モラヴァ川": 5,
    "ティチーノ川": 5, "ミンチョ川": 5, "サン川": 5, "ネリス川": 5, "トレント川": 5,
    "スエズ運河": 4,
}

# 湖の日本語名（Natural Earth の name_ja より優先する）
LAKE_JA: dict[str, str] = {
    "Lake Ladoga": "ラドガ湖", "Lake Onega": "オネガ湖", "Lake Peipus": "ペイプス湖", "Lake Pskov": "プスコフ湖",
    "Vänern": "ヴェーネルン湖", "Vättern": "ヴェッテルン湖", "Mälaren": "メーラレン湖",
    "Lake Saimaa": "サイマー湖", "Päijänne": "パイエンネ湖", "Inarijrvi": "イナリ湖",
    "Lake Geneva": "レマン湖", "Bodensee": "ボーデン湖", "Lake Balaton": "バラトン湖",
    "Neuchâtel": "ヌーシャテル湖", "Lago di Como": "コモ湖", "Lago di Garda": "ガルダ湖",
    "Lago Maggiore": "マッジョーレ湖", "Lake Zurich": "チューリヒ湖", "Zürichsee": "チューリヒ湖",
    "Lake Van": "ヴァン湖", "Lake Urmia": "ウルミア湖", "Lake Sevan": "セヴァン湖", "Lake Tuz": "トゥズ湖",
    "Sea of Galilee": "ガリラヤ湖", "Dead Sea": "死海", "Lake Skadar": "シュコダル湖",
    "Lake Ohrid": "オフリド湖", "Lake Prespa": "プレスパ湖",
    "Syvash": "シヴァシュ湖", "Lake Il'Men'": "イリメニ湖", "Lake Beloye": "ベロエ湖",
    "Kaliningradskiy Zaliv": "ヴィスワ潟", "Zalew Wislany": "ヴィスワ潟",
    "Lough Neagh": "ネイ湖", "Loch Ness": "ネス湖", "North Aral Sea": "アラル海", "South Aral Sea": "アラル海",
    "Võrtsjärv": "ヴォルツ湖",
}

# 歴史地図として重要な湖の表示開始の拡大率
LAKE_MINZ: dict[str, float] = {
    "ラドガ湖": 2, "オネガ湖": 2, "ヴェーネルン湖": 2, "ペイプス湖": 3, "ヴェッテルン湖": 3, "メーラレン湖": 3,
    "レマン湖": 4, "ボーデン湖": 4, "バラトン湖": 4, "ヴァン湖": 3, "ウルミア湖": 3, "セヴァン湖": 4,
    "死海": 4, "ガリラヤ湖": 5, "イリメニ湖": 4, "アラル海": 2, "ヴィスワ潟": 4,
    "コモ湖": 5, "ガルダ湖": 5, "マッジョーレ湖": 5, "シュコダル湖": 5, "オフリド湖": 5,
}

# 貯水池として登録されているが、もとは自然の湖のもの（残す）
NATURAL_RESERVOIRS = {
    "Lake Il'Men'", "Ozero Kubenskoye", "Oulujärvi", "Lake Imandra", "Lake Kovdozero",
    "Lake Vygozero", "Lake Segozerskoye", "Pielinen",
}


def fetch() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for name in SOURCES:
        p = CACHE / f"{name}.geojson"
        if not p.exists():
            print(f"download {name}", file=sys.stderr)
            urllib.request.urlretrieve(f"{BASE}/{name}.geojson", p)


def load(name: str) -> gpd.GeoDataFrame:
    g = gpd.read_file(CACHE / f"{name}.geojson")
    g = g[g.geometry.notna()].cx[BBOX[0] : BBOX[2], BBOX[1] : BBOX[3]].copy()
    g["geometry"] = g.geometry.intersection(box(*BBOX))
    return g[~g.geometry.is_empty]


def s(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v).strip()


def default_river_minz(sr: float) -> float:
    if sr <= 3:
        return 3
    if sr <= 5:
        return 4
    if sr <= 7:
        return 5
    if sr <= 9:
        return 6
    if sr <= 10:
        return 6.5
    return 7


def minz_to_rank(z: float) -> int:
    return {2: 1, 3: 3, 4: 5, 5: 7}.get(int(z), 9)


def build_rivers() -> list[dict]:
    a = load("ne_10m_rivers_lake_centerlines")
    b = load("ne_10m_rivers_europe")
    b = b[b.scalerank <= MAX_RIVER_SCALERANK]
    rows = []
    for g, src in ((a, "main"), (b, "eu")):
        for r in g.itertuples():
            keys = [s(r.name), s(r.name_en), s(r.name_alt)]
            ja = next((RIVER_JA[k] for k in keys if k in RIVER_JA), "")
            if not ja and src == "eu":
                ja = s(getattr(r, "name_ja", ""))
            name_en = s(r.name_en) or s(r.name)
            sr = float(r.scalerank)
            minz = default_river_minz(sr)
            rank = int(sr)
            if ja in RIVER_MINZ:
                minz = min(minz, RIVER_MINZ[ja])
                rank = min(rank, minz_to_rank(RIVER_MINZ[ja]))
            canal = next((CANAL_FROM[k] for k in keys if k in CANAL_FROM), None)
            rows.append(dict(name=ja, name_en=name_en, minz=minz, rank=rank, canal=canal, geom=r.geometry))
    # 同じ川（日本語名）の区間は一番大きい区分にそろえ、1つの地物にまとめる
    best: dict[str, tuple[float, int, str]] = {}
    for r in rows:
        if r["name"]:
            cur = best.get(r["name"])
            cand = (r["minz"], r["rank"], r["name_en"])
            if cur is None or cand[:2] < cur[:2]:
                best[r["name"]] = cand
    groups: dict[tuple, list] = {}
    for r in rows:
        if r["name"]:
            minz, rank, en = best[r["name"]]
            key = (r["name"], en, minz, rank, r["canal"])
        else:
            key = ("", r["name_en"], r["minz"], r["rank"], r["canal"])
        groups.setdefault(key, []).append(r["geom"])
    feats = []
    for (ja, en, minz, rank, canal), geoms in groups.items():
        g = unary_union(geoms)
        if g.geom_type == "MultiLineString":
            g = linemerge(g)
        props = dict(name=ja, name_en=en, minz=minz, rank=rank)
        if canal:
            props["from"] = canal
        feats.append(dict(type="Feature", properties=props, geometry=mapping(g)))
    feats.sort(key=lambda f: (f["properties"]["rank"], f["properties"]["name_en"]))
    return feats


def default_lake_minz(min_zoom: float, sr: float) -> float:
    z = float(min_zoom) if min_zoom and min_zoom > 0 else sr
    return max(2.5, min(7.5, round(z * 2) / 2 + 1))


def build_lakes() -> list[dict]:
    a = load("ne_10m_lakes")
    b = load("ne_10m_lakes_europe")
    b = b[b.scalerank <= 11]
    feats = []
    for g in (a, b):
        for r in g.itertuples():
            name = s(r.name)
            if r.featurecla == "Reservoir" and name not in NATURAL_RESERVOIRS:
                continue
            ja = LAKE_JA.get(name) or s(getattr(r, "name_ja", ""))
            minz = default_lake_minz(r.min_zoom, float(r.scalerank))
            if ja in LAKE_MINZ:
                minz = min(minz, LAKE_MINZ[ja])
            rank = int(r.scalerank)
            props = dict(name=ja, name_en=s(getattr(r, "name_en", "")) or name, minz=minz, rank=rank)
            feats.append(dict(type="Feature", properties=props, geometry=mapping(r.geometry)))
    feats.sort(key=lambda f: (f["properties"]["rank"], f["properties"]["name_en"]))
    return feats


def write_simplified(feats: list[dict], out: Path, interval: int, kind: str) -> None:
    tmp = ROOT / ".cache" / f"{out.stem}_raw.geojson"
    tmp.write_text(json.dumps(dict(type="FeatureCollection", features=feats), ensure_ascii=False))
    cmd = ["npx", "--yes", "mapshaper", "-i", str(tmp), "-simplify", f"interval={interval}"]
    if kind == "polygon":
        cmd += ["keep-shapes", "-filter-slivers", "min-area=0.5km2"]
    cmd += ["-filter", "!this.isNull", "-o", str(out), "format=geojson", "precision=0.0005"]
    subprocess.run(cmd, check=True, cwd=ROOT)
    # 座標がなくなった地物・属性の整形
    fc = json.loads(out.read_text())
    keep = []
    for f in fc["features"]:
        if not f.get("geometry"):
            continue
        if kind == "polygon" and shape(f["geometry"]).area < 1e-4:
            continue
        keep.append(f)
    fc = dict(type="FeatureCollection", features=keep)
    out.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")))
    print(f"{out.relative_to(ROOT)}: {len(keep)} features, {out.stat().st_size // 1024} KB", file=sys.stderr)


def main() -> None:
    fetch()
    OUT.mkdir(parents=True, exist_ok=True)
    write_simplified(build_rivers(), OUT / "rivers.json", SIMPLIFY_INTERVAL_RIVERS, "line")
    write_simplified(build_lakes(), OUT / "lakes.json", SIMPLIFY_INTERVAL_LAKES, "polygon")


if __name__ == "__main__":
    main()
