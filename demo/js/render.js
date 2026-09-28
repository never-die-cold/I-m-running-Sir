"use strict";
/* ============================================================
   render.js —— 画布 / 相机 / 绘制
   ============================================================ */
const cv=document.getElementById("game"), ctx=cv.getContext("2d");
let W=0,H=0,DPR=1;
function resize(){
  DPR=Math.min(window.devicePixelRatio||1, 2);
  W=cv.clientWidth; H=cv.clientHeight;
  cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener("resize",resize);

let cam={x:0,y:0,zoom:0.42};
const CAM_MIN=0.14, CAM_MAX=2.2;
function w2s(x,y){ return [ (x-cam.x)*cam.zoom + W/2, H/2 - (y-cam.y)*cam.zoom ]; }

function draw(){
  ctx.fillStyle="#07090a"; ctx.fillRect(0,0,W,H);

  const z=cam.zoom;
  const halfW=W/2/z, halfH=H/2/z;
  const L=cam.x-halfW, R=cam.x+halfW, Bo=cam.y-halfH, T=cam.y+halfH;

  drawGroundGrid(L,R,Bo,T,z);
  drawWater();
  drawForest();
  for(const rd of CAMPUS.roads){
    if(rd.isTrack) continue;
    if(rd.style==="tram"){ drawRibbon(rd.pts, rd.w, "rgba(139,95,191,.55)", false, [10,8]); continue; }
    drawRibbon(rd.pts, rd.w, "#3b3f45", rd.closed);
  }
  drawTrails();
  drawRibbon(CAMPUS.mainRoute.pts, 1.8, "rgba(249,198,58,.30)", true, [5,6]);
  for(const rd of CAMPUS.roads){ if(rd.isTrack) drawRibbon(rd.pts, rd.w, "#8a4a32", rd.closed); }
  for(const b of CAMPUS.buildings) drawBuilding(b);
  drawLandmarks();
  drawCheckpoints();
  drawNav();
  drawPfx();
  if(session.mode==="battle") drawBattle();
  drawPlayer();

  /* 天色 / 天气罩 + 雨 */
  const tint=ENV.skyTint();
  if(tint.overlay){ ctx.fillStyle=tint.overlay; ctx.fillRect(0,0,W,H); }
  if(ENV.isCloudy()){ ctx.fillStyle="rgba(130,140,150,.10)"; ctx.fillRect(0,0,W,H); }
  if(ENV.isRain()){ ctx.fillStyle="rgba(50,70,100,.16)"; ctx.fillRect(0,0,W,H); drawRainFx(); }
  drawMinimap();
}

function drawNav(){
  const t=session.navTarget;
  if(!t) return;
  const [px,py]=w2s(session.worldPos.x,session.worldPos.y);
  const [tx,ty]=w2s(t.localMeters.x,t.localMeters.y);
  ctx.save();
  ctx.setLineDash([6*cam.zoom,5*cam.zoom]);
  ctx.strokeStyle="rgba(139,95,191,.75)"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(tx,ty); ctx.stroke();
  ctx.setLineDash([]);
  const d=V.dist(session.worldPos,t.localMeters);
  ctx.fillStyle="#c9b3e6"; ctx.font="10px sans-serif"; ctx.textAlign="center";
  ctx.fillText(d>999?(d/1000).toFixed(2)+"km":Math.round(d)+"m", (px+tx)/2, (py+ty)/2-6);
  if(tx<0||tx>W||ty<0||ty>H){
    const cx=Math.max(24,Math.min(W-24,tx)), cy=Math.max(24,Math.min(H-24,ty));
    ctx.translate(cx,cy); ctx.rotate(Math.atan2(ty-py,tx-px));
    ctx.fillStyle="#8b5fbf";
    ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-6,6); ctx.lineTo(-6,-6); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawWater(){
  for(const w of (CAMPUS.water||[])){
    if(w.c){
      const [x,y]=w2s(w.c.x,w.c.y);
      const rx=w.rx*cam.zoom, ry=w.ry*cam.zoom;
      if(x+rx<-20||x-rx>W+20||y+ry<-20||y-ry>H+20) continue;
      ctx.fillStyle="#16324a";
      ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,7); ctx.fill();
      ctx.strokeStyle="rgba(90,160,210,.35)"; ctx.lineWidth=1.5; ctx.stroke();
    } else {
      drawRibbon(w.pts, w.w, "#16324a", false);
      drawRibbon(w.pts, Math.max(1,w.w*0.25), "rgba(90,160,210,.30)", false);
    }
  }
}

function drawForest(){
  if(!CAMPUS.trees || cam.zoom<0.10) return;
  for(const t of CAMPUS.trees){
    const [x,y]=w2s(t.x,t.y);
    if(x<-16||x>W+16||y<-16||y>H+16) continue;
    const r=Math.max(1,t.r*cam.zoom);
    ctx.fillStyle = t.tone>0.5 ? "#1c3226" : "#213b2c";
    ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  }
}

function drawTrails(){
  for(const tr of (CAMPUS.trails||[])) drawRibbon(tr.pts, 2.2, "rgba(140,170,130,.38)", !!tr.closed, [4,5]);
}

function drawLandmarks(){
  if(cam.zoom<0.22) return;
  ctx.save();
  ctx.textAlign="center"; ctx.textBaseline="middle";
  for(const lm of (CAMPUS.landmarks||[])){
    const [x,y]=w2s(lm.c.x,lm.c.y);
    if(x<-90||x>W+90||y<-40||y>H+40) continue;
    ctx.fillStyle="#8b5fbf";
    ctx.beginPath();
    ctx.moveTo(x,y-6); ctx.lineTo(x+5,y); ctx.lineTo(x,y+6); ctx.lineTo(x-5,y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle="rgba(244,238,255,.85)"; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle="rgba(240,235,250,.92)";
    ctx.font='11px "Microsoft YaHei",sans-serif';
    ctx.fillText(lm.n, x, y-13);
  }
  for(const g of (CAMPUS.gates||[])){
    const [x,y]=w2s(g.c.x,g.c.y);
    if(x<-60||x>W+60||y<-40||y>H+40) continue;
    ctx.fillStyle="#f9c63a";
    ctx.fillRect(x-4,y-4,8,8);
    ctx.strokeStyle="rgba(0,0,0,.5)"; ctx.lineWidth=1; ctx.strokeRect(x-4,y-4,8,8);
    ctx.fillStyle="rgba(249,198,58,.9)";
    ctx.font='10px "Microsoft YaHei",sans-serif';
    ctx.fillText(g.n, x, y-11);
  }
  ctx.restore();
}

function drawGroundGrid(L,R,Bo,T,z){
  ctx.fillStyle=ENV.skyTint().ground; ctx.fillRect(0,0,W,H);
  const step = z<0.3?200 : z<0.7?100 : 50;
  if(step*z < 22) return;
  ctx.strokeStyle="rgba(255,255,255,.030)"; ctx.lineWidth=1; ctx.beginPath();
  const x0=Math.ceil(L/step)*step, y0=Math.ceil(Bo/step)*step;
  for(let x=x0;x<=R;x+=step){ const s=w2s(x,0); ctx.moveTo(s[0],0); ctx.lineTo(s[0],H); }
  for(let y=y0;y<=T;y+=step){ const s=w2s(0,y); ctx.moveTo(0,s[1]); ctx.lineTo(W,s[1]); }
  ctx.stroke();
}

function drawRibbon(pts, width, color, closed, dash){
  ctx.save();
  ctx.lineWidth=Math.max(1, width*cam.zoom);
  ctx.lineCap="round"; ctx.lineJoin="round";
  ctx.strokeStyle=color;
  if(dash) ctx.setLineDash(dash.map(d=>d*cam.zoom));
  ctx.beginPath();
  for(let i=0;i<pts.length;i++){ const s=w2s(pts[i].x,pts[i].y); i?ctx.lineTo(s[0],s[1]):ctx.moveTo(s[0],s[1]); }
  if(closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawBuilding(b){
  const c=BUILDING_COLORS[b.k]||[100,100,100];
  const [x,y]=w2s(b.c.x+b.s.x/2, b.c.y+b.s.y/2);
  const w=b.s.x*cam.zoom, h=b.s.y*cam.zoom;
  const rx=x-w, ry=y;

  ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
  ctx.fillRect(rx,ry,w,h);
  ctx.fillStyle=`rgba(255,255,255,.10)`;
  ctx.fillRect(rx,ry,w,Math.max(1,h*0.14));
  ctx.strokeStyle=`rgba(0,0,0,.45)`; ctx.lineWidth=1;
  ctx.strokeRect(rx+.5,ry+.5,w-1,h-1);

  /* 夜间窗户灯（确定性伪随机亮窗） */
  if(ENV.isNight() && w>14 && h>10){
    ctx.fillStyle="rgba(255,214,120,.75)";
    for(let yy=ry+4; yy<ry+h-4; yy+=7)
      for(let xx=rx+4; xx<rx+w-5; xx+=7)
        if(((xx*13+yy*7)|0)%5<2) ctx.fillRect(xx,yy,2.2,2.6);
  }

  if(w>62 && h>18){
    ctx.fillStyle="rgba(235,242,240,.72)";
    ctx.font=`${Math.min(12,Math.max(9,h*0.24))}px "Microsoft YaHei",sans-serif`;
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(b.n, rx+w/2, ry+h/2);
  }
}

let T0=performance.now()/1000;
function drawCheckpoints(){
  const pulse=(Math.sin((performance.now()/1000-T0)*3)+1)/2;
  for(const cp of session.checkpoints){
    const [x,y]=w2s(cp.localMeters.x, cp.localMeters.y);
    const r=cp.radius*cam.zoom;
    if(x<-r-40||x>W+r+40||y<-r-40||y>H+r+40) continue;

    ctx.save();
    if(cp.cleared){
      ctx.strokeStyle="rgba(120,130,126,.4)"; ctx.setLineDash([4,5]); ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.stroke();
      ctx.fillStyle="rgba(120,130,126,.65)";
      ctx.font="11px sans-serif"; ctx.textAlign="center";
      ctx.fillText("已打卡", x, y+4);
    } else {
      const a=0.20+pulse*0.20;
      ctx.fillStyle=`rgba(63,214,255,${a*0.5})`;
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
      ctx.strokeStyle=`rgba(63,214,255,${a+0.45})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.stroke();
      ctx.strokeStyle="rgba(63,214,255,.95)"; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.arc(x,y,r*(0.55+0.25*pulse),0,7); ctx.stroke();
      ctx.fillStyle="#3fd6ff";
      ctx.font="bold 11px sans-serif"; ctx.textAlign="center";
      ctx.fillText("打卡点 "+(cp.index+1), x, y-r-8);
    }
    ctx.restore();
  }
}

function drawBattle(){
  /* 命中特效 */
  for(const f of BATTLE.fx){
    const [x,y]=w2s(f.x,f.y);
    const t=f.age/f.dur;
    ctx.strokeStyle=f.color;
    ctx.globalAlpha=(1-t)*0.8;
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(x,y,f.r*cam.zoom*(0.5+t),0,7); ctx.stroke();
    ctx.globalAlpha=1;
  }
  /* 敌人 */
  for(const e of BATTLE.enemies){
    const t=ENEMY_TYPES[e.type];
    const [x,y]=w2s(e.x,e.y);
    const r=Math.max(3,t.r*cam.zoom);
    if(x<-40||x>W+40||y<-40||y>H+40) continue;
    ctx.save();
    if(e.type==="shooter"){
      ctx.fillStyle=t.color;
      ctx.beginPath();
      ctx.moveTo(x,y-r*1.3); ctx.lineTo(x+r*1.1,y); ctx.lineTo(x,y+r*1.3); ctx.lineTo(x-r*1.1,y);
      ctx.closePath(); ctx.fill();
    } else if(e.type==="charger"){
      const a=Math.atan2(BATTLE._py-e.y,BATTLE._px-e.x);
      ctx.translate(x,y); ctx.rotate(a);
      ctx.fillStyle=t.color;
      ctx.beginPath(); ctx.moveTo(r*1.4,0); ctx.lineTo(-r,r*0.9); ctx.lineTo(-r,-r*0.9);
      ctx.closePath(); ctx.fill();
      ctx.rotate(-a); ctx.translate(-x,-y);
    } else {
      ctx.fillStyle=t.color;
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    ctx.strokeStyle="rgba(0,0,0,.5)"; ctx.lineWidth=1.2; ctx.stroke();
    /* 血条 */
    const bw=Math.max(14,r*2.4);
    ctx.fillStyle="rgba(0,0,0,.55)";
    ctx.fillRect(x-bw/2,y-r-8,bw,3);
    ctx.fillStyle=e.type==="boss"?"#ffd23f":"#71e88a";
    ctx.fillRect(x-bw/2,y-r-8,bw*Math.max(0,e.hp/e.maxHp),3);
    if(e.type==="boss"){
      ctx.strokeStyle="rgba(255,210,63,.9)"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y,r+3+Math.sin(BATTLE.time*6)*1.5,0,7); ctx.stroke();
    }
    ctx.restore();
  }
  /* 敌方弹 */
  for(const b of BATTLE.ebullets){
    const [x,y]=w2s(b.x,b.y);
    ctx.fillStyle="#ff8a5a";
    ctx.beginPath(); ctx.arc(x,y,Math.max(2.4,3.6*cam.zoom),0,7); ctx.fill();
  }
  /* 玩家箭 */
  ctx.strokeStyle="#ffe98a"; ctx.lineWidth=Math.max(1.4,2.2*cam.zoom); ctx.lineCap="round";
  ctx.beginPath();
  for(const b of BATTLE.bullets){
    const [x,y]=w2s(b.x,b.y);
    const [x2,y2]=w2s(b.x-b.vx*0.045, b.y-b.vy*0.045);
    ctx.moveTo(x2,y2); ctx.lineTo(x,y);
  }
  ctx.stroke();
}

function drawPlayer(){
  const [x,y]=w2s(session.worldPos.x, session.worldPos.y);
  const f=session.lastFix;
  const dir = (f && f.speed>0.35)
    ? { x:Math.sin(f.bearing*DEG), y:Math.cos(f.bearing*DEG) }
    : { x:0, y:-1 };

  ctx.save();
  const g=ctx.createRadialGradient(x,y,2,x,y,34);
  g.addColorStop(0,"rgba(249,198,58,.42)"); g.addColorStop(1,"rgba(249,198,58,0)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,34,0,7); ctx.fill();

  /* 夜间车头灯锥形光 */
  if(ENV.isNight()){
    const a=Math.atan2(-dir.y,dir.x);
    const g2=ctx.createRadialGradient(x,y,4,x,y,92);
    g2.addColorStop(0,"rgba(255,240,190,.30)"); g2.addColorStop(1,"rgba(255,240,190,0)");
    ctx.fillStyle=g2;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.arc(x,y,92,a-0.42,a+0.42); ctx.closePath(); ctx.fill();
  }

  ctx.strokeStyle="rgba(249,198,58,.35)"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(x,y,13,0,7); ctx.stroke();

  ctx.fillStyle="#f9c63a";
  ctx.beginPath(); ctx.arc(x,y,6.2,0,7); ctx.fill();
  ctx.fillStyle="#1b1d18";
  ctx.beginPath(); ctx.arc(x+dir.x*2.6, y-dir.y*2.6, 2.6, 0, 7); ctx.fill();

  ctx.strokeStyle="rgba(255,255,255,.55)"; ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.moveTo(x,y);
  ctx.lineTo(x+dir.x*22, y-dir.y*22); ctx.stroke();
  ctx.restore();
}

function drawJoystick(){
  const R=Math.min(W,H)*0.13;
  const ox=joy.active?joy.ox:W*0.16, oy=joy.active?joy.oy:H*0.78;
  ctx.save();
  ctx.strokeStyle="rgba(255,255,255,.20)"; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(ox,oy,R,0,7); ctx.stroke();
  ctx.strokeStyle="rgba(255,255,255,.10)";
  ctx.beginPath(); ctx.arc(ox,oy,R*0.45,0,7); ctx.stroke();
  ctx.fillStyle = (joy.x||joy.y)?"rgba(249,198,58,.8)":"rgba(255,255,255,.32)";
  ctx.beginPath(); ctx.arc(ox+joy.x*R, oy-joy.y*R, R*0.30, 0, 7); ctx.fill();
  ctx.restore();
}

/* ============================================================
   粒子（跑步尘土 / 彩带）与雨（屏幕空间）
   ============================================================ */
const PFX=[];
const CONF_COLORS=["#f9c63a","#3fd6ff","#71e88a","#e858c8","#ff8a5a"];
function spawnDust(x,y){
  if(PFX.length>=240) return;
  PFX.push({x,y,vx:(Math.random()-.5)*2,vy:(Math.random()-.5)*2,age:0,dur:.5,
            r:2+Math.random()*2.4,color:"#9a927e",g:0});
}
function spawnConfetti(x,y){
  for(let i=0;i<28&&PFX.length<280;i++){
    const a=Math.random()*Math.PI*2, sp=3+Math.random()*9;
    PFX.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,age:0,dur:1.0,
              r:2.6,color:CONF_COLORS[i%CONF_COLORS.length],g:10});
  }
}
function updatePfx(dt){
  for(let i=PFX.length-1;i>=0;i--){
    const p=PFX[i]; p.age+=dt;
    if(p.age>=p.dur){ PFX.splice(i,1); continue; }
    p.x+=p.vx*dt; p.y+=p.vy*dt;
    if(p.g) p.vy-=p.g*dt;
  }
}
function drawPfx(){
  for(const p of PFX){
    const [x,y]=w2s(p.x,p.y);
    const t=p.age/p.dur;
    ctx.globalAlpha=1-t;
    ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(x,y,Math.max(1,p.r*cam.zoom*(p.g?1:(1+t))),0,7); ctx.fill();
  }
  ctx.globalAlpha=1;
}

const RAIN=[];
function updateRainFx(dt){
  if(!ENV.isRain()){ if(RAIN.length) RAIN.length=0; return; }
  while(RAIN.length<90) RAIN.push({x:Math.random()*W,y:Math.random()*H,
    v:520+Math.random()*260,l:9+Math.random()*9});
  for(const r of RAIN){
    r.y+=r.v*dt; r.x-=r.v*0.18*dt;
    if(r.y>H+20){ r.y=-20; r.x=Math.random()*(W+120); }
    if(r.x<-20) r.x+=W+40;
  }
}
function drawRainFx(){
  ctx.strokeStyle="rgba(160,190,230,.45)"; ctx.lineWidth=1;
  ctx.beginPath();
  for(const r of RAIN){ ctx.moveTo(r.x,r.y); ctx.lineTo(r.x+r.l*0.18,r.y-r.l); }
  ctx.stroke();
}
function updateEnvFx(dt){ updatePfx(dt); updateRainFx(dt); }

/* ============================================================
   小地图（右下角：主路 / 建筑 / 打卡点 / 敌人 / 玩家 / 视野框）
   ============================================================ */
function drawMinimap(){
  const mw=170, mh=124, mx=W-mw-12, my=H-mh-58;
  const b=CAMPUS.bounds;
  const s=Math.min(mw/(b.maxX-b.minX), mh/(b.maxY-b.minY));
  const ox=mx+(mw-(b.maxX-b.minX)*s)/2, oy=my+(mh-(b.maxY-b.minY)*s)/2;
  const m2x=x=>ox+(x-b.minX)*s, m2y=y=>oy+(b.maxY-y)*s;
  ctx.save();
  ctx.fillStyle="rgba(4,7,9,.72)"; ctx.strokeStyle="rgba(63,214,255,.35)"; ctx.lineWidth=1;
  ctx.fillRect(mx,my,mw,mh); ctx.strokeRect(mx+.5,my+.5,mw-1,mh-1);
  ctx.strokeStyle="rgba(249,198,58,.55)"; ctx.beginPath();
  CAMPUS.mainRoute.pts.forEach((p,i)=>{
    const X=m2x(p.x),Y=m2y(p.y); i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);
  });
  ctx.stroke();
  ctx.fillStyle="rgba(160,170,180,.5)";
  for(const bd of CAMPUS.buildings)
    ctx.fillRect(m2x(bd.c.x-bd.s.x/2), m2y(bd.c.y+bd.s.y/2),
                 Math.max(1.5,bd.s.x*s), Math.max(1.5,bd.s.y*s));
  for(const cp of session.checkpoints){
    ctx.fillStyle=cp.cleared?"rgba(120,130,126,.6)":"#3fd6ff";
    ctx.beginPath(); ctx.arc(m2x(cp.localMeters.x),m2y(cp.localMeters.y),2.2,0,7); ctx.fill();
  }
  if(session.mode==="battle")
    for(const e of BATTLE.enemies){
      ctx.fillStyle="#ff6b5a"; ctx.fillRect(m2x(e.x)-1.5,m2y(e.y)-1.5,3,3);
    }
  ctx.fillStyle="#f9c63a";
  ctx.beginPath(); ctx.arc(m2x(session.worldPos.x),m2y(session.worldPos.y),2.6,0,7); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,.25)";
  ctx.strokeRect(m2x(cam.x-W/2/cam.zoom), m2y(cam.y+H/2/cam.zoom),
                 W/cam.zoom*s, H/cam.zoom*s);
  ctx.restore();
}
