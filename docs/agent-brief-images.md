# 資料集の画像を選ぶ担当への共通の指示

田村さんの要望：「画像をもっと増やしたい。人物だけでなく出来事でも、様子を描いた絵画など。教科書や資料集のようにたくさん画像があるイメージ」。
画面はすでに、出典の Wikipedia 記事の中の画像を自動で並べる（docs/data-format.md の「画像」）。この作業では、**教科書・資料集に載る定番の1枚**を選んでデータに書き、ギャラリーの先頭に出す。

## 作るもの
- 担当の出来事ファイル（data/events/*.yaml）の **重要度 1 の出来事すべて**（と、余力があれば重要度 2 のうち教科書で太字になるもの）に `images:` を足す。
  ```yaml
  images:
    - file: "Jacques-Louis David - The Coronation of Napoleon (1805-1807).jpg"
      caption: ダヴィッド「ナポレオンの戴冠式」（1805–07年、ルーヴル美術館）
  ```
- 1件に 1〜3 枚。優先順：その出来事を描いた同時代の絵画・版画・屏風・写真 → 有名な後世の歴史画 → 条約文書・地図・遺跡の写真。人物の肖像だけの出来事は、その人物の代表的な肖像でよい（君主の欄と重なりすぎないように）。
- caption は日本語で、高校世界史の資料集の書き方に寄せる：作者「題名」（制作年、所蔵）／「〜の様子」（同時代の版画）など。わからない部分は書かない（推測で所蔵などを書かない）。
- 国旗・紋章・ロゴ・現代の記念切手・ゲーム画像・AI 画像のようなものは選ばない。

## ファイル名は必ず確かめる（推測のまま書かない）
- この環境から commons.wikimedia.org・ja/en.wikipedia.org の **action API**（`/w/api.php`）に curl で接続できる。REST API（`/api/rest_v1/`）はレート制限が厳しいので使わない。
- User-Agent は `-A "history-map-image-curation/0.1"` を付ける（個人名・メールなどは入れない）。**1秒に1回以下**に抑え、429 が返ったら 60 秒以上待つ。
- 探し方：
  - 記事の画像の一覧：`https://ja.wikipedia.org/w/api.php?action=query&prop=images&titles=<記事名>&imlimit=50&format=json`（en も）
  - Commons の検索：`https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=<語>&srlimit=20&format=json`
  - 説明・作者・年：`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata|size&titles=File:<名前>&format=json`
- **書く前に存在を確かめる**：`action=query&titles=File:A|File:B|…`（50件まで）でまとめて確かめ、`missing` のものは書かない。確かめた一覧をスクリプトで残す（作業フォルダ）。
- file はファイル名だけ（「File:」なし、空白区切り）。

## 守ること
- 担当のファイルの `images:` を足すだけ。ほかの項目（年・本文・重要度など）は変えない。他の担当のファイルは触らない。
- `npm run data` が警告なしで通ること。git commit はしない。
- 作業用スクリプトはリポジトリの外：/tmp/claude-0/-home-user-world-history-atlas/5a7a987a-a877-559b-b3fe-1574c9cf110f/scratchpad/img_<担当名>/
- 最後の報告（日本語・簡潔）：画像を付けた件数（重要度別）、付けられなかった出来事とその理由、迷ったもの。
