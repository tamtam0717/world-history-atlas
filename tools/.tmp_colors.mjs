import fs from 'fs';
const R='/home/user/world-history-atlas/';
const a=JSON.parse(fs.readFileSync(R+'public/data/atlas.json'));
const t=JSON.parse(fs.readFileSync(R+'public/data/pieces.topo.json'));
const P=a.polities;const idx={};a.pieceIds.forEach((p,i)=>idx[p]=i);
const arcP={};t.objects.pieces.geometries.forEach(g=>{const i=idx[g.id];const rec=x=>{if(typeof x==='number'){const k=x<0?~x:x;(arcP[k]??=new Set()).add(i)}else x.forEach(rec)};rec(g.arcs||[])});
const nb=[];for(const s of Object.values(arcP)){const l=[...s];for(let i=0;i<l.length;i++)for(let j=i+1;j<l.length;j++)nb.push([l[i],l[j]])}
const lab=h=>{let [r,g,b]=[1,3,5].map(k=>parseInt(h.slice(k,k+2),16)/255).map(c=>c>0.04045?((c+0.055)/1.055)**2.4:c/12.92);let x=(r*0.4124+g*0.3576+b*0.1805)/0.95047,y=r*0.2126+g*0.7152+b*0.0722,z=(r*0.0193+g*0.1192+b*0.9505)/1.08883;const f=v=>v>0.008856?Math.cbrt(v):7.787*v+16/116;return[116*f(y)-16,500*(f(x)-f(y)),200*(f(y)-f(z))]};
const dE=(p,q)=>{const A=lab(p),B=lab(q);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])};
const st=(i,y)=>{let c=null;for(const e of a.pieceTimelines[i])if(e[0]<=y)c=e;return c};
const want=new Set(process.argv[2].split(','));const pairs={};
const iso=id=>id.split('-')[0];
for(let y=1648;y<=2025;y++)for(const [i,j] of nb){if(!want.has(iso(a.pieceIds[i]))&&!want.has(iso(a.pieceIds[j])))continue;const s=st(i,y),u=st(j,y);if(!s||!u||s[1]===u[1]||s[1]<0||u[1]<0)continue;const k=[P[s[1]].id,P[u[1]].id].sort().join(' ');(pairs[k]??=new Set()).add(y)}
const col=id=>P.find(p=>p.id===id).color;
const out=Object.entries(pairs).map(([k,ys])=>{const [p,q]=k.split(' ');return [dE(col(p),col(q)),k,col(p),col(q),Math.min(...ys)+'-'+Math.max(...ys)]}).sort((x,y)=>x[0]-y[0]);
for(const o of out.filter(o=>o[0]<+process.argv[3]))console.log(o[0].toFixed(1),o.slice(1).join(' '));
