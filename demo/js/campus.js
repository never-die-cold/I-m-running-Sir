"use strict";
/* ============================================================
   campus.js —— 校园注册表
   各校园数据文件（campus-suzhou.js / campus-demo.js）调用 registerCampus()
   注册自己；main.js 通过 initCampus() 解析当前校园（?campus=<id>，默认第一个）。
   ============================================================ */
const CAMPUS_REGISTRY = [];

function registerCampus(def){
  if (!def || !def.id) throw new Error("campus def needs id");
  if (CAMPUS_REGISTRY.some(c=>c.id===def.id)) throw new Error("duplicate campus id: "+def.id);
  CAMPUS_REGISTRY.push(def);
  return def;
}

/* 建筑配色（kind → RGB） */
const BUILDING_COLORS = {
  library:[82,90,118], teach:[107,100,90], canteen:[122,102,74], dorm:[96,90,107],
  gym:[77,108,100], admin:[111,97,83], lab:[90,102,111],
  tech:[70,96,128], hotel:[120,96,110], shop:[116,104,82],
  clinic:[92,110,104], center:[104,92,120], heritage:[122,70,58]
};

/* ---- 注册表内部工具 ---- */
function _distPointSeg(p, a, b){
  const abx=b.x-a.x, aby=b.y-a.y;
  const L2=abx*abx+aby*aby;
  if (L2<1e-12) return Math.hypot(p.x-a.x, p.y-a.y);
  let t=((p.x-a.x)*abx+(p.y-a.y)*aby)/L2;
  t=Math.max(0,Math.min(1,t));
  return Math.hypot(p.x-(a.x+abx*t), p.y-(a.y+aby*t));
}

function _nearAnyRoad(x, y, roads, margin){
  for (const rd of roads){
    const pts=rd.pts;
    for (let i=0;i<pts.length-1;i++){
      if (_distPointSeg({x,y}, pts[i], pts[i+1]) < rd.w/2+margin) return true;
    }
    if (rd.closed && _distPointSeg({x,y}, pts[pts.length-1], pts[0]) < rd.w/2+margin) return true;
  }
  return false;
}

function _inAnyBuilding(x, y, buildings, pad){
  for (const b of buildings){
    if (Math.abs(x-b.c.x)<=b.s.x/2+pad && Math.abs(y-b.c.y)<=b.s.y/2+pad) return true;
  }
  return false;
}

function _inAnyWater(x, y, water, pad){
  for (const w of water){
    if (w.c){
      const nx=(x-w.c.x)/(w.rx+pad), ny=(y-w.c.y)/(w.ry+pad);
      if (nx*nx+ny*ny<=1) return true;
    }
  }
  return false;
}

/* 解析并装配当前校园（Polyline / 边界 / 林木） */
function initCampus(){
  let want=null;
  try {
    if (typeof location!=="undefined" && location.search){
      want=new URLSearchParams(location.search).get("campus");
    }
  } catch(e){}

  const def = (want && CAMPUS_REGISTRY.find(c=>c.id===want)) || CAMPUS_REGISTRY[0];
  if (!def) throw new Error("no campus registered");

  def.mainRoute = new Polyline(def.mainRoutePts, true);

  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  const eat=p=>{ if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y; };
  for (const rd of def.roads) for (const p of rd.pts) eat(p);
  for (const b of def.buildings){
    eat({x:b.c.x-b.s.x/2, y:b.c.y-b.s.y/2});
    eat({x:b.c.x+b.s.x/2, y:b.c.y+b.s.y/2});
  }
  for (const p of def.mainRoutePts) eat(p);
  for (const w of def.water){
    if (w.c){ eat({x:w.c.x-w.rx, y:w.c.y-w.ry}); eat({x:w.c.x+w.rx, y:w.c.y+w.ry}); }
    else for (const p of w.pts) eat(p);
  }
  for (const t of (def.trails||[])) for (const p of t.pts) eat(p);
  def.bounds = { minX:minX-30, minY:minY-30, maxX:maxX+30, maxY:maxY+30 };

  /* 林木：确定性生成，避让道路 / 建筑 / 水面 */
  def.trees=[];
  for (const f of (def.forests||[])){
    const rng=new Rng(f.seed||1234);
    let placed=0, guard=0;
    while (placed<f.count && guard<f.count*40){
      guard++;
      const a=rng.next()*Math.PI*2, rr=Math.sqrt(rng.next());
      const x=f.c.x+Math.cos(a)*f.rx*rr, y=f.c.y+Math.sin(a)*f.ry*rr;
      if (_nearAnyRoad(x,y,def.roads,6)) continue;
      if (_inAnyBuilding(x,y,def.buildings,8)) continue;
      if (_inAnyWater(x,y,def.water,10)) continue;
      def.trees.push({x, y, r:2.6+rng.next()*3.4, tone:rng.next()});
      placed++;
    }
  }
  return def;
}
