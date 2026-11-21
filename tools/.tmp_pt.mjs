import fs from 'fs'; import {feature} from 'topojson-client'; import {geoContains} from 'd3-geo';
const t=JSON.parse(fs.readFileSync('/home/user/world-history-atlas/public/data/pieces.topo.json'));const fc=feature(t,t.objects.pieces);
for(const s of process.argv.slice(2)){const [x,y]=s.split(',').map(Number);const f=fc.features.find(f=>geoContains(f,[x,y]));console.log(s,f?f.id:'-')}
