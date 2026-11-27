# world-history-atlas

田村篤志さんが世界史を学ぶための「共通の教科書」。普段チャットで世界史の質問をするたびに、どの質問からも参照できる土台を作ることが目的。
中心になるのは **年代別のヨーロッパ地図** で、年を進めたり指定した年に飛んだりでき、その年の出来事と国ごとの情報が表示されるもの。

## これまでに決まったこと（2026-11-20、claude.ai での議論より）

### 目的・使い方
- 主な使い方は **(c) 地図を眺めて全体像をつかむ**（質問時の参照や通読教材は二の次）。
- 対象は **ヨーロッパ・中世以降**（開始年は未決定。下の「未決事項」を参照）。
- 公開ページになってよい（GitHub Pages で公開してかまわない）。

### 欲しい機能
- 年代別のヨーロッパ地図
  - 年を1年ずつ進める／戻す
  - 数値（年）を入力するとその年の地図にジャンプ
- 画面の右側に、その年に起きた主な出来事を表示
- 国をクリックすると、その時期の情報を表示
  - 君主（皇帝・国王・朝廷など）
  - 情勢
  - その年に起きた事件（あれば）
- **スマホでも快適に見られること**（PCでは右パネル、スマホでは下からのシートなど、レスポンシブ対応にする）

### 作業の進め方
- **作業量は惜しまない。** Claude が10時間連続で動けば解決することなら、それだけトークンを使ってよいプロジェクト。
- **基本はずっとクラウドセッションで作業する**（PCのローカルでは作業しない）。スマホからも積極的に改修したいので、作業は細かく commit/push し、どのセッションからでも続きを再開できる状態を保つ。
- 方針の大きな分岐点では田村さんに質問してよい。

## 国境データの方式：ピース塗り分け方式（合意済み）

国境線の座標を Claude が記憶から描くと不正確になるので、それはしない。代わりに次の方式をとる。

1. **ピース（ジオメトリ）**：現代の州・県単位の区画を、ジグソーパズルのピースとして使う。Natural Earth の admin-1 などの公開データを使い、必要な所だけ細かい区画やカスタム分割を加える。
2. **所属データ（Claude が調べて作る）**：「どのピースが、何年から何年まで、どの国に属していたか」を、国境変化イベントの単位で記録する。
   - 例：「シュレジエン：1742年 オーストリア→プロイセン（ベルリン条約）」
3. **描画**：任意の年について、所属データからピースを国ごとに色分けし、同じ国のピースを結合して1年単位の地図を作る。年ごとの「国境変化」もイベントから自動で導出し、右パネルに出す。
4. **神聖ローマ帝国のような分裂地域**：二層で表示する。外側の枠が上位の政体（帝国）、中が主要な領邦。細かすぎる領邦はまとめる。
5. **検証**：
   - 答え合わせに [aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps)（GPL-3.0）を使う。数十の年のスナップショットしかなく精度も粗いので、正解扱いはせず、あくまで照合用。
   - 重要な区切りでは、作業に関わっていない別のエージェントにデータをチェックさせる。
6. **出典**：所属変更イベントや君主のデータには、できるだけ出典（条約名・参照ページなど）を持たせる。

## 範囲と公開先（2026-11-20 決定）
- **最終的な対象期間：476年（西ローマ滅亡）〜現代**。データ形式は最初から476年〜現代を扱える設計にする。
  - 初期中世は国境があいまいな地域が多い。このため所属データには「不確実」「名目的な支配」などの区別を持たせ、ピース方式と合わない地域も表現できるようにしておく。
- **試作期間：1648〜1815（ウェストファリア条約〜ウィーン会議）**。
- **公開先：GitHub Pages**。リポジトリを public にする作業は田村さんが行う（準備ができたら Claude から依頼する）。

## 技術的な方針メモ（Claude の判断。必要なら変更してよい）
- ピースは Natural Earth の admin-1 だけでは粗い（例：ドイツは16州しかない）。このため、ドイツ・イタリア・低地諸国などは、さらに細かい区画（geoBoundaries の admin-2 など、ライセンスが CC-BY 系のもの）で補う。地図を描く前に最初に検証するのはここ。
- 神聖ローマ帝国の領邦は、主要な20〜30程度に絞る。残りは「その他の帝国諸邦」にまとめる。
- 表記は日本語。高校世界史の教科書の表記に寄せる。

