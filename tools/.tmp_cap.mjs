import fs from 'fs'; import {feature} from 'topojson-client'; import {geoContains} from 'd3-geo';
const R='/home/user/world-history-atlas/';
const a=JSON.parse(fs.readFileSync(R+'public/data/atlas.json'));
const t=JSON.parse(fs.readFileSync(R+'public/data/pieces.topo.json'));
const fc=feature(t,t.objects.pieces);const idx={};a.pieceIds.forEach((p,i)=>idx[p]=i);
const P=a.polities.map(p=>p.id);
const want=new Set(process.argv[2].split(','));
const st=(i,y)=>{let c=null;for(const e of a.pieceTimelines[i])if(e[0]<=y)c=e;return c};
for(const c of a.cities){for(const cap of c.capital||[]){if(!want.has(cap.polity))continue;
 const f=fc.features.find(f=>geoContains(f,[c.lon,c.lat]));if(!f){console.log('nopiece',c.id);continue}
 const i=idx[f.id];const pol=a.polities.find(p=>p.id===cap.polity);
 const bad=[];for(let y=cap.from??1648;y<=(cap.to??2025);y++){const s=st(i,y);if(!s||P[s[1]]!==cap.polity)bad.push(y+':'+(s?P[s[1]]:'-'))}
 console.log(c.id,c.name,cap.polity,cap.from,cap.to,f.id,bad.length?'MISMATCH '+bad.slice(0,6).join(' ')+(bad.length>6?' ...'+bad.length:''):'ok')}}
