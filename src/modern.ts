// 「現代の国境」表示（C キー／ボタンを押している間だけ出す）で使う、現代の国名と配色

/** ピースの iso（国コード）→ 日本語の国名 */
export const MODERN_NAMES: Record<string, string> = {
  AFG: "アフガニスタン",
  ALB: "アルバニア",
  AND: "アンドラ",
  ARE: "アラブ首長国連邦",
  ARM: "アルメニア",
  AUT: "オーストリア",
  AZE: "アゼルバイジャン",
  BEL: "ベルギー",
  BGR: "ブルガリア",
  BHR: "バーレーン",
  BIH: "ボスニア・ヘルツェゴヴィナ",
  BLR: "ベラルーシ",
  CHE: "スイス",
  CYP: "キプロス",
  CZE: "チェコ",
  DEU: "ドイツ",
  DNK: "デンマーク",
  DZA: "アルジェリア",
  EGY: "エジプト",
  ESH: "西サハラ",
  ESP: "スペイン",
  EST: "エストニア",
  FIN: "フィンランド",
  FRA: "フランス",
  GBR: "イギリス",
  GEO: "ジョージア",
  GRC: "ギリシア",
  GRL: "グリーンランド",
  HRV: "クロアチア",
  HUN: "ハンガリー",
  IRL: "アイルランド",
  IRN: "イラン",
  IRQ: "イラク",
  ISL: "アイスランド",
  ISR: "イスラエル",
  ITA: "イタリア",
  JOR: "ヨルダン",
  KAZ: "カザフスタン",
  KWT: "クウェート",
  LBN: "レバノン",
  LBY: "リビア",
  LIE: "リヒテンシュタイン",
  LTU: "リトアニア",
  LUX: "ルクセンブルク",
  LVA: "ラトヴィア",
  MAR: "モロッコ",
  MCO: "モナコ",
  MDA: "モルドバ",
  MKD: "北マケドニア",
  MLI: "マリ",
  MLT: "マルタ",
  MNE: "モンテネグロ",
  MRT: "モーリタニア",
  NLD: "オランダ",
  NOR: "ノルウェー",
  OMN: "オマーン",
  PAK: "パキスタン",
  POL: "ポーランド",
  PRT: "ポルトガル",
  QAT: "カタール",
  ROU: "ルーマニア",
  RUS: "ロシア",
  SAU: "サウジアラビア",
  SMR: "サンマリノ",
  SRB: "セルビア",
  SVK: "スロヴァキア",
  SVN: "スロヴェニア",
  SWE: "スウェーデン",
  SYR: "シリア",
  TKM: "トルクメニスタン",
  TUN: "チュニジア",
  TUR: "トルコ",
  UKR: "ウクライナ",
  UZB: "ウズベキスタン",
  VAT: "ヴァチカン",
  XKX: "コソヴォ",
};

export function modernName(iso: string): string {
  return MODERN_NAMES[iso] ?? "係争地";
}

/** 隣り合う国が同じ色にならないよう、隣接関係から貪欲に色を割り当てる */
export const MODERN_PALETTE = ["#f2d7a6", "#c9dcb4", "#b9d3e6", "#e8bfc4", "#d8c8e6", "#efe3a8", "#bfe0d8"];

export function assignColors(isos: string[], neighbors: Map<string, Set<string>>): Map<string, string> {
  // 隣国の多い国から順に塗る
  const order = [...isos].sort((a, b) => (neighbors.get(b)?.size ?? 0) - (neighbors.get(a)?.size ?? 0));
  const out = new Map<string, string>();
  for (const iso of order) {
    const used = new Set([...(neighbors.get(iso) ?? [])].map((n) => out.get(n)).filter(Boolean));
    out.set(iso, MODERN_PALETTE.find((c) => !used.has(c)) ?? MODERN_PALETTE[0]);
  }
  return out;
}
