#!/usr/bin/env python3
"""南ドイツ（BS）の地域データ data/regions/germany_south.yaml を生成する。"""
import json, sys

WP = "https://ja.wikipedia.org/wiki/"
DWP = "https://de.wikipedia.org/wiki/"

H, R, G = "hre", "rhine_confederation", "german_confederation"

C_RHINE = "ライン同盟の結成・神聖ローマ帝国の解体"
C_1813 = "ライン同盟の解体（ライプツィヒの戦いの後）"
C_GC = "ドイツ連邦の発足（ウィーン議定書）"
S_RHINE = WP + "ライン同盟"
S_GC = WP + "ドイツ連邦"
S_RD = WP + "帝国代表者会議主要決議"
S_PRESS = WP + "プレスブルクの和約"


def E(frm, owner, overlord=None, cause=None, certainty=None, note=None, source=None):
    d = {"from": frm, "owner": owner}
    if overlord:
        d["overlord"] = overlord
    if certainty:
        d["certainty"] = certainty
    if cause:
        d["cause"] = cause
    if note:
        d["note"] = note
    if source:
        d["source"] = source
    return d


def tail(owner, rhine=1806, end1813=True, gc=True, rhine_cause=C_RHINE):
    """ライン同盟加盟（rhine 年）→1813 解体→1815 ドイツ連邦"""
    out = []
    if rhine:
        out.append(E(rhine, owner, R, rhine_cause, source=S_RHINE))
    if end1813:
        out.append(E(1813, owner, None, C_1813, source=WP + "ライプツィヒの戦い"))
    if gc:
        out.append(E(1815, owner, G, C_GC, source=S_GC))
    return out


LEFT_BANK = [
    E(1797, "france", None, "カンポ・フォルミオ条約（秘密条項）でライン左岸のフランス併合が決まる（1794年からフランス軍が占領）",
      "occupied", source=WP + "カンポ・フォルミオ条約"),
    E(1801, "france", None, "リュネヴィル条約でライン左岸がフランス領に", source=WP + "リュネヴィル条約"),
]
NORTH_1814 = [
    E(1814, "prussia", None, "第一次パリ条約でフランスが放棄、連合国の管理下（中部ライン総督府）", "uncertain",
      source=WP + "パリ条約_(1814年)"),
    E(1815, "prussia", G, "ウィーン議定書でプロイセン領（のちのライン州）", source=WP + "ウィーン議定書"),
]


def south_1814(final):
    return [
        E(1814, "habsburg", None, "第一次パリ条約でフランスが放棄、オーストリア・バイエルン共同管理委員会の管理下（ウィーン議定書でいったんオーストリアに割り当て）",
          "uncertain", source=DWP + "Gemeinschaftliche_Landesadministrationskommission"),
        E(1816, final, G,
          "ミュンヘン条約でバイエルン領（ラインクライス）" if final == "bavaria" else "ウィーン議定書に基づきヘッセン大公国領（ラインヘッセン）",
          source=DWP + ("Rheinkreis" if final == "bavaria" else "Rheinhessen")),
    ]


REUNION = E(1680, "france", None, "ルイ14世の再統合（レユニオン）政策によりフランスが併合（1684年レーゲンスブルク休戦条約で一時承認）",
            "occupied", note="ザール州（Province de la Sarre）として統治。要確認：個々の領邦が併合された年は1679–1684年で異なる。",
            source=WP + "レユニオン政策")

regions = []


def region(id, name, pieces=None, timeline=None, note=None, select=None):
    r = {"id": id, "name": name}
    r["select"] = select if select else {"pieces": pieces}
    if note:
        r["note"] = note
    r["timeline"] = timeline
    regions.append(r)


# ======================================================================= バイエルン
region("bavaria_core", "バイエルン（オーバーバイエルン・ニーダーバイエルン）",
       select={"adm2": ["DEU/Oberbayern", "DEU/Niederbayern"], "pieces": ["DEU-Aichach_Friedberg"]},
       timeline=[
           E(1648, "bavaria", H, source=WP + "バイエルン選帝侯領"),
           E(1704, "habsburg", H, "ブレンハイム（ヘーヒシュテット）の戦いの後、イルベスハイム条約でオーストリアの占領下に（1706年選帝侯の帝国追放）",
             "occupied", source=WP + "スペイン継承戦争"),
           E(1714, "bavaria", H, "ラシュタット条約・バーデン条約で選帝侯が復帰", source=WP + "ラシュタット条約"),
       ] + tail("bavaria", rhine_cause="バイエルン王国の成立（1806年1月）とライン同盟加盟")
       + [],
       note="オーバーバイエルン・ニーダーバイエルンの大部分（ここに含まれる司教領などは別の地域で上書き）。1742–45年のオーストリア軍による占領（オーストリア継承戦争）は描かない。")

region("upper_palatinate", "オーバープファルツ",
       select={"adm2": ["DEU/Oberpfalz"]},
       timeline=[
           E(1648, "bavaria", H, "ウェストファリア条約でバイエルン領と確認（1628年から領有）", source=WP + "ヴェストファーレン条約"),
           E(1704, "habsburg", H, "スペイン継承戦争でオーストリアの占領下に", "occupied", source=WP + "スペイン継承戦争"),
           E(1708, "palatinate", H, "皇帝がオーバープファルツと選帝侯位の一部をプファルツ選帝侯ヨハン・ヴィルヘルムに与える", "uncertain",
             note="要確認：プファルツの実効支配の程度。", source=DWP + "Oberpfalz"),
           E(1714, "bavaria", H, "ラシュタット条約・バーデン条約でバイエルンに返還", source=WP + "ラシュタット条約"),
       ] + tail("bavaria", rhine_cause="バイエルン王国の成立とライン同盟加盟"),
       note="ズルツバッハ（プファルツ＝ズルツバッハ）、ロプコヴィッツ家のノイシュタット＝シュテルンシュタインなどの小領はまとめた。")

region("regensburg_city", "レーゲンスブルク",
       pieces=["DEU-Regensburg_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "other_hre", H, note="帝国都市レーゲンスブルク（1663年から永久帝国議会の所在地）。レーゲンスブルク司教領と帝国修道院も併存した。",
             source=DWP + "Reichsstadt_Regensburg"),
           E(1803, "frankfurt_gd", H, "帝国代表者会議主要決議：ダールベルクのレーゲンスブルク侯国に", source=S_RD),
           E(1806, "frankfurt_gd", R, C_RHINE, source=S_RHINE),
           E(1810, "bavaria", R, "パリ条約（1810）でダールベルクがバイエルンに譲る", source=DWP + "Fürstentum_Regensburg"),
           E(1813, "bavaria", None, C_1813),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ])

region("neuburg", "ノイブルク（プファルツ＝ノイブルク）",
       pieces=["DEU-Neuburg_Schrobenhausen"],
       timeline=[
           E(1648, "palatinate_neuburg", H, source=DWP + "Pfalz-Neuburg"),
           E(1685, "palatinate", H, "プファルツ＝ノイブルク家がプファルツ選帝侯位を継承（ジンメルン系の断絶）", source=WP + "プファルツ選帝侯領"),
           E(1777, "bavaria", H, "プファルツ選帝侯カール・テオドールがバイエルンを相続", source=WP + "バイエルン継承戦争"),
       ] + tail("bavaria"),
       note="南部のシュローベンハウゼンはバイエルン領。プファルツ＝ノイブルクの飛び地（ラウインゲン、ブルクレンゲンフェルト、ヒルポルトシュタインなど）はピースが合わないので描かない。")

region("passau_city", "パッサウ", pieces=["DEU-Passau_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "passau", H, source=DWP + "Hochstift_Passau"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議：イルツ川・イン川以西の市街などはバイエルンへ", source=S_RD),
       ] + tail("bavaria"))

region("passau_abteiland", "パッサウ司教領（アプタイラント）", pieces=["DEU-Freyung_Grafenau"],
       timeline=[
           E(1648, "passau", H, source=DWP + "Hochstift_Passau"),
           E(1803, "salzburg", H, "帝国代表者会議主要決議：パッサウ司教領の主要部はザルツブルク選帝侯国へ", source=S_RD),
           E(1805, "bavaria", H, "プレスブルク条約でバイエルン領に", source=S_PRESS),
       ] + tail("bavaria"))

