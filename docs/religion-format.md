# 宗教の分布データの形式

田村さんと決めた方針（2026-11-20）：
- 宗教から作る（言語・民族は後で同じ仕組みで作る）
- 分け方は教科書程度（下の表）
- 描き方は「多数派の色で塗り、混在している地域は2色目の斜線を重ねる」

## 宗教の種類（data/religion/_kinds.yaml）

| id | 名前 | 色の系統 |
|---|---|---|
| catholic | カトリック | 黄 |
| lutheran | ルター派 | 青 |
| reformed | カルヴァン派（改革派） | 紫 |
| anglican | イギリス国教会 | 赤 |
| orthodox | 正教会 | 茶 |
| oriental | 東方諸教会（アルメニア使徒教会・コプト教会など） | 橙 |
| sunni | イスラーム（スンナ派） | 緑 |
| shia | イスラーム（シーア派） | 濃い緑 |
| other | その他（シャーマニズムなど） | 灰 |

- 東方典礼カトリック（ユニエイト）はカトリックに含め、note に書く。
- ユダヤ教は地域の多数派にはならないので、地図の塗りには使わない（必要なら都市や地域の note に書く）。

## 地域ごとの変遷（data/religion/*.yaml）

政治の地域（data/regions）と同じ書き方。select の書き方も同じで、`regions:` には政治の地域 ID も使える。

```yaml
- id: rel_bohemia
  name: ボヘミア
  select:
    regions: [bohemia]          # 政治の地域を流用してよい
  timeline:
    - from: 1648
      main: catholic            # 多数派
      note: 白山の戦い（1620）後の再カトリック化がほぼ完了
    - from: 1781
      main: catholic
      minor: lutheran           # 混在している場合の2番目（斜線で描く）
      note: ヨーゼフ2世の寛容令で、プロテスタントが公認される
      source: "https://ja.wikipedia.org/wiki/寛容令"
```

- **main**：その地域の多数派（民衆の信仰）。支配者の宗派ではなく住民の多数派で判断する（例：ハンガリー東部の改革派、オスマン帝国下のバルカンの正教徒）。
- **minor**：無視できない規模（目安として住民の2〜3割以上）の少数派がいる場合だけ書く。1つだけ。
- 年の決まり・重なりの決まり（いちばん小さい地域が優先）は政治の地域と同じ。
- 宗教の分布はゆっくり変わるので、項目は「大きな変化」があったときだけ足す（例：1685 ナントの王令廃止、1731–32 ザルツブルクのプロテスタント追放、オスマン領からキリスト教徒の地域への移行）。

## atlas.json への出力（tools/build_data.mjs）

```
religion: {
  kinds: [{ id, name, color }],
  regions: [{ id, name, timeline }],
  pieceTimelines: [[開始年, main の index, minor の index（なければ -1）, 地域 index], ...]  // ピースごと
}
```

## 確認のしかた

- `npm run data` で検証される。main / minor が `_kinds.yaml` にない ID、timeline が年の昇順でない、未定義の地域を参照している、などは警告になる。
- ファイル名が `_` で始まるもの（`_kinds.yaml`）は地域として読まない。
- 宗教データのないピースを数える：`node tools/build_data.mjs --religion-missing 1650,1750,1800`（`--iso DEU,AUT` で国を絞れる）。
- 同じ ID の地域が宗教にも政治にもあるときは、`regions:` では宗教の地域が優先される。
