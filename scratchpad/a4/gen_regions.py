# A4（南米北部・アンデス）の地域ファイル data/regions/andes.yaml を生成する。
# 使い方: python3 scratchpad/a4/gen_regions.py
import json, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "data", "regions", "andes.yaml")

SP = "spain"
GC = "gran_colombia"
NGU = "new_granada_united"
W = "https://ja.wikipedia.org/wiki/"
EN = "https://en.wikipedia.org/wiki/"


def e(frm, owner, **kw):
    d = {"from": frm, "owner": owner}
    d.update(kw)
    return d


# ---- 植民地期の共通部分 ----
def ng(cert=None, label_pref="ヌエバ・グラナダ"):
    """ヌエバ・グラナダ（コロンビア）の 1648–1809"""
    c = {"certainty": cert} if cert else {}
    return [
        e(1648, SP, label=f"{label_pref}（ペルー副王領）", **c,
          note="スペイン領。サンタフェ・デ・ボゴタの聴訴院（アウディエンシア）が治め、ペルー副王に属した",
          source=W + "ヌエバ・グラナダ副王領"),
        e(1717, SP, label="ヌエバ・グラナダ副王領", **c, cause="ヌエバ・グラナダ副王領が置かれる（1723年にいったん廃止）",
          source=W + "ヌエバ・グラナダ副王領"),
        e(1723, SP, label=f"{label_pref}（ペルー副王領）", **c, cause="ヌエバ・グラナダ副王領がいったん廃止され、ペルー副王領に戻る"),
        e(1739, SP, label="ヌエバ・グラナダ副王領", **c, cause="ヌエバ・グラナダ副王領が再び置かれる（ボゴタが都）",
          source=W + "ヌエバ・グラナダ副王領"),
    ]


def quito(cert=None, name="キト"):
    c = {"certainty": cert} if cert else {}
    return [
        e(1648, SP, label=f"{name}（ペルー副王領）", **c,
          note="スペイン領。キトの聴訴院（アウディエンシア）が治めた",
          source=W + "キト・アウディエンシア"),
        e(1717, SP, label=f"{name}（ヌエバ・グラナダ副王領）", **c, cause="キト聴訴院がヌエバ・グラナダ副王領に移される"),
        e(1723, SP, label=f"{name}（ペルー副王領）", **c, cause="ヌエバ・グラナダ副王領がいったん廃止され、ペルー副王領に戻る"),
        e(1739, SP, label=f"{name}（ヌエバ・グラナダ副王領）", **c, cause="ヌエバ・グラナダ副王領の再設置で、その一部となる"),
    ]


def ven(label, cert=None, until1777=True):
    c = {"certainty": cert} if cert else {}
    out = [e(1648, SP, label=label, **c,
             note="スペイン領。ベネズエラ州などの州はサント・ドミンゴの聴訴院（ヌエバ・エスパーニャ副王領）に属し、1717–23年と1739年からはヌエバ・グラナダ副王領に属した。マラカイボ州は初めからボゴタの聴訴院の下にあった",
             source=W + "ベネズエラ総督領")]
    out.append(e(1777, SP, label="ベネズエラ総監領", **c,
                 cause="ベネズエラ総監領が置かれ、カラカスの総監の下に諸州がまとまる（1786年にカラカス聴訴院）",
                 source=W + "ベネズエラ総督領"))
    return out


def peru_col(label="ペルー副王領", cert=None):
    c = {"certainty": cert} if cert else {}
    return [e(1648, SP, label=label, **c, note="スペイン領。リマに副王が置かれた", source=W + "ペルー副王領")]


def charcas(cert=None):
    c = {"certainty": cert} if cert else {}
    return [
        e(1648, SP, label="チャルカス（ペルー副王領）", **c,
          note="スペイン領アルト・ペルー。チャルカス（ラ・プラタ、今のスクレ）の聴訴院が治め、ポトシ銀山があった",
          source=W + "チャルカス・アウディエンシア"),
    ]


def charcas_rp(cert=None):
    c = {"certainty": cert} if cert else {}
    return e(1776, SP, label="チャルカス（ラ・プラタ副王領）", **c,
             cause="リオ・デ・ラ・プラタ副王領が置かれ、アルト・ペルー（チャルカス）がその一部となる",
             source=W + "リオ・デ・ラ・プラタ副王領")


# 独立期の共通の項目
J1810_NG = dict(certainty="uncertain", label="ヌエバ・グラナダ（諸都市の評議会）",
                cause="7月20日、ボゴタで評議会（フンタ）が副王を退ける。各地の都市も評議会を作る（名目上はフェルナンド7世に忠誠）",
                source=W + "コロンビア独立宣言")
NGU1811 = dict(cause="ヌエバ・グラナダ連合州が結成される（11月）。独立派どうしの内戦が続いた（「愚かな祖国」の時代）",
               source=EN + "United_Provinces_of_New_Granada")
SP1816 = dict(label="ヌエバ・グラナダ副王領", cause="モリーリョの遠征軍が独立派を破り、ボゴタに入る（5月）",
              source=EN + "Spanish_reconquest_of_New_Granada")
GC1819 = dict(cause="ボヤカの戦い（8月7日）でボリバルが勝ち、ボゴタを解放。12月にアンゴストゥーラ会議がコロンビア共和国（大コロンビア）の成立を宣言",
              source=W + "ボヤカの戦い")
COL1831 = dict(cause="大コロンビアが解体し、ヌエバ・グラナダ共和国となる（11月）", source=W + "大コロンビア")
VEN1830 = dict(cause="ベネズエラが大コロンビアから分離する（パエス）", source=W + "大コロンビア")
ECU1830 = dict(cause="エクアドルが大コロンビアから分離して独立する（5月、フローレス）", source=W + "エクアドルの歴史")

J1810_VEN = dict(certainty="uncertain", label="ベネズエラ（カラカスの評議会）",
                 cause="4月19日、カラカスの市参事会が総監を退けて最高評議会を作る（名目上はフェルナンド7世に忠誠）",
                 source=EN + "Venezuelan_Declaration_of_Independence")
VEN1811 = dict(cause="7月5日、ベネズエラ議会が独立を宣言する（第一共和国）", source=W + "ベネズエラ独立宣言")
SP1812 = dict(label="ベネズエラ総監領", cause="大地震とスペイン軍の反攻で第一共和国が崩れ、ミランダが降伏する（7月）",
              source=EN + "First_Republic_of_Venezuela")
VEN1813 = dict(cause="ボリバルの「感嘆すべき遠征」でカラカスを奪回（8月）、東部はマリーニョが解放（第二共和国）",
               source=EN + "Admirable_Campaign")
SP1814 = dict(label="ベネズエラ総監領", cause="ボベスの率いる平原の騎兵（リャネーロ）に敗れ、第二共和国が崩れる",
              source=EN + "Second_Republic_of_Venezuela")
GC1821 = dict(cause="カラボボの戦い（6月24日）でボリバルが勝ち、カラカスを解放", source=W + "カラボボの戦い")

PB1836 = dict(cause="ペルー・ボリビア連合が成立する（10月、サンタ・クルスが最高護民官）", source=W + "ペルー・ボリビア連合")
PB1839 = dict(cause="ユンガイの戦い（1月）でチリとペルーの亡命派の軍に敗れ、連合が解体する", source=W + "ペルー・ボリビア連合戦争")

R = []


def region(rid, name, pieces, timeline, note=None, names=None):
    d = {"id": rid, "name": name}
    if names:
        d["names"] = names
    d["select"] = {"pieces": pieces}
    if note:
        d["note"] = note
    d["timeline"] = timeline
    R.append(d)


# ================= コロンビア =================
def col_core(start, extra_after_1811=None, ngu_cert=None, sp1816=True, gc=1819, gc_cert=None, c1810=True):
    t = list(start)
    if c1810:
        t.append(e(1810, SP, **J1810_NG))
    k = {"certainty": ngu_cert} if ngu_cert else {}
    t.append(e(1811, NGU, **k, **NGU1811))
    if extra_after_1811:
        t += extra_after_1811
    if sp1816:
        t.append(e(1816, SP, **SP1816))
    if gc_cert:
        t.append(e(gc, GC, certainty=gc_cert, **GC1819))
        t.append(e(gc + 1, GC))
    else:
        t.append(e(gc, GC, **GC1819))
    t.append(e(1831, "colombia", **COL1831))
    return t