## 画面づくりの原則（田村さんの方針、2026-11-20）
- 情報は、文字を読まなくても**見た目で直感的に伝わる**ようにする（色の濃さ・光沢・グラデーション・太さなど）。例：潮流の「始まり／最盛期／衰退」は濃さや光り方の変化で伝える。これは潮流に限らず、UI 全般で大切にする。
- 田村さんへの報告・質問は日本語で書く。

## リポジトリの構成（2026-11-20 時点）

- `src/`：画面（Vite + TypeScript、d3-geo・topojson-client。SVG で描画）
  - `map.ts` 地図（ピースを所属で結合して描く、ラベル、ズーム、デバッグ表示）
  - `panel.ts` 右パネル（出来事・国境の変化・国の情報）、`sheet.ts` スマホの下シート
- `data/`：手で書くデータ（YAML）。形式は `docs/data-format.md`
- `public/data/`：`pieces.topo.json`（ピース地図。tools/build_pieces.sh で生成し commit 済み）、`atlas.json`（npm run data で生成。commit しない）
- `tools/`：ピースの生成、データの検証、historical-basemaps との照合（compare_hb.py）、地図の画像書き出し（snapshot.mjs）
- `docs/`：データ形式、政体 ID の割り当て、データ作成エージェントへの共通の指示
- GitHub Pages：`.github/workflows/pages.yml`（main への push でデプロイ）

## 環境のメモ（クラウドセッション）

- Python の地理系ライブラリは `/home/user/venv`（geopandas, shapely, pyogrio）。新しいセッションでは
  `python3 -m venv /home/user/venv && /home/user/venv/bin/pip install geopandas pyogrio shapely pyarrow pypinyin` で作り直す。
- ネットワーク：raw.githubusercontent.com と media.githubusercontent.com（geoBoundaries）、npm は使える。Wikipedia・naciscdn.org・geoboundaries.org は bash からは使えない。
- Playwright と Chromium は入っている（tools/snapshot.mjs で使う）。

## 進捗（2026-11-20 時点）

- ロードマップ 1〜2：完了（骨組み・データ形式）。
- ロードマップ 3：1648–1815 の試作データを、7担当（地域別のエージェント）で作成済み。全7,074ピースに所属あり。政体166、地域444、出来事約340。
  - 担当間の整合：完了（docs/integration-notes.md の「整合の結果」）。
  - 独立レビュー：完了（docs/review/）。重要度 A・B の指摘は反映済み。反映しなかったものと理由は docs/review/fixes.md。
  - ピースの改良：ロシア西部13州を郡単位に、メノルカ島を分離、フルビェシュフ郡の壊れた形を修正（tools/pieces_config.json の adm2_within / split / clip）。全7,453ピース。
- 画面（2026-11-20 夜）：MapLibre GL の地球儀表示に移行。都市（その時代321・現代675）、海・海峡名、川・湖、節目ジャンプ、現代の国境との切り替え、ショートカット（? で一覧）、地名検索（F）、Wikipedia 画像、宗教の分布表示（政治／宗教の切り替え、data/religion）、年リンク、戻る／進む（⌘[ ⌘]）。
- 潮流（data/movements、36件。docs/movements-format.md）はデータのみ完成。画面への組み込みが次の作業（パネル一覧・年表の帯・地図上の広がり。勢いは濃さ・光りで見せる）。
- 1815–1914 に拡大（2026-11-21）：7担当で延長 → 整合 → 独立レビュー（docs/review/1914_*.md）→ 修正。表示範囲は 1648–1914（data/meta.yaml）。
  - 言語（民族）の分布（data/language、1648–1914。docs/language-format.md）と潮流の画面（パネル・年表の帯・地図の光）も完成。宗教も 1914 まで延長。
  - 方針：保護国は宗主国の色（副ラベル label で元の国名）、アフガニスタンは独自の色（緩衝国）、宗主権は宗主国の色の帯、ハンガリー王冠領は外枠、ユダヤ人が最大の都市はイディッシュ語。
  - 注意：MapLibre の filter の ["zoom"] は整数でしか評価されないので、map.ts の setupZoomFilters で実際の拡大率に置き換えている。
