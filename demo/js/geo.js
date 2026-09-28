"use strict";
/* ============================================================
   geo.js —— 几何 / 地理基础（与 unity/Assets/Scripts/Core/ 保持一致）
   ============================================================ */
const DEG = Math.PI / 180;

const V = {
  add:(a,b)=>({x:a.x+b.x,y:a.y+b.y}),
  sub:(a,b)=>({x:a.x-b.x,y:a.y-b.y}),
  mul:(a,s)=>({x:a.x*s,y:a.y*s}),
  len:a=>Math.hypot(a.x,a.y),
  norm:a=>{const l=Math.hypot(a.x,a.y); return l>1e-12?{x:a.x/l,y:a.y/l}:{x:0,y:0};},
  lerp:(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),
  dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),
  dot:(a,b)=>a.x*b.x+a.y*b.y,
  cross:(a,b)=>a.x*b.y-a.y*b.x
};

function metersPerDegLat(lat){const p=lat*DEG;
  return 111132.92-559.82*Math.cos(2*p)+1.175*Math.cos(4*p)-0.0023*Math.cos(6*p);}
function metersPerDegLon(lat){const p=lat*DEG;
  return 111412.84*Math.cos(p)-93.5*Math.cos(3*p)+0.118*Math.cos(5*p);}

const EARTH_R = 6371008.8;
function haversine(a,b){
  const la1=a.lat*DEG, la2=b.lat*DEG, dla=la2-la1, dlo=(b.lon-a.lon)*DEG;
  const s1=Math.sin(dla/2), s2=Math.sin(dlo/2);
  let h=s1*s1+Math.cos(la1)*Math.cos(la2)*s2*s2;
  if(h>1)h=1;
  return 2*EARTH_R*Math.asin(Math.sqrt(h));
}

class LocalFrame {
  constructor(origin){ this.origin=origin;
    this.mPerDegLat=metersPerDegLat(origin.lat);
    this.mPerDegLon=metersPerDegLon(origin.lat); }
  toLocal(p){ return { x:(p.lon-this.origin.lon)*this.mPerDegLon,
                       y:(p.lat-this.origin.lat)*this.mPerDegLat }; }
  toGeo(v){ return { lat:this.origin.lat+v.y/this.mPerDegLat,
                     lon:this.origin.lon+v.x/this.mPerDegLon }; }
}

/* 确定性随机 (mulberry32) —— 顺序与 C# 版不同，统计特性一致 */
function Rng(seed){
  let s = seed>>>0;
  this.next = function(){ s=(s+0x6D2B79F5)|0;
    let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296; };
  this.range = (a,b)=>a+(b-a)*this.next();
  this.int   = (a,b)=>a+Math.floor(this.next()*Math.max(1,b-a));
  this.gauss = function(){ let u1=this.next(), u2=this.next();
    if(u1<1e-12)u1=1e-12; return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2); };
}

class Polyline {
  constructor(points, closed){
    if(points.length<2) throw new Error("need >=2 points");
    this.closed = !!closed;
    let pts = points.slice();
    if(this.closed && V.dist(pts[0], pts[pts.length-1])>1e-9) pts.push(pts[0]);
    this.pts = pts;
    this.cum = [0];
    for(let i=1;i<pts.length;i++) this.cum.push(this.cum[i-1]+V.dist(pts[i-1],pts[i]));
  }
  get length(){ return this.cum[this.cum.length-1]; }
  wrap(d){ const t=this.length; if(t<=1e-9) return 0;
    if(this.closed){ let v=d%t; if(v<0)v+=t; return v; }
    return Math.max(0, Math.min(t, d)); }
  segAt(d){ const c=this.cum; let lo=0, hi=c.length-1;
    while(lo<hi-1){ const m=(lo+hi)>>1; if(c[m]<=d) lo=m; else hi=m; }
    return Math.min(lo, this.pts.length-2); }
  pointAt(d){ const dd=this.wrap(d), s=this.segAt(dd);
    const a=this.cum[s], b=this.cum[s+1], t=b-a<=1e-12?0:(dd-a)/(b-a);
    return V.lerp(this.pts[s], this.pts[s+1], t); }
  tangentAt(d){ const s=this.segAt(this.wrap(d));
    const n=V.norm(V.sub(this.pts[s+1], this.pts[s]));
    return (n.x===0&&n.y===0)?{x:1,y:0}:n; }
}

/* 圆角矩形 / 标准田径场 —— 与 C# CampusLayout 对应 */
function roundedRect(min,max,r,seg){
  const out=[]; const arc=(cx,cy,from,to)=>{ for(let i=0;i<=seg;i++){
    const a=(from+(to-from)*i/seg)*DEG; out.push({x:cx+r*Math.cos(a), y:cy+r*Math.sin(a)}); } };
  const x0=min.x,y0=min.y,x1=max.x,y1=max.y;
  const rr=Math.min(r, Math.min(x1-x0,y1-y0)/2);
  arc(x1-rr,y0+rr,-90,0); arc(x1-rr,y1-rr,0,90); arc(x0+rr,y1-rr,90,180); arc(x0+rr,y0+rr,180,270);
  return out;
}
function stadiumTrack(c,half,radius){
  const pts=[], steps=24;
  pts.push({x:c.x-half,y:c.y-radius}); pts.push({x:c.x+half,y:c.y-radius});
  for(let i=1;i<=steps;i++){ const a=(-90+180*i/steps)*DEG;
    pts.push({x:c.x+half+radius*Math.cos(a), y:c.y+radius*Math.sin(a)}); }
  pts.push({x:c.x-half,y:c.y+radius});
  for(let i=1;i<=steps;i++){ const a=(90+180*i/steps)*DEG;
    pts.push({x:c.x-half+radius*Math.cos(a), y:c.y+radius*Math.sin(a)}); }
  return new Polyline(pts,true);
}