region("col_bogota", "ボゴタ・クンディナマルカ", ["COL-Bogota_Capital_District", "COL-Cundinamarca"],
       ng() + [
           e(1810, SP, **J1810_NG),
           e(1811, "cundinamarca", cause="クンディナマルカ国が成立する（ナリーニョ）。連合州に加わらず、連邦派と内戦になる",
             source=EN + "Free_and_Independent_State_of_Cundinamarca"),
           e(1814, NGU, cause="ボリバルの率いる連合州の軍がボゴタを占め、クンディナマルカが連合州に加わる（12月）",
             source=EN + "United_Provinces_of_New_Granada"),
           e(1816, SP, **SP1816),
           e(1819, GC, **GC1819),
           e(1831, "colombia", **COL1831),
       ])

region("col_central", "ボヤカ・トリマ・ウイラ", ["COL-Boyaca", "COL-Tolima", "COL-Huila"],
       ng() + col_core([]))
region("col_santander", "サンタンデール", ["COL-Santander", "COL-Norte_de_Santander"], ng() + col_core([]))
region("col_antioquia", "アンティオキア・カルダス", ["COL-Antioquia", "COL-Caldas", "COL-Risaralda", "COL-Quindio"],
       ng() + col_core([]))
region("col_choco", "チョコ", ["COL-Choco"], ng() + col_core([], gc=1819, gc_cert="uncertain"))
region("col_valle", "カウカ川流域（カリ）", ["COL-Valle_del_Cauca"], ng() + col_core([], gc=1819, gc_cert="uncertain"))
region("col_cauca", "ポパヤン", ["COL-Cauca"],
       ng(label_pref="ポパヤン") + [
           e(1810, SP, **J1810_NG),
           e(1811, NGU, certainty="uncertain",
             cause="独立派がポパヤンを占める（3月、バホ・パラセの戦い）。以後、パストの王党派と取り合いが続いた",
             source=EN + "United_Provinces_of_New_Granada"),
           e(1816, SP, **SP1816),
           e(1820, GC, certainty="uncertain", cause="大コロンビア軍がポパヤンに入るが、パストの王党派との戦いが続く"),
           e(1821, GC),
           e(1830, "ecuador", certainty="uncertain", cause="大コロンビアの解体の中で、カウカ県（ポパヤン・パスト）がエクアドルへの合流を宣言する",
             note="1832年のパスト条約でヌエバ・グラナダに戻った（カルチ川が国境）。カリ・ブガなど北部の町の態度は要確認",
             source=EN + "Ecuador–Colombia_relations"),
           e(1832, "colombia", cause="パスト条約（12月）でエクアドルがカウカ・パストをヌエバ・グラナダに返す",
             source=EN + "Ecuador–Colombia_relations"),
       ])
region("col_pasto", "パスト（ナリーニョ）", ["COL-Narino"],
       ng(label_pref="パスト") + [
           e(1822, GC, cause="ボンボナの戦い（4月）とピチンチャの戦い（5月）の後、王党派の町パストが降伏する",
             note="パストでは1824年までアグアロンゴらの王党派の反乱が続いた", source=EN + "Battle_of_Bombona"),
           e(1830, "ecuador", certainty="uncertain", cause="大コロンビアの解体の中で、パストがエクアドルへの合流を宣言する",
             source=EN + "Ecuador–Colombia_relations"),
           e(1832, "colombia", cause="パスト条約（12月）でエクアドルがパストをヌエバ・グラナダに返す"),
       ])
region("col_cartagena", "カルタヘナ（カリブ海岸西部）", ["COL-Bolivar", "COL-Atlantico", "COL-Sucre", "COL-Cordoba"],
       ng(label_pref="カルタヘナ") + [
           e(1810, SP, certainty="uncertain", label="カルタヘナ（評議会）",
             cause="5月、カルタヘナの市参事会が総督を退け、評議会を作る"),
           e(1811, NGU, cause="カルタヘナが独立を宣言（11月11日）し、ヌエバ・グラナダ連合州に加わる",
             source=EN + "Cartagena_de_Indias#Independence"),
           e(1815, SP, label="ヌエバ・グラナダ副王領", cause="モリーリョの遠征軍が105日の包囲の末にカルタヘナを落とす（12月）",
             source=EN + "Siege_of_Cartagena_(1815)"),
           e(1821, GC, cause="カルタヘナの王党派が降伏する（10月）", source=EN + "Siege_of_Cartagena_(1820–1821)"),
           e(1831, "colombia", **COL1831),
       ])
region("col_santa_marta", "サンタ・マルタ・リオアチャ", ["COL-Magdalena", "COL-Cesar", "COL-La_Guajira"],
       ng(label_pref="サンタ・マルタ") + [
           e(1820, GC, cause="大コロンビア軍がサンタ・マルタを占める（11月）", note="サンタ・マルタは独立期を通じて王党派の拠点だった",
             source=EN + "Santa_Marta"),
           e(1831, "colombia", **COL1831),
       ],
       note="ラ・グアヒーラ半島の先住民ワユー（グアヒーロ）は植民地期を通じてほぼ自立していた（ピースの粒度では表せない）")
region("col_llanos", "東部平原（カサナレ）", ["COL-Casanare", "COL-Arauca", "COL-Meta"],
       ng(label_pref="平原（リャノス）") + [
           e(1810, SP, **J1810_NG),
           e(1811, NGU, **NGU1811),
           e(1816, SP, certainty="uncertain", **SP1816),
           e(1817, "venezuela", certainty="uncertain",
             cause="カサナレの平原が独立派のゲリラの拠点となる（1818年からサンタンデールが軍を組織。アンゴストゥーラのボリバル政府の下）",
             source=EN + "Francisco_de_Paula_Santander"),
           e(1819, GC, cause="ボリバルの軍がカサナレからアンデスを越え、ボヤカで勝つ（8月）。12月に大コロンビアが成立",
             source=W + "ボヤカの戦い"),
           e(1831, "colombia", **COL1831),
       ],
       note="植民地期はイエズス会などの布教村と牧場が点在した")
region("col_east", "オリノコ・アマゾン上流（ビチャダ・グアイニア・バウペス・グアビアレ）",
       ["COL-Vichada", "COL-Guainia", "COL-Vaupes", "COL-Guaviare"],
       ng(cert="nominal", label_pref="ヌエバ・グラナダ") + [
           e(1819, GC, certainty="nominal", cause="大コロンビアの成立（主張のみ。先住民の地）"),
           e(1831, "colombia", certainty="nominal", **COL1831),
           e(1910, "colombia", cause="ゴムの採集が広がり、バウペス（1910）・ビチャダ（1913）に特別区（コミサリア）が置かれる",
             note="実際の国家の存在は薄く、20世紀後半まで先住民の地が広かった（要確認：年は目安）",
             source=EN + "Vaupés_Department"),
       ],
       note="スペイン・コロンビアの主張は及んでいたが、実際には先住民の地（nominal）。ポルトガル・ブラジルとの境もあいまいだった")
region("col_amazon", "カケター・プトゥマヨ", ["COL-Caqueta", "COL-Putumayo"],
       ng(cert="nominal", label_pref="ポパヤン") + [
           e(1822, GC, certainty="nominal", cause="パストの降伏で南部が大コロンビアに入る（主張のみ）"),
           e(1831, "colombia", certainty="nominal", **COL1831),
           e(1933, "colombia", cause="レティシア紛争の後、コロンビアがアマゾン南部に軍と道路を置き、実効支配を固める",
             source=EN + "Colombia–Peru_war"),
       ],
       note="モコアなどの布教村を除き、実際には先住民の地（nominal）。20世紀初めのプトゥマヨ川流域はペルーのゴム会社（アラナ）が支配した")
