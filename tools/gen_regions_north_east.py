"""F 北欧・東欧: data/regions/north_east.yaml を生成する補助スクリプト（scratchpad 用）。
ピースの割り当てはここで決め、出力 YAML には明示的なピース ID を書く。"""
import json, sys
from collections import OrderedDict, defaultdict

ROOT = "/home/user/world-history-atlas"
rows = open(f"{ROOT}/data/generated/pieces.tsv").read().strip().split("\n")
head = rows[0].split("\t")
P = [dict(zip(head, r.split("\t"))) for r in rows[1:]]
ISOS = "DNK NOR SWE FIN EST LVA LTU POL BLR UKR RUS".split()
P = [p for p in P if p["iso"] in ISOS]
for p in P:
    p["lon"] = float(p["lon"]); p["lat"] = float(p["lat"])
BYID = {p["id"]: p for p in P}

WP = "https://ja.wikipedia.org/wiki/"
def E(frm, owner, overlord=None, certainty=None, cause=None, source=None, note=None):
    d = OrderedDict(); d["from"] = frm; d["owner"] = owner
    if overlord: d["overlord"] = overlord
    if certainty: d["certainty"] = certainty
    if cause: d["cause"] = cause
    if source: d["source"] = source if source.startswith("http") else WP + source
    if note: d["note"] = note
    return d

S_ROSK = "ロスキレ条約"; S_COP = "コペンハーゲン条約_(1660年)"; S_NYS = "ニスタット条約"
S_ABO = "オーボ条約"; S_FRED = "フレデリクスハムンの和約"; S_KIEL = "キール条約"
S_P1 = "ポーランド分割"; S_TIL = "ティルジットの和約"; S_VIE = "ウィーン議定書"
S_SCH = "シェーンブルンの和約"; S_AND = "アンドルソヴォ条約"; S_KAR = "カルロヴィッツ条約"
S_BUC = "ブチャチ条約"; S_KK = "キュチュク・カイナルジ条約"; S_JAS = "ヤッシー条約"
S_BUH = "ブカレスト条約_(1812年)"; S_WEH = "ヴェーラウ条約"; S_BER = "ベルリン条約_(1742年)"
S_STO = "ストックホルム条約_(1720年)"; S_PER = "ペレヤスラフ会議"; S_ZB = "ズボリウ条約"
S_WARS = "ワルシャワ公国"; S_CONG = "ポーランド立憲王国"

# ---- 変遷（timeline）の型 ----
T = {}
T["denmark"] = [E(1648, "denmark")]
T["schleswig_dk"] = [E(1648, "denmark", note="シュレースヴィヒ公国（帝国外）。1713/1720年まではゴットルプ家の持ち分が散在（地図では省略）")]
T["bornholm"] = [E(1648, "denmark"), E(1658, "sweden", cause="ロスキレ条約でスウェーデンに割譲", source=S_ROSK),
                 E(1660, "denmark", cause="島民の反乱を受け、コペンハーゲン条約でデンマークに返還", source=S_COP)]
T["norway"] = [E(1648, "denmark"), E(1814, "norway", cause="キール条約でデンマークがノルウェーを放棄。独立宣言の後、11月にスウェーデンと同君連合", source=S_KIEL)]
T["trondelag"] = [E(1648, "denmark"), E(1658, "sweden", cause="ロスキレ条約でスウェーデンに割譲", source=S_ROSK),
                  E(1660, "denmark", cause="コペンハーゲン条約でデンマーク＝ノルウェーに返還", source=S_COP),
                  E(1814, "norway", cause="キール条約・スウェーデンとの同君連合", source=S_KIEL)]
T["sweden"] = [E(1648, "sweden")]
T["finnmark_inner"] = [E(1648, "denmark", certainty="uncertain", note="内陸のサーミ人の地域。デンマーク＝ノルウェーとスウェーデンが共同で課税し、国境は未画定"),
                       E(1751, "denmark", cause="ストレムスタード条約でノルウェーとスウェーデンの国境が画定", source="ストレムスタード条約"),
                       E(1814, "norway", cause="キール条約・スウェーデンとの同君連合", source=S_KIEL)]
T["halland"] = [E(1648, "sweden", note="1645年ブレムセブルー条約で30年間の担保としてスウェーデンが占有"),
                E(1658, "sweden", cause="ロスキレ条約でハッランドが正式にスウェーデン領に", source=S_ROSK)]
T["scania"] = [E(1648, "denmark"), E(1658, "sweden", cause="ロスキレ条約でスコーネ・ブレーキンゲがスウェーデン領に", source=S_ROSK)]
T["bohuslan"] = [E(1648, "denmark"), E(1658, "sweden", cause="ロスキレ条約でボーヒュースレーンがスウェーデン領に", source=S_ROSK)]
T["finland"] = [E(1648, "sweden"), E(1809, "finland", "russia", cause="フレデリクスハムンの和約でフィンランドがロシアに割譲され、フィンランド大公国となる", source=S_FRED)]
T["old_finland"] = [E(1648, "sweden"), E(1743, "russia", cause="オーボ条約でキュミ川以東をロシアに割譲", source=S_ABO),
                    E(1812, "finland", "russia", cause="「旧フィンランド」がフィンランド大公国に編入される", source="フィンランド大公国")]
T["baltic_sw"] = [E(1648, "sweden"), E(1721, "russia", cause="ニスタット条約でロシアに割譲", source=S_NYS)]
T["latgale"] = [E(1648, "poland_lithuania"), E(1772, "russia", cause="第1回ポーランド分割", source=S_P1)]
T["courland"] = [E(1648, "courland", "poland_lithuania"), E(1795, "russia", cause="第3回ポーランド分割でクールラント公国がロシアに併合", source="クールラント公国")]
T["lith_1795"] = [E(1648, "poland_lithuania"), E(1795, "russia", cause="第3回ポーランド分割", source=S_P1)]
T["lith_1793"] = [E(1648, "poland_lithuania"), E(1793, "russia", cause="第2回ポーランド分割", source=S_P1)]
T["lith_1772"] = [E(1648, "poland_lithuania"), E(1772, "russia", cause="第1回ポーランド分割", source=S_P1)]
T["suvalkija"] = [E(1648, "poland_lithuania"), E(1795, "prussia", cause="第3回ポーランド分割（新東プロイセン）", source=S_P1),
                  E(1807, "warsaw", cause="ティルジット条約でワルシャワ公国が成立", source=S_TIL),
                  E(1815, "congress_poland", "russia", cause="ウィーン議定書でポーランド立憲王国に", source=S_VIE)]
T["bialystok"] = [E(1648, "poland_lithuania"), E(1795, "prussia", cause="第3回ポーランド分割（新東プロイセン）", source=S_P1),
                  E(1807, "russia", cause="ティルジット条約でビャウィストク地区がロシアに", source=S_TIL)]