- 1914–2025 に拡大（2026-11-21）：7担当 → 整合（docs/integration-notes-2025.md）→ 独立レビュー（docs/review/2025_*.md）→ 修正。表示範囲は 1648–2025。
  - 方針：枢軸国の戦後無効になった併合・保護領は occupied（斜線＋副ラベル）、ソ連のバルト・ポーランド東部は斜線なし、クリミア2014・2022以降は occupied、第一次大戦の占領は開始年から描く。
  - 言語は「民族」で塗る（田村さん決定）。宗教の世俗化は色を薄くして見せる（data/religion/secular.yaml の secular）。
  - 題名は「世界歴史地図」。全世界のピース（9,555 → 南・東南アジアの細分化後 11,477）があり、データのない地域は現代の国境で淡く表示。
  - 東アジアの準備（2026-11-21）：中国を地級（約340）に細分（tools/chn_pieces.py、pieces_config.json の chn）。CGAZ の中国は海岸が欠けている（遼東半島の先端・浦東・香港島など）ので Natural Earth で補った。租借地用に CHN-Dalian_urban（関東州）・CHN-Qingdao_urban（膠州湾）・CHN-Weihai_urban（威海衛）・CHN-Zhanjiang_urban（広州湾）、香港は _Hong_Kong_Island・_Kowloon と残り（新界、元の ID）。サハリンは RUS-Sakhalin_Oblast（北）・_South（北緯50度以南）・_North_Kurils・_South_Kurils（CGAZ にない南千島を Natural Earth で補う）。全9,870ピース。
- 南・東南アジアのピース（2026-11-21）：tools/pieces_config.json の world_adm2 で、インド（県 735、仏領ポンディシェリ・カーリカール・マーヘ・ヤナム、ポルトガル領ゴア・ダマン・ディウ・ダードラー＝ナガル・ハヴェーリーが別ピース）・パキスタン（県 126）・バングラデシュ・スリランカ・ネパール・ミャンマー・フィリピン・インドネシア（パプア2州を除く）を ADM2 に。ラオスのチャンパーサック、ベトナムのクアンチ・クアンビン、マレーシアのペナン・ペラ・サラワクだけ ADM2。タイ・カンボジア・シンガポール・ブルネイ・東ティモール（オエクシは州単位で別）・ブータンは ADM1 のまま。シャンデルナゴル（フーグリー県の中）・トランケバル・セランポールは県より小さいので別ピースにしていない。
- 東アジア（2026-11-21）：中国（地級345ピース）・内陸アジア・日本朝鮮・分布の4担当 → 整合（docs/integration-notes-east-asia.md）→ 独立レビュー（docs/review/ea_*.md）→ 修正。指示書は docs/agent-brief-east-asia.md。
  - 田村さんの決定：冊封は独自色＋清の帯（overlord: qing）、清の藩部は certainty: indirect（薄い色）。
  - 南・東南アジアのピースは細分化済み（インド県単位など、全11,477ピース）。
- 南アジア・東南アジア（2026-11-21）：S1〜S6 の6担当 → 整合（docs/integration-notes-south-asia.md）→ 独立レビュー（docs/review/sa_*.md）→ 修正。指示書は docs/agent-brief-south-asia.md。
  - 方針：保護下の藩王国・スルタン国・保護国は宗主国の色を薄く（indirect）＋label、直轄地は管区・州名の label、ベトナムに清の帯、マラーター 1802–17 はイギリスの帯。
  - 潮流の spread は既定で本国（polities の home_iso）だけが光る。植民地も光らせるときは include_colonies。exclude_regions も使える（docs/movements-format.md）。
  - スマホの下シートは Touch Events で、操作部や本文の上をなぞっても動く（src/sheet.ts）。