region("col_amazonas", "アマゾナス（レティシア）", ["COL-Amazonas"],
       ng(cert="nominal", label_pref="ポパヤン") + [
           e(1822, GC, certainty="nominal", cause="パストの降伏で南部が大コロンビアに入る（主張のみ）"),
           e(1831, "colombia", certainty="nominal", **COL1831),
           e(1900, "peru", certainty="uncertain",
             cause="ペルーのゴム会社（アラナのペルー・アマゾン会社）がプトゥマヨ川とカケター川の間を支配する。レティシアはペルーの町",
             note="先住民の強制労働と虐殺が1912年にケースメントの報告で国際問題になった（プトゥマヨ事件）。コロンビア・エクアドルも領有を主張",
             source=EN + "Putumayo_genocide"),
           e(1930, "colombia", cause="サロモン＝ロサノ条約（1922年調印、1928年批准）によりペルーがレティシアを引き渡す（8月）",
             source=EN + "Salomón–Lozano_Treaty"),
           e(1932, "peru", certainty="occupied", label="レティシア（ペルーの占領）",
             cause="ペルー人の一団がレティシアを占拠し、ペルー軍が支援する（9月、レティシア紛争）",
             source=EN + "Colombia–Peru_war"),
           e(1933, "colombia", certainty="uncertain", label="レティシア（国際連盟の管理）",
             cause="停戦（5月）の後、国際連盟の委員会がレティシアを1年間管理する（1934年6月にコロンビアへ）",
             source=EN + "Colombia–Peru_war"),
           e(1934, "colombia", cause="リオデジャネイロ議定書（5月）でペルーがサロモン＝ロサノ条約を認め、レティシアがコロンビアに戻る"),
       ])
region("col_san_andres", "サン・アンドレス・プロビデンシア", ["COL-Archipielago_de_San_Andres_Providencia_y_Santa_Catalina"],
       [e(1648, SP, certainty="nominal", label="",
          note="1631–41年にはイングランドのピューリタンの植民地（プロヴィデンス島会社）があり、1641年にスペインが奪った。その後もジャマイカ系のイギリス人入植者が住んだ",
          source=EN + "Providence_Island_colony"),
        e(1803, SP, label="ヌエバ・グラナダ副王領", cause="サン・アンドレス諸島がヌエバ・グラナダ副王領（カルタヘナ）の管轄に移される",
          source=EN + "San_Andrés,_Providencia_and_Santa_Catalina"),
        e(1822, GC, cause="諸島が大コロンビアに加わる（6月）", note="1818–21年にはフランス人の私掠船長オーリーがプロビデンシアを拠点にした"),
        e(1831, "colombia", **COL1831),
        ],
       note="ニカラグアも領有を主張した（1928年のエスゲラ＝バルセナス条約、2012年の国際司法裁判所の判決で周辺の海域を一部失う）")

# ================= ベネズエラ =================
region("ven_caracas", "カラカス・中部（ララを含む）",
       ["VEN-Distrito_Capital", "VEN-La_Guaira", "VEN-Miranda", "VEN-Aragua", "VEN-Carabobo", "VEN-Yaracuy", "VEN-Lara"],
       ven("ベネズエラ州") + [
           e(1810, SP, **J1810_VEN),
           e(1811, "venezuela", **VEN1811),
           e(1812, SP, **SP1812),
           e(1813, "venezuela", **VEN1813),
           e(1814, SP, **SP1814),
           e(1821, GC, **GC1821),
           e(1830, "venezuela", **VEN1830),
       ],
       note="プエルト・カベーリョ（カラボボ）の要塞は1823年11月まで王党派が守った")
region("ven_andes", "アンデス地方（メリダ・トルヒーヨ・タチラ）", ["VEN-Merida", "VEN-Trujillo", "VEN-Tachira"],
       ven("マラカイボ州（ヌエバ・グラナダ）") + [
           e(1810, SP, **J1810_VEN),
           e(1811, "venezuela", **VEN1811),
           e(1812, SP, **SP1812),
           e(1813, "venezuela", cause="ボリバルがヌエバ・グラナダから攻め入り、メリダ・トルヒーヨを解放（5–6月。「死に至る戦い」の布告）",
             source=EN + "Admirable_Campaign"),
           e(1814, SP, **SP1814),
           e(1820, GC, cause="大コロンビア軍がメリダ・トルヒーヨを占める。11月にトルヒーヨで休戦条約"),
           e(1830, "venezuela", **VEN1830),
       ],
       note="トルヒーヨは1786年までベネズエラ州に属した（ラベルは単純化）")
region("ven_llanos", "平原（バリナス・グアリコ）", ["VEN-Barinas", "VEN-Portuguesa", "VEN-Cojedes", "VEN-Guarico"],
       ven("ベネズエラ州") + [
           e(1810, SP, **J1810_VEN),
           e(1811, "venezuela", **VEN1811),
           e(1812, SP, **SP1812),
           e(1813, "venezuela", certainty="uncertain", **VEN1813),
           e(1814, SP, **SP1814),
           e(1821, GC, **GC1821),
           e(1830, "venezuela", **VEN1830),
       ],
       note="1813–14年の平原では王党派のボベスの騎兵が優勢だった。1816–20年はパエスの独立派のゲリラと王党派が争った")
region("ven_apure", "アプレ", ["VEN-Apure"],
       ven("ベネズエラ州", cert="nominal")[:1] + [
           e(1750, SP, label="ベネズエラ州", cause="カプチン会の布教村と牧場が広がる（目安の年）"),
           ven("")[1],
           e(1810, SP, **J1810_VEN),
           e(1811, "venezuela", **VEN1811),
           e(1812, SP, **SP1812),
           e(1816, "venezuela", certainty="uncertain", cause="パエスの率いる平原の騎兵（リャネーロ）がアプレで王党派を破り始める",
             source=W + "ホセ・アントニオ・パエス"),
           e(1817, "venezuela", cause="アプレの平原がパエスの独立派の拠点となる"),
           e(1819, GC, cause="12月、アンゴストゥーラ会議が大コロンビアの成立を宣言", source=W + "アンゴストゥーラ会議"),
           e(1830, "venezuela", **VEN1830),
       ])
region("ven_coro", "コロ（ファルコン）", ["VEN-Falcon"],
       ven("ベネズエラ州") + [
           e(1821, GC, cause="コロが大コロンビアに加わる（5月）"),
           e(1830, "venezuela", **VEN1830),
       ],
       note="コロは独立期を通じて王党派の町だった（1806年のミランダの上陸も失敗）")
region("ven_maracaibo", "マラカイボ（スリア）", ["VEN-Zulia"],
       ven("マラカイボ州（ヌエバ・グラナダ）") + [
           e(1821, GC, cause="マラカイボが独立を宣言して大コロンビアに加わる（1月）"),
           e(1822, SP, certainty="occupied", label="マラカイボ（王党派の奪回）",
             cause="王党派のモラレスが反攻し、マラカイボを奪い返す（9月）"),
           e(1823, GC, cause="マラカイボ湖の海戦（7月）で大コロンビアの艦隊が勝ち、王党派が降伏する",
             source=EN + "Battle_of_Lake_Maracaibo"),
           e(1830, "venezuela", **VEN1830),
       ])
region("ven_east", "東部（クマナ・バルセロナ・マトゥリン）", ["VEN-Sucre", "VEN-Monagas", "VEN-Anzoategui"],
       ven("ヌエバ・アンダルシア州（クマナ）") + [
           e(1810, SP, **J1810_VEN),
           e(1811, "venezuela", **VEN1811),
           e(1812, SP, **SP1812),
           e(1813, "venezuela", cause="マリーニョがトリニダード沖から上陸し、東部を解放する（1–8月）", source=EN + "Santiago_Mariño"),
           e(1814, SP, **SP1814),
           e(1816, SP, certainty="uncertain", label="ベネズエラ総監領",
             cause="マリーニョ・ベルムデス・ピアルらの独立派のゲリラが東部で戦う"),
           e(1821, GC, cause="クマナの王党派が降伏する（10月）"),
           e(1830, "venezuela", **VEN1830),
       ])
