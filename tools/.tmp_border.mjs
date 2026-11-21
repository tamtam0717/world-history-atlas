// 担当ファイルの境界で隣り合うピースの所属の段差を探す
import fs from 'fs'; import YAML from 'yaml';
const R='/home/user/world-history-atlas/';
const a=JSON.parse(fs.readFileSync(R+'public/data/atlas.json'));
const t=JSON.parse(fs.readFileSync(R+'public/data/pieces.topo.json'));
const files=process.argv[2].split(',');
const y0=+process.argv[3]||1648, y1=+process.argv[4]||2025;
const fileOfRegion={};
for(const f of fs.readdirSync(R+'data/regions')){const d=YAML.parse(fs.readFileSync(R+'data/regions/'+f,'utf8'));for(const r of d||[])fileOfRegion[r.id]=f.replace('.yaml','');}
const pid=a.pieceIds; const idx={};pid.forEach((p,i)=>idx[p]=i);
const arcP={};
const geoms=t.objects.pieces.geometries;
geoms.forEach(g=>{const i=idx[g.id];const rec=(x)=>{if(typeof x==='number'){const k=x<0?~x:x;(arcP[k]??=new Set()).add(i)}else x.forEach(rec)};rec(g.arcs||[])});
const nb=new Set();
for(const s of Object.values(arcP)){const l=[...s];for(let i=0;i<l.length;i++)for(let j=i+1;j<l.length;j++){nb.add(l[i]<l[j]?l[i]+','+l[j]:l[j]+','+l[i])}}
function st(i,y){const tl=a.pieceTimelines[i];let c=null;for(const e of tl)if(e[0]<=y)c=e;return c}
const P=a.polities.map(p=>p.id), C=a.certainty;
const out={};
for(const k of nb){const [i,j]=k.split(',').map(Number);
 for(let y=y0;y<=y1;y++){const s=st(i,y),u=st(j,y);if(!s||!u)continue;
  const fi=fileOfRegion[a.regions[s[4]].id],fj=fileOfRegion[a.regions[u[4]].id];
  if(fi===fj||!files.includes(fi)&&!files.includes(fj))continue;
  if(!files.includes(fi)||!files.includes(fj)) if(process.argv[5]!=='all') continue;
  if(s[1]===u[1]&&s[2]===u[2]&&s[3]===u[3])continue;
  const d=`${fi}:${a.regions[s[4]].id}=${P[s[1]]}/${s[2]<0?'':P[s[2]]}/${C[s[3]]} | ${fj}:${a.regions[u[4]].id}=${P[u[1]]}/${u[2]<0?'':P[u[2]]}/${C[u[3]]}`;
  (out[d]??=[]).push(y);}}
const rng=ys=>{ys=[...new Set(ys)].sort((a,b)=>a-b);const r=[];let s=ys[0],p=ys[0];for(const y of ys.slice(1)){if(y!==p+1){r.push(s===p?s:s+'-'+p);s=y}p=y}r.push(s===p?s:s+'-'+p);return r.join(',')};
for(const [d,ys] of Object.entries(out).sort((x,y)=>Math.min(...x[1])-Math.min(...y[1])))console.log(rng(ys),d);