- 南北アメリカのピース（2026-11-21）：tools/pieces_config.json の world_adm2 で、アメリカ合衆国30州（MT WY CO NM KS OK MN ND TX AZ CA WA LA MS AL FL GA PA NY VA WV NC SC ME MA CT NJ KY TN OH）を郡に（ID は「郡名_州略号」、例 USA-Washington_PA。adm2_suffix）、カナダのケベック・オンタリオ・ノヴァスコシアを経済圏、チリ全土を県、チアパス・タクナ・ロレト・パラグアイのチャコ3県・サルタ・フフイ・カタマルカ・ロライマを ADM2 に。split で近似：マニトバ 1870/1881、ケベック（アンティコスティ・マドレーヌ諸島・サンジャン川以東・アビティビ北部・アンガヴァ）、オンタリオ北部（オールバニ川・ハドソン湾流域・レイニー川）、アルバータ・サスカチュワン北緯55度以北、ラブラドル、ヴァンクーヴァー島・ハイダグワイ、北西準州・ヌナヴトの北極諸島（islands）、ミシガンのアッパー半島、ネヴァダ（1862・1866 の東部、南端）、パナマ運河地帯（line＋km、3州に分かれる）、コーン諸島、トルトゥーガ島、七つの布教村（RS）、アントファガスタの南緯24度以南。CGAZ にない海外領土（GUF GLP MTQ BLM MAF SXM ABW CUW BES AIA MSR VGB CYM TCA BMU SPM SGS）とグアンタナモ基地（CUB-Guantanamo_Bay_Naval_Base）は Natural Earth から（add_ne_pieces）。全13,902ピース。
  - 宿題：新しい国コード（GUF など）の現代名は src/modern.ts の MODERN_NAMES にまだない（「係争地」と表示される）。アフリカ・オセアニアの海外領土（レユニオン・ニューカレドニアなど）も CGAZ にない可能性。
- 南北アメリカ（2026-11-21〜22）：A1〜A6 の6担当 → 整合（docs/integration-notes-americas.md）→ 独立レビュー（docs/review/am_*.md）→ 修正。指示書は docs/agent-brief-americas.md。ピースは米国30州を郡に、カナダ・南米の一部を細分、運河地帯・グアンタナモ、海外領土を Natural Earth で追加（全13,902）。
  - 田村さんの決定：実効支配は濃く、主張だけは nominal（斜線）、主な先住民勢力は独自の色。
  - 砂糖植民地などの宗教は住民の多数派で（奴隷が多数の時期は other＋宗主国の宗派を minor）。
  - 画面：出来事・国境の変化は地図に映っている地域を先に（関係国の領土が画面に映っていれば範囲内）。出来事に at: [経度, 緯度] を書ける。所属なしは点描、データ未整備は灰色で区別。
- 次の作業の候補：アフリカ → オセアニア。
  - 宿題：潮流 spread に除外の書き方を足す案。