region("ven_margarita", "マルガリータ島（ヌエバ・エスパルタ）", ["VEN-Nueva_Esparta"],
       ven("マルガリータ州") + [
           e(1810, SP, **J1810_VEN),
           e(1811, "venezuela", **VEN1811),
           e(1812, SP, **SP1812),
           e(1813, "venezuela", **VEN1813),
           e(1815, SP, label="ベネズエラ総監領", cause="スペインのモリーリョの遠征軍がマルガリータ島を占める（4月）",
             source=EN + "Pablo_Morillo"),
           e(1816, "venezuela", cause="アリスメンディの蜂起と、ハイチから来たボリバルの遠征隊（5月）で島が独立派の拠点となる",
             source=EN + "Juan_Bautista_Arismendi"),
           e(1819, GC, cause="12月、アンゴストゥーラ会議が大コロンビアの成立を宣言"),
           e(1830, "venezuela", **VEN1830),
       ])
region("ven_guayana", "ギアナ（ボリバル州）", ["VEN-Bolivar"],
       [e(1648, SP, certainty="nominal", label="ギアナ州",
          note="オリノコ川下流のサント・トメ・デ・ギアナなど、わずかな拠点のほかは先住民の地。オランダ領エセキボとの境はあいまい",
          source=EN + "Spanish_Guayana"),
        e(1724, SP, label="ギアナ州", cause="カタルーニャのカプチン会がカロニ川流域に布教村を広げる"),
        e(1777, SP, label="ベネズエラ総監領", cause="ベネズエラ総監領が置かれる", source=W + "ベネズエラ総督領"),
        e(1817, "venezuela", cause="ピアルとボリバルがアンゴストゥーラを落とし（7月）、独立派の拠点とする（第三共和国）",
          source=W + "アンゴストゥーラ会議"),
        e(1819, GC, cause="12月、アンゴストゥーラ会議が大コロンビアの成立を宣言", source=W + "アンゴストゥーラ会議"),
        e(1830, "venezuela", **VEN1830),
        ],
       note="南部・東部の奥地はベネズエラの主張が及ぶだけの先住民の地だった（ピースの粒度では表せない）")
region("ven_delta", "オリノコ・デルタ（デルタ・アマクロ）", ["VEN-Delta_Amacuro"],
       [e(1648, SP, certainty="nominal", label="ギアナ州", note="ワラオ人の地"),
        e(1777, SP, certainty="nominal", label="ベネズエラ総監領"),
        e(1817, "venezuela", certainty="nominal", cause="独立派がギアナを解放する"),
        e(1819, GC, certainty="nominal"),
        e(1830, "venezuela", certainty="nominal", **VEN1830),
        e(1884, "venezuela", cause="デルタ・アマクロ準州（連邦直轄領）が置かれる"),
        ])
region("ven_amazonas", "ベネズエラのアマゾナス", ["VEN-Amazonas"],
       [e(1648, SP, certainty="nominal", label="ギアナ州", note="オリノコ川上流・ネグロ川上流の先住民の地。1759年にサン・カルロス・デ・リオ・ネグロの砦が置かれた"),
        e(1777, SP, certainty="nominal", label="ベネズエラ総監領"),
        e(1817, "venezuela", certainty="nominal", cause="独立派がギアナを解放する"),
        e(1819, GC, certainty="nominal"),
        e(1830, "venezuela", certainty="nominal", **VEN1830),
        e(1900, "venezuela", cause="アマゾナス準州でゴムの採集が広がる（年は目安）", note="20世紀半ばまで国家の存在は薄かった"),
        ])
region("ven_islands", "ベネズエラ沖の島々（連邦属領）", ["VEN-Dependencias_Federales"],
       [e(1648, SP, certainty="nominal", label="", note="ロス・ロケス・ラ・オルチラ・アベス島などの無人に近い島々"),
        e(1821, GC, certainty="nominal", cause="カラボボの戦いの後、大コロンビアの領域となる"),
        e(1830, "venezuela", **VEN1830,
          note="アベス島はオランダと争ったが、1865年のスペイン女王の仲裁でベネズエラ領と認められた"),
        ])

# ================= エクアドル =================
GC1822 = dict(cause="ピチンチャの戦い（5月24日）でスクレが勝ち、キトが解放されて大コロンビアに入る",
              source=W + "ピチンチャの戦い")
region("ecu_quito", "キト（中部・北部の高地とエスメラルダス）",
       ["ECU-Pichincha", "ECU-Imbabura", "ECU-Carchi", "ECU-Cotopaxi", "ECU-Tungurahua", "ECU-Chimborazo",
        "ECU-Bolivar", "ECU-Santo_Domingo_de_los_Tsachilas", "ECU-Esmeraldas"],
       quito() + [
           e(1810, SP, certainty="uncertain", label="キト（評議会）",
             cause="9月、キトに2度目の評議会（最高評議会）ができる（1809年8月10日の「最初の叫び」の評議会は10月に崩れた）",
             source=W + "キト自治宣言"),
           e(1811, "ecuador", certainty="uncertain", cause="キト国の評議会が摂政会議への服従をやめ、1812年2月に憲法を定める",
             source=EN + "State_of_Quito"),
           e(1812, SP, label="キト（ヌエバ・グラナダ副王領）", cause="スペインのモンテス将軍がキトを落とす（11月）",
             source=EN + "State_of_Quito"),
           e(1822, GC, **GC1822),
           e(1830, "ecuador", **ECU1830),
       ])
region("ecu_cuenca", "クエンカ・ロハ", ["ECU-Azuay", "ECU-Canar", "ECU-Loja"],
       quito(name="クエンカ") + [
           e(1822, GC, cause="スクレの軍がクエンカに入り（2月）、ピチンチャの戦い（5月）の後に大コロンビアに入る"),
           e(1830, "ecuador", **ECU1830),
       ])
GUAY1803 = e(1803, SP, label="グアヤキル（ペルー副王領）", cause="グアヤキルがペルー副王の管轄に移される（軍事・通商）",
             source=EN + "Free_Province_of_Guayaquil")
GUAY1820 = e(1820, "guayaquil", cause="10月9日、グアヤキルが独立を宣言する（グアヤキル自由県。オルメド）",
             source=EN + "Free_Province_of_Guayaquil")
GUAY1822 = e(1822, GC, cause="7月、ボリバルがグアヤキルを大コロンビアに編入する（グアヤキル会談の直前）",
             source=W + "グアヤキル会談")
region("ecu_guayaquil", "グアヤキル・マナビ", ["ECU-Guayas", "ECU-Santa_Elena", "ECU-Los_Rios", "ECU-Manabi"],
       quito(name="グアヤキル") + [GUAY1803, GUAY1820, GUAY1822, e(1830, "ecuador", **ECU1830)])
region("ecu_el_oro", "エル・オロ（マチャラ）", ["ECU-El_Oro"],
       quito(name="グアヤキル") + [GUAY1803, GUAY1820, GUAY1822, e(1830, "ecuador", **ECU1830),
                                 e(1941, "peru", certainty="occupied", label="エル・オロ（ペルーの占領）",
                                   cause="エクアドル＝ペルー戦争（7月）でペルー軍がエル・オロ州を占領する",
                                   source=EN + "Ecuadorian–Peruvian_War"),
                                 e(1942, "ecuador", cause="リオデジャネイロ議定書（1月）の後、ペルー軍が撤退する",
                                   source=EN + "Rio_Protocol")])
region("ecu_oriente", "エクアドル東部（オリエンテ）",
       ["ECU-Sucumbios", "ECU-Napo", "ECU-Orellana", "ECU-Pastaza", "ECU-Morona_Santiago", "ECU-Zamora_Chinchipe"],
       quito(cert="nominal") + [
           e(1822, GC, certainty="nominal", **GC1822),
           e(1830, "ecuador", certainty="nominal", **ECU1830,
             note="エクアドルはマラニョン川・アマゾン川までを主張したが、ペルーが南部と東部に進出し、境は未画定のままだった"),
           e(1942, "ecuador", cause="リオデジャネイロ議定書でペルーとの国境が決まり、エクアドルは主張していたアマゾン地方の大半を失う",
             note="コンドル山脈の一部が未画定のまま残り、1981年（パキーシャ）・1995年（セネパ）に衝突した。1998年のブラジリア議定書で確定",
             source=EN + "Rio_Protocol"),
       ],
       note="キホス・マカスなどわずかな町と布教村を除いて先住民の地（nominal）")