T["smolensk"] = [E(1648, "poland_lithuania"), E(1667, "russia", cause="アンドルソヴォ条約でスモレンスクをロシアに割譲", source=S_AND)]
T["russia"] = [E(1648, "russia")]
T["russia_steppe"] = [E(1648, "russia", certainty="uncertain", note="バシキール人・カザフ人の遊牧地。ロシアの支配は名目的"),
                      E(1735, "russia", cause="オレンブルク遠征。要塞線の建設でロシアの支配が固まる", source="オレンブルク")]
T["ingria"] = [E(1648, "sweden", note="イングリア（ストルボヴォ条約 1617 以来のスウェーデン領）"),
               E(1721, "russia", cause="ニスタット条約でイングリアをロシアに割譲（1703年にペテルブルク建設）", source=S_NYS)]
T["ducal_prussia"] = [E(1648, "prussia", "poland_lithuania", note="プロイセン公国（ポーランド王の封土。帝国外）"),
                      E(1657, "prussia", cause="ヴェーラウ条約でプロイセン公国がポーランドの宗主権から離れる", source=S_WEH)]
T["royal_prussia"] = [E(1648, "poland_lithuania", note="王領プロイセン"), E(1772, "prussia", cause="第1回ポーランド分割（西プロイセン）", source=S_P1)]
T["kulm"] = [E(1648, "poland_lithuania", note="王領プロイセン（ヘウムノ地方）"), E(1772, "prussia", cause="第1回ポーランド分割", source=S_P1),
             E(1807, "warsaw", cause="ティルジット条約でワルシャワ公国に", source=S_TIL), E(1815, "prussia", cause="ウィーン議定書でプロイセンに返還", source=S_VIE)]
T["danzig"] = [E(1648, "poland_lithuania", note="ダンツィヒ（王領プロイセンの自治都市）"),
               E(1793, "prussia", cause="第2回ポーランド分割", source=S_P1),
               E(1807, "danzig", cause="ティルジット条約でダンツィヒ自由市となる（フランスの保護下）", source=S_TIL),
               E(1814, "prussia", cause="ナポレオン軍の降伏後、プロイセン領に（1815年ウィーン議定書で確定）", source=S_VIE)]
T["torun"] = [E(1648, "poland_lithuania", note="トルン（王領プロイセンの都市）"), E(1793, "prussia", cause="第2回ポーランド分割", source=S_P1),
              E(1807, "warsaw", cause="ティルジット条約", source=S_TIL), E(1815, "prussia", cause="ウィーン議定書", source=S_VIE)]
T["lauenburg"] = [E(1648, "poland_lithuania", note="ラウエンブルク・ビュートウ（ポメルン公家の封土）"),
                  E(1657, "prussia", cause="ブロンベルク条約でブランデンブルクに与えられる", source="ブロンベルク条約")]
T["pom_br"] = [E(1648, "prussia", "hre", note="ヒンターポンメルン・ノイマルク（ブランデンブルク）"),
               E(1806, "prussia", cause="神聖ローマ帝国の解体"),
               E(1815, "prussia", "german_confederation", cause="ドイツ連邦の成立", source=S_VIE)]
T["pom_sw"] = [E(1648, "sweden", "hre", note="スウェーデン領ポンメルン", cause="ウェストファリア条約", source="ヴェストファーレン条約"),
               E(1720, "prussia", "hre", cause="ストックホルム条約でシュテッティンとペーネ川以南をプロイセンに割譲", source=S_STO),
               E(1806, "prussia", cause="神聖ローマ帝国の解体"),
               E(1815, "prussia", "german_confederation", cause="ドイツ連邦の成立", source=S_VIE)]
T["goleniow"] = [E(1648, "sweden", "hre", note="オーデル川東岸の帯状地（シュテッティン国境条約 1653）"),
                 E(1679, "prussia", "hre", cause="サン＝ジェルマン条約でオーデル東岸をブランデンブルクに", source="サン＝ジェルマン＝アン＝レー条約_(1679年)", note="ゴルノウは1693年まで担保。要確認"),
                 E(1806, "prussia", cause="神聖ローマ帝国の解体"),
                 E(1815, "prussia", "german_confederation", cause="ドイツ連邦の成立", source=S_VIE)]
T["silesia"] = [E(1648, "habsburg", "hre"), E(1742, "prussia", "hre", cause="ブレスラウ条約・ベルリン条約でシュレジエンの大半がプロイセン領に", source=S_BER),
                E(1806, "prussia", cause="神聖ローマ帝国の解体"),
                E(1815, "prussia", "german_confederation", cause="ドイツ連邦の成立", source=S_VIE)]
T["austrian_silesia"] = [E(1648, "habsburg", "hre", note="テッシェン公国（1742年以後もオーストリア領シュレジエン）"),
                         E(1806, "habsburg", cause="神聖ローマ帝国の解体"),
                         E(1815, "habsburg", "german_confederation", cause="ドイツ連邦の成立", source=S_VIE)]
T["lusatia"] = [E(1648, "saxony", "hre", note="ラウジッツ（1635年以来ザクセン選帝侯領）"),
                E(1806, "saxony", "rhine_confederation", cause="ザクセンがライン同盟に加盟（王国に昇格）", source="ライン同盟"),
                E(1813, "saxony", cause="ライプツィヒの戦いの後、ライン同盟が崩壊"),
                E(1815, "prussia", "german_confederation", cause="ウィーン議定書でラウジッツの大部分をプロイセンに割譲", source=S_VIE)]
T["netze"] = [E(1648, "poland_lithuania"), E(1772, "prussia", cause="第1回ポーランド分割（ネッツェ地区）", source=S_P1),
              E(1807, "warsaw", cause="ティルジット条約でワルシャワ公国に", source=S_TIL),
              E(1815, "prussia", cause="ウィーン議定書でポズナン大公国としてプロイセン領に", source=S_VIE)]
T["sp_posen"] = [E(1648, "poland_lithuania"), E(1793, "prussia", cause="第2回ポーランド分割（南プロイセン）", source=S_P1),
                 E(1807, "warsaw", cause="ティルジット条約でワルシャワ公国に", source=S_TIL),
                 E(1815, "prussia", cause="ウィーン議定書でポズナン大公国としてプロイセン領に", source=S_VIE)]
T["sp_congress"] = [E(1648, "poland_lithuania"), E(1793, "prussia", cause="第2回ポーランド分割（南プロイセン）", source=S_P1),
                    E(1807, "warsaw", cause="ティルジット条約でワルシャワ公国に", source=S_TIL),
                    E(1815, "congress_poland", "russia", cause="ウィーン議定書でポーランド立憲王国に", source=S_VIE)]
