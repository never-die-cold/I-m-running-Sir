"use strict";
/* ============================================================
   main.js —— 输入 / 会话 / 主循环
   ============================================================ */
const keys={};
window.addEventListener("keydown",e=>{
  keys[e.code]=true;
  /* 战斗升级三选一：1/2/3 选牌（优先于模式切换） */
  if(BATTLE.state==="levelup"){
    if(e.code==="Digit1"){ applySkill(0); return; }
    if(e.code==="Digit2"){ applySkill(1); return; }
    if(e.code==="Digit3"){ applySkill(2); return; }
  }
  if(e.code==="Space"){ e.preventDefault(); boot.autopilot=!boot.autopilot; }
  if(e.code==="KeyT"){ resetRun(); }
  if(e.code==="Digit1"){ session.setMode("checkpoint"); resetRun(); }
  if(e.code==="Digit2"){ session.setMode("tour"); resetRun(); }
  if(e.code==="Digit3"){ session.setMode("free"); resetRun(); }
  if(e.code==="Digit4"){ session.setMode("battle"); resetRun(); }
  if(e.code==="Equal"||e.code==="NumpadAdd"){ cam.zoom=Math.min(CAM_MAX,cam.zoom*1.18); }
  if(e.code==="Minus"||e.code==="NumpadSubtract"){ cam.zoom=Math.max(CAM_MIN,cam.zoom/1.18); }
});
window.addEventListener("keyup",e=>{ keys[e.code]=false; });
cv.addEventListener("wheel",e=>{
  e.preventDefault();
  cam.zoom=Math.max(CAM_MIN,Math.min(CAM_MAX, cam.zoom*(e.deltaY<0?1.12:1/1.12)));
},{passive:false});

const joy={ active:false, id:null, ox:0, oy:0, x:0, y:0 };
function canvasPos(e){
  const r=cv.getBoundingClientRect();
  return { x:e.clientX-r.left, y:e.clientY-r.top };
}
cv.addEventListener("pointerdown",e=>{
  if(e.clientX - cv.getBoundingClientRect().left > W*0.55) return;
  joy.active=true; joy.id=e.pointerId;
  const p=canvasPos(e); joy.ox=p.x; joy.oy=p.y;
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove",e=>{
  if(!joy.active||e.pointerId!==joy.id) return;
  const p=canvasPos(e);
  const R=Math.min(W,H)*0.13;
  let dx=(p.x-joy.ox)/R, dy=-(p.y-joy.oy)/R;
  const m=Math.hypot(dx,dy); if(m>1){ dx/=m; dy/=m; }
  joy.x=dx; joy.y=dy;
});
function endJoy(e){ if(e.pointerId===joy.id){ joy.active=false; joy.id=null; joy.x=0; joy.y=0; } }
cv.addEventListener("pointerup",endJoy);
cv.addEventListener("pointercancel",endJoy);

function readInput(){
  let x=0,y=0;
  if(keys.KeyW||keys.ArrowUp) y+=1;
  if(keys.KeyS||keys.ArrowDown) y-=1;
  if(keys.KeyD||keys.ArrowRight) x+=1;
  if(keys.KeyA||keys.ArrowLeft) x-=1;
  if(x||y){ const m=Math.hypot(x,y); return {x:x/m,y:y/m}; }
  if(joy.x||joy.y) return {x:joy.x,y:joy.y};
  return {x:0,y:0};
}

/* ============================================================
   主循环
   ============================================================ */
const CAMPUS = initCampus();
const ORIGIN = CAMPUS.origin;
const frame = new LocalFrame(ORIGIN);
let session, boot;

function resetRun(){
  session.resetToRouteStart();
  if(session.mode==="checkpoint") session.spawnCheckpoints(boot.cpCount||3, 80, 120, 0.15);
  else session.checkpoints=[];
  session.landmarksFound=[];
  session.stamina=100;
  if(session.mode==="battle") battleReset(20260924);
  session.startRun();
  boot.autopilot=false;
  cam.x=session.worldPos.x; cam.y=session.worldPos.y;
}

function init(){
  session = new RunSession(frame, CAMPUS, 20260924);
  boot = { autopilot:false, speedMul:6, targetSpeed:2.94, lastTime:performance.now()/1000 };

  resetRun();

  resize();
  document.getElementById("boot").remove();

  const btns=[...document.querySelectorAll("#speeds button")];
  const badge=document.getElementById("badge");
  function setSpeed(mult){
    boot.speedMul=mult;
    btns.forEach(b=>b.classList.toggle("on", +b.dataset.s===mult));
    badge.textContent = mult===1 ? "（实机固定 1×）" : `（实机固定 1×，此处仅演示）`;
  }
  btns.forEach(b=>b.addEventListener("click",()=>setSpeed(+b.dataset.s)));
  setSpeed(6);

  requestAnimationFrame(loop);
}

function loop(nowMs){
  const now=nowMs/1000;
  let realDt=Math.min(0.05, now-boot.lastTime);
  boot.lastTime=now;

  const wallMs = Date.now();
  const battleMode = session.mode==="battle";
  /* 战斗模式永远实时（1×），其他模式保持演示加速 */
  const dt = battleMode ? realDt : realDt * boot.speedMul;

  if(battleMode && BATTLE.state==="fighting"){
    const dir=readInput();
    const sprint = !!(keys.ShiftLeft||keys.ShiftRight);
    const moving = dir.x!==0||dir.y!==0;
    session.tick(dt, wallMs, dir, boot.targetSpeed*BATTLE.player.moveMul, sprint);
    battleTick(dt, session.worldPos, moving);
  } else if(!battleMode){
    const sprint = !!(keys.ShiftLeft||keys.ShiftRight);
    if(boot.autopilot) session.tickAutopilot(dt, wallMs, boot.targetSpeed);
    else session.tick(dt, wallMs, readInput(), boot.targetSpeed, sprint);
  }
  /* 升级选牌 / 倒下：画面冻结，等待选择或 T 重开 */

  const k=1-Math.exp(-realDt*6);
  cam.x += (session.worldPos.x-cam.x)*k;
  cam.y += (session.worldPos.y-cam.y)*k;

  draw();
  drawJoystick();
  updateHud();
  requestAnimationFrame(loop);
}

init();
