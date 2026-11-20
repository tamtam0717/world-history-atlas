#!/usr/bin/env bash
# ピースの元になる境界データを .cache/src/ にダウンロードする（約260MB）。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cache/src/gb .cache/src/cgaz
cd .cache/src
GB=https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData
for lv in ADM1 ADM2; do
  [ -f CGAZ_$lv.zip ] || curl -fsSL -o CGAZ_$lv.zip $GB/CGAZ/geoBoundariesCGAZ_$lv.zip
  unzip -oq CGAZ_$lv.zip -d cgaz
done
for c in DEU/ADM3 ITA/ADM3 FRA/ADM3 BEL/ADM3 GRC/ADM3; do
  f=gb/$(echo $c | tr / _).geojson
  [ -f $f ] || curl -fsSL -o $f "$GB/gbOpen/$c/geoBoundaries-$(echo $c | tr / -)_simplified.geojson"
done