T["p3_congress"] = [E(1648, "poland_lithuania"), E(1795, "prussia", cause="第3回ポーランド分割（新東プロイセン・新シュレジエン）", source=S_P1),
                    E(1807, "warsaw", cause="ティルジット条約でワルシャワ公国に", source=S_TIL),
                    E(1815, "congress_poland", "russia", cause="ウィーン議定書でポーランド立憲王国に", source=S_VIE)]
T["wg_congress"] = [E(1648, "poland_lithuania"), E(1795, "habsburg", cause="第3回ポーランド分割（西ガリツィア）", source=S_P1),
                    E(1809, "warsaw", cause="シェーンブルン条約で西ガリツィアがワルシャワ公国に", source=S_SCH),
                    E(1815, "congress_poland", "russia", cause="ウィーン議定書でポーランド立憲王国に", source=S_VIE)]
T["krakow"] = [E(1648, "poland_lithuania"), E(1795, "habsburg", cause="第3回ポーランド分割", source=S_P1),
               E(1809, "warsaw", cause="シェーンブルン条約でワルシャワ公国に", source=S_SCH),
               E(1815, "krakow", cause="ウィーン議定書でクラクフ自由市となる（ロシア・プロイセン・オーストリアの保護下）", source="クラクフ自由市")]
T["zamosc"] = [E(1648, "poland_lithuania"), E(1772, "habsburg", cause="第1回ポーランド分割（ガリツィア）", source=S_P1),
               E(1809, "warsaw", cause="シェーンブルン条約でザモシチ地区がワルシャワ公国に", source=S_SCH),
               E(1815, "congress_poland", "russia", cause="ウィーン議定書でポーランド立憲王国に", source=S_VIE)]
T["galicia"] = [E(1648, "poland_lithuania"), E(1772, "habsburg", cause="第1回ポーランド分割（ガリツィア・ロドメリア王国）", source=S_P1)]
T["podolia_w"] = [E(1648, "poland_lithuania"), E(1672, "ottoman", cause="ブチャチ条約でポジーリャがオスマン帝国領に", source=S_BUC),
                  E(1699, "poland_lithuania", cause="カルロヴィッツ条約でポジーリャがポーランドに返還", source=S_KAR),
                  E(1772, "habsburg", cause="第1回ポーランド分割（ガリツィア）", source=S_P1)]
T["tarnopol_pod"] = T["podolia_w"] + [E(1809, "russia", cause="シェーンブルン条約でタルノポリ地区がロシアに", source=S_SCH),
                                      E(1815, "habsburg", cause="ウィーン議定書でオーストリアに返還", source=S_VIE)]
T["tarnopol_rut"] = T["galicia"] + [E(1809, "russia", cause="シェーンブルン条約でタルノポリ地区がロシアに", source=S_SCH),
                                    E(1815, "habsburg", cause="ウィーン議定書でオーストリアに返還", source=S_VIE)]
T["podolia_e"] = [E(1648, "poland_lithuania"), E(1672, "ottoman", cause="ブチャチ条約でポジーリャがオスマン帝国領に（カミャネツ州）", source=S_BUC),
                  E(1699, "poland_lithuania", cause="カルロヴィッツ条約でポーランドに返還", source=S_KAR),
                  E(1793, "russia", cause="第2回ポーランド分割", source=S_P1)]
T["r_north"] = [E(1648, "poland_lithuania", certainty="uncertain", note="フメリニツキーの乱以後、コサックとポーランドの戦場"),
                E(1667, "poland_lithuania", cause="アンドルソヴォ条約でドニエプル右岸はポーランド領に", source=S_AND),
                E(1793, "russia", cause="第2回ポーランド分割", source=S_P1)]
T["r_south"] = [E(1648, "cossack_hetmanate", certainty="uncertain", cause="フメリニツキーの乱", source="フメリニツキーの乱"),
                E(1649, "cossack_hetmanate", "poland_lithuania", cause="ズボリウ条約でキエフ・ブラーツラフ・チェルニーヒウ県のコサック自治を承認", source=S_ZB),
                E(1654, "cossack_hetmanate", "russia", certainty="uncertain", cause="ペレヤスラフ協定でロシアの保護下に", source=S_PER),
                E(1667, "poland_lithuania", certainty="uncertain", cause="アンドルソヴォ条約でドニエプル右岸はポーランド領とされる", source=S_AND),
                E(1669, "right_bank_hetmanate", "ottoman", certainty="uncertain", cause="ドロシェンコがオスマン帝国の宗主権を受け入れる", source="ペトロ・ドロシェンコ"),
                E(1676, "ottoman", certainty="uncertain", cause="ジュラウノ条約。右岸の大部分がオスマン帝国の支配下に（荒廃期）", source="ジュラウノ条約"),
                E(1686, "poland_lithuania", certainty="uncertain", cause="永遠平和条約。キエフ以南は無人の緩衝地帯とされる", source="永遠平和条約_(1686年)"),
                E(1699, "poland_lithuania", cause="カルロヴィッツ条約でポーランドの右岸支配が確定", source=S_KAR),
                E(1793, "russia", cause="第2回ポーランド分割", source=S_P1)]
T["left_bank"] = [E(1648, "cossack_hetmanate", certainty="uncertain", cause="フメリニツキーの乱", source="フメリニツキーの乱"),
                  E(1649, "cossack_hetmanate", "poland_lithuania", cause="ズボリウ条約でコサックの自治を承認", source=S_ZB),
                  E(1654, "cossack_hetmanate", "russia", cause="ペレヤスラフ協定でロシアの保護下に", source=S_PER),
                  E(1764, "russia", cause="ヘトマン制の廃止（小ロシア参議会の統治）", source="ヘーチマン国家")]
T["sloboda"] = [E(1648, "russia", certainty="uncertain", note="「荒野」への入植が進む時期"),
                E(1654, "russia", cause="スロボダ・ウクライナ（ハルキウ建設）へのコサックの入植", source="スロボダ・ウクライナ")]
T["sich"] = [E(1648, "zaporozhian_sich", certainty="uncertain", note="「荒野」。境界ははっきりしない"),
             E(1654, "zaporozhian_sich", "russia", certainty="uncertain", cause="ペレヤスラフ協定", source=S_PER),
             E(1711, "zaporozhian_sich", "crimea", certainty="uncertain", cause="マゼパの反乱後、シーチはクリミア＝ハンの保護下へ（オレシキのシーチ）", source="ザポロージャ・シーチ"),
             E(1734, "zaporozhian_sich", "russia", certainty="uncertain", cause="シーチがロシアの保護下に戻る（新シーチ）", source="ザポロージャ・シーチ"),
             E(1775, "russia", cause="ロシアがザポロージャ・シーチを廃止し、新ロシア県に編入", source="ザポロージャ・シーチ")]