region("berchtesgaden", "ベルヒテスガーデン", pieces=["DEU-Berchtesgadener_Land"],
       timeline=[
           E(1648, "berchtesgaden", H, source=DWP + "Fürstpropstei_Berchtesgaden"),
           E(1803, "salzburg", H, "帝国代表者会議主要決議：ザルツブルク選帝侯国に併合", source=S_RD),
           E(1805, "habsburg", H, "プレスブルク条約：ザルツブルクとともにオーストリア領", source=S_PRESS),
           E(1806, "habsburg", None, "神聖ローマ帝国の解体"),
           E(1810, "bavaria", R, "シェーンブルン条約（1809）の結果、ザルツブルクとともにバイエルン領", source=DWP + "Fürstpropstei_Berchtesgaden"),
           E(1813, "bavaria", None, C_1813),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ],
       note="ピースには、バイエルン領バート・ライヒェンハルと、ザルツブルク領ルペルティヴィンケル（ラウフェン・フライラッシング。1810年からバイエルン）も含む。面積の大きい修道院侯領の所属で塗る。")

region("werdenfels", "ヴェルデンフェルス（フライジング司教領）", pieces=["DEU-Garmisch_Partenkirchen"],
       timeline=[
           E(1648, "freising", H, note="フライジング司教領のヴェルデンフェルス伯領。北部のムルナウ・エッタールはバイエルン領。",
             source=DWP + "Grafschaft_Werdenfels"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議（1802年からバイエルンが占領）", source=S_RD),
       ] + tail("bavaria"))

region("eichstatt", "アイヒシュテット司教領", pieces=["DEU-Eichstatt"],
       timeline=[
           E(1648, "eichstatt", H, source=DWP + "Hochstift_Eichstätt"),
           E(1803, "salzburg", H, "帝国代表者会議主要決議：大部分がザルツブルク選帝侯国へ（一部はバイエルン）", source=S_RD),
           E(1805, "bavaria", H, "プレスブルク条約でバイエルン領に", source=S_PRESS),
       ] + tail("bavaria"))

# ---------------------------------------------------------------- シュヴァーベン（バイエルン側）
region("augsburg_city", "帝国都市アウクスブルク", pieces=["DEU-Augsburg_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "other_hre", H, note="帝国都市アウクスブルク（宗派同権の都市）", source=DWP + "Reichsstadt_Augsburg"),
           E(1806, "bavaria", R, "プレスブルク条約に基づき1806年3月にバイエルンへ編入", source=S_PRESS),
           E(1813, "bavaria", None, C_1813),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ])

region("augsburg_bishopric", "アウクスブルク司教領", pieces=["DEU-Augsburg_Landkreis", "DEU-Dillingen_a_d_Donau", "DEU-Ostallgau"],
       timeline=[
           E(1648, "augsburg_bishopric", H, source=DWP + "Hochstift_Augsburg"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議（世俗化）", source=S_RD),
       ] + tail("bavaria"),
       note="ディリンゲンのピースにはプファルツ＝ノイブルク領（ラウインゲン・ヘーヒシュテット）、アウクスブルク郡にはブルガウ辺境伯領・フッガー家領も含む。")

region("swabian_imperial_cities_bav", "帝国都市メミンゲン・カウフボイレン",
       pieces=["DEU-Kaufbeuren_Kreisfreie_Stadt", "DEU-Memmingen_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "other_hre", H, note="シュヴァーベンの帝国都市", source=DWP + "Reichsstadt"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議（帝国都市の陪臣化）", source=S_RD),
       ] + tail("bavaria"))

region("kempten", "ケンプテン修道院侯領", pieces=["DEU-Kempten_Allgau_Kreisfreie_Stadt", "DEU-Oberallgau"],
       timeline=[
           E(1648, "kempten", H, source=DWP + "Fürststift_Kempten"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議（世俗化。帝国都市ケンプテンも陪臣化）", source=S_RD),
       ] + tail("bavaria"),
       note="帝国都市ケンプテン（市街）と、アウクスブルク司教領のゾントホーフェン・オーバーストドルフも含む。")

region("oettingen", "エッティンゲン（リース地方）", pieces=["DEU-Donau_Ries"],
       timeline=[
           E(1648, "other_hre", H, note="エッティンゲン伯（1674年から侯）家領、帝国都市ネルトリンゲンなど。ドナウヴェルトは1607年からバイエルン領。",
             source=DWP + "Oettingen_(Adelsgeschlecht)"),
           E(1806, "bavaria", R, "ライン同盟規約でエッティンゲン家がバイエルンの主権下に（陪臣化）", source=S_RHINE),
           E(1813, "bavaria", None, C_1813),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ])

region("unterallgau", "ウンターアルゴイ（オットーボイレンなど）", pieces=["DEU-Unterallgau"],
       timeline=[
           E(1648, "other_hre", H, note="帝国修道院オットーボイレン、フッガー家領バーベンハウゼン、バイエルン領ミンデルハイムなど。",
             source=DWP + "Reichsabtei_Ottobeuren"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議（オットーボイレン修道院の世俗化）", source=S_RD),
       ] + tail("bavaria"))

region("burgau", "ブルガウ辺境伯領（前方オーストリア）", pieces=["DEU-Gunzburg", "DEU-Neu_Ulm"],
       timeline=[
           E(1648, "habsburg", H, note="前方オーストリアのブルガウ辺境伯領。ノイウルム郡にはフッガー家領（オーストリアの主権下）や帝国都市ウルムの領地も含む。",
             source=DWP + "Markgrafschaft_Burgau"),
           E(1805, "bavaria", H, "プレスブルク条約でバイエルン領に", source=S_PRESS),
       ] + tail("bavaria"))

region("lindau", "リンダウ・西アルゴイ", pieces=["DEU-Lindau_Bodensee"],
       timeline=[
           E(1648, "habsburg", H, note="オーストリア領ホーエンエック（西アルゴイ）と帝国都市リンダウ。",
             source=DWP + "Herrschaft_Hohenegg"),
           E(1805, "bavaria", H, "プレスブルク条約でバイエルン領に", source=S_PRESS),
       ] + tail("bavaria"),
       note="要確認：西アルゴイのオーストリア領と帝国都市リンダウの面積比。")

# ---------------------------------------------------------------- フランケン
region("nuremberg", "帝国都市ニュルンベルク", pieces=["DEU-Nurnberg_Kreisfreie_Stadt", "DEU-Nurnberger_Land"],
       timeline=[
           E(1648, "nuremberg", H, source=DWP + "Reichsstadt_Nürnberg"),
           E(1806, "bavaria", R, "ライン同盟規約でバイエルンへ編入（1806年9月）", source=S_RHINE),
           E(1813, "bavaria", None, C_1813),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ])

region("ansbach", "アンスバッハ辺境伯領",
       pieces=["DEU-Ansbach_Kreisfreie_Stadt", "DEU-Ansbach_Landkreis", "DEU-Weienburg_Gunzenhausen", "DEU-Roth",
               "DEU-Schwabach_Kreisfreie_Stadt", "DEU-Furth_Landkreis", "DEU-Furth_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "ansbach", H, source=DWP + "Fürstentum_Ansbach"),
           E(1791, "prussia", H, "辺境伯カール・アレクサンダーの退位、プロイセン王が継承", source=DWP + "Fürstentum_Ansbach"),
           E(1806, "bavaria", R, "シェーンブルン条約・パリ条約でプロイセンがバイエルンに譲渡", source=DWP + "Fürstentum_Ansbach"),
           E(1813, "bavaria", None, C_1813),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ],
       note="アンスバッハ郡には帝国都市ローテンブルク・ディンケルスビュール、ヴァイセンブルク郡にはパッペンハイム家領・帝国都市ヴァイセンブルクも含む。フュルトはアンスバッハ・バンベルク・ニュルンベルクの共同支配。")

region("bayreuth", "バイロイト辺境伯領",
       pieces=["DEU-Bayreuth_Kreisfreie_Stadt", "DEU-Bayreuth_Landkreis", "DEU-Kulmbach", "DEU-Hof_Kreisfreie_Stadt",
               "DEU-Hof_Landkreis", "DEU-Wunsiedel_i_Fichtelgebirge", "DEU-Erlangen_Kreisfreie_Stadt",
               "DEU-Neustadt_a_d_Aisch_Bad_Windsheim"],
       timeline=[
           E(1648, "bayreuth", H, source=DWP + "Fürstentum_Bayreuth"),
           E(1769, "ansbach", H, "バイロイト系の断絶、アンスバッハ辺境伯が相続（同君連合）", source=DWP + "Fürstentum_Bayreuth"),
           E(1791, "prussia", H, "辺境伯カール・アレクサンダーの退位、プロイセン王が継承", source=DWP + "Fürstentum_Bayreuth"),
           E(1806, "prussia", None, "神聖ローマ帝国の解体"),
           E(1807, "france", None, "ティルジット条約でプロイセンが放棄、フランスの管理下（1806年10月から占領）", "occupied",
             source=WP + "ティルジットの和約"),
           E(1810, "bavaria", R, "パリ条約（1810）でナポレオンがバイエルンに売却", source=DWP + "Fürstentum_Bayreuth"),
           E(1813, "bavaria", None, C_1813),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ],
       note="ノイシュタット・アン・デア・アイシュのピースには帝国都市ヴィンツハイムも含む。")

region("bamberg", "バンベルク司教領",
       pieces=["DEU-Bamberg_Kreisfreie_Stadt", "DEU-Bamberg_Landkreis", "DEU-Forchheim", "DEU-Kronach", "DEU-Lichtenfels",
               "DEU-Erlangen_Hochstadt"],
       timeline=[
           E(1648, "bamberg", H, source=DWP + "Hochstift_Bamberg"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議（1802年からバイエルンが占領）", source=S_RD),
       ] + tail("bavaria"),
       note="エアランゲン＝ヘーヒシュタット郡はバンベルク領ヘーヒシュタット・ヘルツォーゲンアウラッハとバイロイト領の混在。")

region("wurzburg", "ヴュルツブルク司教領",
       pieces=["DEU-Wurzburg_Kreisfreie_Stadt", "DEU-Wurzburg_Landkreis", "DEU-Kitzingen", "DEU-Main_Spessart",
               "DEU-Schweinfurt_Landkreis", "DEU-Bad_Kissingen", "DEU-Rhon_Grabfeld", "DEU-Haberge"],
       timeline=[
           E(1648, "wurzburg", H, source=DWP + "Hochstift_Würzburg"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議（1802年からバイエルンが占領）", source=S_RD),
           E(1805, "wurzburg", H, "プレスブルク条約：前トスカーナ大公フェルディナントのヴュルツブルク選帝侯国に", source=S_PRESS),
           E(1806, "wurzburg", R, "ヴュルツブルク大公国としてライン同盟に加盟（1806年9月）", source=DWP + "Großherzogtum_Würzburg"),
           E(1813, "wurzburg", None, C_1813),
           E(1814, "bavaria", None, "パリ条約（1814年6月）でバイエルン領に（フェルディナントはトスカーナに復帰）", source=DWP + "Großherzogtum_Würzburg"),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ],
       note="マイン＝シュペッサルト郡のロール（マインツ領）、バート・キッシンゲン郡のハンメルブルク（フルダ領）なども含む。")

region("schweinfurt_city", "帝国都市シュヴァインフルト", pieces=["DEU-Schweinfurt_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "other_hre", H, note="帝国都市シュヴァインフルト", source=DWP + "Reichsstadt_Schweinfurt"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議（帝国都市の陪臣化）", source=S_RD),
           E(1806, "bavaria", R, C_RHINE, source=S_RHINE),
           E(1810, "wurzburg", R, "バイエルンからヴュルツブルク大公国へ", note="要確認", source=DWP + "Reichsstadt_Schweinfurt"),
           E(1813, "wurzburg", None, C_1813),
           E(1814, "bavaria", None, "パリ条約（1814年6月）でバイエルン領に"),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ])

region("aschaffenburg", "アシャッフェンブルク（マインツ領）",
       pieces=["DEU-Aschaffenburg_Kreisfreie_Stadt", "DEU-Aschaffenburg_Landkreis"],
       timeline=[
           E(1648, "mainz", H, note="マインツ選帝侯の第二の居城の町", source=DWP + "Oberstift_Mainz"),
           E(1803, "frankfurt_gd", H, "帝国代表者会議主要決議：ダールベルクのアシャッフェンブルク侯国に", source=S_RD),
           E(1806, "frankfurt_gd", R, C_RHINE, source=S_RHINE),
           E(1813, "other_hre", None, "フランクフルト大公国の解体、連合国の管理下", "uncertain"),
           E(1814, "bavaria", None, "パリ条約（1814年6月）でバイエルン領に", source=DWP + "Fürstentum_Aschaffenburg"),
           E(1815, "bavaria", G, C_GC, source=S_GC),
       ])

region("miltenberg", "ミルテンベルク・アモールバッハ（マインツ領オーデンヴァルト）", pieces=["DEU-Miltenberg"],
       timeline=[
           E(1648, "mainz", H, source=DWP + "Oberstift_Mainz"),
           E(1803, "other_hre", H, "帝国代表者会議主要決議：新設のライニンゲン侯国へ", source=DWP + "Fürstentum_Leiningen"),
           E(1806, "baden", R, "ライン同盟規約：ライニンゲン侯国がバーデンの主権下に（陪臣化）", source=DWP + "Fürstentum_Leiningen"),
           E(1810, "hesse_darmstadt", R, "バーデンとヘッセンの領土交換", note="要確認", source=DWP + "Amorbach"),
           E(1813, "hesse_darmstadt", None, C_1813),
           E(1815, "hesse_darmstadt", G, C_GC, source=S_GC),
           E(1816, "bavaria", G, "ヘッセン大公国からバイエルンへ（ミュンヘン条約・1816年の領土交換）", note="要確認"),
       ])

# ======================================================================= バーデン＝ヴュルテンベルク
region("wurttemberg_core", "ヴュルテンベルク本領",
       pieces=["DEU-Stuttgart_Stadtkreis", "DEU-Ludwigsburg", "DEU-Boblingen", "DEU-Esslingen", "DEU-Goppingen",
               "DEU-Rems_Murr_Kreis", "DEU-Reutlingen", "DEU-Tubingen_Landkreis", "DEU-Calw", "DEU-Freudenstadt",
               "DEU-Enzkreis", "DEU-Heidenheim", "DEU-Heilbronn_Landkreis", "DEU-Tuttlingen", "DEU-Zollernalbkreis"],
       timeline=[E(1648, "wurttemberg", H, source=WP + "ヴュルテンベルク公国")]
       + tail("wurttemberg", rhine_cause="ヴュルテンベルク王国の成立（1806年1月）とライン同盟加盟"),
       note="帝国都市エスリンゲン・ロイトリンゲン（1803年ヴュルテンベルク）、ホーエンツォレルン＝ヘヒンゲン侯国（ツォレルンアルプ郡）、前方オーストリア領ホーエンベルク伯領（トゥットリンゲン郡など）、エンツ郡のバーデン領、ハイルブロン郡のドイツ騎士団領なども含む。")

region("heilbronn_city", "帝国都市ハイルブロン", pieces=["DEU-Heilbronn_Stadtkreis"],
       timeline=[
           E(1648, "other_hre", H, note="帝国都市ハイルブロン"),
           E(1803, "wurttemberg", H, "帝国代表者会議主要決議（帝国都市の陪臣化）", source=S_RD),
       ] + tail("wurttemberg"))

region("ellwangen", "エルヴァンゲンとオストアルプ", pieces=["DEU-Ostalbkreis"],
       timeline=[
           E(1648, "other_hre", H, note="エルヴァンゲン修道院長領（侯領）、帝国都市シュヴェービッシュ・グミュント・アーレン・ボップフィンゲン、エッティンゲン家領など。",
             source=DWP + "Fürstpropstei_Ellwangen"),
           E(1803, "wurttemberg", H, "帝国代表者会議主要決議（エルヴァンゲンの世俗化、帝国都市の陪臣化）", source=S_RD),
       ] + tail("wurttemberg"))

region("schwabisch_hall", "シュヴェービッシュ・ハル", pieces=["DEU-Schwabisch_Hall"],
       timeline=[
           E(1648, "other_hre", H, note="帝国都市シュヴェービッシュ・ハル、リンプルク伯領、ホーエンローエ家領、アンスバッハ領クライルスハイムなど。",
             source=DWP + "Reichsstadt_Schwäbisch_Hall"),
           E(1803, "wurttemberg", H, "帝国代表者会議主要決議（帝国都市ハルの陪臣化）", source=S_RD),
       ] + tail("wurttemberg"),
       note="リンプルク・ホーエンローエ領は1806年、クライルスハイム（アンスバッハ→バイエルン）は1810年にヴュルテンベルク領。")

region("hohenlohe", "ホーエンローエ", pieces=["DEU-Hohenlohekreis"],
       timeline=[
           E(1648, "other_hre", H, note="ホーエンローエ諸家（1744/64年から侯）の領地", source=DWP + "Hohenlohe_(Adelsgeschlecht)"),
           E(1806, "wurttemberg", R, "ライン同盟規約：ホーエンローエ家がヴュルテンベルクの主権下に（陪臣化）", source=S_RHINE),
           E(1813, "wurttemberg", None, C_1813),
           E(1815, "wurttemberg", G, C_GC, source=S_GC),
       ])

region("main_tauber", "タウバー川流域（メルゲントハイム・ヴェルトハイム）", pieces=["DEU-Main_Tauber_Kreis"],
       timeline=[
           E(1648, "other_hre", H, note="ドイツ騎士団総長領メルゲントハイム、マインツ領タウバービショフスハイム、レーヴェンシュタイン＝ヴェルトハイム伯領、ホーエンローエ家領など。",
             source=DWP + "Deutschordensstaat_Mergentheim"),
           E(1806, "baden", R, "ライン同盟規約：ライニンゲン・レーヴェンシュタイン家などがバーデンの主権下に", source=S_RHINE),
           E(1813, "baden", None, C_1813),
           E(1815, "baden", G, C_GC, source=S_GC),
       ],
       note="南部のメルゲントハイム（ドイツ騎士団）は1809年にヴュルテンベルク領。")

region("ulm", "帝国都市ウルムとその領域", pieces=["DEU-Ulm_Stadtkreis", "DEU-Alb_Donau_Kreis"],
       timeline=[
           E(1648, "other_hre", H, note="帝国都市ウルム（帝国都市で2番目に広い領域を持つ）、前方オーストリア領エーインゲンなど。",
             source=DWP + "Reichsstadt_Ulm"),
           E(1803, "bavaria", H, "帝国代表者会議主要決議でバイエルンへ", source=S_RD),
           E(1806, "bavaria", R, C_RHINE, source=S_RHINE),
           E(1810, "wurttemberg", R, "バイエルンとヴュルテンベルクの国境条約（1810）", source=DWP + "Grenzvertrag_zwischen_Bayern_und_Württemberg"),
           E(1813, "wurttemberg", None, C_1813),
           E(1815, "wurttemberg", G, C_GC, source=S_GC),
       ],
       note="ドナウ川沿いの前方オーストリア領（エーインゲンなど）は1805年にヴュルテンベルク領。")

region("rottweil", "帝国都市ロットヴァイル", pieces=["DEU-Rottweil"],
       timeline=[
           E(1648, "other_hre", H, note="帝国都市ロットヴァイル（広い領域を持つ）、前方オーストリア領シュランベルク、ヴュルテンベルク領ズルツなど。",
             source=DWP + "Reichsstadt_Rottweil"),
           E(1803, "wurttemberg", H, "帝国代表者会議主要決議（帝国都市の陪臣化）", source=S_RD),
       ] + tail("wurttemberg"))

region("upper_swabia", "オーバーシュヴァーベン（修道院領・帝国都市）", pieces=["DEU-Biberach", "DEU-Ravensburg"],
       timeline=[
           E(1648, "other_hre", H, note="ヴァインガルテン・オクセンハウゼン・シュッセンリートなどの帝国修道院、帝国都市ラーフェンスブルク・ビーベラッハ・ヴァンゲン、ヴァルトブルク家、オーストリア領シュヴァーベン代官領など。",
             source=DWP + "Oberschwaben"),
           E(1806, "wurttemberg", R, "ライン同盟結成前後の併合と陪臣化でヴュルテンベルク領に", source=S_RHINE),
           E(1813, "wurttemberg", None, C_1813),
           E(1815, "wurttemberg", G, C_GC, source=S_GC),
       ],
       note="1803–1806年は所属が細かく分かれる（修道院領はナッサウ＝オラニエ家・メッテルニヒ家など、帝国都市はバーデン・バイエルンなど）ため、まとめて描かない。ラーフェンスブルクなどは1810年にバイエルンからヴュルテンベルクへ。")

region("bodensee", "ボーデン湖北岸", pieces=["DEU-Bodenseekreis"],
       timeline=[
           E(1648, "other_hre", H, note="帝国修道院ザーレム、帝国都市ユーバーリンゲン・ブーフホルン、コンスタンツ司教領メーアスブルク、モンフォール伯領テットナング（1780年オーストリア）など。",
             source=DWP + "Reichsabtei_Salem"),
           E(1803, "baden", H, "帝国代表者会議主要決議：ザーレム・ユーバーリンゲン・メーアスブルクがバーデンへ", source=S_RD),
       ] + tail("baden"),
       note="東部のテットナング・フリードリヒスハーフェン（ブーフホルン）は1810年からヴュルテンベルク領。")

region("hohenzollern_sigmaringen", "ホーエンツォレルン＝ジグマリンゲン", pieces=["DEU-Sigmaringen"],
       timeline=[
           E(1648, "hohenzollern", H, note="ジグマリンゲン伯領はオーストリアの封土。ピースには前方オーストリア領のドナウ諸都市（メンゲン・ザウルガウ）やフュルステンベルク領メスキルヒも含む。",
             source=DWP + "Fürstentum_Hohenzollern-Sigmaringen"),
           E(1806, "hohenzollern", R, "ライン同盟に加盟して主権を得る", source=S_RHINE),
           E(1813, "hohenzollern", None, C_1813),
           E(1815, "hohenzollern", G, C_GC, source=S_GC),
       ])

region("breisgau", "ブライスガウと前方オーストリア（シュヴァルツヴァルト南部・ヘーガウ）",
       pieces=["DEU-Breisgau_Hochschwarzwald", "DEU-Waldshut", "DEU-Konstanz"],
       timeline=[
           E(1648, "habsburg", H, note="前方オーストリア（フライブルクの政庁が統治）。ザンクト・ブラージエン修道院領、ネレンブルク方伯領、帝国騎士領などを含む。",
             source=DWP + "Vorderösterreich"),
           E(1805, "baden", H, "プレスブルク条約：ブライスガウ・コンスタンツなどがバーデン領に（1803–05年はモデナ公エステ家領）", source=S_PRESS),
       ] + tail("baden"),
       note="ブライザッハは1648–1697年フランス領（ピースが粗いので描かない）。ネレンブルク（シュトックアッハ）は1805–10年ヴュルテンベルク領。")

region("freiburg_city", "フライブルク", pieces=["DEU-Freiburg_im_Breisgau_Stadtkreis"],
       timeline=[
           E(1648, "habsburg", H, source=DWP + "Freiburg_im_Breisgau"),
           E(1679, "france", None, "ナイメーヘンの和約（皇帝との講和）でフランス領", source=WP + "ナイメーヘンの和約"),
           E(1697, "habsburg", H, "ライスワイク条約でオーストリアに返還", source=WP + "レイスウェイク条約"),
           E(1805, "baden", H, "プレスブルク条約でバーデン領", source=S_PRESS),
       ] + tail("baden"))

region("markgraflerland", "マルクグレーフラーラント・ハッハベルク（バーデン領）", pieces=["DEU-Lorrach", "DEU-Emmendingen"],
       timeline=[E(1648, "baden", H, note="バーデン＝ドゥルラハ領のレッテルン・ザウゼンベルク・ハッハベルク。", source=DWP + "Markgräflerland")]
       + tail("baden"),
       note="エメンディンゲン郡にはオーストリア領ケンツィンゲン・ヴァルトキルヒも含む。")

region("ortenau", "オルテナウ", pieces=["DEU-Ortenaukreis"],
       timeline=[
           E(1648, "other_hre", H, note="オルテナウ代官領（オーストリア。1701–71年バーデン＝バーデンに質入れ）、帝国都市オッフェンブルク・ゲンゲンバッハ、フュルステンベルク家領、ハーナウ＝リヒテンベルク伯領（ケール）、シュトラスブルク司教領など。",
             source=DWP + "Ortenau"),
           E(1803, "baden", H, "帝国代表者会議主要決議：帝国都市、シュトラスブルク司教領の右岸部分などがバーデンへ", source=S_RD),
       ] + tail("baden"),
       note="オーストリアのオルテナウ代官領は1805年、フュルステンベルク家領は1806年にバーデン領。")

region("furstenberg", "フュルステンベルク（バール）", pieces=["DEU-Schwarzwald_Baar_Kreis"],
       timeline=[
           E(1648, "other_hre", H, note="フュルステンベルク家（1664/1716年から侯）の領地（ドナウエッシンゲン）、前方オーストリア領フィリンゲン、ヴュルテンベルク領シュヴェニンゲン。",
             source=DWP + "Fürstentum_Fürstenberg"),
           E(1806, "baden", R, "ライン同盟規約：フュルステンベルク家がバーデンの主権下に（陪臣化）", source=S_RHINE),
           E(1813, "baden", None, C_1813),
           E(1815, "baden", G, C_GC, source=S_GC),
       ])

region("baden_durlach", "バーデン＝ドゥルラハ本領（カールスルーエ・プフォルツハイム）",
       pieces=["DEU-Karlsruhe_Stadtkreis", "DEU-Karlsruhe_Landkreis", "DEU-Pforzheim_Stadtkreis"],
       timeline=[E(1648, "baden", H, source=WP + "バーデン辺境伯領")] + tail("baden"),
       note="カールスルーエ郡にはシュパイアー司教領（ブルッフザール）、プファルツ領ブレッテン、バーデン＝バーデン領エットリンゲンも含む。")

region("baden_baden", "バーデン＝バーデン", pieces=["DEU-Baden_Baden_Stadtkreis", "DEU-Rastatt"],
       timeline=[
           E(1648, "baden_baden", H, source=DWP + "Markgrafschaft_Baden-Baden"),
           E(1771, "baden", H, "バーデン＝バーデン家の断絶、両バーデンの統一", source=WP + "バーデン辺境伯領"),
       ] + tail("baden"))

region("kurpfalz_right", "プファルツ（ライン右岸：ハイデルベルク・マンハイム）",
       pieces=["DEU-Heidelberg_Stadtkreis", "DEU-Mannheim_Stadtkreis", "DEU-Rhein_Neckar_Kreis"],
       timeline=[
           E(1648, "palatinate", H, "ウェストファリア条約でプファルツ選帝侯が復位", source=WP + "ヴェストファーレン条約"),
           E(1777, "bavaria", H, "カール・テオドールのバイエルン相続（プファルツ＝バイエルン）", source=WP + "バイエルン継承戦争"),
           E(1803, "baden", H, "帝国代表者会議主要決議：右岸プファルツがバーデンへ", source=S_RD),
       ] + tail("baden"))

region("mosbach", "モースバッハ・ブーヘン（オーデンヴァルト南部）", pieces=["DEU-Neckar_Odenwald_Kreis"],
       timeline=[
           E(1648, "palatinate", H, note="プファルツ領モースバッハと、マインツ領ブーヘン・ヴァルデュルン、帝国騎士領。", source=DWP + "Neckar-Odenwald-Kreis"),
           E(1777, "bavaria", H, "カール・テオドールのバイエルン相続"),
           E(1803, "other_hre", H, "帝国代表者会議主要決議：新設のライニンゲン侯国へ", source=DWP + "Fürstentum_Leiningen"),
           E(1806, "baden", R, "ライン同盟規約：ライニンゲン侯国がバーデンの主権下に（陪臣化）", source=S_RHINE),
           E(1813, "baden", None, C_1813),
           E(1815, "baden", G, C_GC, source=S_GC),
       ])

# ======================================================================= ヘッセン
region("hesse_kassel_core", "ヘッセン＝カッセル本領",
       pieces=["DEU-Kassel_Kreisfreie_Stadt", "DEU-Kassel_Landkreis", "DEU-Schwalm_Eder_Kreis", "DEU-Werra_Meiner_Kreis",
               "DEU-Hersfeld_Rotenburg", "DEU-Marburg_Biedenkopf"],
       timeline=[
           E(1648, "hesse_kassel", H, "ウェストファリア条約でヘルスフェルトを獲得、ヘッセン戦争の講和でマールブルク北部を確保",
             source=WP + "ヘッセン＝カッセル方伯領"),
           E(1806, "france", None, "フランス軍の占領（選帝侯は亡命）", "occupied", source=WP + "ヘッセン選帝侯国"),
           E(1807, "westphalia_kingdom", R, "ヴェストファーレン王国（ジェローム・ボナパルト）に編入", source=WP + "ヴェストファーレン王国"),
           E(1813, "hesse_kassel", None, "ヴェストファーレン王国の崩壊、選帝侯の復帰", source=WP + "ヘッセン選帝侯国"),
           E(1815, "hesse_kassel", G, C_GC, source=S_GC),
       ],
       note="マールブルク＝ビーデンコップ郡のビーデンコップはヘッセン＝ダルムシュタット領、シュヴァルム＝エーダー郡のフリッツラーは1803年までマインツ領。")

region("waldeck", "ヴァルデック", pieces=["DEU-Waldeck_Frankenberg"],
       timeline=[
           E(1648, "waldeck", H, source=DWP + "Waldeck_(Land)"),
           E(1806, "waldeck", None, "神聖ローマ帝国の解体"),
           E(1807, "waldeck", R, "ライン同盟に加盟", source=S_RHINE),
           E(1813, "waldeck", None, C_1813),
           E(1815, "waldeck", G, C_GC, source=S_GC),
       ],
       note="南東部のフランケンベルクはヘッセン＝カッセル領。")

region("fulda", "フルダ", pieces=["DEU-Fulda"],
       timeline=[
           E(1648, "fulda", H, source=DWP + "Hochstift_Fulda"),
           E(1803, "nassau_orange", H, "帝国代表者会議主要決議：ナッサウ＝オラニエ＝フルダ侯国に", source=S_RD),
           E(1806, "france", None, "ナポレオンがオラニエ家の領地を没収、フランスの管理下", "occupied", source=DWP + "Fürstentum_Fulda"),
           E(1810, "frankfurt_gd", R, "フランクフルト大公国に編入", source=WP + "フランクフルト大公国"),
           E(1813, "other_hre", None, "フランクフルト大公国の解体、連合国の管理下", "uncertain"),
           E(1815, "prussia", G, "ウィーン議定書でプロイセン領（1816年ヘッセン選帝侯国へ）", source=DWP + "Fürstentum_Fulda"),
           E(1816, "hesse_kassel", G, "プロイセンからヘッセン選帝侯国へ", source=DWP + "Fürstentum_Fulda"),
       ])

region("hanau", "ハーナウ", pieces=["DEU-Main_Kinzig_Kreis"],
       timeline=[
           E(1648, "other_hre", H, note="ハーナウ＝ミュンツェンベルク伯領、帝国都市ゲルンハウゼン、イーゼンブルク家領など。", source=DWP + "Grafschaft_Hanau"),
           E(1736, "hesse_kassel", H, "ハーナウ伯家の断絶、ヘッセン＝カッセルが相続", source=DWP + "Grafschaft_Hanau-Münzenberg"),
           E(1806, "france", None, "フランス軍の占領", "occupied", source=DWP + "Fürstentum_Hanau"),
           E(1810, "frankfurt_gd", R, "フランクフルト大公国に編入", source=WP + "フランクフルト大公国"),
           E(1813, "hesse_kassel", None, "フランクフルト大公国の解体、選帝侯の復帰", source=DWP + "Fürstentum_Hanau"),
           E(1815, "hesse_kassel", G, C_GC, source=S_GC),
       ])

region("isenburg", "オッフェンバッハ（イーゼンブルク）",
       pieces=["DEU-Offenbach_Landkreis", "DEU-Offenbach_am_Main_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "other_hre", H, note="イーゼンブルク＝ビルシュタイン家（オッフェンバッハ）、マインツ領ゼーリゲンシュタット、ハーナウ領など。",
             source=DWP + "Fürstentum_Isenburg"),
           E(1806, "other_hre", R, "イーゼンブルク侯国がライン同盟に加盟", source=S_RHINE),
           E(1813, "other_hre", None, "ライン同盟の解体、連合国（オーストリア）の管理下", "uncertain"),
           E(1816, "hesse_darmstadt", G, "ウィーン会議の決定によりヘッセン大公国領", source=DWP + "Fürstentum_Isenburg"),
       ])

region("frankfurt", "フランクフルト", pieces=["DEU-Frankfurt_am_Main_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "frankfurt", H, source=WP + "フランクフルト自由都市"),
           E(1806, "frankfurt_gd", R, "ライン同盟規約：ダールベルクの首座大司教侯国に編入", source=S_RHINE),
           E(1813, "frankfurt", None, "フランクフルト大公国の解体、都市の独立回復", source=WP + "フランクフルト大公国"),
           E(1815, "frankfurt", G, "ウィーン議定書で自由都市、ドイツ連邦議会の所在地", source=WP + "フランクフルト自由都市"),
       ])

region("wetterau", "ヴェッテラウ", pieces=["DEU-Wetteraukreis"],
       timeline=[
           E(1648, "other_hre", H, note="帝国都市・帝国城塞フリートベルク、イーゼンブルク＝ビューディンゲン、ゾルムス家、シュトルベルク家などの伯領（ヴェッテラウ伯団）。",
             source=DWP + "Wetterauer_Grafenverein"),
           E(1806, "hesse_darmstadt", R, "ライン同盟規約：ゾルムス・シュトルベルク家などがヘッセン大公国の主権下に", source=S_RHINE),
       ] + tail("hesse_darmstadt", rhine=None),
       note="イーゼンブルク＝ビューディンゲンは1806–16年イーゼンブルク侯国の主権下。")

region("upper_hesse_darmstadt", "オーバーヘッセン（ギーセン）", pieces=["DEU-Gieen_Landkreis", "DEU-Vogelsbergkreis"],
       timeline=[
           E(1648, "hesse_darmstadt", H, "ヘッセン戦争の講和（1648）でギーセンを含むマールブルク遺領の南部を確保", source=DWP + "Hessenkrieg"),
       ] + tail("hesse_darmstadt", rhine_cause="ヘッセン大公国の成立とライン同盟加盟"),
       note="ゾルムス家（リヒ・ラウバッハ）、リーデーゼル家（ラウターバッハ）などの領地も含む（1806年陪臣化）。")

region("starkenburg", "スタルケンブルク（ダルムシュタット）",
       pieces=["DEU-Darmstadt_Kreisfreie_Stadt", "DEU-Darmstadt_Dieburg", "DEU-Gro_Gerau"],
       timeline=[E(1648, "hesse_darmstadt", H, note="上カッツェンエルンボーゲン伯領。ディーブルクは1803年までマインツ領。",
                   source=WP + "ヘッセン＝ダルムシュタット方伯領")]
       + tail("hesse_darmstadt", rhine_cause="ヘッセン大公国の成立とライン同盟加盟"))

region("bergstrasse", "ベルクシュトラーセ", pieces=["DEU-Bergstrae"],
       timeline=[
           E(1648, "palatinate", H, note="マインツがプファルツに質入れしていた地域。", source=DWP + "Bergstraße_(Region)"),
           E(1650, "mainz", H, "ベルクシュトラーセ協定でマインツに返還", note="要確認：年（1650年）", source=DWP + "Bergsträßer_Rezess"),
           E(1803, "hesse_darmstadt", H, "帝国代表者会議主要決議", source=S_RD),
       ] + tail("hesse_darmstadt", rhine_cause="ヘッセン大公国の成立とライン同盟加盟"))

region("erbach", "エルバッハ（オーデンヴァルト）", pieces=["DEU-Odenwaldkreis"],
       timeline=[
           E(1648, "other_hre", H, note="エルバッハ伯領", source=DWP + "Grafschaft_Erbach"),
           E(1806, "hesse_darmstadt", R, "ライン同盟規約：エルバッハ伯家がヘッセン大公国の主権下に", source=S_RHINE),
       ] + tail("hesse_darmstadt", rhine=None))

region("nassau_taunus", "ナッサウ（タウヌス・ラーン）",
       pieces=["DEU-Wiesbaden_Kreisfreie_Stadt", "DEU-Rheingau_Taunus_Kreis", "DEU-Hochtaunuskreis", "DEU-Limburg_Weilburg"],
       timeline=[E(1648, "nassau", H, note="ナッサウ＝イトシュタイン・ウージンゲン・ヴァイルブルクなどの領地。", source=DWP + "Nassau_(Adelsgeschlecht)")]
       + tail("nassau", rhine_cause="ナッサウ公国の成立とライン同盟加盟"),
       note="ラインガウ（マインツ領）とリンブルク（トリーア領）は1803年までそれぞれの大司教領、ホーエンタウヌス郡のホンブルクはヘッセン＝ホンブルク方伯領（1806–15年ヘッセン大公国の主権下）、ハダマーはオラニエ＝ナッサウ領。ピースの大部分を占めるナッサウ領で塗る。")

region("main_taunus", "ヘーヒスト・ホーフハイム（マインツ領）", pieces=["DEU-Main_Taunus_Kreis"],
       timeline=[
           E(1648, "mainz", H, source=DWP + "Oberstift_Mainz"),
           E(1803, "nassau", H, "帝国代表者会議主要決議でナッサウへ", source=S_RD),
       ] + tail("nassau"))

region("dillenburg", "ディレンブルク（ナッサウ＝オラニエ）", pieces=["DEU-Lahn_Dill_Kreis"],
       timeline=[
           E(1648, "nassau_orange", H, note="ナッサウ＝ディレンブルク（オットー系）。南部はゾルムス＝ブラウンフェルス伯領と帝国都市ヴェッツラー（1693年から帝国最高法院の所在地）。",
             source=DWP + "Nassau-Dillenburg"),
           E(1806, "berg", R, "ナポレオンがオラニエ家の領地を没収、ベルク大公国へ", source=DWP + "Nassau-Oranien"),
           E(1813, "nassau_orange", None, "ベルク大公国の崩壊、オラニエ家の復帰", source=DWP + "Nassau-Oranien"),
           E(1815, "nassau", G, "ウィーン会議：オラニエ家がルクセンブルクと引き換えに放棄、プロイセンを経てナッサウ公国領", source=DWP + "Nassau-Oranien"),
       ])

region("westerwald", "ヴェスターヴァルト（モンタバウアー）", pieces=["DEU-Westerwaldkreis"],
       timeline=[
           E(1648, "trier", H, note="トリーア領モンタバウアー、ザイン＝ハッヘンブルク伯領、ライニンゲン＝ヴェスターブルク伯領など。", source=DWP + "Westerwaldkreis"),
           E(1803, "nassau", H, "帝国代表者会議主要決議：トリーアの右岸領がナッサウへ", source=S_RD),
       ] + tail("nassau"))

region("rhein_lahn", "下カッツェンエルンボーゲン伯領・ディーツ", pieces=["DEU-Rhein_Lahn_Kreis"],
       timeline=[
           E(1648, "hesse_kassel", H, note="下カッツェンエルンボーゲン伯領（ヘッセン＝ラインフェルス＝ローテンブルク家）、ナッサウ＝ディーツ領、マインツ領オーバーラーンシュタインなど。",
             source=DWP + "Niedergrafschaft_Katzenelnbogen"),
           E(1806, "nassau", R, "ヘッセン＝カッセル領の没収、ナッサウ公国へ", note="要確認：ナッサウ領となった年（1806年フランス占領、1806/07年ナッサウ）",
             source=DWP + "Niedergrafschaft_Katzenelnbogen"),
           E(1813, "nassau", None, C_1813),
           E(1815, "nassau", G, C_GC, source=S_GC),
       ])

region("altenkirchen", "ザイン＝アルテンキルヒェン", pieces=["DEU-Altenkirchen_Westerwald"],
       timeline=[
           E(1648, "other_hre", H, note="ザイン＝アルテンキルヒェン伯領", source=DWP + "Grafschaft_Sayn-Altenkirchen"),
           E(1741, "ansbach", H, "ザクセン＝アイゼナハ家の断絶、アンスバッハ辺境伯が相続", source=DWP + "Grafschaft_Sayn-Altenkirchen"),
           E(1791, "prussia", H, "アンスバッハ辺境伯の退位、プロイセン領", source=DWP + "Grafschaft_Sayn-Altenkirchen"),
           E(1803, "nassau", H, "帝国代表者会議主要決議でナッサウ＝ウージンゲンへ", source=DWP + "Grafschaft_Sayn-Altenkirchen"),
           E(1806, "nassau", R, C_RHINE, source=S_RHINE),
           E(1813, "nassau", None, C_1813),
           E(1815, "prussia", G, "ウィーン会議でプロイセン領（ナッサウとの交換）", source=DWP + "Grafschaft_Sayn-Altenkirchen"),
       ])

region("neuwied", "ヴィート（ノイヴィート）", pieces=["DEU-Neuwied"],
       timeline=[
           E(1648, "other_hre", H, note="ヴィート伯領（1784年からヴィート＝ノイヴィート侯国）。ケルン領リンツ、トリーア領も含む。", source=DWP + "Wied-Neuwied"),
           E(1806, "nassau", R, "ライン同盟規約：ヴィート家がナッサウ公国の主権下に（陪臣化）", source=S_RHINE),
           E(1813, "nassau", None, C_1813),
           E(1815, "prussia", G, "ウィーン会議でプロイセン領", source=DWP + "Wied-Neuwied"),
       ])

# ======================================================================= ライン左岸
region("trier_core", "トリーア選帝侯領（モーゼル・コブレンツ）",
       pieces=["DEU-Trier_Kreisfreie_Stadt", "DEU-Trier_Saarburg", "DEU-Bernkastel_Wittlich", "DEU-Vulkaneifel",
               "DEU-Cochem_Zell", "DEU-Mayen_Koblenz", "DEU-Koblenz_Kreisfreie_Stadt"],
       timeline=[E(1648, "trier", H, source=WP + "トリーア大司教")] + LEFT_BANK + NORTH_1814,
       note="ベルンカステル＝ヴィットリヒ郡のトラーベン＝トラーバッハ（後方シュポンハイム伯領）、フルカンアイフェル郡のマンダーシャイト家領なども含む。")

region("bitburg", "ビットブルク（ルクセンブルク公領）", pieces=["DEU-Eifelkreis_Bitburg_Prum"],
       timeline=[
           E(1648, "spain", H, note="ルクセンブルク公領（スペイン領ネーデルラント、ブルグント・クライス）。北部のプリュムはトリーア領。",
             source=WP + "ルクセンブルク公国"),
           E(1684, "france", None, "フランスがルクセンブルクを攻略（レーゲンスブルク休戦条約）", "occupied", source=WP + "レユニオン政策"),
           E(1697, "spain", H, "ライスワイク条約でスペインに返還", source=WP + "レイスウェイク条約"),
           E(1714, "habsburg", H, "ラシュタット条約でオーストリア領ネーデルラントに", source=WP + "ラシュタット条約"),
           E(1795, "france", None, "フランスがオーストリア領ネーデルラントを併合（1797年カンポ・フォルミオ条約で承認）", "occupied",
             source=WP + "カンポ・フォルミオ条約"),
           E(1797, "france", None, "カンポ・フォルミオ条約", source=WP + "カンポ・フォルミオ条約"),
       ] + NORTH_1814,
       note="ルクセンブルク本体（C 担当）の変遷と年を合わせる必要あり。")

region("ahrweiler", "アールヴァイラー（ケルン領）", pieces=["DEU-Ahrweiler"],
       timeline=[E(1648, "cologne", H, note="ケルン選帝侯領アールヴァイラーと、ユーリヒ公領ジンツィヒ・レマーゲン、アーレンベルク家領など。", source=DWP + "Amt_Ahrweiler")]
       + LEFT_BANK + NORTH_1814)

region("hunsruck_nahe", "フンスリュック・ナーエ（プファルツ・シュポンハイム）", pieces=["DEU-Bad_Kreuznach", "DEU-Rhein_Hunsruck_Kreis"],
       timeline=[
           E(1648, "palatinate", H, note="プファルツ＝ジンメルン（1674年プファルツ本家へ）、前方シュポンハイム伯領（プファルツ・バーデン共同）、トリーア領ボッパルト、ヘッセン領ザンクト・ゴアなど。",
             source=DWP + "Grafschaft_Sponheim"),
           E(1777, "bavaria", H, "カール・テオドールのバイエルン相続（プファルツ＝バイエルン）"),
       ] + LEFT_BANK + NORTH_1814,
       note="要確認：ジンメルン・クロイツナハ周辺がピース面積の過半か。")

region("birkenfeld", "ビルケンフェルト（後方シュポンハイム伯領）", pieces=["DEU-Birkenfeld"],
       timeline=[
           E(1648, "other_hre", H, note="後方シュポンハイム伯領（バーデンとプファルツ＝ビルケンフェルト家の共同統治）、オーバーシュタイン領など。",
             source=DWP + "Grafschaft_Sponheim"),
           REUNION,
           E(1697, "other_hre", H, "ライスワイク条約で返還", source=WP + "レイスウェイク条約"),
       ] + LEFT_BANK + NORTH_1814,
       note="1817年にオルデンブルク領ビルケンフェルト侯国となる。")

region("saarbrucken", "ザールブリュッケン（ナッサウ＝ザールブリュッケン）",
       pieces=["DEU-Regionalverband_Saarbrucken", "DEU-Neunkirchen"],
       timeline=[
           E(1648, "nassau", H, note="ナッサウ＝ザールブリュッケン伯領・ナッサウ＝オットヴァイラー伯領。", source=DWP + "Grafschaft_Saarbrücken"),
           REUNION,
           E(1697, "nassau", H, "ライスワイク条約で返還", source=WP + "レイスウェイク条約"),
       ] + LEFT_BANK + [
           E(1815, "prussia", G, "第二次パリ条約でプロイセン領（1814年の第一次パリ条約ではフランス領にとどまった）", source=DWP + "Zweiter_Pariser_Frieden"),
       ])

region("saarlouis", "ザールルイ", pieces=["DEU-Saarlouis"],
       timeline=[
           E(1648, "france", H, note="ロレーヌ公領（1633年からフランス軍が占領）", certainty="occupied", source=WP + "ロレーヌ公国"),
           E(1661, "lorraine", H, "ヴァンセンヌ条約（ロレーヌ公の復帰）"),
           E(1670, "france", H, "フランス軍の再占領", "occupied"),
           E(1680, "france", None, "要塞都市ザールルイの建設、フランス領（1697年ライスワイク条約でも保持）", source=DWP + "Saarlouis"),
           E(1815, "prussia", G, "第二次パリ条約でプロイセン領", source=DWP + "Zweiter_Pariser_Frieden"),
       ],
       note="ロレーヌ公国の変遷は A 担当（west.yaml）の lorraine_duchy と合わせた。")

region("merzig_st_wendel", "メルツィヒ・ザンクト・ヴェンデル（トリーア領）", pieces=["DEU-Merzig_Wadern", "DEU-St_Wendel"],
       timeline=[
           E(1648, "trier", H, note="トリーア領ザンクト・ヴェンデル、メルツィヒ＝ザールガウ（トリーアとロレーヌの共同領）、ダークシュトゥール領など。",
             source=DWP + "Kurtrier"),
           REUNION,
           E(1697, "trier", H, "ライスワイク条約で返還", source=WP + "レイスウェイク条約"),
       ] + LEFT_BANK + NORTH_1814,
       note="ザンクト・ヴェンデルは1816年にザクセン＝コーブルクのリヒテンベルク侯国となる。")

region("zweibrucken", "プファルツ＝ツヴァイブリュッケン",
       pieces=["DEU-Zweibrucken_Kreisfreie_Stadt", "DEU-Saarpfalz_Kreis", "DEU-Kusel", "DEU-Sudwestpfalz"],
       timeline=[
           E(1648, "zweibrucken", H, source=DWP + "Pfalz-Zweibrücken"),
           REUNION,
           E(1697, "sweden", H, "ライスワイク条約で返還（公はスウェーデン王カール12世）", source=DWP + "Pfalz-Zweibrücken"),
           E(1718, "zweibrucken", H, "カール12世の死、プファルツ＝クレーブルク系が継承", source=DWP + "Pfalz-Zweibrücken"),
       ] + LEFT_BANK + south_1814("bavaria"),
       note="ザールプファルツ郡にはフォン・デア・ライエン家領（ブリースカステル）、南西プファルツ郡にはハーナウ＝リヒテンベルク伯領・シュパイアー司教領も含む。1681–97年のスウェーデン王の継承はフランスの占領中のため描かれない。")

region("pirmasens", "ピルマゼンス（ハーナウ＝リヒテンベルク）", pieces=["DEU-Pirmasens_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "other_hre", H, note="ハーナウ＝リヒテンベルク伯領", source=DWP + "Grafschaft_Hanau-Lichtenberg"),
           E(1736, "hesse_darmstadt", H, "ハーナウ＝リヒテンベルク伯領をヘッセン＝ダルムシュタットが相続", source=DWP + "Grafschaft_Hanau-Lichtenberg"),
       ] + LEFT_BANK + south_1814("bavaria"))

region("kurpfalz_left", "プファルツ（ライン左岸）",
       pieces=["DEU-Kaiserslautern_Kreisfreie_Stadt", "DEU-Kaiserslautern_Landkreis", "DEU-Neustadt_an_der_Weinstrae_Kreisfreie_Stadt",
               "DEU-Bad_Durkheim", "DEU-Donnersbergkreis", "DEU-Frankenthal_Pfalz_Kreisfreie_Stadt",
               "DEU-Ludwigshafen_am_Rhein_Kreisfreie_Stadt", "DEU-Rhein_Pfalz_Kreis", "DEU-Germersheim", "DEU-Sudliche_Weinstrae"],
       timeline=[
           E(1648, "palatinate", H, "ウェストファリア条約でプファルツ選帝侯が復位", source=WP + "プファルツ選帝侯領"),
           E(1777, "bavaria", H, "カール・テオドールのバイエルン相続（プファルツ＝バイエルン）", source=WP + "バイエルン継承戦争"),
       ] + LEFT_BANK + south_1814("bavaria"),
       note="ライニンゲン伯領（バート・デュルクハイム）、ナッサウ＝ヴァイルブルク領キルヒハイムボーランデン、オーストリア領ファルケンシュタイン（ドナースベルク郡）、シュパイアー司教領、ツヴァイブリュッケン領ベルクツァベルンなども含む。")

region("alzey", "アルツァイ（プファルツ領ラインヘッセン）", pieces=["DEU-Alzey_Worms"],
       timeline=[
           E(1648, "palatinate", H, source=DWP + "Oberamt_Alzey"),
           E(1777, "bavaria", H, "カール・テオドールのバイエルン相続（プファルツ＝バイエルン）"),
       ] + LEFT_BANK + south_1814("hesse_darmstadt"))

region("mainz_left", "マインツ（ライン左岸）", pieces=["DEU-Mainz_Kreisfreie_Stadt", "DEU-Mainz_Bingen"],
       timeline=[
           E(1648, "mainz", H, source=WP + "マインツ大司教"),
           E(1797, "france", None, "カンポ・フォルミオ条約の後、1797年12月にマインツがフランス軍に開城（1792–93年にも占領、マインツ共和国）",
             "occupied", source=WP + "マインツ共和国"),
           LEFT_BANK[1],
       ] + south_1814("hesse_darmstadt"),
       note="マインツ＝ビンゲン郡にはプファルツ領オッペンハイム・インゲルハイムも含む。")

region("worms_city", "帝国都市ヴォルムス", pieces=["DEU-Worms_Kreisfreie_Stadt"],
       timeline=[E(1648, "other_hre", H, note="帝国都市ヴォルムスとヴォルムス司教領", source=DWP + "Reichsstadt_Worms")]
       + LEFT_BANK + south_1814("hesse_darmstadt"))

region("speyer_city", "帝国都市シュパイアー", pieces=["DEU-Speyer_Kreisfreie_Stadt"],
       timeline=[E(1648, "other_hre", H, note="帝国都市シュパイアー（1689年まで帝国最高法院の所在地）。シュパイアー司教はライン右岸のブルッフザールに住んだ。",
                   source=DWP + "Reichsstadt_Speyer")]
       + LEFT_BANK + south_1814("bavaria"))

region("landau", "ランダウ", pieces=["DEU-Landau_in_der_Pfalz_Kreisfreie_Stadt"],
       timeline=[
           E(1648, "other_hre", H, note="帝国都市ランダウ（アルザス十都市同盟。ウェストファリア条約でフランスが代官職を得た）", source=DWP + "Landau_in_der_Pfalz"),
           E(1680, "france", None, "再統合政策でフランスが併合（1697年ライスワイク条約・1714年ラシュタット条約で確認）", source=WP + "レユニオン政策"),
           E(1815, "habsburg", None, "第二次パリ条約でフランスが放棄、オーストリアへ（1816年バイエルン）", "uncertain", source=DWP + "Zweiter_Pariser_Frieden"),
           E(1816, "bavaria", G, "ミュンヘン条約でバイエルン領（ドイツ連邦の要塞）", source=DWP + "Landau_in_der_Pfalz"),
       ])

# ======================================================================= コーブルク（北ドイツ担当のエルンスト系ザクセン諸公国と接続）
region("coburg", "コーブルク", pieces=["DEU-Coburg_Kreisfreie_Stadt", "DEU-Coburg_Landkreis"],
       timeline=[
           E(1648, "COBURG_OWNER", H, note="エルンスト系ザクセン諸公国（1640–72年ザクセン＝アルテンブルク、1672–80年ザクセン＝ゴータ、1680–99年ザクセン＝コーブルク、1735年からザクセン＝コーブルク＝ザールフェルト）。",
             source=DWP + "Sachsen-Coburg"),
           E(1806, "COBURG_OWNER", R, "ライン同盟に加盟（1806年12月）", source=S_RHINE),
           E(1813, "COBURG_OWNER", None, C_1813),
           E(1815, "COBURG_OWNER", G, C_GC, source=S_GC),
       ])


# ----------------------------------------------------------------------- 出力
def yq(s):
    return json.dumps(s, ensure_ascii=False)


def dump_entry(e):
    lines = []
    first = True
    for k in ["from", "owner", "overlord", "certainty", "cause", "note", "source"]:
        if k not in e:
            continue
        v = e[k]
        if k == "from":
            sv = str(v)
        elif v is None:
            sv = "null"
        elif k in ("owner", "overlord", "certainty"):
            sv = v
        else:
            sv = yq(v)
        lines.append(("    - " if first else "      ") + f"{k}: {sv}")
        first = False
    return lines


coburg_owner = sys.argv[1] if len(sys.argv) > 1 else "saxe_coburg"
out = ["# 南ドイツ（BS 担当）の地域と所属の変遷（1648–1815）",
       "# 生成元: 担当者の作業用スクリプト。ピースは現代の郡（Kreis）単位で、歴史的な領邦がまたがる場合は面積の大きい側に入れた。",
       ""]
for r in regions:
    out.append(f"- id: {r['id']}")
    out.append(f"  name: {yq(r['name'])}")
    out.append("  select:")
    for k, v in r["select"].items():
        out.append(f"    {k}: [{', '.join(v)}]" if k != "adm2" else f"    {k}: [{', '.join(yq(x) for x in v)}]")
    if "note" in r:
        out.append(f"  note: {yq(r['note'])}")
    out.append("  timeline:")
    for e in r["timeline"]:
        e = dict(e)
        if e.get("owner") == "COBURG_OWNER":
            e["owner"] = coburg_owner
        out.extend(dump_entry(e))
    out.append("")
open("/home/user/world-history-atlas/data/regions/germany_south.yaml", "w").write("\n".join(out))
print(len(regions), "regions")