region("ecu_galapagos", "ガラパゴス諸島", ["ECU-Galapagos"],
       [e(1648, None, note="無人島。スペインは領有を主張したが統治せず、海賊や捕鯨船が立ち寄った（所属なしで描く）"),
        e(1832, "ecuador", cause="エクアドルがガラパゴス諸島の領有を宣言する（2月）", source=W + "ガラパゴス諸島"),
        ])

# ================= ペルー =================
PE1821 = dict(cause="7月28日、サン・マルティンがリマでペルーの独立を宣言する（北部の諸州も独立派に加わる）",
              source=W + "ペルーの独立")
PE1824 = dict(cause="アヤクーチョの戦い（12月9日）でスクレが副王軍を破り、王党派が降伏する", source=W + "アヤクーチョの戦い")
NP = "北ペルー国"
SPP = "南ペルー国"


def per_tail(pb_label, pb_cert=None):
    c = {"certainty": pb_cert} if pb_cert else {}
    return [e(1836, "peru_bolivia", label=pb_label, **c, **PB1836), e(1839, "peru", **c, **PB1839)]


region("per_north", "ペルー北部（トルヒーヨ・カハマルカ・ピウラ）",
       ["PER-Tumbes", "PER-Piura", "PER-Lambayeque", "PER-La_Libertad", "PER-Cajamarca", "PER-Amazonas", "PER-San_Martin", "PER-Ancash"],
       peru_col() + [e(1821, "peru", cause="トルヒーヨ（1820年12月）・ピウラ・カハマルカ・チャチャポヤスなど北部の諸州が独立派に加わる",
                       source=W + "ペルーの独立")] + per_tail(NP),
       note="トゥンベスとハエン（カハマルカ）はエクアドルも主張したが、独立期からペルーが治めた")
region("per_lima", "リマ", ["PER-Lima", "PER-Municipalidad_Metropolitana_de_Lima"],
       peru_col() + [e(1821, "peru", **PE1821)] + per_tail(NP) + [
           e(1881, "chile", certainty="occupied", label="リマ（チリの占領）",
             cause="太平洋戦争：チョリーヨス・ミラフローレスの戦い（1月）の後、チリ軍がリマを占領する",
             source=W + "太平洋戦争_(1879年-1884年)"),
           e(1883, "peru", cause="アンコン条約（10月）の後、チリ軍がリマから撤退する", source=EN + "Treaty_of_Ancón"),
       ],
       note="1823年6–7月と1824年2–12月には王党派が一時リマを占めた（年末の状態では独立派）")
region("per_callao", "カヤオ", ["PER-El_Callao"],
       peru_col() + [
           e(1821, "peru", cause="カヤオの要塞の王党派が降伏する（9月）"),
           e(1824, SP, label="カヤオ要塞（王党派）", cause="2月、カヤオの守備隊が反乱を起こして要塞を王党派に渡す",
             source=EN + "Siege_of_Callao_(1825–1826)"),
           e(1826, "peru", cause="王党派のロディルが包囲の末に降伏する（1月）。南アメリカ本土で最後のスペインの拠点だった",
             source=EN + "Siege_of_Callao_(1825–1826)"),
       ] + per_tail(NP) + [
           e(1881, "chile", certainty="occupied", label="カヤオ（チリの占領）", cause="太平洋戦争：チリ軍がリマとカヤオを占領する"),
           e(1883, "peru", cause="アンコン条約（10月）の後、チリ軍が撤退する", source=EN + "Treaty_of_Ancón"),
       ])
region("per_center", "ペルー中部（フニン・パスコ・ウアヌコ・イカ）", ["PER-Junin", "PER-Pasco", "PER-Huanuco", "PER-Ica"],
       peru_col() + [
           e(1821, SP, certainty="uncertain", label="ペルー副王領",
             cause="独立派と王党派が中部の高地と南海岸を争う（王党派の主力はハウハ・ワンカヨに）"),
           e(1824, "peru", cause="フニンの戦い（8月）とアヤクーチョの戦い（12月）で独立派が勝つ", source=W + "アヤクーチョの戦い"),
       ] + per_tail(NP),
       note="1742–52年のフアン・サントス・アタワルパの反乱以後、中部のアマゾン側（チャンチャマヨなど）は約100年スペイン人が入れなかった（ピースの粒度では表せない）")
region("per_south", "ペルー南部（アヤクーチョ・アプリマク・ワンカベリカ）", ["PER-Ayacucho", "PER-Apurimac", "PER-Huancavelica"],
       peru_col() + [e(1824, "peru", **PE1824)] + per_tail(SPP))
region("per_arequipa", "アレキパ", ["PER-Arequipa"],
       peru_col() + [e(1824, "peru", **PE1824)] + per_tail(SPP) + [
           e(1883, "chile", certainty="occupied", label="アレキパ（チリの占領）", cause="太平洋戦争：チリ軍がアレキパを占領する（10月）"),
           e(1884, "peru", cause="アンコン条約の批准の後、チリ軍が撤退する（8月）", source=EN + "Treaty_of_Ancón"),
       ])
region("per_cusco", "クスコ", ["PER-Cusco"],
       peru_col() + [
           e(1780, SP, certainty="uncertain", label="トゥパク・アマルの反乱",
             cause="11月、トゥパク・アマル2世が反乱を起こし、年末にクスコを包囲する", source=EN + "Rebellion_of_Túpac_Amaru_II"),
           e(1781, SP, label="ペルー副王領", cause="トゥパク・アマル2世が捕らえられ、クスコで処刑される（5月）"),
           e(1814, SP, certainty="uncertain", label="クスコの反乱",
             cause="8月、プマカワとアングロ兄弟がクスコで反乱を起こす（1815年3月に鎮圧）", source=EN + "Cuzco_Rebellion_of_1814"),
           e(1815, SP, label="ペルー副王領"),
           e(1824, "peru", **PE1824),
       ] + per_tail(SPP),
       note="1821–24年は副王ラ・セルナが都をクスコに移して王党派の本拠とした")
region("per_puno", "プーノ", ["PER-Puno"],
       peru_col() + [
           e(1776, SP, label="プーノ（ラ・プラタ副王領）", cause="プーノがリオ・デ・ラ・プラタ副王領に移される（1796年にペルーへ戻る）",
             source=W + "リオ・デ・ラ・プラタ副王領"),
           e(1780, SP, certainty="uncertain", label="トゥパク・アマルの反乱", cause="トゥパク・アマル2世の反乱がティティカカ湖の周りに広がる"),
           e(1782, SP, label="プーノ（ラ・プラタ副王領）", cause="ディエゴ・クリストバル・トゥパク・アマルが降伏し、反乱が鎮まる"),
           e(1796, SP, label="ペルー副王領", cause="プーノがペルー副王領に戻される"),
           e(1814, SP, certainty="uncertain", label="クスコの反乱", cause="クスコの反乱軍がプーノとラパスを占める"),
           e(1815, SP, label="ペルー副王領"),
           e(1824, "peru", **PE1824),
       ] + per_tail(SPP))
MOQ = [e(1824, "peru", **PE1824)] + per_tail(SPP) + [
    e(1880, "chile", certainty="occupied", label="タクナ・モケグア（チリの占領）",
      cause="太平洋戦争：チリ軍がモケグア・タクナを占領する（3–5月。アルト・デ・ラ・アリアンサの戦い）",
      source=EN + "Battle_of_Tacna"),
]
region("per_moquegua", "モケグア・タクナ北部（カンダラベ・ホルヘ・バサドレ）", ["PER-Moquegua", "PER-Candarave", "PER-Jorge_Basadre"],
       peru_col() + MOQ + [e(1884, "peru", cause="アンコン条約の批准の後、チリ軍が撤退する（サマ川より北はペルーに残る）",
                            source=EN + "Treaty_of_Ancón")])
