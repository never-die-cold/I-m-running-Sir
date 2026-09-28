"use strict";
/* ============================================================
   main.js —— 输入 / 会话 / 主循环
   ============================================================ */
const keys={};
window.addEventListener("keydown",e=>{
  keys[e.code]=true;
  Sfx.unlock();
  /* 开始菜单：1-4 选模式，回车开始 */
  if(isStartVisible()){
    if(e.code==="Digit1"){ START_OPTS.mode="checkpoint"; buildStartPanel(); }
    else if(e.code==="Digit2"){ START_OPTS.mode="tour"; buildStartPanel(); }
    else if(e.code==="Digit3"){ START_OPTS.mode="free"; buildStartPanel(); }
    else if(e.code==="Digit4"){ START_OPTS.mode="battle"; buildStartPanel(); }
    else if(e.code==="Enter"||e.code==="Space"){ e.preventDefault(); startFromMenu(); }
    return;
  }
  if(e.code==="KeyM"){ showToast(Sfx.toggle()?"🔇 音效已静音":"🔊 音效已开启"); return; }
  if(e.code==="KeyP"||e.code==="Escape"){ togglePause(); return; }
  /* 战斗升级三选一：1/2/3 选牌（优先于模式切换） */
  if(BATTLE.state==="levelup"){
    if(e.code==="Digit1"){ applySkill(0); return; }
    if(e.code==="Digit2"){ applySkill(1); return; }
    if(e.code==="Digit3"){ applySkill(2); return; }
  }
  if(e.code==="Space"){ e.preventDefault(); boot.autopilot=!boot.autopilot; syncAutoBtn(); }
  if(e.code==="KeyT"){
    /* 结算弹层开着时 T=再来一局，否则 T=结算 */
    if(isResultVisible()){ hideResult(); resetRun(); }
    else showResult(session.mode==="battle"?"战 斗 结 束":"本 局 结 算");
  }
  if(e.code==="Digit1"){ hideResult(); session.setMode("checkpoint"); resetRun(); }
  if(e.code==="Digit2"){ hideResult(); session.setMode("tour"); resetRun(); }
  if(e.code==="Digit3"){ hideResult(); session.setMode("free"); resetRun(); }
  if(e.code==="Digit4"){ hideResult(); session.setMode("battle"); resetRun(); }
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
  Sfx.unlock();
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
  if (typeof Progress !== "undefined") Progress.finishRun(session, session.mode==="battle"?BATTLE:null);
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

function syncAutoBtn(){
  const b=document.getElementById("mbAuto");
  if(b) b.classList.toggle("on", !!boot.autopilot);
}

function init(){
  session = new RunSession(frame, CAMPUS, 20260924);
  boot = { autopilot:false, paused:true, speedMul:6, targetSpeed:2.94, lastTime:performance.now()/1000 };

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
  btns.forEach(b=>b.addEventListener("click",()=>{ Sfx.play("click"); setSpeed(+b.dataset.s); }));
  setSpeed(6);

  /* 弹层 / 快捷按钮 */
  $("startBtn").addEventListener("click", startFromMenu);
  $("deadRetry").addEventListener("click", ()=>{ Sfx.play("click"); hideResult(); resetRun(); });
  $("deadMenu").addEventListener("click", ()=>{ Sfx.play("click"); hideResult(); showStart(); });
  $("pauseResume").addEventListener("click", ()=>togglePause(false));
  $("pauseMenu").addEventListener("click", ()=>{ togglePause(false); showStart(); });
  $("mbPause").addEventListener("click", ()=>togglePause());
  $("mbAuto").addEventListener("click", ()=>{ boot.autopilot=!boot.autopilot; syncAutoBtn(); Sfx.play("click"); });
  const sb=$("mbSprint");
  sb.addEventListener("pointerdown",e=>{ e.preventDefault(); keys.ShiftRightMobile=true; });
  const up=()=>{ keys.ShiftRightMobile=false; };
  sb.addEventListener("pointerup",up); sb.addEventListener("pointercancel",up); sb.addEventListener("pointerleave",up);

  showStart();
  requestAnimationFrame(loop);
}

let _dustT=0, _lastShootT=0, _prevBState="fighting", _prevBullets=0, _prevHp=100;
function loop(nowMs){
  const now=nowMs/1000;
  let realDt=Math.min(0.05, now-boot.lastTime);
  boot.lastTime=now;

  const wallMs = Date.now();
  const battleMode = session.mode==="battle";
  /* 战斗模式永远实时（1×），其他模式保持演示加速；暂停/菜单时冻结世界 */
  if(!boot.paused){
    const dt = battleMode ? realDt : realDt * boot.speedMul;
    ENV.tick(realDt, battleMode?1:boot.speedMul);
    updateEnvFx(realDt);

    let moving=false;
    if(battleMode && BATTLE.state==="fighting"){
      const dir=readInput();
      const sprint = !!(keys.ShiftLeft||keys.ShiftRight||keys.ShiftRightMobile);
      moving = dir.x!==0||dir.y!==0;
      session.tick(dt, wallMs, dir, boot.targetSpeed*BATTLE.player.moveMul, sprint);
      battleTick(dt, session.worldPos, moving);
      if(BATTLE.state==="levelup" && _prevBState!=="levelup") Sfx.play("levelup");
      if(BATTLE.state==="dead" && _prevBState!=="dead") Sfx.play("death");
      if(BATTLE.player.hp<_prevHp) Sfx.play("hurt");
      if(BATTLE.bullets.length>_prevBullets && now-_lastShootT>0.08){ Sfx.play("shoot"); _lastShootT=now; }
      _prevBState=BATTLE.state; _prevBullets=BATTLE.bullets.length; _prevHp=BATTLE.player.hp;
    } else if(!battleMode){
      const dir=readInput();
      moving = dir.x!==0||dir.y!==0;
      const sprint = !!(keys.ShiftLeft||keys.ShiftRight||keys.ShiftRightMobile);
      if(boot.autopilot) session.tickAutopilot(dt, wallMs, boot.targetSpeed);
      else session.tick(dt, wallMs, dir, boot.targetSpeed, sprint);
    }
    /* 升级选牌 / 倒下 / 结算：世界冻结，等待选择 */

    _dustT-=realDt;
    if(moving && _dustT<=0){ spawnDust(session.worldPos.x, session.worldPos.y); _dustT=0.12; }
  }

  const k=1-Math.exp(-realDt*6);
  cam.x += (session.worldPos.x-cam.x)*k;
  cam.y += (session.worldPos.y-cam.y)*k;

  draw();
  drawJoystick();
  updateHud();
  requestAnimationFrame(loop);
}

init();
