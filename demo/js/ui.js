"use strict";
/* ============================================================
   ui.js —— HUD 文案 / 格式化
   ============================================================ */
const $=id=>document.getElementById(id);

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

  $("vMode").textContent = boot.autopilot?"自动驾驶中":"手动模式";
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