TAC1884 = e(1884, "chile", certainty="uncertain", label="タクナ（チリの管理）",
            cause="アンコン条約（1883年10月調印、1884年批准）：タクナ・アリカは10年間チリが治め、住民投票で帰属を決めることになる（投票は行われなかった）",
            source=EN + "Treaty_of_Ancón")
region("per_tacna", "タクナ", ["PER-Tacna_Province"],
       peru_col() + MOQ + [TAC1884,
                           e(1929, "peru", cause="リマ条約（6月）：タクナはペルーに、アリカはチリに分ける（8月に引き渡し）",
                             source=EN + "Treaty_of_Lima_(1929)")])
region("per_tarata", "タラタ", ["PER-Tarata"],
       peru_col() + MOQ + [TAC1884,
                           e(1925, "peru", cause="アメリカ合衆国の大統領クーリッジの仲裁裁定で、タラタがペルーに返される（9月）",
                             source=EN + "Tacna–Arica_compromise")])
MAY_Q = e(1648, SP, certainty="nominal", label="マイナス（キト）",
          note="イエズス会の布教村（マイナス布教区、ボルハが拠点）のほかは先住民の地。キトの聴訴院に属した",
          source=EN + "Maynas")
MAY_1802 = e(1802, SP, certainty="nominal", label="マイナス（ペルー副王領）",
             cause="国王の勅令でマイナスの統治がペルー副王領に移される（のちのペルー・エクアドルの国境紛争のもと）",
             source=EN + "Real_Cédula_of_1802")
MAY_1821 = e(1821, "peru", certainty="nominal", cause="マイナス（モヨバンバ）がペルーの独立に加わる")
region("per_loreto_north", "ロレート北部（マラニョン川・アマゾン川の北）",
       ["PER-Datem_del_Maranon", "PER-Loreto_Province", "PER-Maynas", "PER-Putumayo"],
       [MAY_Q, MAY_1802, MAY_1821,
        e(1836, "peru_bolivia", certainty="nominal", label=NP, **PB1836),
        e(1839, "peru", certainty="nominal", **PB1839),
        e(1864, "peru", certainty="uncertain", cause="イキトスに海軍の河港が置かれ、ペルーの支配が広がる。エクアドル・コロンビアも領有を主張",
          source=W + "イキトス"),
        e(1942, "peru", cause="リオデジャネイロ議定書（1月）でエクアドルとの国境が決まる", source=EN + "Rio_Protocol"),
        ],
       note="エクアドルはマラニョン川・アマゾン川の北を、コロンビアはプトゥマヨ川の南の一部を主張した（コロンビアとは1922年のサロモン＝ロサノ条約で決着）")
region("per_loreto_south", "ロレート南部（ユリマグアス・レケナ・ウカヤリ下流）",
       ["PER-Alto_Amazonas", "PER-Requena", "PER-Ucayali_Province", "PER-Mariscal_Ramon_Castilla"],
       [MAY_Q, MAY_1802, MAY_1821,
        e(1836, "peru_bolivia", certainty="nominal", label=NP, **PB1836),
        e(1839, "peru", certainty="nominal", **PB1839),
        e(1864, "peru", cause="イキトスに河港が置かれ、汽船の航路とゴムの採集でペルーの支配が広がる", source=W + "イキトス"),
        ])
region("per_selva", "ペルー東部のアマゾン（ウカヤリ・マドレ・デ・ディオス）", ["PER-Ucayali", "PER-Madre_de_Dios"],
       peru_col(cert="nominal") + [
           e(1821, "peru", certainty="nominal", cause="ペルーの独立（主張のみ。先住民の地）"),
           e(1836, "peru_bolivia", certainty="nominal", label=SPP, **PB1836),
           e(1839, "peru", certainty="nominal", **PB1839),
           e(1900, "peru", cause="ゴム・ブームでフィッツカラルドらがウカヤリ川・マドレ・デ・ディオス川に進出し、プエルト・マルドナド（1902）が作られる",
             note="ボリビア・ブラジルとの国境は1909年の条約で決まった", source=EN + "Madre_de_Dios_Region"),
       ])

# ================= ボリビア =================
BO1810 = e(1810, "united_provinces_rio_plata", certainty="uncertain", label="アルト・ペルー（ブエノスアイレスの軍）",
           cause="ブエノスアイレスの革命政府の軍（第1次北部遠征。カステリ）がスイパチャで勝ち（11月）、アルト・ペルーを占める",
           source=EN + "First_Upper_Peru_campaign")
SP1811B = e(1811, SP, label="チャルカス（ペルー副王領の軍の支配）",
            cause="ワキの戦い（6月）でブエノスアイレスの軍が敗れ、ペルー副王の軍がアルト・ペルーを取り戻す",
            note="1813年・1815年にもブエノスアイレスの軍が攻め入ったが、年末までに退いた。各地で独立派のゲリラ（レプブリケタ）が戦った",
            source=EN + "Battle_of_Huaqui")
BO1825 = e(1825, "bolivia", cause="スクレの軍がアルト・ペルーを解放し、8月6日にボリビアが独立を宣言する",
           source=W + "ボリビアの歴史")
BO_PB = [e(1836, "peru_bolivia", label="ボリビア国", **PB1836), e(1839, "bolivia", **PB1839)]
region("bol_lapaz", "ラパス・オルロ", ["BOL-La_Paz", "BOL-Oruro"],
       charcas() + [charcas_rp(),
                    e(1781, SP, certainty="uncertain", label="トゥパク・カタリの反乱",
                      cause="トゥパク・カタリがラパスを包囲する（3–10月）。11月に捕らえられ処刑された", source=EN + "Siege_of_La_Paz"),
                    e(1782, SP, label="チャルカス（ラ・プラタ副王領）"),
                    BO1810, SP1811B, BO1825] + BO_PB)
region("bol_charcas", "チュキサカ・ポトシ", ["BOL-Chuquisaca", "BOL-Potosi"],
       charcas() + [charcas_rp(), BO1810, SP1811B, BO1825] + BO_PB)
region("bol_cochabamba", "コチャバンバ", ["BOL-Cochabamba"],
       charcas() + [charcas_rp(), BO1810,
                    e(1811, "united_provinces_rio_plata", certainty="uncertain", label="コチャバンバ（独立派の蜂起）",
                      cause="ワキの敗戦の後もコチャバンバが再び蜂起する（10月。1812年5月に鎮圧）"),
                    e(1812, SP, label="チャルカス（ペルー副王領の軍の支配）", cause="ゴジェネチェの軍がコチャバンバを落とす（5月）"),
                    BO1825] + BO_PB)
region("bol_tarija", "タリハ", ["BOL-Tarija"],
       charcas() + [charcas_rp(),
                    e(1807, SP, label="サルタ（ラ・プラタ副王領）", cause="タリハがサルタ州（今のアルゼンチン北西部）に移される"),
                    BO1810, SP1811B,
                    e(1825, "united_provinces_rio_plata", certainty="uncertain", label="タリハ（サルタ州）",
                      cause="王党派の敗北の後、タリハはサルタ州（リオ・デ・ラ・プラタ連合州）に戻る"),
                    e(1826, "bolivia", cause="タリハの市参事会がボリビアへの帰属を決める（8月）。アルゼンチンは1889年に認めた",
                      source=EN + "Tarija")] + BO_PB)
region("bol_santa_cruz", "サンタ・クルス（チキートス）", ["BOL-Santa_Cruz"],
       charcas(cert="nominal") + [
           e(1691, SP, label="チャルカス（ペルー副王領）", cause="イエズス会がチキートスに布教村（レドゥクシオン）を作り始める",
             source=EN + "Jesuit_Missions_of_Chiquitos"),
           charcas_rp(), BO1810, SP1811B,
           e(1813, "united_provinces_rio_plata", certainty="uncertain", label="サンタ・クルス（独立派）",
             cause="ベルグラーノの派遣したワルネスがサンタ・クルスを治める", source=EN + "Ignacio_Warnes"),
           e(1816, SP, label="チャルカス（ペルー副王領の軍の支配）", cause="エル・パリの戦い（11月）でワルネスが戦死する"),
           BO1825] + BO_PB,
       note="東部のチャコ（今のパラグアイ側）との境はチャコ戦争（1932–35）まで未画定")
