# 南アジア・東南アジア（1648–2025）：データ作成担当への共通の指示

ヨーロッパ・東アジア（レビュー済み）に続いて、南アジア・東南アジアを作る。年の範囲は 1648–2025。

## 最初に読むもの
1. CLAUDE.md（「画面づくりの原則」「進捗」）
2. docs/data-format.md（certainty の `indirect` を含む）、docs/agent-brief.md（手順・検証・してはいけないこと）
3. docs/agent-brief-1815-1914.md・docs/agent-brief-1914-2025.md・docs/agent-brief-east-asia.md（保護国・宗主権・占領・傀儡国家・冊封・藩部の扱い）
4. docs/integration-notes-east-asia.md の「整合の結果」
5. 既存の政体（作り直さずに使う）：britain・france・netherlands・portugal・spain・denmark・usa・japan・qing・prc・roc・persia・durrani・afghanistan・soviet_union など（data/polities/*.yaml を grep）

## 担当とファイル（ピースは data/generated/pieces.tsv の iso と adm1 列で決まる）

| 担当 | 範囲 | ファイル（data/polities・regions・events の下） |
|---|---|---|
| S1 北西インド・パキスタン | IND の adm1 が Punjab・Jammu and Kashmir・Ladakh・Himachal Pradesh・Haryana・Delhi・Chandigarh・Rajasthan・Gujarat・Dadra and Nagar Haveli and Daman and Diu・Uttarakhand・Uttar Pradesh・Madhya Pradesh、および PAK | `india_north.yaml` |
| S2 東インド・ベンガル・ヒマラヤ | IND の adm1 が Bihar・Jharkhand・West Bengal・Odisha・Chhattisgarh・Assam・Arunachal Pradesh・Manipur・Nagaland・Mizoram・Meghalaya・Tripura・Sikkim、および BGD・NPL・BTN | `india_east.yaml` |
| S3 南インド・スリランカ | IND の adm1 が Maharashtra・Goa・Karnataka・Kerala・Tamil Nadu・Puducherry・Andhra Pradesh・Telangana・Andaman and Nicobar Islands・Lakshadweep、および LKA・MDV | `india_south.yaml` |
| S4 大陸部東南アジア | MMR・THA・LAO・KHM・VNM | `mainland_sea.yaml` |
| S5 島嶼部東南アジア | IDN・MYS・SGP・BRN・PHL・TLS | `maritime_sea.yaml` |
| S6 分布 | 上のすべての宗教・言語（data/religion/south_asia.yaml・southeast_asia.yaml、data/language/ 同名、_kinds.yaml への追加）、都市（data/cities.yaml）、潮流（data/movements/south_asia.yaml） | 左のとおり |

境目で迷ったら note で申し送る。PAK-Chagai・PAK-Gwadar・PAK-Kech はすでにヨーロッパの担当（ottoman.yaml）がデータを持っている。足りない年だけを補い、ある年は変えない。

## 主な政体 ID（誰が定義するか）

| ID | 名前 | 担当 |
|---|---|---|
| `mughal` | ムガル帝国（–1857） | S1 |
| `sikh_empire` `awadh` `rajput_*`（主要なものだけ） | シク王国、アワド、ラージプート諸国 | S1 |
| `maratha` | マラーター同盟（ペーシュワー。シンディア・ホールカル・ガーイクワード・ボーンスレーなど有力諸侯は必要なら別 ID＋overlord: maratha） | S3 |
| `hyderabad` `mysore` `carnatic` `travancore` `kandy` | ハイデラバード、マイソール、カルナータカ太守、トラヴァンコール、キャンディ王国 | S3 |
| `bengal_nawab` `nepal` `bhutan` `ahom` `burma` との境 | ベンガル太守、ネパール（ゴルカ朝）、ブータン、アホーム王国 | S2 |
| `india` `pakistan` `bangladesh` `sri_lanka` | 独立後（1947–、1971–、1948–） | S1（india・pakistan）・S2（bangladesh）・S3（sri_lanka） |
| `burma` `siam` `cambodia` `vietnam`（阮朝・現代）`trinh` `nguyen_lords` `tay_son` `luang_prabang` `vientiane` `champasak` `lan_na` | 大陸部の諸王朝 | S4 |
| `north_vietnam` `south_vietnam` `laos` `khmer_rouge`（必要なら names で） | 冷戦期 | S4 |
| `mataram` `banten` `aceh` `gowa` `johor` `brunei` `sulu` `ternate` など | 島嶼部の主要なスルタン国 | S5 |
| `indonesia` `malaysia` `singapore` `philippines` `east_timor` | 独立後 | S5 |

## 描き方の方針
- 「Y 年の年末の状態」。
- **イギリス東インド会社の直轄領・英領インド**：owner: britain（会社の統治は note と label で。1858 年から直轄）。
- **藩王国・保護下の在地政権**：自立していた時期は独自の政体。軍事保護条約（軍事保護同盟など）や保護条約で宗主国の下に入った後は、owner: 宗主国・`certainty: indirect`（宗主国の色を薄く）・label に藩王国名（例：「ハイデラバード藩王国」）。オランダ領東インドのスルタン国、英領マラヤの諸州（連合州・非連合州）、フランス領インドシナの保護国（アンナン・トンキン・カンボジア・ラオス）も同じ扱い。直轄の植民地（コーチシナ・海峡植民地・ベンガル管区など）は certainty なし（濃い色）。
- **冊封**：ベトナム（黎朝・阮朝）は独自の色＋`overlord: qing`（1885 年の天津条約まで）。シャム・ビルマ・ラオスの朝貢は断続的なので帯は付けず note に書く。
- **シャムの宗主権下**（ランナー・ラオ諸国・マレー北部のスルタン国・カンボジアの一時期）は独自の色＋overlord: siam。
- **ムガル帝国の名目的な宗主権**（18 世紀の継承国家：ハイデラバード・ベンガル・アワドなど）：実質的に自立した後は独自の色。帯は付けない（実態が薄いため。note に書く）。
- 第二次世界大戦の日本の占領地（1941/42–45）は owner: japan・certainty: occupied。タイは同盟国として独自の色のまま。日本が与えた「独立」（ビルマ国・フィリピン第二共和国など）は独自の政体＋overlord: japan。
- 独立・分離（1947 印パ分離、1948 ビルマ・セイロン、1949 インドネシア、1954 ジュネーヴ協定、1957/63 マラヤ・マレーシア、1965 シンガポール、1971 バングラデシュ、1975 ベトナム統一・ラオス、2002 東ティモール）、カシミール（実効支配線で分ける。ピースの過半で近似）、ゴア 1961、フランス領インド 1954、シッキム 1975。
- 名目的な支配・内陸の未支配地（スペイン領フィリピンの山地・ミンダナオ、オランダ領東インドの外島、英領インドの北東辺境）は certainty: nominal / uncertain、note に書く。
- 表記は日本の高校世界史の教科書に合わせる（アクバル、アウラングゼーブ、プラッシーの戦い、シパーヒーの反乱（インド大反乱）、コンバウン朝、ラタナコーシン朝、阮朝、ジャワ戦争、ホセ＝リサール など）。

## 作るもの・確認
- 担当範囲のすべてのピースに 1648–2025 の所属を与える。確認：`node tools/build_data.mjs --missing 1648,1700,1707,1760,1765,1800,1818,1850,1858,1886,1900,1920,1942,1945,1947,1950,1971,2025 --iso <国コード>`（ゼロにする。S1〜S3 は IND を分け合うので、自分の adm1 の分を数える）。
- 元首（皇帝・王・スルタン・総督は note、独立後は実権者）を出典の URL つきで。情勢（periods）3〜8 件、出来事 40〜80 件（高校世界史で太字になる事件はもらさない）。
- 地図の確認：`node tools/snapshot.mjs 1648 1707 1765 1800 1818 1858 1886 1900 1942 1947 1971 2025 --zoom <経度>,<緯度>,<倍率> --out .cache/snapshots/<担当名>`。
- `npm run data` が警告なしで通ること（他担当の未定義 ID による警告は報告に書く）。

## 敏感な主題
印パ分離の暴力、ベンガル飢饉、ベトナム戦争、カンボジアの大量虐殺、東ティモール、ロヒンギャ、カシミールの帰属などは、事実に基づき、高校世界史・一般的な百科事典の水準の中立的な表現で書く。現在の地図は実際の統治（実効支配）で塗る。

## 最後に報告すること
docs/agent-brief.md と同じ（日本語・簡潔に）。担当どうしの確認点も。
