# 政体 ID の割り当て（試作期間 1648–1815）

地域ごとにデータ作成を分担するため、主な政体の ID と「どのファイルで定義するか」をここで決めておく。
ほかの担当の政体を参照するときは、この表の ID をそのまま使う（定義はしない）。
表にない政体が必要になったら、自分の担当ファイルで自由に追加してよい（ID の重複はビルドでエラーになる）。

| 担当 | 定義ファイル | 現代の国（ピースの担当範囲） |
|---|---|---|
| A 西欧・北アフリカ | `data/polities/west.yaml`, `data/regions/west.yaml`, `data/events/west.yaml` | FRA ESP PRT AND MCO GBR IRL ISL GRL MAR DZA TUN LBY EGY ESH MRT MLI |
| BN 北ドイツ | `data/polities/germany_north.yaml` ほか同名 | DEU のうち adm1 が Schleswig-Holstein, Hamburg, Niedersachsen, Bremen, Mecklenburg-Vorpommern, Brandenburg, Berlin, Sachsen-Anhalt, Sachsen, Thüringen, Nordrhein-Westfalen |
| BS 南ドイツ | `data/polities/germany_south.yaml` ほか同名 | DEU のうち adm1 が Hessen, Rheinland-Pfalz, Saarland, Baden-Württemberg, Bayern |
| C 低地諸国・スイス・イタリア | `data/polities/italy_lowcountries.yaml` ほか同名 | NLD BEL LUX CHE LIE ITA SMR VAT MLT |
| D ハプスブルク領 | `data/polities/habsburg.yaml` ほか同名 | AUT CZE SVK HUN SVN HRV |
| E バルカン・オスマン・中東 | `data/polities/ottoman.yaml` ほか同名 | BIH SRB XKX MNE ALB MKD GRC BGR ROU MDA TUR CYP SYR LBN ISR JOR IRQ SAU KWT BHR QAT ARE OMN GEO ARM AZE IRN AFG PAK TKM UZB KAZ と数字コード（係争地） |
| F 北欧・東欧 | `data/polities/north_east.yaml` ほか同名 | DNK NOR SWE FIN EST LVA LTU POL BLR UKR RUS |

## 主な政体 ID

| ID | 名前 | 定義する担当 |
|---|---|---|
| `france` | フランス（王国→共和国→帝国→王国。names で切り替え） | A |
| `spain` | スペイン | A |
| `portugal` | ポルトガル | A |
| `britain` | イングランド王国（〜1706）→グレートブリテン王国（1707〜1800）→連合王国（1801〜） | A |
| `scotland` | スコットランド王国（〜1706） | A |
| `ireland` | アイルランド王国（〜1800） | A |
| `morocco` `algiers` `tunis` `tripoli` | モロッコ、アルジェ、チュニス、トリポリ | A |
| `hre` | 神聖ローマ帝国（overlord としてだけ使う枠。〜1806） | BS |
| `prussia` | ブランデンブルク＝プロイセン→プロイセン王国 | BN |
| `saxony` `hanover` `mecklenburg` `brunswick` `munster` `westphalia_kingdom` `berg` | ザクセン、ハノーファー（ブラウンシュヴァイク＝リューネブルク）、メクレンブルク、ブラウンシュヴァイク＝ヴォルフェンビュッテル、ミュンスター司教領、ヴェストファーレン王国、ベルク大公国 | BN |
| `bavaria` `palatinate` `wurttemberg` `baden` `hesse_kassel` `hesse_darmstadt` | バイエルン、プファルツ、ヴュルテンベルク、バーデン、ヘッセン＝カッセル、ヘッセン＝ダルムシュタット | BS |
| `cologne` | ケルン選帝侯領（大司教領。本領はライン左岸＝現NRW・RP） | BN |
| `mainz` `trier` | マインツ・トリーア選帝侯領（大司教領） | BS |
| `other_hre` | その他の帝国諸邦（細かい領邦をまとめたもの） | BS |
| `rhine_confederation` | ライン同盟（overlord。1806–1813） | BS |
| `german_confederation` | ドイツ連邦（overlord。1815–） | BS |
| `netherlands` | ネーデルラント連邦共和国→バタヴィア共和国→ホラント王国→ネーデルラント連合王国（names で切り替え） | C |
| `switzerland` | スイス（盟約者団→ヘルヴェティア共和国→スイス連邦） | C |
| `savoy` | サヴォイア公国→サルデーニャ王国（1720〜） | C |
| `venice` `genoa` `tuscany` `papal_states` `naples` | ヴェネツィア、ジェノヴァ、トスカーナ、教皇領、ナポリ | C |
| `habsburg` | オーストリア（ハプスブルク君主国→オーストリア帝国 1804〜） | D |
| `transylvania` | トランシルヴァニア公国 | D |
| `ottoman` | オスマン帝国 | E |
| `wallachia` `moldavia` | ワラキア、モルダヴィア | E |
| `ragusa` | ラグーザ（ドゥブロヴニク）共和国 | E |
| `persia` | ペルシア（サファヴィー朝など。names で切り替え） | E |
| `sweden` | スウェーデン | F |
| `denmark` | デンマーク＝ノルウェー | F |
| `russia` | ロシア（ツァーリ国→ロシア帝国 1721〜） | F |
| `poland_lithuania` | ポーランド＝リトアニア共和国 | F |
| `courland` | クールラント公国 | F |
| `crimea` | クリミア＝ハン国 | F |
| `cossack_hetmanate` | ヘトマン国家（ウクライナ・コサック） | F |
| `warsaw` | ワルシャワ公国（1807–1815） | F |

## 境界をまたぐ領域の扱い

担当範囲は「現代の国」で分けているので、歴史的な地域が担当をまたぐことがある。

- 例：シュレジエン（現ポーランド＝F、現チェコ＝D、現ドイツ＝BN）、ポメラニア（ドイツ＝BN、ポーランド＝F）、東プロイセン（ポーランド・ロシア＝F）、チロル（オーストリア＝D、イタリア＝C）、モルダヴィア（ルーマニア・モルドバ＝E、ウクライナ＝F）。
- **それぞれの担当は、自分の範囲のピースだけを select に入れる。** 同じ歴史的地域でも、地域 ID を担当ごとに分ける（例：`silesia_pl`（F）、`silesia_cz`（D）、`silesia_de`（B））。
- 変遷（timeline）は担当どうしで矛盾しないように、条約と年を一般的な通説に合わせる。

## 色の目安

隣り合う国が区別できる、淡めの色にする。代表的な国はおおよそ次の系統にそろえる（最終的な調整はまとめ役が行う）。

- フランス：青系、イギリス：赤系、スペイン：橙系、ポルトガル：緑系
- オーストリア：黄系、プロイセン：灰青系、バイエルン：水色系、ザクセン：緑系
- オスマン帝国：緑系、ロシア：茶系、ポーランド＝リトアニア：桃系、スウェーデン：黄土系、デンマーク：赤系
- ヴェネツィア：橙茶系、教皇領：淡黄系、スイス：赤茶系、オランダ：橙系
- 聖界諸侯（大司教領・司教領）：紫系