T["new_serbia"] = T["sich"][:4] + [E(1752, "russia", cause="新セルビア（セルビア人などの軍事入植地）の設置", source="新セルビア")]
T["nogai_taurida"] = [E(1648, "nogai", "crimea", certainty="uncertain", note="ノガイ人の遊牧地（クリミア＝ハン国の支配下）"),
                      E(1783, "russia", cause="ロシアのクリミア併合", source="ロシアによるクリミア併合_(1783年)")]
T["nogai_1774"] = [E(1648, "nogai", "crimea", certainty="uncertain", note="ノガイ人の遊牧地（クリミア＝ハン国の支配下）"),
                   E(1774, "russia", cause="キュチュク・カイナルジ条約でドニエプル・南ブグ間とアゾフ海北岸がロシア領に", source=S_KK)]
T["yedisan"] = [E(1648, "ottoman", note="イェディサン。オスマン帝国のオチャキウ（オズィ）州で、ノガイ人が遊牧する"),
                E(1792, "russia", cause="ヤッシー条約でドニエストル川以東がロシア領に", source=S_JAS)]
T["budjak"] = [E(1648, "ottoman", note="ブジャク（アッケルマン・イズマイルなどオスマン帝国の要塞とノガイ人の遊牧地）"),
               E(1812, "russia", cause="ブカレスト条約でベッサラビアがロシア領に", source=S_BUH)]
T["crimea"] = [E(1648, "crimea", "ottoman"), E(1774, "crimea", cause="キュチュク・カイナルジ条約でオスマン帝国から独立", source=S_KK),
               E(1783, "russia", cause="ロシアのクリミア併合", source="ロシアによるクリミア併合_(1783年)")]
T["kefe"] = [E(1648, "ottoman", note="オスマン帝国の直轄地（カッファ州。南岸の港と要塞）"),
             E(1774, "crimea", cause="キュチュク・カイナルジ条約で独立したクリミア＝ハン国の領土に", source=S_KK),
             E(1783, "russia", cause="ロシアのクリミア併合", source="ロシアによるクリミア併合_(1783年)")]
T["kerch"] = [E(1648, "ottoman", note="ケルチ・イェニカレ（オスマン帝国の直轄地）"),
              E(1774, "russia", cause="キュチュク・カイナルジ条約でケルチとイェニカレがロシア領に", source=S_KK)]
T["bukovina"] = [E(1648, "moldavia", "ottoman"), E(1775, "habsburg", cause="オーストリアがブコヴィナを獲得", source="ブコヴィナ")]
T["hertsa"] = [E(1648, "moldavia", "ottoman")]
T["hotin"] = [E(1648, "moldavia", "ottoman"), E(1713, "ottoman", cause="ホティン要塞周辺がオスマン帝国の直轄地（ライア）となる", source="ホティン"),
              E(1812, "russia", cause="ブカレスト条約でベッサラビアがロシア領に", source=S_BUH)]
T["hungary"] = [E(1648, "habsburg", note="ハンガリー王国（帝国外）。ムカチェヴォなど東部は1711年までラーコーツィ家の所領")]
T["don"] = [E(1648, "don_cossacks", "russia", certainty="uncertain", note="ドン・コサック軍の土地。アゾフはオスマン帝国の要塞（1696–1711 ロシア、1739/1774 ロシア）")]
T["slavo_serbia"] = [E(1648, "don_cossacks", "russia", certainty="uncertain"),
                     E(1753, "russia", cause="スラヴャノ・セルビア（軍事入植地）の設置", source="スラヴャノ・セルビア")]
T["kuban"] = [E(1648, "nogai", "crimea", certainty="uncertain", note="クバンのノガイ人（クリミア＝ハン国の支配下）"),
              E(1783, "russia", certainty="uncertain", cause="クリミア併合とともにクバン川右岸をロシアが併合", source="ロシアによるクリミア併合_(1783年)"),
              E(1792, "russia", cause="黒海コサック軍の入植", source="黒海コサック軍")]
T["circassia"] = [E(1648, "circassia", certainty="uncertain", note="チェルケス人の諸部族。オスマン帝国・クリミアが名目上の宗主権を主張")]
T["kabarda"] = [E(1648, "kabarda", certainty="uncertain"),
                E(1774, "kabarda", "russia", certainty="nominal", cause="キュチュク・カイナルジ条約でカバルダのロシア帰属をオスマン帝国が承認", source=S_KK)]
T["ossetia"] = [E(1648, None, certainty="uncertain", note="オセット人の諸共同体"),
                E(1784, "russia", certainty="uncertain", cause="ウラジカフカス要塞の建設", source="ウラジカフカス")]
T["chechnya"] = [E(1648, None, certainty="uncertain", note="チェチェン人・イングーシ人の諸共同体（国家なし）")]
T["dagestan"] = [E(1648, "persia", certainty="nominal", note="ダゲスタンの諸侯国。ペルシアが名目上の宗主権"),
                 E(1813, "russia", certainty="uncertain", cause="ゴレスターン条約でダゲスタンがロシア領に", source="ゴレスターン条約")]
T["kalmyk"] = [E(1648, "kalmyk", "russia", certainty="uncertain"),
               E(1771, "russia", cause="カルムイクの大半が中央アジアへ移動し、ハン国は廃止される", source="カルムイク・ハン国")]

# ---- ピースの割り当て ----
G = {}  # piece id -> group
def put(group, ids):
    for i in ids:
        if i not in BYID:
            sys.exit(f"unknown piece {i} ({group})")
        if i in G:
            sys.exit(f"dup piece {i}: {G[i]} / {group}")
        G[i] = group
def pol(*keys):
    out = []
    for k in keys:
        for cand in (f"POL-powiat_{k}", f"POL-{k}"):
            if cand in BYID:
                out.append(cand); break
        else:
            sys.exit(f"POL key not found: {k}")
    return out
def pre(iso, *keys):
    return [f"{iso}-{k}" for k in keys]

# DNK
put("bornholm", ["DNK-Bornholm"])
put("schleswig_dk", pre("DNK", "Haderslev", "Aabenraa", "Tnder", "Snderborg"))
# SWE
put("scania", [p["id"] for p in P if p["iso"] == "SWE" and p["adm1"] in ("Skåne län", "Blekinge län")])
put("halland", [p["id"] for p in P if p["iso"] == "SWE" and p["adm1"] == "Hallands län"])
put("bohuslan", pre("SWE", "Stromstad", "Tanum", "Sotenas", "Munkedal", "Lysekil", "Uddevalla", "Orust", "Tjorn", "Stenungsund", "Kungalv", "Ockero"))
# NOR
put("trondelag", [p["id"] for p in P if p["iso"] == "NOR" and p["adm1"] == "Trøndelag"])
put("finnmark_inner", ["NOR-Guovdageaidnu_sme_1", "NOR-Kara_johka_sme_1"])
# FIN
put("old_finland", pre("FIN", "Kotkan_Haminan_seutukunta", "Lappeenrannan_seutukunta", "Imatran_seutukunta", "Savonlinnan_seutukunta", "Kouvolan_seutukunta"))
# LVA
put("livonia_lv", pre("LVA", "R_ga", "da_u_novads", "Ropa_u_novads", "Saulkrastu_novads", "Siguldas_novads", "Limba_u_novads",
                      "Valmieras_novads", "Valkas_novads", "C_su_novads", "Smiltenes_novads", "Al_ksnes_novads", "Gulbenes_novads",
                      "Madonas_novads", "Ogres_novads", "Salaspils_novads"))