region("bol_beni", "ベニ（モホス）", ["BOL-Beni"],
       charcas(cert="nominal") + [
           e(1682, SP, label="チャルカス（ペルー副王領）", cause="イエズス会がモホスに最初の布教村（ロレト）を作る",
             source=EN + "Jesuit_Missions_of_Moxos"),
           charcas_rp(), BO1825] + BO_PB)
region("bol_pando", "パンド（アマゾン北部）", ["BOL-Pando"],
       charcas(cert="nominal") + [
           charcas_rp(cert="nominal"),
           e(1825, "bolivia", certainty="nominal", cause="ボリビアの独立（主張のみ。先住民の地）"),
           e(1836, "peru_bolivia", certainty="nominal", label="ボリビア国", **PB1836),
           e(1839, "bolivia", certainty="nominal", **PB1839),
           e(1900, "bolivia", cause="ゴム・ブームでボリビア政府がリベラルタなどに拠点を置く（北のアクレではブラジル人入植者と戦争になる）",
             note="アクレは1903年のペトロポリス条約でブラジル領に。ペルーとの境は1909–11年に確定。パンド県は1938年に設置",
             source=EN + "Acre_War"),
       ])

# ================= ギアナ（英領・蘭領・仏領） =================
NL = "netherlands"
BR = "britain"
FR = "france"


def guiana_core(first_label, first_note=None, start_cert=None, start2=None):
    c = {"certainty": start_cert} if start_cert else {}
    t = [e(1648, NL, label=first_label, **c, **({"note": first_note} if first_note else {}),
           source=EN + "Essequibo_(colony)")]
    if start2:
        t += start2
    t += [
        e(1781, BR, certainty="occupied", label="ギアナ（イギリスの占領）",
          cause="アメリカ独立戦争に加わったオランダに対し、イギリスがエセキボ・デメララ・ベルビセを占領する",
          source=EN + "Demerara#History"),
        e(1782, FR, certainty="occupied", label="ギアナ（フランスの占領）", cause="フランスがイギリスから奪う（ロンシャン＝のちのジョージタウンを建設）"),
        e(1784, NL, label=first_label, cause="パリ条約でオランダに返される"),
        e(1796, BR, certainty="occupied", label="ギアナ（イギリスの占領）",
          cause="フランス革命戦争：オランダ（バタヴィア共和国）がフランス側についたため、イギリスが占領する"),
        e(1802, NL, label=first_label, cause="アミアンの和約でバタヴィア共和国に返される"),
        e(1803, BR, certainty="occupied", label="ギアナ（イギリスの占領）", cause="戦争の再開でイギリスが再び占領する（9月）"),
    ]
    return t


BG1814 = lambda lab: e(1814, BR, label=lab, cause="ロンドン協定（8月）でエセキボ・デメララ・ベルビセがイギリスに割譲される",
                       source=EN + "Anglo-Dutch_Treaty_of_1814")
BG1831 = e(1831, BR, label="英領ギアナ", cause="デメララ＝エセキボとベルビセが合わさり、英領ギアナとなる",
           source=W + "イギリス領ギアナ")
GUY1966 = e(1966, "guyana", cause="5月26日、ガイアナがイギリスから独立する", source=W + "ガイアナ")

region("guy_essequibo", "エセキボ川河口", ["GUY-Essequibo_Islands_West_Demerara"],
       guiana_core("エセキボ（オランダ西インド会社）",
                   first_note="ゼーラント（オランダ西インド会社）の植民地。キク・オーヴァー・アル砦が拠点。サトウキビの奴隷制プランテーションが広がった") +
       [BG1814("デメララ＝エセキボ"), BG1831, GUY1966])
region("guy_demerara", "デメララ（ジョージタウン）", ["GUY-Demerara_Mahaica"],
       guiana_core("エセキボ（オランダ西インド会社）", start_cert="nominal",
                   start2=[e(1746, NL, label="デメララ（オランダ西インド会社）",
                             cause="デメララ川流域に入植が許され、植民地デメララが作られる", source=EN + "Demerara")]) +
       [BG1814("デメララ＝エセキボ"), BG1831, GUY1966])
BERB = guiana_core("ベルビセ（オランダ）", first_note="1627年にファン・ペーレ家が開いたオランダの植民地（1720年からベルビセ協会）")
# 1763年のベルビセ奴隷反乱
BERB.insert(1, e(1763, NL, certainty="uncertain", label="ベルビセ奴隷反乱",
                 cause="2月、クフィー（コフィ）を指導者とする奴隷の反乱が起こり、植民地の大半を反乱軍が押さえる（1764年に鎮圧）",
                 source=EN + "Berbice_slave_uprising"))
BERB.insert(2, e(1764, NL, label="ベルビセ（オランダ）", cause="オランダ・近隣の植民地からの援軍が反乱を鎮める"))
region("guy_berbice", "ベルビセ", ["GUY-East_Berbice_Corentyne", "GUY-Mahaica_Berbice"],
       BERB + [BG1814("ベルビセ"), BG1831, GUY1966],
       note="コランティン川上流のニュー川の三角地帯（ティグリ）はスリナムも主張している")
region("guy_pomeroon", "ポメルーン", ["GUY-Pomeroon_Supenaam"],
       guiana_core("エセキボ（オランダ西インド会社）", start_cert="nominal",
                   first_note="1650年代にオランダ人のノヴァ・ゼーランディア植民地があったが、1666年に壊された。その後はまばらな交易所") +
       [BG1814("デメララ＝エセキボ"), BG1831, GUY1966])
INTERIOR = lambda first_label: [
    e(1648, NL, certainty="nominal", label=first_label, note="オランダの交易者が入るだけの先住民の地（nominal）"),
    e(1814, BR, certainty="nominal", label="英領ギアナ", cause="ロンドン協定でイギリスに割譲される",
      source=EN + "Anglo-Dutch_Treaty_of_1814"),
]
region("guy_interior", "ギアナ中部の奥地", ["GUY-Upper_Demerara_Berbice", "GUY-Potaro_Siparuni"],
       INTERIOR("エセキボ（オランダ西インド会社）") + [
           e(1899, BR, label="英領ギアナ", cause="金・ダイヤモンドの採掘と境界の確定で、植民地政府の支配が奥地に及ぶ（年は目安）"),
           GUY1966])
region("guy_west", "エセキボ川の西（ベネズエラとの係争地）", ["GUY-Barina_Waini", "GUY-Cuyuni_Mazaruni"],
       INTERIOR("エセキボ（オランダ西インド会社）") + [
           e(1841, BR, certainty="uncertain", label="英領ギアナ（ベネズエラとの係争地）",
             cause="イギリスがショーンバーグの調べた境界線を示し、ベネズエラとの係争が始まる",
             source=EN + "Guayana_Esequiba"),
           e(1899, BR, label="英領ギアナ",
             cause="パリの仲裁裁定（10月）でエセキボ川の西の大半がイギリス領と決まる（1895年のベネズエラ危機でアメリカが仲裁を求めた）",
             source=EN + "Venezuela_Crisis_of_1895"),
           e(1966, "guyana", cause="5月26日、ガイアナが独立する。直前のジュネーヴ協定（2月）でベネズエラとの係争は話し合いに委ねられた",
             note="ベネズエラは1962年から仲裁裁定を無効と主張し、この地域を「グアヤナ・エセキバ」と呼んで領有を主張している（2023年に住民投票、国際司法裁判所で審理中）。実際の統治はガイアナ",
             source=EN + "Guayana_Esequiba"),
       ],
       note="スペイン・ベネズエラもエセキボ川までを主張した（主張が重なる所は、地図で一般的に示されるオランダ・イギリス側にした）")
