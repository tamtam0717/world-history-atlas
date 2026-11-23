# アフリカ（1648–2025）：データ作成担当への共通の指示

ヨーロッパ・アジア・南北アメリカ（レビュー済み）に続いて、アフリカを作る。年の範囲は 1648–2025。

## 最初に読むもの
1. CLAUDE.md（「画面づくりの原則」「進捗」）
2. docs/data-format.md（certainty の nominal / uncertain / indirect / occupied、label、overlord、出来事の at）、docs/agent-brief.md（手順・検証・してはいけないこと）
3. docs/agent-brief-1815-1914.md・docs/agent-brief-1914-2025.md・docs/agent-brief-south-asia.md・docs/agent-brief-americas.md（保護国・宗主権・占領・植民地・先住の国家の扱い）
4. 既存の政体（作り直さずに使う）：britain・france・portugal・spain・netherlands・germany（german_empire）・italy・belgium・ottoman・egypt・morocco・tunis・tunisia・algeria・libya・oman・usa・soviet_union など（data/polities/*.yaml を grep）。
5. ピースは data/generated/pieces.tsv（iso・adm1 列）。**北アフリカ（MAR・ESH・DZA・TUN・LBY・EGY）はヨーロッパの担当（data/regions/west.yaml・ottoman.yaml）がすでに 1648–2025 のデータを持っている。** サハラの内陸部や、新しく分けたピース（西サハラの3ピース、ビル・タウィール、ハライブなど）の扱いだけ確認し、足りない所を補う（ある年は変えない。直す必要があれば報告に書く）。

## 担当とファイル

| 担当 | 範囲（iso） | ファイル（data/polities・regions・events の下） |
|---|---|---|
| F1 西アフリカ（セネガンビア・サヘル） | MRT・SEN・GMB・GNB・GIN・SLE・LBR・MLI・BFA・CIV・NER・CPV | `west_africa.yaml` |
| F2 ギニア湾・ナイジェリア | GHA・TGO・BEN・NGA・CMR・TCD・GNQ・STP | `guinea_coast.yaml` |
| F3 東アフリカ・アフリカの角・スーダン | SDN・SSD・ETH・ERI・DJI・SOM・KEN・UGA・RWA・BDI・TZA | `east_africa.yaml` |
| F4 中部・南部アフリカ | CAF・GAB・COG・COD・AGO・ZMB・MWI・MOZ・ZWE・BWA・NAM・ZAF・LSO・SWZ・MDG・COM・MYT・REU・MUS・SYC・SHN・IOT・ATF | `southern_africa.yaml` |
| F5 分布 | アフリカ全体の宗教・言語（data/religion/africa.yaml、data/language/africa.yaml、_kinds.yaml への追加。北アフリカの既存の分布は確認して必要なら補う）、都市（data/cities.yaml に追記）、潮流（data/movements/africa.yaml） | 左のとおり |

境目（サヘル・チャド湖・スーダン南部・大湖地方・ザンベジ川流域など）で迷ったら note で申し送る。

## 主な政体 ID（誰が定義するか。この表にないものは担当の範囲で自由に）

| ID | 名前 | 担当 |
|---|---|---|
| `futa_toro` `futa_jallon` `kaarta` `segu` `toucouleur`（トゥクロール帝国）`wassoulou`（サモリ）`kenedougou` `mossi`（ワガドゥグなど）`liberia` `senegal` `mali` など | | F1 |
| `ashanti` `dahomey` `oyo` `benin_kingdom` `sokoto`（ソコト・カリフ国）`bornu` `kanem`/`wadai` `bagirmi` `ghana` `nigeria` `biafra` など | | F2 |
| `ethiopia`（ゴンダール朝 → 諸侯の時代 → 帝国 → 社会主義 → 連邦。names で）`funj`（センナール）`darfur` `mahdist`（マフディー国家）`zanzibar` `buganda` `bunyoro` `rwanda_kingdom` `somali_*` `sudan` `kenya` `tanzania` など | | F3 |
| `kongo` `lunda` `luba` `kuba` `mutapa` `rozwi` `ndebele` `zulu` `transvaal`（南アフリカ共和国＝ボーア）`orange_free_state` `natalia` `lesotho` `swaziland` `merina`（マダガスカル）`congo_free_state` `rhodesia` `south_africa` など | | F4 |

## 描き方の方針（南北アメリカと同じ考え方）
- **実効支配は濃く、主張だけは斜線、アフリカの主な国家は独自の色**：
  - ヨーロッパ諸国の沿岸の砦・交易拠点・植民地の実際に治めていた所は、宗主国の色（certainty なし）。
  - ベルリン会議（1884–85）前後の「勢力圏」「主張」だけで、実際の支配がまだ及んでいない内陸は、その国の `certainty: nominal`（斜線）。実効支配が及んだ年（遠征・条約・行政の設置）から濃く塗る。
  - アシャンティ・ダホメ・オヨ・ソコト・ボルヌ・エチオピア・マフディー国家・ブガンダ・コンゴ王国・ルンダ・ズールー・メリナなど、教科書や一般的な歴史地図に出る国家は独自の政体として独自の色で塗る（範囲があいまいなら uncertain）。
  - どの国家の支配も及ばない所（サハラの砂漠の奥地、熱帯雨林の奥地など）で、大きな国家もない所は owner なし（所属なし）にして note に書く。トゥアレグなど遊牧の連合は、教科書に出る規模なら政体にしてもよい。
- **植民地と保護領**：
  - 直轄の植民地（ケープ植民地、セネガル、ゴールドコースト植民地、ラゴス、アルジェリアなど）は宗主国の色＋label（「ケープ植民地」「フランス領西アフリカ（セネガル）」など、時期の名前）。
  - 在地の王・首長がそのまま認められた保護領（ナイジェリア北部の首長国、ブガンダ、ザンジバル、ベチュアナランド、バストランド、スワジランドなど、間接統治が明確なもの）は、宗主国の `certainty: indirect`（薄い色）＋label。間接統治がはっきりしない保護領は直轄と同じ扱い。
  - 委任統治（旧ドイツ領：トーゴ・カメルーン・南西アフリカ・タンガニーカ・ルアンダ＝ウルンディ）は委任された国の色＋label。
- **戦争・占領**：第二次エチオピア戦争後のイタリアの支配（1936–41）は、戦後無効になった枢軸国の併合として certainty: occupied（ヨーロッパの方針と同じ）。第一次・第二次世界大戦のアフリカでの占領、独立戦争・内戦（アルジェリアは既存、ビアフラ、コンゴ動乱、アンゴラ・モザンビーク、ソマリア、スーダン、エチオピア・エリトリアなど）は年末時点の主な支配で、反乱・分離勢力の支配地は独自の政体か uncertain。
- 南アフリカのホームランド（バントゥースタン）は描かない（note）。
- 現在の地図は実際の統治で塗る（ソマリランド、西サハラ、南スーダン、サヘルの武装勢力の支配地などは uncertain や独自の政体で、note に）。
- 表記は日本の高校世界史の教科書に合わせる（ムハンマド・アリー、マフディー、ゴードン、ファショダ事件、ボーア戦争、セシル・ローズ、リヴィングストン、スタンリー、レオポルド2世、メネリク2世、アドワの戦い、ハイレ・セラシエ、エンクルマ、ルムンバ、マンデラ、アパルトヘイト など）。

## 作るもの・確認
- 担当範囲のすべてのピースに 1648–2025 の所属を与える（意図した所属なしは note と報告に）。確認：`node tools/build_data.mjs --missing 1648,1700,1750,1800,1830,1860,1880,1885,1890,1900,1914,1920,1936,1945,1960,1975,1990,2025 --iso <国コード>`。
- 元首（植民地の時期は宗主国の元首を使うので不要。在地の主な国家の王・スルタン・皇帝、独立後の実権者）を出典の URL つきで。情勢（periods）3〜8 件、出来事 40〜80 件（高校世界史で太字になる事件はもらさない）。場所がはっきりした出来事には `at: [経度, 緯度]` を付けてよい。
- 地図の確認：`node tools/snapshot.mjs 1648 1750 1800 1830 1860 1880 1890 1900 1914 1936 1945 1960 1975 2025 --zoom <経度>,<緯度>,<倍率> --out .cache/snapshots/<担当名>`。
- `npm run data` が警告なしで通ること（他担当の未定義 ID による警告は報告に書く）。
- 地域の数が多くなる国（NGA 774・GHA 260・TZA・MOZ・AGO・UGA など）は、同じ変遷をたどるピースをまとめた地域にし、生成スクリプトを使ってよい。作業用のスクリプトは、リポジトリの外の scratchpad（/tmp/claude-0/-home-user-world-history-atlas/5a7a987a-a877-559b-b3fe-1574c9cf110f/scratchpad/<担当名>/）に置く。

## 敏感な主題
奴隷貿易、植民地支配の暴力（コンゴ自由国、ヘレロ・ナマの虐殺など）、アパルトヘイト、ルワンダの虐殺、内戦・飢饉、現在の紛争と領土問題は、事実に基づき、高校世界史・一般的な百科事典の水準の中立的な表現で書く。

## 最後に報告すること
docs/agent-brief.md と同じ（日本語・簡潔に）。担当どうしの確認点も。
