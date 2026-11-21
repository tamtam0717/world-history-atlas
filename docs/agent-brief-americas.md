# 南北アメリカ（1648–2025）：データ作成担当への共通の指示

ヨーロッパ・東アジア・南アジア・東南アジア（レビュー済み）に続いて、南北アメリカを作る。年の範囲は 1648–2025。

## 最初に読むもの
1. CLAUDE.md（「画面づくりの原則」「進捗」）
2. docs/data-format.md（certainty の nominal / uncertain / indirect / occupied、label、overlord）、docs/agent-brief.md（手順・検証・してはいけないこと）
3. docs/agent-brief-1815-1914.md・docs/agent-brief-1914-2025.md・docs/agent-brief-south-asia.md（保護国・宗主権・占領・植民地の扱い）
4. 既存の政体（作り直さずに使う）：spain・portugal・france・britain・netherlands・denmark・sweden・russia・usa・germany など（data/polities/*.yaml を grep）。usa はヨーロッパの担当が「占領地区などに使う」ために定義しただけなので、本格的な情報（元首・情勢）は A1 が書き足す（Edit で該当箇所だけ）。
5. ピースは data/generated/pieces.tsv（iso・adm1 列）。グリーンランドとアイスランドはヨーロッパの担当のデータがある。

## 担当とファイル

| 担当 | 範囲 | ファイル（data/polities・regions・events の下） |
|---|---|---|
| A1 アメリカ合衆国 | USA のうちアラスカ以外（ハワイを含む） | `usa.yaml` |
| A2 カナダ・アラスカ | CAN、USA の Alaska、SPM（サンピエール島・ミクロン島）、BMU | `canada.yaml` |
| A3 メキシコ・中米・カリブ | MEX、GTM・BLZ・HND・SLV・NIC・CRI・PAN、カリブ海の全島嶼（CUB・HTI・DOM・JAM・PRI・BHS・TTO・小アンティル諸島・英領／仏領／蘭領／米領の島） | `mexico_caribbean.yaml` |
| A4 南米北部・アンデス | COL・VEN・ECU・PER・BOL・GUY・SUR・GUF | `andes.yaml` |
| A5 ブラジル・南米南部 | BRA・ARG・CHL・PRY・URY・FLK（フォークランド）・SGS | `south_cone.yaml` |
| A6 分布 | 上のすべての宗教・言語（data/religion/americas.yaml、data/language/americas.yaml、_kinds.yaml への追加）、都市（data/cities.yaml に追記）、潮流（data/movements/americas.yaml） | 左のとおり |

境目（テキサス・カリフォルニア〈A1〉とメキシコ〈A3〉、オレゴン〈A1〉とブリティッシュコロンビア〈A2〉、アラスカの境、ルイジアナとヌーヴェル・フランス、アマゾンの国境、チャコ、パタゴニアなど）で迷ったら note で申し送る。

## 主な政体 ID（誰が定義するか）

| ID | 名前 | 担当 |
|---|---|---|
| `usa`（既存に書き足す）`csa` | アメリカ合衆国、アメリカ連合国（1861–65） | A1 |
| `texas` `california_republic`（必要なら） | テキサス共和国（1836–45） | A1 |
| `iroquois` `cherokee` `creek` `lakota` `comanche` など | 主な先住民勢力（教科書に出る規模のもの） | A1 |
| `canada` | カナダ（1867–。自治領→names） | A2 |
| `hudson_bay_company` は作らず britain＋label | ルパートランド | A2 |
| `mexico` `central_america`（中米連邦）`guatemala` `honduras` `el_salvador` `nicaragua` `costa_rica` `panama` `cuba` `haiti` `dominican_republic` `jamaica` など | | A3 |
| `apache` `maya_independent`（ユカタンのカスタ戦争期のチャン・サンタ・クルス）など | | A3 |
| `gran_colombia` `colombia` `venezuela` `ecuador` `peru` `bolivia` `peru_bolivia`（連合）`guyana` `suriname` | | A4 |
| `brazil` `argentina` `chile` `paraguay` `uruguay` `united_provinces_rio_plata` など | | A5 |
| `mapuche` | マプーチェ（アラウカニア）、パンパの先住民勢力 | A5 |

## 田村さんの決定（アメリカ大陸）
- **実効支配は濃く、主張だけは斜線、主な先住民勢力は独自の色**：
  - 植民地の入植地・砦と周辺など実際に治めていた所は、宗主国の色（certainty なし）。
  - ヨーロッパの国が主張しているだけで実際には先住民の地だった所は、その国の `certainty: nominal`（斜線）。主張が重なる所は、地図で一般的に示される側にして note に書く。
  - イロコイ連邦・クリーク・チェロキー・ラコタ（スー）・コマンチ・アパッチ・マプーチェなど、教科書や一般的な歴史地図に出る大きな先住民勢力は、独自の政体として独自の色で塗る（範囲があいまいなら uncertain）。宗主国と条約で保護・同盟の関係にある時期は overlord でもよい。
  - どの国の主張も及ばない所（極北・アマゾン奥地など）で、大きな先住民勢力もない所は owner なし（所属なし）にして note に書く。
- **植民地**：スペインの副王領・総督領（ヌエバ・エスパーニャ、ペルー、ヌエバ・グラナダ、リオ・デ・ラ・プラタ）、ポルトガル領ブラジル、英領13植民地などは宗主国の色＋label（「ヌエバ・エスパーニャ副王領」「マサチューセッツ植民地」など、地域ごとに時期の名前）。南アジアの直轄地の副ラベルと同じ考え方。

## 描き方の方針
- 「Y 年の年末の状態」。
- 独立戦争・内戦・戦争（アメリカ独立戦争、ラテンアメリカの独立戦争 1810–25、アメリカ＝メキシコ戦争、南北戦争、パラグアイ戦争、太平洋戦争〈1879–84〉、チャコ戦争、米西戦争など）は、年末時点の主な支配を描く。独立宣言後で承認前の新国家は独自の色（支配があいまいなら uncertain）。占領は certainty: occupied（例：1847 年のメキシコ市、1880–83 年のリマ）。
- アメリカ合衆国の準州（テリトリー）・未編入地は owner: usa（label に準州名を付けてもよい）。インディアン準州（オクラホマ）も usa＋label。先住民保留地は描かない。
- 保護領・軍政：キューバ（1898–1902 の米軍政は usa・occupied、1903–34 のプラット修正条項は overlord: usa）、パナマ運河地帯（1903–1999、usa＋label。ピースがあれば）、グアンタナモ、ハイチ（1915–34）・ドミニカ（1916–24）・ニカラグア（1912–33）の米軍占領は occupied。
- 名目的な支配・未画定の国境（アマゾン、チャコ、パタゴニア、アラスカとカナダの境、オレゴン・カントリーの英米共同占有）は nominal / uncertain と note。
- 表記は日本の高校世界史の教科書に合わせる（ワシントン、ジェファソン、モンロー宣言、リンカン、シモン・ボリバル、サン・マルティン、トゥサン・ルヴェルチュール、イダルゴ、フアレス、ディアス、メキシコ革命、カストロ など）。

## 作るもの・確認
- 担当範囲のすべてのピースに 1648–2025 の所属を与える（意図した所属なしは note と報告に）。確認：`node tools/build_data.mjs --missing 1648,1700,1763,1783,1803,1810,1825,1848,1861,1867,1900,1914,1945,1960,1990,2025 --iso <国コード>`。
- 元首（植民地の時期は宗主国の元首を使うので不要。独立後の大統領・皇帝など、実権者）を出典の URL つきで。情勢（periods）3〜8 件、出来事 40〜80 件（高校世界史で太字になる事件はもらさない）。
- 地図の確認：`node tools/snapshot.mjs 1648 1700 1763 1783 1803 1825 1848 1861 1867 1898 1914 1945 1960 2025 --zoom <経度>,<緯度>,<倍率> --out .cache/snapshots/<担当名>`。
- `npm run data` が警告なしで通ること（他担当の未定義 ID による警告は報告に書く）。
- 作業用のスクリプトは scratchpad の自分専用のサブフォルダ（例：scratchpad/a1/）に置く（他の担当と名前がぶつからないように）。

## 敏感な主題
先住民の強制移住（涙の道など）・虐殺、奴隷制と奴隷貿易、独裁政権と人権侵害、内戦、領土紛争（フォークランド／マルビナス、ベリーズ、エセキボなど）は、事実に基づき、高校世界史・一般的な百科事典の水準の中立的な表現で書く。現在の地図は実際の統治で塗る。

## 最後に報告すること
docs/agent-brief.md と同じ（日本語・簡潔に）。担当どうしの確認点も。

## 追記：海外領土のピース（ピースの見直しで追加）
CGAZ になかった海外領土は Natural Earth から足してあり、iso は地域のコード：A3＝GLP・MTQ・BLM・MAF・SXM・ABW・CUW・BES・AIA・MSR・VGB・CYM・TCA（プエルトリコ・米領ヴァージン諸島は USA の ADM1）、A4＝GUF、A2＝BMU・SPM、A5＝SGS。パナマ運河地帯は PAN-*_Canal_Zone の 3 ピース、グアンタナモ基地は CUB-Guantanamo_Bay_Naval_Base。アメリカ合衆国の郡ピースの ID は「郡名_州略号」（例 USA-Washington_PA）。