put("latgale", pre("LVA", "Daugavpils", "Aug_daugavas_novads", "Kr_slavas_novads", "Ludzas_novads", "R_zeknes", "R_zeknes_novads",
                   "Prei_u_novads", "L_v_nu_novads", "Balvu_novads", "Varak_nu_novads"))
put("courland", [p["id"] for p in P if p["iso"] == "LVA" and p["id"] not in G])
# LTU
put("memel", pre("LTU", "Klaip_da_City_Municipality", "Klaip_da_District_Municipality", "Neringos_savivaldyb", "ilut_District_Municipality", "Pag_gi_savivaldyb"))
put("suvalkija", pre("LTU", "aki_rajono_savivaldyb", "Kalvarija_Municipality", "Kazl_R_dos_savivaldyb", "Marijampol_Municipality",
                     "Vilkavi_kis_District_Municipality", "Lazdij_rajono_savivaldyb", "Prienai_District_Municipality",
                     "Alytus_District_Municipality", "Alytaus_miesto_savivaldyb"))
put("lithuania", [p["id"] for p in P if p["iso"] == "LTU" and p["id"] not in G])
# POL
put("pom_sw", pol("Szczecin", "policki", "winouj_cie"))
put("goleniow", pol("goleniowski"))
put("pom_br", pol("Colberg_County", "Koszalin", "koszali_ski", "s_awie_ski", "bia_ogardzki", "szczecinecki", "drawski", "widwi_ski",
                  "obeski", "gryficki", "kamie_ski", "stargardzki", "pyrzycki", "choszcze_ski", "my_liborski", "gryfi_ski", "gorzowski",
                  "Gorzow_Wielkopolski", "strzelecko_drezdenecki", "sul_ci_ski", "s_ubicki", "kro_nie_ski", "S_upsk", "s_upski"))
put("lauenburg", pol("l_borski", "bytowski"))
put("royal_prussia", pol("chojnicki", "cz_uchowski", "ko_cierski", "kartuski", "wejherowski", "pucki", "Gdynia", "Sopot", "gda_ski",
                         "starogardzki", "tczewski", "malborski", "sztumski", "nowodworski", "Elbl_g", "elbl_ski", "tucholski", "wiecki",
                         "Grudzi_dz", "grudzi_dzki", "nowomiejski", "lidzbarski", "olszty_ski", "Olsztyn", "braniewski"))
put("kulm", pol("che_mi_ski", "w_brzeski", "brodnicki", "toru_ski"))
put("danzig", pol("Gda_sk"))
put("torun", pol("Toru"))
put("ducal_prussia", pol("kwidzy_ski", "i_awski", "ostrodzki", "nidzicki", "dzia_dowski", "szczycie_ski", "piski", "e_cki", "gi_ycki",
                         "w_gorzewski", "go_dapski", "olecki", "mr_gowski", "k_trzy_ski", "bartoszycki") + ["RUS-Kaliningrad"])
put("netze", pol("pilski", "z_otowski", "wa_ecki", "s_pole_ski", "nakielski", "bydgoski", "Bydgoszcz", "inowroc_awski", "czarnkowsko_trzcianecki"))
put("sp_posen", pol("pozna_ski", "Pozna", "gnie_nie_ski", "w_growiecki", "chodzieski", "obornicki", "szamotulski", "mi_dzychodzki",
                    "nowotomyski", "grodziski", "wolszty_ski", "ko_cia_ski", "remski", "redzki_2", "wrzesi_ski", "jaroci_ski", "pleszewski",
                    "gosty_ski", "leszczy_ski", "Leszno", "rawicki", "krotoszy_ski", "ostrowski", "ostrzeszowski", "k_pi_ski", "mogile_ski",
                    "ni_ski", "mi_dzyrzecki", "wschowski"))
put("sp_congress", pol("Kalisz", "kaliski", "Konin", "koni_ski", "kolski", "turecki", "s_upecki", "w_oc_awski", "W_oc_awek", "radziejowski",
                       "aleksandrowski", "Lipno_County", "rypi_ski", "golubsko_dobrzy_ski", "od", "odzki_wschodni", "zgierski", "pabianicki",
                       "aski", "zdu_skowolski", "sieradzki", "wieruszowski", "wielu_ski", "paj_cza_ski", "be_chatowski", "piotrkowski",
                       "Piotrkow_Trybunalski", "radomszcza_ski", "tomaszowski", "brzezi_ski", "owicki", "skierniewicki", "Skierniewice",
                       "rawski", "czycki", "Kutno_County", "podd_bicki", "P_ock", "p_ocki", "sierpecki", "gostyni_ski", "sochaczewski",
                       "yrardow_County", "uromi_ski", "m_awski", "k_obucki", "Cz_stochowa", "cz_stochowski"))
put("p3_congress", pol("Warszawa", "warszawski_zachodni", "pruszkowski", "Grodzisk_Mazowiecki_County", "piaseczy_ski", "grojecki", "legionowski",
                       "nowodworski_2", "p_o_ski", "ciechanowski", "pu_tuski", "makowski", "przasnyski", "ostro_cki", "Ostro_ka",
                       "wyszkowski", "ostrowski_2", "om_a", "om_y_ski", "kolne_ski", "zambrowski", "wysokomazowiecki", "grajewski",
                       "augustowski", "suwalski", "Suwa_ki", "sejne_ski",
                       "zawiercia_ski", "b_dzi_ski", "Sosnowiec", "D_browa_Gornicza", "myszkowski"))
put("bialystok", pol("Bia_ystok", "bia_ostocki", "sokolski", "moniecki", "bielski", "hajnowski", "siemiatycki"))
put("wg_congress", pol("Radom", "radomski", "przysuski", "szyd_owiecki", "bia_obrzeski", "kozienicki", "zwole_ski", "lipski", "garwoli_ski",
                       "otwocki", "mi_ski", "Siedlce", "Siedlce_County", "osicki", "soko_owski", "w_growski", "wo_omi_ski",
                       "Kielce", "kielecki", "konecki", "skar_yski", "starachowicki", "ostrowiecki", "opatowski", "sandomierski", "staszowski",
                       "buski", "pi_czowski", "kazimierski", "j_drzejowski", "w_oszczowski", "opoczy_ski",
                       "Lublin", "lubelski", "czy_ski", "widnicki_2", "lubartowski", "pu_awski", "rycki", "ukowski", "radzy_ski", "parczewski",
                       "w_odawski", "Bia_a_Podlaska", "bialski", "Che_m", "che_mski", "krasnostawski", "kra_nicki", "opolski_2",
                       "miechowski", "proszowicki", "olkuski"))
