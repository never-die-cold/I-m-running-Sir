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

/* 开发者面板（GPS/JSON）显隐：跑步模式默认开、战斗模式默认收，H 随时切换 */
function toggleDevPanels(){
  const cur=Store.read("devPanels", true);
  Store.write("devPanels", !cur);
  showToast(!cur?"🛠 开发面板已显示":"面板已收起 (H)");
}
function devPanelsVisible(){
  return Store.read("devPanels", true);
}

/* 打卡/巡礼发现的音效与彩带（按帧差分触发）+ 定向全清自动结算 */
let _lastCleared=0, _lastLm=0, _resultShownRun=false;
function observePickups(session){
  const cleared=session.checkpoints.filter(c=>c.cleared).length;
  if(cleared===0) _resultShownRun=false;
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
  if(session.mode==="checkpoint" && session.checkpoints.length>0 &&
     cleared===session.checkpoints.length && !_resultShownRun && !isResultVisible()){
    _resultShownRun=true;
    showResult("打卡完成！");
  }
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
      const RAR={common:["普通","#cfd8d5",""],rare:["稀有","#3fd6ff","skcard-rare"],epic:["史诗","#c9b3e6","skcard-epic"]};
      BATTLE.choices.forEach((c,i)=>{
        const r=RAR[c.rar]||RAR.common;
        const d=document.createElement("div");
        d.className="skcard "+r[2];
        d.innerHTML="<b style='color:"+r[1]+"'>"+(i+1)+". "+c.s.n+" · "+r[0]+"</b>"+c.s.d+"<i>"+_skillLvTag(c.s.id)+"</i>";
        d.addEventListener("click",()=>applySkill(i));
        box.appendChild(d);
      });
    }
    lvl.style.display="flex";
  } else lvl.style.display="none";

  if(session.mode==="battle" && BATTLE.state==="dead"){
    if(!isResultVisible()) showResult("你 倒 下 了");
  }
  if(session.mode==="battle" && BATTLE.state==="victory"){
    if(!isResultVisible()) showResult("通 关 ！");
  }
}

/* 首次进入战斗的引导提示（永久一次） */
function maybeTutorialToast(){
  if(session.mode!=="battle") return;
  if(typeof Store==="undefined"||Store.read("tutorialDone",false)) return;
  Store.write("tutorialDone",true);
  showToast("🕹 左摇杆 / WASD 移动");
  showToast("🎯 右摇杆 / J / 普攻键 射击（移动中可射）");
  showToast("💨 Shift / 冲刺键 翻滚无敌");
}
function _skillLvTag(id){
  const p=BATTLE.player;
  const cur={multi:p.arrows,pierce:p.pierce,ricochet:p.ricochet,nova:p.nova,
             side:p.side,leech:p.leech,magnet:p.magnet,shieldLv:p.shieldLv}[id];
  if(id==="burn") return p.burn?"已习得":"";
  if(id==="frost") return p.frost?"已习得":"";
  return cur!==undefined?("当前 "+cur+" 级"):"";
}

/* ============================================================
   开始菜单 / 暂停 / 结算（星级：3★=均配速≤5'30"）
   ============================================================ */
const START_OPTS={ mode:"checkpoint", cpCount:3, pace:2.94 };
const PACE_OPTS=[
  { v:2.56, n:"轻松 6'30\"" },
  { v:2.94, n:"标准 5'40\"" },
  { v:3.53, n:"竞速 4'43\"" }
];
function isStartVisible(){ const el=$("startOverlay"); return !!(el&&el.style.display==="flex"); }
function isResultVisible(){ const el=$("deadOverlay"); return !!(el&&el.style.display==="flex"); }

