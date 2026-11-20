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

## E（バルカン・オスマン・中東）から
- トランシルヴァニア 1687–1698：E は「owner transylvania、overlord habsburg、uncertain」。D の案（1698 まで overlord ottoman）と食い違う → どちらかに統一（E の 1687 項目を消せば D に合う）
- コトル湾・ドラゴニャ（115）：1805 cisalpine、1809 illyria、1814 habsburg（D に合わせ済み）
- ラグーザ：D 側で overlord ottoman が付いていない（貢納関係の扱いを統一）
- ボスニア北辺（ポサヴィナ・ブルチコ）1718–1739 habsburg → HRV 側スラヴォニアと整合確認
- トランスニストリア 1791 まで ottoman、1792 russia。ウクライナ側のイェディサン・ブジャクの owner（ottoman か crimea か）を F と統一
- ベッサラビア 1812 russia、ホティン 1713 からオスマン直轄
- ジョージア諸国（イメレティ 1804 保護国→1810 併合、ミングレリア 1803、グリア・アブハジア 1810）と RUS 側の北カフカース
- エジプト（A）とヒジャーズ奪回の扱い、サウード王国の色（桃色）

## C（低地諸国・スイス・イタリア）から
- ゴリツィア・トリエステ：C は 1809 illyria、1814 habsburg（D と合っているか確認）
- トレント・南チロル：1805 バイエルン、1810 トレントのみイタリア王国、1814 オーストリア → D のチロルと整合
- NLD-Gennep・上ヘルレのプロイセン領：1795 フランス → BN のライン左岸のフランス化の年と合わせる
- BEL-Verviers と 1815 年のオイペン・マルメディ（プロイセン）の境界（BN/BS）
- ルクセンブルク 1815（netherlands + german_confederation）と、ドイツ側の旧ルクセンブルク領（ビットブルクなど、プロイセン）の整合
- ピエモンテ：1798 フランス占領、1802 併合、1814 savoy → A のサヴォイア本領と年を合わせる
- リヒテンシュタイン・バーゼル司教領北部の overlord（hre→rhine_confederation→german_confederation）の年を BS と合わせる
- 色：netherlands（#f2a65a）と spain が近い → まとめ役で調整
- genoa のドージェ一覧（約75人）、liege・malta・neuchatel の君主は記憶ベースで要確認