put("krakow", pol("Krakow", "krakowski", "chrzanowski", "Jaworzno"))
put("zamosc", pol("Zamo", "zamojski", "tomaszowski_2", "bi_gorajski", "hrubieszowski", "janowski"))
put("austrian_silesia", pol("cieszy_ski", "Bielsko_County", "Bielsko_Bia_a"))
put("lusatia", pol("zgorzelecki", "luba_ski", "arski"))
put("galicia_pl", pol("Nowy_S_cz", "nowos_decki", "gorlicki", "limanowski", "nowotarski", "tatrza_ski", "suski", "my_lenicki", "wielicki",
                      "boche_ski", "brzeski_2", "Tarnow", "tarnowski", "d_browski", "wadowicki", "o_wi_cimski", "ywiecki")
     + [p["id"] for p in P if p["iso"] == "POL" and p["adm1"] == "Subcarpathian Voivodeship"])
put("silesia_pl", [p["id"] for p in P if p["iso"] == "POL" and p["id"] not in G and
                   (p["adm1"] in ("Lower Silesian Voivodeship", "Opole Voivodeship", "Silesian Voivodeship"))]
    + pol("Zielona_Gora", "zielonogorski", "nowosolski", "aga_ski", "wiebodzi_ski"))

# RUS
put("ingria", pre("RUS", "Leningrad_oblast", "Saint_Petersburg"))
put("smolensk", pre("RUS", "Smolensk_Oblast"))
put("don", pre("RUS", "Rostov_Oblast"))
put("kuban", pre("RUS", "Krasnodar_Krai", "Stavropol_Krai"))
put("circassia", pre("RUS", "Adygea", "Karachay_Cherkessia"))
put("kabarda", pre("RUS", "Kabardino_Balkaria"))
put("ossetia", pre("RUS", "North_Ossetia_Alania"))
put("chechnya", pre("RUS", "Chechnya", "Ingushetia"))
put("dagestan", pre("RUS", "Dagestan"))
put("kalmyk", pre("RUS", "Kalmykia"))
put("russia_steppe", pre("RUS", "Orenburg_Oblast", "Chelyabinsk_Oblast", "Kurgan_Oblast"))
put("russia", [p["id"] for p in P if p["iso"] == "RUS" and p["id"] not in G])

# BLR: 1772 / 1793 / 1795
B1772 = pre("BLR", "Verkhnyadzvinsk", "Rasony", "Polotsk", "Haradok", "Vitebsk", "Shumilina", "Beshankovichy", "Liozna", "Syanno", "Orsha",
            "Dubrowna", "Talachyn", "Mogilev", "Shklow", "Horki", "Mstsislaw", "Krychaw", "Klimavichy", "Khotsimsk", "Kastsyukovichy",
            "Krasnapolle", "Cherykaw", "Slawharad", "Chavusy", "Bykhaw", "Byalynichy", "Kruhlaye", "Rahachow", "Karma", "Chachersk",
            "Buda_Kashalyova", "Vietka", "Gomel", "Dobrush")
put("blr_1772", B1772)
# 1793 線：ドルヤ〜ナロチ湖〜ストウブツィ〜ネスヴィジ西〜ピンスク〜（ウクライナへ）
LINE93 = [(55.80, 27.45), (54.85, 26.75), (54.20, 26.75), (53.60, 26.70), (53.20, 26.40), (52.10, 26.10), (51.00, 26.00), (50.30, 26.30), (49.50, 26.10)]
def x93(lat):
    if lat >= LINE93[0][0]: return LINE93[0][1]
    for (la1, x1), (la2, x2) in zip(LINE93, LINE93[1:]):
        if la2 <= lat <= la1:
            t = (la1 - lat) / (la1 - la2); return x1 + (x2 - x1) * t
    return LINE93[-1][1]
for p in P:
    if p["iso"] == "BLR" and p["id"] not in G:
        put("lith_1793" if p["lon"] > x93(p["lat"]) else "lithuania", [p["id"]])

# UKR
U = {}
def u(group, *names):
    put(group, pre("UKR", *names))
u("zakarpattia", *[p["id"][4:] for p in P if p["iso"] == "UKR" and p["adm1"] == "Zakarpattia Oblast"])
u("bukovina", "Hlyboka", "Storozhynets", "Vyzhnytsia", "Putyla", "Kitsman", "Zastavna")
u("hertsa", "Hertsa")
u("hotin", "Khotyn", "Kelmentsi", "Sokyriany", "Novoselytsia")
u("budjak", "Izmali", "Kiliia", "Reni", "Bolhrad", "Artsyi", "Tarutyne", "Sarata", "Tatarbunary", "Bilhorod_Dnistrovskyi")
u("kerch", "Lenine")
u("kefe", "Kirovske", "Nakhimovskyi", "Leninskyi", "Balakavaskyi")
u("crimea", *[p["id"][4:] for p in P if p["iso"] == "UKR" and p["adm1"] == "Autonomous Republic of Crimea" and p["id"] not in G])
u("tarnopol_pod", "Terebovlia", "Husiatyn", "Chortkiv", "Borschiv")
u("podolia_w", "Zalishchyky", "Buchach")
u("tarnopol_rut", "Ternopil", "Zbarazh", "Pidvolochysk")
u("volhynia_w", "Kremenets", "Shumsk", "Lanivtsi")
u("galicia_ua", "Sniatyn", *[p["id"][4:] for p in P if p["iso"] == "UKR" and p["adm1"] in ("Lviv Oblast", "Ivano-Frankivsk Oblast", "Ternopil Oblast") and p["id"] not in G])
# ヴォルィーニ：1793 線で東西に分ける
for p in P:
    if p["iso"] == "UKR" and p["adm1"] in ("Volyn Oblast", "Rivne Oblast") and p["id"] not in G:
        put("lith_1793" if p["lon"] > x93(p["lat"]) else "volhynia_w", [p["id"]])
for p in P:
    if p["iso"] == "UKR" and p["adm1"] == "Khmelnytskyi Oblast" and p["id"] not in G:
        put("podolia_e" if p["lat"] < 49.52 else "lith_1793", [p["id"]])
