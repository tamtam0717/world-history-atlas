#!/usr/bin/env bash
# ピース地図 public/data/pieces.topo.json を作り直す。
# 前提: tools/fetch_sources.sh を実行済み、Python 仮想環境に geopandas が入っていること
#   python3 -m venv ~/venv && ~/venv/bin/pip install geopandas pyogrio shapely pyarrow
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-/home/user/venv/bin/python}"
"$PY" tools/build_pieces.py
npx mapshaper -i .cache/pieces_raw.geojson snap -clean \
  -simplify 6% weighted keep-shapes -clean \
  -rename-layers pieces \
  -o public/data/pieces.topo.json format=topojson quantization=200000 id-field=id
node tools/pieces_index.mjs
