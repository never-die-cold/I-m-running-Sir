"use strict";
/* ============================================================
   ui.js —— HUD 文案 / 格式化 / toast
   ============================================================ */
const $=id=>document.getElementById(id);

/* toast 队列（成就 / 新纪录）；headless 沙箱无 DOM/setTimeout，静默跳过 */
const _toastQ=[];
function showToast(text,kind){
  try{
    if(typeof document==="undefined"||!document.createElement||typeof setTimeout==="undefined") return;
    _toastQ.push({text,kind:kind||"ach"});
    if(_toastQ.length===1) _nextToast();
  }catch(e){}
}
function _nextToast(){
  const box=$("toast");
  if(!box|| !_toastQ.length) return;
  const t=_toastQ[0];
  const el=document.createElement("div");
  el.className="toastItem"+(t.kind==="rec"?" rec":"");
  el.textContent=t.text;
  box.appendChild(el);
  requestAnimationFrame(()=>{ el.style.opacity="1"; });
  setTimeout(()=>{ el.style.opacity="0"; },2600);
  setTimeout(()=>{
    el.remove();
    _toastQ.shift();
    _nextToast();
  },3100);
}
Progress.onToast=(text,kind)=>{ showToast(text,kind); Sfx.play(kind==="rec"?"record":"ach"); };

/* 打卡/巡礼发现的音效与彩带（按帧差分触发） */
let _lastCleared=0, _lastLm=0;
function observePickups(session){
  const cleared=session.checkpoints.filter(c=>c.cleared).length;
  if(cleared>_lastCleared){
    Sfx.play("checkpoint");
    spawnConfetti(session.worldPos.x, session.worldPos.y);
  }
  _lastCleared=cleared;
  const lm=session.landmarksFound?session.landmarksFound.length:0;
  if(lm>_lastLm){
    Sfx.play("checkpoint");
    spawnConfetti(session.worldPos.x, session.worldPos.y);
  }
  _lastLm=lm;
}

function fmtPace(sec){
  if(!sec||!isFinite(sec)||sec<=0) return "--'--\"";
  const t=Math.round(sec);
  return String(Math.floor(t/60)).padStart(2,"0")+"'"+String(t%60).padStart(2,"0")+"\"";
}
function fmtDur(sec){
  const t=Math.max(0,Math.floor(sec));
  const h=Math.floor(t/3600), m=Math.floor(t%3600/60), s=t%60;
  return (h?String(h).padStart(2,"0")+":":"")+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}

/* ---- 战斗弹层：升级三选一 / 倒下结算 ---- */
function refreshBattleOverlays(){
  const lvl=$("lvlOverlay"), dead=$("deadOverlay");
  if(!lvl || !dead) return;
  if(session.mode==="battle" && BATTLE.state==="levelup"){
    const box=$("lvlCards");
    if(box.dataset.for!==String(BATTLE.level)){
      box.dataset.for=String(BATTLE.level);
      box.innerHTML="";
      BATTLE.choices.forEach((sk,i)=>{
        const d=document.createElement("div");
        d.className="skcard";
        d.innerHTML="<b>"+(i+1)+". "+sk.n+"</b>"+sk.d+"<i>"+_skillLvTag(sk.id)+"</i>";
        d.addEventListener("click",()=>applySkill(i));
        box.appendChild(d);
      });
    }
    lvl.style.display="flex";
  } else lvl.style.display="none";

  if(session.mode==="battle" && BATTLE.state==="dead"){
    $("deadStats").innerHTML=
      "存活波次 <b>"+BATTLE.wave+"</b> · 击杀 <b>"+BATTLE.kills+"</b> · 等级 <b>Lv."+BATTLE.level+"</b><br>"+
      "本次里程 <b>"+(session.recordedDist/1000).toFixed(2)+" km</b> · 用时 <b>"+fmtDur(session.duration)+"</b>";
    dead.style.display="flex";
  } else dead.style.display="none";
}
function _skillLvTag(id){
  const p=BATTLE.player;
  const cur={multi:p.arrows,pierce:p.pierce,ricochet:p.ricochet,nova:p.nova}[id];
  return cur!==undefined?("当前 "+cur+" 级"):"";
}