u("podolia_e", "Bar", "Murovani_Kurylivtsi")
u("r_north", *[p["id"][4:] for p in P if p["iso"] == "UKR" and p["adm1"] == "Zhytomyr Oblast"])
u("r_north", "Makariv", "Borodianka", "Ivankiv", "Poliske")
u("left_bank", "Kyiv", "Kyiv_Sviatoshyn", "Vasylkiv", "Obukhiv", "Vyshhorod", "Brovary", "Boryspil", "Baryshivka", "Pereiaslav_Khmelnytskyi",
  "Zghurivka", "Yahotyn", "Zolotonosha", "Chornobai", "Drabiv")
u("left_bank", *[p["id"][4:] for p in P if p["iso"] == "UKR" and p["adm1"] in ("Chernihiv Oblast", "Poltava Oblast")])
u("left_bank", "Konotop", "Krolevets", "Hlukhiv", "Shostka", "Yampil_2", "Seredyna_Buda", "Romny", "Nedryhailiv", "Lypova_Dolyna",
  "Tsarychanka", "Mahdalynivka", "Yurivka")
u("yedisan", "Ovidiopol")
u("yedisan", "Biliaivka", "Rozdilna", "Velyks_Mykhailivka", "Zakharivka", "Shyriaieve", "Ivanivka", "Berezivka", "Mykolaivka", "Liubashhivka",
  "Ananiv", "Podilsk", "Okny", "Kodyma", "Balta", "Lyman", "Domanivka", "Veselynove", "Berezanka", "Ochakiv", "Mykolaiv_2", "Kryve_Ozero", "Vradiivka")
u("r_south", "Pishchanka", "Savran", "Holovanivsk", "Vilshanka", "Haivoron", "Blahovishchenske", "Novoarkhanhelsk", "Kamianka")
u("r_south", *[p["id"][4:] for p in P if p["iso"] == "UKR" and p["adm1"] in ("Vinnytsia Oblast", "Kyiv Oblast", "Cherkasy Oblast") and p["id"] not in G])
u("new_serbia", "Novomyrhorod", "Mala_Vyska", "Znamianka", "Oleksandriia", "Onufriivka", "Svitlovodsk", "Oleksandrivka")
u("sloboda", *[p["id"][4:] for p in P if p["iso"] == "UKR" and p["adm1"] == "Kharkiv Oblast"])
u("sloboda", "Putyvl", "Buryn", "Bilopillia", "Sumy", "Lebedyn", "Okhtyrka", "Trostianets_2", "Krasnopillia", "Velyka_Pysarivka",
  "Starobilsk", "Svatove", "Bilokurakyne", "Novopskov", "Markivka", "Milove", "Bilovodsk", "Troitske", "Kreminna", "Novoaidar",
  "Sloviansk", "Lyman_2", "Bakhmut")
u("don", "Antratsyt", "Dovzhansk", "Sorokyne", "Lutuhyne", "Stanytsia_Luhanska", "Shakhtarsk", "Amvrosiivka")
u("slavo_serbia", "Slovianoserbsk", "Popasna", "Perevalsk")
u("nogai_taurida", "Henichesk", "Chaplynka", "Kalanchak", "Skadovsk", "Holo_Prystan", "Oleshky", "Kakhovka", "Novotroitske", "Nyzhni_Sirohozy",
  "Ivanivka_2", "Velyka_Lepetkya", "Hornostaivka", "Verkhniy_Rohackyk", "Melitopol", "Yakymivka", "Pryazovske", "Prymorsk", "Berdiansk",
  "Vesele", "Mykhailivka", "Tokmak", "Velyka_Bilozerka", "Chernihivka", "Bilmak")
u("nogai_1774", "Beryslav", "Bilozerka", "Velyka_Oleksandrivka", "Vysokopillia", "Novovorontsovka", "Vitovka", "Snihurivka", "Rozivka")
for p in P:
    if p["iso"] == "UKR" and p["id"] not in G:
        put("sich", [p["id"]])

# ---- 地域の定義 ----
REG = OrderedDict()
def R(id, name, tl, base=None, note=None):
    REG[id] = dict(name=name, tl=tl, base=base, note=note)