- アフリカのピースとピースの宿題（2026-11-22）：world_adm2 で NGA GHA CMR ETH ERI UGA TZA MLI SEN GMB GIN SLE CIV BFA TGO BEN NER TCD AGO MOZ MWI MDG ZAF を CGAZ ADM2 に、KEN は沿岸5県（ザンジバルの10マイル帯）、SSD は中央・東エクアトリア（ラド飛び地）だけ。北アフリカ（MAR DZA TUN LBY EGY）・ESH は従来どおり（ヨーロッパ担当のデータあり）。NAM は CGAZ・gbOpen とも ADM2 の名前と形が食い違っている（Walvis Bay の名前が内陸の区画に付いている）ので ADM1 のまま（ウォルビス・ベイは未分割）。Natural Earth から REU MYT SHN（セントヘレナ・アセンション・トリスタン）IOT（チャゴス）ATF を追加。split：西サハラ（北緯26度以北 Saguia_el_Hamra、24度以南 Tiris_al_Gharbiyya）、ビル・タウィール、ハラーイブ、ワディ・ハルファ突出部、アオズー地帯（TCD の4ピース *_Aouzou、国境に平行な線で近似）。
  - 宿題の結果：ARG-Entre_Rios、USA-South_Dakota_East（ミズーリ川の東・ヤンクトン。元の ID が西）、JPN-Hokkaido_Wajinchi・JPN-Amami_Islands・JPN-Tokara_Islands・JPN-Ogasawara_Islands、関東州は CHN-Dalian の北緯39.45度以南を CHN-Dalian_urban に足した（3,483km²）、AZE-Nagorno_Karabakh（地区で近似、約4,250km²）、北緯38度線：KOR-Gangwon/Gyeonggi_North_of_38th_parallel、PRK-North/South_Hwanghae_South_of_38th_parallel。新しいピースの所属データはまだない（data/ の note の「ピースが分けられない」も未修正）。
  - split の新しい書き方：name "*"（その国の全ピース）、units（CGAZ ADM2 の区画名で切る。units_bbox・units_clip）、rename、merge_into、min_area。範囲内（zone=eu）の split で bbox の外に出たピースも残す。全16,245ピース（pieces.topo.json 7.5MB、gzip 1.76MB）。
  - 残り：src/modern.ts の MODERN_NAMES に REU MYT SHN IOT ATF がない。タンジール国際管理地帯（MAR-Prefecture_of_Tangier_Assilah にアシラが入る。分けると新ピースが iso: [MAR] のフランス保護領に入るので保留）、ウォルビス・ベイ、イレミ三角地帯、ゴレ島（ダカール県で代用）は未分割。
- アフリカ（2026-11-22〜23）：F1〜F5 の5担当 → 整合（docs/integration-notes-africa.md）→ 独立レビュー（docs/review/af_*.md）→ 修正。指示書は docs/agent-brief-africa.md。描き方は南北アメリカと同じ（実効支配は濃く、主張は斜線、在地国家は独自色、在地の王が残った保護領は indirect）。アジアの空白（中央アジア東部・イエメン・係争地など）も補充済み。
  - 画面：「現代」の表示の国の色は、最後の年（2025）にその国の大部分を持つ政体の色にそろえる（src/map.ts の modernColors）。snapshot に --modern。
- オセアニア（2026-11-23）：O1〜O3 の3担当 → 整合（docs/integration-notes-oceania.md）→ 独立レビュー（docs/review/oceania.md）→ 修正。指示書は docs/agent-brief-oceania.md。これで全世界の全ピース（16,331）に 1648–2025 のデータがある（2025 年の所属なしは南極・南沙諸島・ビル・タウィールのみ）。
- 1453–1647（ヨーロッパ・中東・北アフリカ、2026-11-24）：A〜F の7担当＋分布 → 整合（docs/integration-notes-1453.md）→ 独立レビュー（docs/review/1453_*.md）→ 修正。指示書は docs/agent-brief-1453-1648.md。表示範囲は 1453–2025。
  - 地域に until（その年まで有効）を書ける（政治・宗教・言語）。1648 年より前だけの区分けに使う。
  - 例外として 1648 年以降を直したもの：マスカット 1648–49、ハンガリーなどの宗教（docs/review/fixes.md）。リトアニア・ロシア・ノルウェー・ブハラ・ハンガリー・クリミア・ノガイの色も変えた。
  - アジアの 1453–1647（2026-11-25）：Z1〜Z8 の8担当 → 整合（docs/integration-notes-1453-asia.md）→ 独立レビュー（docs/review/1453_east_asia.md・1453_south_sea.md・1453_asia_distributions.md）→ 修正。指示書は docs/agent-brief-1453-asia.md。build_data.mjs は periods/rulers の取り違えを警告する。
  - 南北アメリカ・サハラ以南のアフリカ・オセアニアの 1453–1647（2026-11-25）：W1〜W7 の7担当 → 整合（docs/integration-notes-1453-rest.md）→ 独立レビュー（docs/review/1453_americas.md・1453_africa_oceania.md・1453_rest_distributions.md）→ 修正。指示書は docs/agent-brief-1453-rest.md。これで全世界の全ピースに 1453–2025 のデータがある。
    - 宗教・言語の timeline に `main: none`（その年から値なし＝無人の時期）を書ける。
    - 残り：ビルカバンバ（PER-Cusco のラ・コンベンシオン郡を分ける）、1647→1648 の段差の一覧（docs/review/fixes.md の「次の見直しの候補」）、モシとハウサ諸国の同じ色。
