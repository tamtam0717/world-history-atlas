#!/usr/bin/env bash
# ピースの元になる境界データを .cache/src/ にダウンロードする（約260MB）。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .cache/src/gb .cache/src/cgaz .cache/src/chn
cd .cache/src
GB=https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData
for lv in ADM1 ADM2; do
  [ -f CGAZ_$lv.zip ] || curl -fsSL -o CGAZ_$lv.zip $GB/CGAZ/geoBoundariesCGAZ_$lv.zip
  unzip -oq CGAZ_$lv.zip -d cgaz
done
for c in DEU/ADM3 ITA/ADM3 FRA/ADM3 BEL/ADM3 GRC/ADM3 CHN/ADM2; do
  f=gb/$(echo $c | tr / _).geojson
  [ -f $f ] || curl -fsSL -o $f "$GB/gbOpen/$c/geoBoundaries-$(echo $c | tr / -)_simplified.geojson"
done
# 中国の地級の区画（中国地州界）と県の属性表（GB1999 コード）。国家測絵局のデータを Revolutionary GIS が公開（PDDL）
CN=https://raw.githubusercontent.com/justinelliotmeyers/-1_400-/master
for e in shp shx dbf prj; do
  [ -f chn/prefectures.$e ] || curl -fsSL -o chn/prefectures.$e "$CN/%E4%B8%AD%E5%9B%BD%E5%9C%B0%E5%B7%9E%E7%95%8C.$e"
done
[ -f chn/counties_attr.dbf ] || curl -fsSL -o chn/counties_attr.dbf "$CN/%E4%B8%AD%E5%9B%BD%E5%8E%BF%E7%95%8C.dbf"