region("guy_south", "ルプヌニ（ブラジルとの係争地を含む）", ["GUY-Upper_Takutu_Upper_Essequibo"],
       INTERIOR("エセキボ（オランダ西インド会社）") + [
           e(1842, BR, certainty="uncertain", label="英領ギアナ（ブラジルとの係争地）",
             cause="ピララをめぐってブラジルと争い、係争地を中立地帯とする"),
           e(1904, BR, label="英領ギアナ", cause="イタリア王の仲裁裁定で、ブラジルとの国境が決まる（6月）",
             source=EN + "Pirara_Question"),
           GUY1966])

# スリナム
SUR1650 = lambda c=None: e(1650, BR, label="スリナム（イギリス）", **({"certainty": c} if c else {}),
                           cause="バルバドス総督ウィロビー卿がスリナムに入植地を開く（パラマリボ）",
                           source=EN + "Willoughbyland")
SUR1667 = lambda c=None: e(1667, NL, label="オランダ領スリナム", **({"certainty": c} if c else {}),
                           cause="ゼーラントのクレインセンがスリナムを奪い（2月）、ブレダの和約でオランダ領となる（ニューアムステルダムとの交換）",
                           note="同年10月にイギリスが奪い返したが、1668年に返された（1674年のウェストミンスター条約で確定）",
                           source=W + "ブレダの和約")
SUR_OCC = lambda c=None: [
    e(1799, BR, certainty="occupied", label="スリナム（イギリスの占領）",
      cause="フランス革命戦争：バタヴィア共和国の植民地スリナムをイギリスが占領する（8月）"),
    e(1802, NL, label="オランダ領スリナム", **({"certainty": c} if c else {}), cause="アミアンの和約で返される"),
    e(1804, BR, certainty="occupied", label="スリナム（イギリスの占領）", cause="イギリスが再び占領する（5月）"),
    e(1816, NL, label="オランダ領スリナム", **({"certainty": c} if c else {}), cause="ロンドン協定（1814年）に基づいてオランダに返される（2月）",
      source=EN + "Anglo-Dutch_Treaty_of_1814"),
]
SUR1954 = e(1954, NL, certainty="indirect", label="スリナム（オランダ王国の構成国）",
            cause="オランダ王国憲章でスリナムが自治権をもつ王国の構成国となる", source=EN + "Charter_for_the_Kingdom_of_the_Netherlands")
SUR1975 = e(1975, "suriname", cause="11月25日、スリナムが独立する", source=W + "スリナム")
SUR_NULL = e(1648, None, note="先住民の地。オランダ人・イギリス人の交易所が断続的にあった（所属なしで描く）")
region("sur_core", "スリナム中心部（パラマリボ）", ["SUR-Paramaribo", "SUR-Wanica", "SUR-Commewijne", "SUR-Para", "SUR-Saramacca"],
       [SUR_NULL, SUR1650(), SUR1667()] + SUR_OCC() + [SUR1954, SUR1975],
       note="1682–1795年はスリナム協会（オランダ西インド会社・アムステルダム市・ファン・アールセン家）の植民地。サトウキビ・コーヒーの奴隷制プランテーションが広がった")
region("sur_coast", "スリナム東西の海岸（ニッケリー・コロニー・マロワイネ）", ["SUR-Nickerie", "SUR-Coronie", "SUR-Marowijne"],
       [SUR_NULL, SUR1650("nominal"), SUR1667("nominal")] + SUR_OCC() + [SUR1954, SUR1975],
       note="プランテーションが広がったのは18世紀末から（コロニーはイギリス占領期の入植）")
region("sur_interior", "スリナムの奥地", ["SUR-Brokopondo", "SUR-Sipaliwini"],
       [SUR_NULL, SUR1650("nominal"), SUR1667("nominal"),
        e(1760, NL, certainty="nominal", label="オランダ領スリナム（マルーンの地）",
          cause="逃亡奴隷の共同体（マルーン）のンジュカと和平条約を結び（1760）、サラマカとも結ぶ（1762）。奥地はマルーンと先住民が自治した",
          source=EN + "Ndyuka_people"),
        e(1799, BR, certainty="nominal", label="スリナム（イギリスの占領）", cause="イギリスがスリナムを占領する"),
        e(1802, NL, certainty="nominal", label="オランダ領スリナム（マルーンの地）"),
        e(1804, BR, certainty="nominal", label="スリナム（イギリスの占領）"),
        e(1816, NL, certainty="nominal", label="オランダ領スリナム（マルーンの地）", cause="オランダに返される"),
        SUR1954, SUR1975],
       note="1986–92年の内戦（ジャングル・コマンド）では東部の奥地が政府の手を離れた。南部の境（ラワ川上流）はフランス領ギアナと、西部（ティグリ）はガイアナと争っている")

# フランス領ギアナ
region("guf", "フランス領ギアナ", ["GUF-Guyane"],
       [e(1648, FR, certainty="nominal", label="ギアナ（フランスの入植の試み）",
          note="1643年にポンセ・ド・ブレティニーがカイエンヌに入植したが、先住民との戦いで失敗した",
          source=EN + "French_Guiana#History"),
        e(1658, NL, certainty="nominal", label="カイエンヌ（オランダ）", cause="オランダ西インド会社の入植者がカイエンヌに住みつく"),
        e(1664, FR, label="フランス領ギアナ", cause="フランスがカイエンヌを取り戻し、本格的な植民地とする（フランス西インド会社）",
          note="1676年にオランダが一時奪ったが、同年中にデストレがとり返した。奥地は先住民と逃亡奴隷の地",
          source=EN + "French_Guiana#History"),
        e(1809, "portugal", certainty="occupied", label="カイエンヌ（ポルトガルの占領）",
          cause="ナポレオン戦争：ブラジルに移ったポルトガル王室がイギリスとともにカイエンヌを占領する（1月）",
          source=EN + "Invasion_of_Cayenne_(1809)"),
        e(1817, FR, label="フランス領ギアナ", cause="ウィーン会議の取り決めでフランスに返される（11月）"),
        e(1946, FR, label="フランス海外県（ギアナ）", cause="フランスの海外県となる", source=W + "フランス領ギアナ"),
        ],
       note="1852–1953年は流刑植民地（悪魔島など）が置かれた。ブラジルとの境（アマパー）は1900年のスイスの仲裁で決まった")


# ---- 書き出し ----
def q(v):
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    return json.dumps(v, ensure_ascii=False)


lines = [
    "# A4 南米北部・アンデス（COL・VEN・ECU・PER・BOL・GUY・SUR・GUF）の地域と所属の変遷（1648–2025）",
    "# scratchpad/a4/gen_regions.py で生成した（各ピースはちょうど1つの地域に属する）。手で直してもよい。",
    "# スペイン領の副王領・聴訴院・州は spain＋label。主張だけの奥地（アマゾン・オリノコ・ギアナ奥地）は certainty: nominal。",
    "# 独立戦争期（1810–25）は年末の主な支配で塗る。独立宣言前の評議会（フンタ）の年は spain・uncertain。",
    "# 太平洋戦争のチリの占領（タクナ・モケグア 1880–83、リマ・カヤオ 1881–82、アレキパ 1883）は occupied、",
    "# アンコン条約後のタクナ・タラタのチリの管理（1884–1929/1925）は chile・uncertain。",
    "# パナマ地峡（PAN）は A3 の担当（1821–30 は gran_colombia、1831–1903 は colombia で塗る約束）。",
    "",
]
seen = set()
for r in R:
    for p in r["select"]["pieces"]:
        assert p not in seen, p
        seen.add(p)
    lines.append(f"- id: {r['id']}")
    lines.append(f"  name: {q(r['name'])}")
    lines.append("  select:")
    lines.append("    pieces: [" + ", ".join(r["select"]["pieces"]) + "]")
    if r.get("note"):
        lines.append(f"  note: {q(r['note'])}")
    lines.append("  timeline:")
    for t in r["timeline"]:
        keys = ["from", "owner", "overlord", "certainty", "label", "cause", "note", "source"]
        first = True
        for k in keys:
            if k not in t:
                continue
            pre = "    - " if first else "      "
            first = False
            lines.append(f"{pre}{k}: {q(t[k])}")
    lines.append("")
with open(OUT, "w") as f:
    f.write("\n".join(lines))
print("regions:", len(R), "pieces:", len(seen))