- 画面（2026-11-25）：国の情報（所属なしの土地・宗教／言語の地域も）は地図の左下の浮いたカード（index.html の #polity、main.ts の layoutCard が凡例の上に配置。スマホは下シートの上で、折りたたみ⇔タップで展開。位置は sheet.ts が書く --sheet-h）。右パネル（下シート）は「その年の解説」（年の操作・出来事・国境／分布の変化・潮流）。カードに「その年の出来事」欄はない（選んだ国に関係する出来事は右パネルの先頭）。国へ寄せるときはカードを避ける（map.focus の avoid）。
  - 画像のギャラリー（2026-11-25）：出来事・潮流は Wikipedia の記事の中の画像（REST の page/media-list）を説明文つきで並べる（src/images.ts の gallerySlot。重要度1と潮流＝大きな代表画像＋横に流せる帯 最大6、重要度2＝帯 最大4、重要度3＝1枚）。国旗・紋章・ロゴ・署名・小さな SVG・Commons にない画像は除き、肖像は後ろ。ja が少なければ en（source の次の記事か言語間リンク）で補う。ライトボックスは ← → ・スワイプで前後へ。データに `images: [{ file, caption }]`（Commons のファイル名）を書くと先頭に出る（出来事・潮流・情勢・都市。docs/data-format.md の「画像」。まだデータはない）。media-list の応答の形は mobileapps のソースで確認（クラウドからは wikipedia.org に繋がらず、実物は未確認）。
- 植民地の選択（2026-11-26）：副ラベルの出ている所を押すと、本国とは別に「植民地」を選ぶ（URL `p=portugal&c=portuguese_brazil`、データのないものは `c=~チュニジア`）。地図は植民地の範囲を太線、本国の残りを細い破線。カードは植民地のカード（上端に本国の色の帯、破線で縁どった本国の色の見本、「本国：〇〇」のリンク、統治者・本国の君主・情勢・構成）。右パネルは「植民地に関係（出来事の polities・代表点 pp が植民地の中・植民地のピースの地域の国境変化）→ 本国 → 地図の範囲 → 外」。« » は植民地の節目（polity-milestones.ts の getColony）。年を変えて植民地が消えたら、前年のピースの半分以上を持つ植民地へ移り（名前・宗主国の交代）、なければ本国の選択に戻る（トースト）。
  - データ：data/colonies（docs/data-format.md の「植民地」。match は labels・contains・regions・iso・exclude_labels・exclude_certainty）。試しに10件（ブラジル・ヌエバ＝エスパーニャ・ペルー・ヴァージニア・英領インド・蘭領東インド・仏領インドシナ・仏領西アフリカ・ケープ（蘭・英））。src/colonies.ts、build_data.mjs は出来事の代表点のピース（pp）も出す。
- 「〇〇史」（2026-11-27）：国・植民地を選ぶと、その舞台（現代の国の範囲。本国＝home_iso の先頭 → その年の首都の国、植民地＝範囲で最も広い国）の歴史として « » ⌘←→ が進む（清 → 中華民国 → 中華人民共和国、ポルトガル領ブラジル → ブラジル帝国）。src/history.ts。
  - 当事者：舞台の面積の 30% 以上を持つ単位（植民地があれば植民地、なければ owner）。一度なったら 10% 以上の間は続く。選んだもの・手書きの members は舞台に土地がある間。
  - 節目は当事者それぞれの節目（polity-milestones.ts に舞台 StageMask を渡す：領土は舞台の中だけ、出来事は代表点 pp が舞台の中）を合わせる。当事者でなくなったら最も広い当事者へ選択を移す（トースト）。URL `h=CHN`。
  - 札は « » の間（当事者の色の丸＋「中国史」）、スライダーの下に当事者の色の帯（刻み＝節目、押すとその年へ）。右パネルは「選択 → 〇〇史 → 本国（植民地のとき）→ 地図の範囲 → 外」。
  - 手で補う：data/histories（docs/data-format.md の「〇〇史」）。ドイツ史・イタリア史・ポーランド史。build_data は polityStage（home_iso の先頭）・polityCapitalIso（首都の国）・polityHomeIso も出す。
