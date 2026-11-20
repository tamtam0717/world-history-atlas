# 担当間の整合チェック用メモ（1648–1815 試作）

各データ担当の報告から、担当の境界で確認が必要な点を集める。全担当の完了後にまとめて確認する。

## A（西欧）から
- サヴォワ：1648–1791 overlord hre（ニースは帝国外）。併合 1792（サヴォワ）・1793（ニース）、1814 部分返還（シャンベリ・アヌシーのみ仏領に残る）、1815 全面返還 → C のピエモンテ側と合わせる
- コルシカ 1768 genoa→france、アヴィニョン 1791 papal_states→france、モナコ 1815 overlord savoy
- モンベリアール：1793 までヴュルテンベルク領（BS の wurttemberg）
- ロレーヌ（1766 仏併合）の東隣：ザールラント（BS）、ルクセンブルク（C）との年の整合
- アイスランド owner denmark（F）、北アフリカ overlord ottoman（E）
- ピース名の取り違え：DZA-Tamanghasset は位置・面積からオランのピース（build_pieces の名前付けを要調査）

## D（ハプスブルク）から
- トランシルヴァニア（E のピース）：1648–1698 transylvania/overlord ottoman、1699 habsburg。パルティウム：1648 transylvania、1660 ottoman、1699 habsburg。バナト 1718
- ラグーザ：HRV のピースは D が記述。1808 廃止のイベントが E と重複していたら片方を削除
- C：ナポレオンのイタリア王国は C の ID `cisalpine` を使用。`brixen` `trent` は D が定義（C は定義しない）。トリエステ・ゴリツィア（ITA）は 1809 illyria（overlord france）、1814 habsburg、1815 german_confederation に合わせる
- BS：インフィアテル・ザルツブルクのバイエルン期の overlord（1806 rhine_confederation、1813 なし、1815 german_confederation）。テシェン条約（1779）のイベント重複。ベルヒテスガーデン 1810
- F：lubovna（スピシュの質入れ都市）1772 poland_lithuania→habsburg。ポーランド側のスピシュ・オラヴァと合わせる
- 1815 年のザルツブルク・インフィアテルはバイエルン（返還は1816）
