# 潮流（思想・芸術様式・宗教運動・経済政治体制）のデータ形式

「ルネサンス」「啓蒙思想」のように、特定の年では表しにくい流れを扱う。田村さんと決めたこと（2026-11-20）：
- 見せ方は3つ：右パネルの「この時代の潮流」、スライダーの下の帯（年表）、地図上の広がり（年とともに広がる様子）。
- 「始まり／最盛期／衰退」は、**文字を読まなくても**色の濃さ・光り方・グラデーションで直感的に伝わるようにする。
  そのため、段階を言葉でなく**強さの曲線（0〜1）**で持つ。

## data/movements/*.yaml

```yaml
- id: enlightenment
  name: 啓蒙思想
  kind: thought            # thought（思想・学問）/ art（芸術様式）/ religion（宗教運動）/ system（経済・政治の体制や考え方）
  curve:                   # 全体としての勢い。[年, 強さ0〜1] を年の昇順に。間は線形補間、範囲外は0
    - [1680, 0.1]
    - [1720, 0.5]
    - [1750, 1.0]
    - [1789, 0.8]
    - [1815, 0.3]
  spread:                  # 地図上の広がり。地域ごとの勢いの曲線（全体の curve とは別に持つ）
    - where: {polities: [britain, netherlands]}   # 政体 ID（その年にその政体が持つ領域）
      curve: [[1680, 0.4], [1720, 0.8], [1790, 0.6]]
    - where: {polities: [france]}
      center: true                                 # 発信地（地図で強調）
      curve: [[1700, 0.3], [1740, 1.0], [1789, 1.0], [1800, 0.5]]
    - where: {regions: [bohemia]}                  # 政治の地域 ID でもよい
      curve: [[1760, 0.3], [1781, 0.7]]
  people: [ヴォルテール, モンテスキュー, ルソー, ディドロ, カント]   # 代表的な人物（日本語）
  works: [『法の精神』, 『社会契約論』, 『百科全書』]                # 代表的な作品・著作（任意）
  events: [europe.yaml などの出来事のタイトル]                       # 関連する出来事（任意）
  text: 1〜3文の説明（高校世界史の水準）
  source: "https://ja.wikipedia.org/wiki/啓蒙思想"   # 画像の取得にも使う
```

- 強さの曲線は「その時代の空気をどれだけ支配していたか」の目安。厳密な数値ではない。
- spread の where は、`polities`（その年の領域）か `regions`（政治の地域 ID）。両方書いてもよい。

### polities が光らせる範囲（本国だけ・植民地を含める・除く）

```yaml
    - where: {polities: [britain]}                           # 既定：イギリスの本国だけ（インド・ビルマ・マラヤなどは光らない）
    - where: {polities: [britain], include_colonies: true}   # 植民地・占領地も含めた全領域
    - where: {polities: [qing], exclude_regions: [tibet_central, khalkha_land]}   # この政治の地域の配下のピースは除く
```

- **既定では本国だけ**が光る。本国は、政体ごとに data/polities の `home_iso` で決める（下）。`home_iso` のない政体は全領域。
  どちらの場合も、`certainty: occupied`（占領）のピースは光らせない。
- `include_colonies: true`：植民地・占領地を含めて、その年の政体の全領域を光らせる。帝国主義・脱植民地化（旧宗主国の部分）・
  総力戦・冷戦・ナチズム・全体主義など、植民地や占領地そのものが潮流の舞台であるものに使う。
- `exclude_regions`：政治の地域 ID（data/regions）の配下のピースを除く。polities にも regions にも効く。
  地域の長い一覧を書かずに「この政体の領域から、ここだけ除く」と書きたいときに使う。
  （例：清の領域から藩部を除く。ただし、地域で書いた一覧と違い、除いた残りもその年の清の領域に限られる。
  租借地や反乱勢力の地域は光らない。）

### 本国（data/polities の home_iso）

```yaml
- id: britain
  name: イングランド王国
  home_iso: [GBR, {iso: IRL, to: 1921}]   # 現代の ISO コード。{iso, from, to} で年を限れる（両端を含む。どちらも省略可）
```

- その政体の本国にあたる現代の国（ISO 3166-1 alpha-3。紛争地の番号コード "115" なども可）。その国の全ピースが対象。
- 植民地をもつ政体には書く（britain・france・netherlands・spain・portugal・belgium・italy・germany・german_empire・
  denmark・russia・japan・usa、2026-11-21）。ヨーロッパの中で併合した土地（ナポレオン期のフランスの県、スペインの
  ネーデルラント・イタリアの領土など）は本国に含めている。年で変わる所は from・to で書く。
- 本国の範囲でも、その年にその政体のものでないピースは光らない（owner がその政体のピースのうち、本国の範囲のものだけ）。