- 次の候補：476 年まで（1453 年より前）、残るピースの宿題（オイペン・マルメディ、ブリガ・テンダ、ザール、ベルリン東西、ニコシア、ウォルビス・ベイ、タンジール、オントンジャワ）、画面の改良。
- オセアニアのピース（2026-11-23）：AUS は州のまま split で、南オーストラリアを東経132・135度（_west_of_132E・_132_135E）、北部準州を東経135度（_west_of_135E）、クイーンズランドの東経141度以西（_west_of_141E、1862）、トレス海峡諸島（_Torres_Strait_Islands_1872・_1879、サイバイ・ボイグは Natural Earth で補う）、AUS-Albany（キング・ジョージ湾 1826）。AUS-Other_Territories はジャーヴィス湾だけになり、クリスマス島 CXR・ココス諸島 CCK・ノーフォーク島 NFK を分けた（split の parts に iso を書ける）。NZL は地方のまま units で NZL-Waikato_Basin・Rohe_Potae・Ruapehu_District・New_Plymouth_District・Whakatane_District。PNG は 1885 年の英独境界の直線でモロベ・エンガ・チンブ（_south_of_1885_line）、ヘラ（_north_of_1885_line）を分けた。SLB-Shortland_Islands、USA-Kauai_and_Niihau、USA-Manu_a_Islands（この2つは A1 の所属データがまだない）。FJI（州）と KIR（環礁）は world_adm2 にした（旧 FJI-Central など4つと KIR-Gilbert_Islands・Line_Islands は消えた。参照なし）。Natural Earth から NCL PYF WLF COK NIU TKL PCN UMI CLP HMD、ケルマデック・亜南極諸島・マッコーリー島、フェニックス諸島・ライン諸島南部・ツバルとマーシャルの欠けた環礁（add_ne_pieces の clip）。チャタム・北マリアナ北部・ミクロネシアの離島は add_from_ne。南極は ATA-Antarctica の1ピースのまま。全16,331ピース（pieces.topo.json 7.5MB、gzip 1.77MB）。
  - 残り：src/modern.ts の MODERN_NAMES に CXR CCK NFK HMD COK NIU TKL NCL PYF WLF PCN UMI CLP がない。オントンジャワ（Natural Earth にもない）、フライ川の突出部（1895）、北部準州の南北分割（1927–31、南緯20度）は未分割。
- 次の作業：全世界のデータ。東アジア（中国・日本・朝鮮）→ 南・東南アジア → 南北アメリカ → アフリカ → オセアニア（田村さん了承済み）。
  - ピースの分割が必要な既知の場所：オイペン・マルメディ、ブリガ・テンダ、ザール、ベルリン東西、ニコシア（ナゴルノ・カラバフは 2026-11-22 に分割済み）。
- 田村さんの決定（2026-11-20）：1815年のプファルツ・ラインヘッセンは暫定統治（斜線）のまま／出来事は約340件すべて残す／Pages 公開はレビュー指摘の修正が終わってから（その時点で手順を案内する）。
- GitHub Pages：公開済み（https://tamtam0717.github.io/world-history-atlas/ ）。main に取り込むと自動でデプロイされる。田村さんの了承があれば、Claude がプルリクエストを作ってマージまで行ってよい（2026-11-20）。

## 想定ロードマップ
1. 骨組みを作る
   - 静的サイト（ビルド後は Pages で配信できる形）
   - 地図の表示、年の操作（スライダー・入力）、右パネル、国クリック、スマホ対応
2. データ形式を決める
   - ピース、政体、所属イベント、君主、出来事の各スキーマ
3. 試作期間のデータを作り、表示と精度を確認する
4. 世紀単位で範囲を広げていく（長時間の自律作業）
5. 運用：チャットで世界史の質問をして得た知識を、出来事や国情報として書き足していく
