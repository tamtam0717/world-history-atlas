// MapLibre の Web Worker のスクリプトを public/maplibre/ に置く。
// バンドルすると Worker の場所を見失うため、ファイルとして配信し setWorkerUrl で指定する。
import fs from "node:fs";
fs.mkdirSync("public/maplibre", { recursive: true });
fs.copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