function buildStartPanel(){
  if(typeof document==="undefined"||!document.createElement) return;   // headless 沙箱静默
  const cc=$("campusChips"); cc.innerHTML="";
  [{n:"南京大学·苏州校区",d:"可选 · 太湖科学城",ok:true,on:true},
   {n:"鼓楼校区",d:"敬请期待",ok:false,on:false},
   {n:"仙林校区",d:"敬请期待",ok:false,on:false}].forEach(c=>{
    const d=document.createElement("div");
    d.className="campusCard"+(c.ok?"":" off")+(c.on?" on":"");
    d.innerHTML="<b>"+c.n+"</b><i>"+c.d+"</i>";
    cc.appendChild(d);
  });
  const mc=$("modeChips"); mc.innerHTML="";
  [["checkpoint","定向打卡"],["tour","地标巡礼"],["free","自由跑"],["battle","狩猎战场"]].forEach(([id,n])=>{
    const d=document.createElement("div");
    d.className="chip"+(START_OPTS.mode===id?" on":"");
    d.textContent=n;
    d.addEventListener("click",()=>{ START_OPTS.mode=id; Sfx.play("click"); buildStartPanel(); });
    mc.appendChild(d);
  });
  const pc=$("cpChips"); pc.innerHTML="";
  [3,5,8].forEach(n=>{
    const d=document.createElement("div");
    d.className="chip"+(START_OPTS.cpCount===n?" on":"");
    d.textContent=n+" 个";
    d.addEventListener("click",()=>{ START_OPTS.cpCount=n; Sfx.play("click"); buildStartPanel(); });
    pc.appendChild(d);
  });
  const pe=$("paceChips"); pe.innerHTML="";
  PACE_OPTS.forEach(p=>{
    const d=document.createElement("div");
    d.className="chip"+(START_OPTS.pace===p.v?" on":"");
    d.textContent=p.n;
    d.addEventListener("click",()=>{ START_OPTS.pace=p.v; Sfx.play("click"); buildStartPanel(); });
    pe.appendChild(d);
  });
  /* 局外天赋商店 */
  $("coinCount").textContent=Progress.data.coins;
  const metaEl=$("metaChips"); metaEl.innerHTML="";
  META_DEFS.forEach(m=>{
    const lv=Progress.data.meta[m.id]||0;
    const maxed=lv>=m.max, cost=maxed?0:m.cost(lv);
    const afford=Progress.data.coins>=cost;
    const d=document.createElement("div");
    d.className="chip"+(maxed?" on":(afford?"":" dim"));
    d.style.opacity=(maxed||afford)?"1":"0.5";
    d.textContent=m.n+" Lv"+lv+(maxed?"（满）":" → "+cost+"💰");
    d.title=m.d;
    d.addEventListener("click",()=>{
      if(maxed) return;
      if(metaBuy(m.id)){ Sfx.play("buy"); buildStartPanel(); }
      else Sfx.play("click");
    });
    metaEl.appendChild(d);
  });
  /* 设置区：音量 / 震屏 / 伤害数字 */
  const vol=$("volSlider"), shk=$("setShake"), dmg=$("setDmg");
  if(vol&&shk&&dmg){
    vol.value=Math.round(SETT.data.volume*100);
    shk.textContent="震屏："+(SETT.data.shake?"开":"关");
    dmg.textContent="伤害数字："+(SETT.data.dmgNum?"开":"关");
    vol.oninput=()=>{ SETT.data.volume=vol.value/100; SETT.save(); Sfx.setVolume(SETT.data.volume); };
    shk.onclick=()=>{ SETT.data.shake=!SETT.data.shake; SETT.save(); Sfx.play("click"); buildStartPanel(); };
    dmg.onclick=()=>{ SETT.data.dmgNum=!SETT.data.dmgNum; SETT.save(); Sfx.play("click"); buildStartPanel(); };
  }
  const P=Progress.data;
  const bestLines=Object.entries(P.best||{}).map(([k,b])=>{
    const seg=k.split(":"), cid=seg[0], mode=seg[1];
    if(mode==="battle") return cid+" 狩猎：最佳 "+(b.kills||0)+" 杀 / "+(b.wave||0)+" 波";
    return cid+" "+mode+"：最佳 "+((b.distM||0)/1000).toFixed(2)+" km"+
      (b.bestPace?" · 均配速 "+fmtPace(b.bestPace):"");
  });
  $("startRecords").innerHTML=
    "成就 <b>"+P.ach.length+" / "+ACH_DEFS.length+"</b> · 累计里程 <b>"+
    ((P.totalDistM||0)/1000).toFixed(2)+" km</b> · 累计击杀 <b>"+(P.totalKills||0)+
    "</b> · 金币 <b>💰"+(P.coins||0)+"</b>"+
    (bestLines.length?"<br>"+bestLines.join("<br>"):"<br>暂无记录，开跑吧！");
}
function showStart(){ buildStartPanel(); $("startOverlay").style.display="flex"; boot.paused=true; }
function hideStart(){ $("startOverlay").style.display="none"; }
function startFromMenu(){
  hideStart();
  boot.paused=false;
  $("pauseOverlay").style.display="none";
  session.setMode(START_OPTS.mode);
  boot.cpCount=START_OPTS.cpCount;
  boot.targetSpeed=START_OPTS.pace;
  resetRun();
  Sfx.play("click");
}
function togglePause(force){
  if(isStartVisible()||isResultVisible()) return;
  boot.paused = force!==undefined?force:!boot.paused;
  $("pauseOverlay").style.display=boot.paused?"flex":"none";
  Sfx.play("click");
}
function starsText(n){ return "★★★".slice(0,n)+"<i>"+"★★★".slice(0,3-n)+"</i>"; }
function showResult(title){
  Progress.finishRun(session, session.mode==="battle"?BATTLE:null);
  const s=Progress.rateRun(session, session.mode==="battle"?BATTLE:null);
  $("deadTitle").textContent=title;
  $("deadStars").innerHTML=starsText(s);
  /* 战利品瀑布：逐条弹出 */
  const rows=[];
  if(session.mode==="battle"){
    rows.push("💰 金币 +"+(BATTLE.coins||0));
    rows.push("🗺 推进站点 "+BATTLE.wave+" / "+BATTLE.roomsTotal);
    rows.push("🗡 击杀 "+BATTLE.kills+" · 等级 Lv."+BATTLE.level);
    rows.push("🏃 里程 "+(session.recordedDist/1000).toFixed(2)+" km · 用时 "+fmtDur(session.duration));
  } else {
    const pace=session.duration>1?1000*session.duration/Math.max(1,session.recordedDist):0;
    rows.push("🏃 里程 "+(session.recordedDist/1000).toFixed(2)+" km");
    rows.push("⏱ 用时 "+fmtDur(session.duration)+(pace>0?" · 均配速 "+fmtPace(pace):""));
  }
  $("deadStats").innerHTML=rows.map((t,i)=>
    '<div class="lootRow" style="animation-delay:'+(i*0.16+0.15).toFixed(2)+'s">'+t+"</div>").join("");
  $("deadEndless").style.display=(session.mode==="battle")?"":"none";
  $("deadOverlay").style.display="flex";
  boot.paused=true;
}
function hideResult(){
  $("deadOverlay").style.display="none";
  boot.paused=false;
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
  /* 右侧功能键随模式切换：战斗=普攻/技能/冲刺，跑步=自动/冲刺 */
  $("mbFire").style.display=inBattle?"":"none";
  $("mbSkill").style.display=inBattle?"":"none";
  $("mbAuto").style.display=inBattle?"none":"";
  $("mbSkill").textContent=(bt.novaCdS||0)>0?Math.ceil(bt.novaCdS)+"s":"技能";
  $("mbSkill").classList.toggle("cooldown",(bt.novaCdS||0)>0);
  maybeTutorialToast();
  /* GPS/JSON 开发面板：战斗模式默认收起，H 切换 */
  $("pRight").style.display=devPanelsVisible()?"":"none";
  $("pRight").style.opacity=inBattle?"0.85":"1";
  $("battleRows").style.display=inBattle?"":"none";
  $("vCp").parentElement.style.display=inBattle?"none":"";
  $("vCpBar").style.display=inBattle?"none":"";
  if(inBattle){
    $("vWave").textContent=bt.wave+" / "+bt.roomsTotal;
    $("vRoom").textContent=bt.room?(bt.enemies.length+" 只"):"-";
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
