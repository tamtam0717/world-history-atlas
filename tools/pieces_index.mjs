// public/data/pieces.topo.json から、地域を定義するときに引く一覧 data/generated/pieces.tsv を作る。
import fs from "node:fs";
import { feature } from "topojson-client";
import { geoArea, geoCentroid } from "d3-geo";
const t = JSON.parse(fs.readFileSync("public/data/pieces.topo.json", "utf8"));
const fc = feature(t, t.objects.pieces);
const rows = ["id\tname\tiso\tadm1\tadm2\tlon\tlat\tarea_km2"];
for (const f of fc.features) {
  const p = f.properties, c = geoCentroid(f);
  const clean = (s) => String(s ?? "").replace(/[\t\n\r]/g, " ");
  rows.push([p.id, clean(p.name), p.iso, clean(p.adm1), clean(p.adm2), c[0].toFixed(3), c[1].toFixed(3), Math.round(geoArea(f) * 6371 * 6371)].join("\t"));
}
fs.mkdirSync("data/generated", { recursive: true });
fs.writeFileSync("data/generated/pieces.tsv", rows.join("\n") + "\n");
console.log(`data/generated/pieces.tsv: ${rows.length - 1} pieces`);