function updateHud(){
  const s=session, f=s.lastFix;
  const pace = f.speed>1e-6 ? 1000/f.speed : 0;
  const avgSpeed = s.duration>1 ? s.recordedDist/s.duration : 0;
  const avgPace = avgSpeed>1e-6 ? 1000/avgSpeed : 0;

  $("vDist").textContent = (s.recordedDist/1000).toFixed(3)+" km";
  $("vPace").textContent = fmtPace(pace);
  $("vTime").textContent = fmtDur(s.duration);
  $("vSpeed").textContent = f.speed.toFixed(2)+" m/s";

  const el=$("vAvg");
  let st, cls;
  if(s.duration<25){ st="--"; cls="dim"; }
  else if(avgSpeed < s.feed.pace.minSpeed){ st="TOO SLOW 太慢"; cls="bad"; }
  else if(avgSpeed > s.feed.pace.maxSpeed){ st="TOO FAST 太快"; cls="warn"; }
  else { st="OK 合法"; cls="good"; }
  el.textContent = fmtPace(avgPace)+"  "+st;
  el.className="v "+cls;

  $("vLat").textContent = f.lat.toFixed(7);
  $("vLon").textContent = f.lon.toFixed(7);
  $("vAcc").textContent = f.accuracy.toFixed(1)+" m";
  $("vSat").textContent = f.satellites;
  $("vBrg").textContent = f.bearing.toFixed(1)+"°";
  $("vFix").textContent = s.fixCount+" @1Hz";

  const cleared = s.checkpoints.filter(c=>c.cleared).length;
  $("vCp").textContent = cleared+" / "+s.checkpoints.length;
  $("vCpBar").style.width = (s.checkpoints.length? cleared/s.checkpoints.length*100:0)+"%";

  const staPct=Math.round(s.stamina);
  $("vSta").textContent=staPct+"%";
  const staBar=$("vStaBar");
  staBar.style.width=staPct+"%";
  staBar.style.background = staPct>50?"#71e88a":(staPct>20?"#ffb84d":"#ff6b5a");

  const modeName={checkpoint:"定向打卡",tour:"地标巡礼",free:"自由跑",battle:"狩猎战场"}[s.mode]||s.mode;
  $("vModeTag").textContent=modeName;
  const wx={sunny:"☀ 晴",cloudy:"☁ 多云",rain:"🌧 雨"}[ENV.weather]||ENV.weather;
  $("vClock").textContent=ENV.clockText()+" · "+wx+(ENV.isNight()?" · 夜":"");
  const totalLm=(s.campus.landmarks||[]).length;
  if(s.mode==="tour"&&totalLm>0){
    $("rowTour").style.display="";
    $("vLm").textContent=s.landmarksFound.length+" / "+totalLm;
  } else {
    $("rowTour").style.display="none";
  }

  /* ---- 战斗层 HUD（弓箭手大作战式） ---- */
  const bt=BATTLE;
  const inBattle=s.mode==="battle";
  $("battleRows").style.display=inBattle?"":"none";
  $("vCp").parentElement.style.display=inBattle?"none":"";
  $("vCpBar").style.display=inBattle?"none":"";
  if(inBattle){
    $("vWave").textContent=bt.wave;
    $("vKill").textContent=bt.kills;
    const hpPct=Math.max(0,Math.round(bt.player.hp/bt.player.maxHp*100));
    $("vHp").textContent=Math.ceil(bt.player.hp)+" / "+bt.player.maxHp;
    const hpBar=$("vHpBar");
    hpBar.style.width=hpPct+"%";
    hpBar.style.background=hpPct>50?"#71e88a":(hpPct>25?"#ffb84d":"#ff6b5a");
    $("vExp").textContent="Lv."+bt.level;
    $("vExpBar").style.width=Math.min(100,bt.exp/bt.expNext*100)+"%";
  }
  refreshBattleOverlays();

  $("vMode").textContent = boot.autopilot?"自动驾驶中":"手动模式";
  Progress.observe(session, inBattle?BATTLE:null, typeof ENV!=="undefined"?ENV:null);
  observePickups(s);
  $("json").textContent = JSON.stringify({
    v:1, seq:s.feed.seq, active:true, running:s.isRunning,
    distanceMeters:+s.recordedDist.toFixed(2), durationSeconds:+s.duration.toFixed(1),
    paceSecPerKm:+pace.toFixed(1), updatedAtMs:f.timeMs,
    fix:{ lat:+f.lat.toFixed(7), lon:+f.lon.toFixed(7), timeMs:f.timeMs,
          elapsedRealtimeNanos:f.elapsedRealtimeNanos, accuracy:+f.accuracy.toFixed(2),
          speed:+f.speed.toFixed(3), bearing:+f.bearing.toFixed(2),
          altitude:+f.altitude.toFixed(2), satellites:f.satellites, provider:"gps" }
  });
}
