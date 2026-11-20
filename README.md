# ヨーロッパ歴史地図（world-history-atlas）

年代別のヨーロッパ地図。年を1年ずつ進めたり、指定した年に飛んだりしながら、国境・君主・出来事を眺めるための静的サイト。

## しくみ

国境線を手で描く代わりに、**現代の行政区画（ピース）を年ごとの所属で塗り分け、同じ国のピースを結合して地図にする**。

- ピース：geoBoundaries（CGAZ ADM1/ADM2）を基本に、ドイツ・フランス・イタリア・ベルギー・ギリシャはより細かい区画を使用（約7,000区画）
- 所属・君主・出来事：`data/` の YAML（形式は [docs/data-format.md](docs/data-format.md)）

## 開発

```bash
npm install
npm run dev        # データを検証・生成して開発サーバを起動
npm run build      # dist/ に静的サイトを出力（GitHub Pages へは main への push で自動デプロイ）
```

### データの検証

```bash
npm run data                                              # 検証して public/data/atlas.json を生成
node tools/build_data.mjs --missing 1648,1815 --iso DEU   # データのないピースを一覧
node tools/snapshot.mjs 1700 --zoom 10,51,3               # 地図を PNG に書き出す
python tools/compare_hb.py 1700 --iso DEU                 # historical-basemaps と照合（要 geopandas）
```

URL の `#y=1740&p=prussia` で年と選択中の国を指定できる。`?debug=pieces` を付けるとピースの境界と ID を表示する。

### ピースの作り直し（通常は不要）

```bash
tools/fetch_sources.sh   # 元データ（約260MB）を .cache/src/ に取得
tools/build_pieces.sh    # public/data/pieces.topo.json と data/generated/pieces.tsv を再生成
```

ピース ID は所属データから参照されるので、作り直したときは ID が変わっていないか確認すること。

## データの出典・ライセンス

- 境界：[geoBoundaries](https://www.geoboundaries.org/)（CC BY 4.0）。ドイツ：BKG（dl-de/by-2-0）、イタリア：ISTAT（CC BY 3.0）、フランス：IGN-F（Etalab 2.0）、ベルギー・ギリシャ：CC0
- 川・湖：[Natural Earth](https://www.naturalearthdata.com/)（パブリックドメイン）の 10m 川・湖データ（rivers_lake_centerlines・rivers_europe・lakes・lakes_europe）。`tools/build_rivers.py` で `public/data/rivers.json`・`lakes.json` を生成
- 照合用（データには取り込まない）：[aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps)（GPL-3.0）
