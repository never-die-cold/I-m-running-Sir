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
  for(const rd of CAMPUS.roads){ if(rd.isTrack) continue; drawRibbon(rd.pts, rd.w, "#3b3f45", rd.closed); }
  drawRibbon(CAMPUS.mainRoute.pts, 1.8, "rgba(249,198,58,.30)", true, [5,6]);
  for(const rd of CAMPUS.roads){ if(rd.isTrack) drawRibbon(rd.pts, rd.w, "#8a4a32", rd.closed); }
  for(const b of CAMPUS.buildings) drawBuilding(b);
  drawCheckpoints();
  drawPlayer();
}

function drawGroundGrid(L,R,Bo,T,z){
  ctx.fillStyle="#11150f"; ctx.fillRect(0,0,W,H);
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