R("denmark_dk", "デンマーク本土", "denmark", base=dict(iso=["DNK"]))
R("schleswig_dk", "北シュレースヴィヒ", "schleswig_dk")
R("bornholm", "ボーンホルム島", "bornholm")
R("norway", "ノルウェー", "norway", base=dict(iso=["NOR"]))
R("finnmark_inner", "フィンマルク内陸（カウトケイノ・カラショーク）", "finnmark_inner")
R("trondelag", "トロンデラーグ（トロンハイム）", "trondelag")
R("sweden", "スウェーデン本土", "sweden", base=dict(iso=["SWE"]), note="ゴットランド・イェムトランド・ヘリエダーレンは1645年ブレムセブルー条約でスウェーデン領")
R("halland", "ハッランド", "halland")
R("scania", "スコーネ・ブレーキンゲ", "scania")
R("bohuslan", "ボーヒュースレーン", "bohuslan")
R("finland", "フィンランド", "finland", base=dict(iso=["FIN"]))
R("old_finland", "旧フィンランド（キュミ川以東）", "old_finland", note="1721年ニスタット条約でロシア領となったヴィープリ地方は現ロシア領（このピース群には含まれない）。コウヴォラ地方（キュミ川の両岸）とサヴォンリンナ地方（一部のみ割譲）は、面積の大きい側の判断が難しく要確認")
R("estonia", "エストニア・北リヴォニア", "baltic_sw", base=dict(iso=["EST"]), note="1561年以来のスウェーデン領エストニア、1629年以来のスウェーデン領リヴォニア、1645年以来のエーゼル島")
R("livonia_lv", "リヴォニア（ヴィゼメ）", "baltic_sw")
R("latgale", "ポーランド領リヴォニア（ラトガレ）", "latgale")
R("courland", "クールラント・ゼムガレ", "courland", note="ピルテン地方（ポーランド直轄）は省略")
R("memel", "メーメル地方（クライペダ）", "ducal_prussia")
R("lithuania", "リトアニア大公国（1795年ロシア領部分）", "lith_1795")
R("suvalkija", "ネマン川以西（スヴァルキヤ）", "suvalkija")
R("pom_sw", "スウェーデン領ポンメルン（オーデル河口）", "pom_sw")
R("goleniow", "ゴルノウ（オーデル東岸）", "goleniow")
R("pom_br", "ヒンターポンメルン・ノイマルク", "pom_br")
R("lauenburg", "ラウエンブルク・ビュートウ", "lauenburg")
R("royal_prussia", "王領プロイセン（ポメレリア・ヴァルミア）", "royal_prussia")
R("kulm", "ヘウムノ地方", "kulm")
R("danzig", "ダンツィヒ（グダンスク）", "danzig")
R("torun", "トルン", "torun")
R("ducal_prussia", "プロイセン公国（東プロイセン）", "ducal_prussia")
R("netze", "ネッツェ地区", "netze")
R("sp_posen", "大ポーランド西部（1815年ポズナン大公国）", "sp_posen")
R("sp_congress", "大ポーランド東部・クヤヴィ・ウッチ・プウォツク", "sp_congress", note="1793年と1795年の境界（プウォツク・マゾフシェ間）は要確認")
R("p3_congress", "マゾフシェ北部・ポドラシェ北部・新シュレジエン", "p3_congress")
R("bialystok", "ビャウィストク地区", "bialystok")
R("wg_congress", "西ガリツィア（ルブリン・ラドム・キェルツェ）", "wg_congress")
R("krakow", "クラクフ", "krakow")
R("zamosc", "ザモシチ地区", "zamosc")
R("galicia_pl", "ガリツィア西部（小ポーランド南部）", "galicia")
R("silesia_pl", "シュレジエン（ポーランド部分）", "silesia", note="グラーツ伯領（クウォツコ）を含む。シュヴィーブス（1686–1695 ブランデンブルク）は省略")
R("austrian_silesia", "テッシェン（オーストリア領シュレジエン）", "austrian_silesia")
R("lusatia", "ラウジッツ（ポーランド部分）", "lusatia")
R("ingria", "イングリア（インゲルマンランド）", "ingria", note="レニングラード州のピースは東部（ロシア本来の領土）も含むが、面積の大きいイングリア・カレリア地峡側に合わせた。要確認")
R("smolensk", "スモレンスク", "smolensk")
R("russia", "ロシア本土", "russia", note="ブリャンスク州南西部（スタロドゥーブ）はヘトマン国家の連隊領だったが、ピースが州単位のためロシアに入れた")
R("russia_steppe", "南ウラル（オレンブルク）", "russia_steppe")
R("don", "ドン・コサック軍の地", "don")
R("slavo_serbia", "スラヴャノ・セルビア", "slavo_serbia")
R("kuban", "クバン・北カフカスの草原", "kuban")
R("circassia", "チェルケス", "circassia")
R("kabarda", "カバルダ", "kabarda")
R("ossetia", "オセチア", "ossetia")
R("chechnya", "チェチェン・イングーシ", "chechnya")
R("dagestan", "ダゲスタン", "dagestan")
R("kalmyk", "カルムイク", "kalmyk")
R("blr_1772", "ベラルーシ東部（1772年ロシア領）", "lith_1772")
R("lith_1793", "ベラルーシ中部・ウクライナ北西部（1793年ロシア領）", "lith_1793", note="1793年の境界（ドルヤ〜ピンスク〜ズブルチ川）はピースの重心で振り分けた。要確認")
R("volhynia_w", "ヴォルィーニ西部（1795年ロシア領）", "lith_1795")
R("zakarpattia", "ザカルパッチャ（ハンガリー北東部）", "hungary")
R("bukovina", "ブコヴィナ", "bukovina")
R("hertsa", "ヘルツァ", "hertsa")
R("hotin", "ホティン地方", "hotin")
R("budjak", "ブジャク（南ベッサラビア）", "budjak")
R("crimea", "クリミア半島", "crimea")
R("kefe", "クリミア南岸（オスマン帝国直轄地）", "kefe")
R("kerch", "ケルチ", "kerch")
R("galicia_ua", "ガリツィア東部（ルテニア）", "galicia")
R("tarnopol_rut", "タルノポリ地方（北部）", "tarnopol_rut")
R("tarnopol_pod", "ポジーリャ西部（タルノポリ地方南部）", "tarnopol_pod")
R("podolia_w", "ポジーリャ西部（ドニエストル沿い）", "podolia_w")
R("podolia_e", "ポジーリャ東部（カミャネツ）", "podolia_e")
R("r_north", "キエフ県北部・ポリーシャ", "r_north")
R("r_south", "ドニエプル右岸（キエフ県南部・ブラーツラフ県）", "r_south")
R("left_bank", "ドニエプル左岸（ヘトマン国家）", "left_bank", note="キエフ市とその周辺（1686年以後ロシア領）を含む")
R("sloboda", "スロボダ・ウクライナ", "sloboda")
R("sich", "ザポロージャ・コサックの地", "sich")
R("new_serbia", "新セルビア（エリサヴェトグラード）", "new_serbia")
R("nogai_taurida", "タヴリア北部（ノガイ草原）", "nogai_taurida")
R("nogai_1774", "ドニエプル・南ブグ間の草原", "nogai_1774")
R("yedisan", "イェディサン（ドニエストル・南ブグ間）", "yedisan")

# ---- 出力 ----
groups = defaultdict(list)
for pid, g in G.items():
    groups[g].append(pid)
unused = set(groups) - set(REG)
if unused: sys.exit(f"groups without region: {unused}")
missing = [p["id"] for p in P if p["id"] not in G and p["iso"] not in ("DNK", "NOR", "SWE", "FIN", "EST")]
if missing: sys.exit(f"unassigned: {missing}")

def q(s):
    return json.dumps(s, ensure_ascii=False)
out = ["# F 北欧・東欧（DNK NOR SWE FIN EST LVA LTU POL BLR UKR RUS）の地域と所属の変遷（1648–1815）",
       "# ピースは担当範囲のものだけを選ぶ。大きな地域（国全体）を小さな地域で上書きしている所がある（重なりの決まり）。",
       ""]
for rid, r in REG.items():
    out.append(f"- id: {rid}")
    out.append(f"  name: {r['name']}")
    if r["note"]: out.append(f"  note: {q(r['note'])}")
    out.append("  select:")
    if r["base"]:
        for k, v in r["base"].items():
            out.append(f"    {k}: [{', '.join(v)}]")
    else:
        ids = sorted(groups[rid])
        lines = []; cur = []
        for i in ids:
            cur.append(i)
            if len(", ".join(cur)) > 100:
                lines.append(", ".join(cur)); cur = []
        if cur: lines.append(", ".join(cur))
        out.append("    pieces: [" + (",\n      ".join(lines)) + "]")
    out.append("  timeline:")
    for e in T[r["tl"]]:
        first = True
        for k, v in e.items():
            pre_ = "    - " if first else "      "
            first = False
            if v is None: vv = "null"
            elif isinstance(v, int): vv = str(v)
            elif k in ("owner", "overlord", "certainty"): vv = v
            else: vv = q(v)
            out.append(f"{pre_}{k}: {vv}")
    out.append("")
open(f"{ROOT}/data/regions/north_east.yaml", "w").write("\n".join(out))
cnt = defaultdict(int)
for g in G.values(): cnt[g] += 1
print(len(REG), "regions;", len(G), "explicit pieces")
print(dict(sorted(cnt.items())))
