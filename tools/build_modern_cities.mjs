// Natural Earth の都市データ（.cache/ne/places.geojson）から、現代版の地図に描く都市を取り出して
// data/generated/cities_modern.json を作る（commit する）。en は英語名（検索用。日本語名と同じなら省く）。
//   curl -s -o .cache/ne/places.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson
import fs from "node:fs";
const d = JSON.parse(fs.readFileSync(".cache/ne/places.geojson", "utf8"));
const out = [];
for (const f of d.features) {
  const p = f.properties;
  const [lon, lat] = [p.LONGITUDE, p.LATITUDE];
  if (lon < -25 || lon > 62 || lat < 25 || lat > 72) continue;
  const pop = p.POP_MAX ?? 0;
  const capital = /Admin-0 capital/.test(p.FEATURECLA ?? "");
  if (pop < 150000 && !capital) continue;
  const en = p.NAME_EN || p.NAME;
  out.push({
    name: p.NAME_JA || p.NAME,
    ...(en && en !== (p.NAME_JA || p.NAME) ? { en } : {}),
    lon: Math.round(lon * 100) / 100,
    lat: Math.round(lat * 100) / 100,
    pop,
    capital,
  });
}
out.sort((a, b) => b.pop - a.pop);
fs.writeFileSync("data/generated/cities_modern.json", JSON.stringify(out));
console.log(`data/generated/cities_modern.json: ${out.length} cities`);
