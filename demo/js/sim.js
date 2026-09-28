"use strict";
/* ============================================================
   sim.js —— 配速 / 抖动 / GPS / 跑步会话（与 C# Core 对应）
   ============================================================ */
class PaceController {
  constructor(seed){
    this.rng = new Rng(seed);
    this.minPace = 180;   // 3'00"/km  合法上限速度
    this.maxPace = 540;   // 9'00"/km  合法下限速度
    this.wanderRatio = 0.10;
    this.wanderTau = 25.0;
    this.responseTau = 3.0;
    this._w = 0; this._cur = 0;
  }
  get minSpeed(){ return 1000/this.maxPace; }
  get maxSpeed(){ return 1000/this.minPace; }
  get current(){ return this._cur; }
  reset(){ this._w = 0; this._cur = 0; }
  update(dt, desired){
    if(desired <= 0){ this._cur = 0; return {applied:0, stopped:true}; }
    if(dt <= 0) return {applied:this._cur, stopped:false};

    const decay = Math.exp(-dt/Math.max(1,this.wanderTau));
    const drive = Math.sqrt(Math.max(0, 1-decay*decay));
    this._w = this._w*decay + drive*this.rng.gauss();

    let target = desired * (1 + this._w*this.wanderRatio);
    let cLow=false, cHigh=false;
    if(target < this.minSpeed){ target=this.minSpeed; cLow=true; }
    else if(target > this.maxSpeed){ target=this.maxSpeed; cHigh=true; }

    if(this._cur <= 1e-6){ this._cur = target; }
    else {
      const a = 1-Math.exp(-dt/Math.max(0.1,this.responseTau));
      this._cur += (target-this._cur)*a;
    }
    return {applied:this._cur, stopped:false, clampedLow:cLow, clampedHigh:cHigh};
  }
}

/* Ornstein-Uhlenbeck 过程：时间相关的漂移，避免白噪声被 FFT 识别 */
class JitterNoise {
  constructor(amp, tau, seed){
    this.amp=amp; this.tau=tau; this.rng=new Rng(seed); this._s={x:0,y:0};
  }
  reset(){ this._s={x:0,y:0}; }
  update(dt){
    if(dt<=0) return this._s;
    const decay=Math.exp(-dt/this.tau);
    const drive=this.amp*Math.sqrt(2/this.tau)*Math.sqrt(Math.max(0,1-decay*decay));
    this._s={ x:this._s.x*decay+drive*this.rng.gauss(),
              y:this._s.y*decay+drive*this.rng.gauss() };
    return this._s;
  }
}

class GpsFeed {
  constructor(frame, seed){
    this.frame=frame;
    this.jitter=new JitterNoise(3.0, 12.0, seed^0xA5A5A5A5);
    this.rng=new Rng(seed^0x5A5A5A5A);
    this.pace=new PaceController(seed^0x3C3C3C3C);
    this.reset();
    this.accMin=5.5; this.accMax=12.0; this.accTau=8.0;
    this.altitude=15.0; this.bearingNoise=3.0; this.speedTau=4.0;
  }
  reset(){
    this._lastTrue=null; this._speed=0; this._bearing=0; this._acc=8.0;
    this.seq=0; this.nanos=0; this.jitter.reset(); this.pace.reset();
  }
  build(dt, trueLocal, velocity, wallMs){
    if(dt<0) dt=0;

    let step=0;
    if(this._lastTrue && dt>1e-6) step=V.dist(trueLocal,this._lastTrue);
    const instant = dt>1e-6 ? step/dt : 0;

    if(this._speed<=0 && instant>0) this._speed=instant;
    else { const a = dt<=0?1:1-Math.exp(-dt/Math.max(0.2,this.speedTau));
           this._speed += (instant-this._speed)*a; }
    if(this._speed<0.15) this._speed=0;

    const off = this.jitter.update(dt);
    const reported = { x:trueLocal.x+off.x, y:trueLocal.y+off.y };

    if(this._speed>0.35){
      let dir=V.norm(velocity);
      if(dir.x===0&&dir.y===0 && this._lastTrue) dir=V.norm(V.sub(trueLocal,this._lastTrue));
      if(dir.x!==0||dir.y!==0){
        const tb=(Math.atan2(dir.y,dir.x)*180/Math.PI+360)%360;
        let diff=tb-this._bearing;
        while(diff>180)diff-=360; while(diff<-180)diff+=360;
        const ba = dt<=0?1:1-Math.exp(-dt/2.0);
        this._bearing=((this._bearing+diff*ba)%360+360)%360;
      }
    }

    const aa = dt<=0?1:1-Math.exp(-dt/Math.max(0.5,this.accTau));
    this._acc += (this.rng.range(this.accMin,this.accMax)-this._acc)*aa;

    const geo = this.frame.toGeo(reported);
    this._lastTrue = trueLocal;
    this.nanos += Math.round(dt*1e9);

    const fix = {
      lat: geo.lat, lon: geo.lon, timeMs: wallMs, elapsedRealtimeNanos: this.nanos,
      accuracy: this._acc, speed: this._speed,
      bearing: ((this._bearing + this.rng.range(-this.bearingNoise,this.bearingNoise))%360+360)%360,
      altitude: this.altitude + this.rng.range(-4,4),
      satellites: this.rng.int(7,13), provider:"gps"
    };
    this.seq++;
    return fix;
  }
}

class RunSession {
  constructor(frame, campus, seed){
    this.frame=frame; this.campus=campus; this.rng=new Rng(seed^0x1234567);
    this.feed=new GpsFeed(frame, seed);
    this.route=campus.mainRoute;
    this.fixInterval=1.0;

    this.worldPos={x:0,y:0}; this.velocity={x:0,y:0};
    this.routeDist=0; this.trueDist=0; this.recordedDist=0; this.duration=0;
    this.isRunning=true; this.fixCount=0;
    this.maxAcc=35; this.maxSpeedAccepted=8;
    this.checkpointRadius=80;
    this.checkpoints=[];
    this.lastFix=this.feed.build(0,{x:0,y:0},{x:0,y:0},Date.now());

    this._lastTrueLocal=null; this._lastAccepted=null; this._fixAcc=0;

    /* ---- 玩法状态（c4）---- */
    this.mode="checkpoint";        // checkpoint | tour | free
    this.stamina=100;              // 0..100
    this.sprinting=false;
    this.landmarksFound=[];        // 巡礼模式：已发现地标名
    this.navTarget=null;           // 导航目标（最近未打卡点）
  }

  resetToRouteStart(){
    this.routeDist=0;
    this.worldPos=this.route.pointAt(0);
    this.velocity={x:0,y:0};
    this._resetCounters();
  }
  _resetCounters(){
    this.trueDist=0; this.recordedDist=0; this.duration=0; this.fixCount=0;
    this._lastTrueLocal=null; this._lastAccepted=null; this._fixAcc=0;
    this.feed.reset();
  }
  startRun(){ this.isRunning=true; this.duration=0; this._lastAccepted=null; this.feed.pace.reset(); }

  /* ---- 玩法（c4）：模式 / 体力 / 导航 / 巡礼 ---- */
  setMode(m){
    if(!["checkpoint","tour","free","battle"].includes(m)) throw new Error("bad mode: "+m);
    this.mode=m;
    if(m!=="checkpoint") this.checkpoints=[];
    return this.mode;
  }
  sprintMul(){ return this.sprinting && this.stamina>0 ? 1.55 : 1.0; }
  updateStamina(dt, sprintWanted, moving){
    if(sprintWanted && moving && this.stamina>0){
      this.stamina=Math.max(0, this.stamina-12*dt);
      this.sprinting=true;
    } else {
      this.sprinting=false;
      this.stamina=Math.min(100, this.stamina+7*dt);
    }
    return this.sprinting;
  }
  nearestUncleared(){
    let best=null, bd=Infinity;
    for(const cp of this.checkpoints){
      if(cp.cleared) continue;
      const d=V.dist(this.worldPos, cp.localMeters);
      if(d<bd){ bd=d; best=cp; }
    }
    return best;
  }
  checkLandmarks(){
    let n=0;
    for(const lm of (this.campus.landmarks||[])){
      if(this.landmarksFound.includes(lm.n)) continue;
      if(V.dist(this.worldPos, lm.c)<=lm.r){ this.landmarksFound.push(lm.n); n++; }
    }
    return n;
  }

  spawnCheckpoints(count, radius, minSep, startExclusion){
    const total=this.route.length;
    const lo=startExclusion*total, hi=total*0.98;
    const picked=[]; let guard=0;
    while(picked.length<count && guard<4000){
      guard++;
      const d=this.rng.range(lo,hi);
      if(picked.every(p=>Math.abs(p-d)>=minSep)) picked.push(d);
    }
    picked.sort((a,b)=>a-b);
    this.checkpoints = picked.map((d,i)=>({
      index:i, routeDistance:d, localMeters:this.route.pointAt(d),
      radius:radius, cleared:false
    }));
  }

  updateCheckpoints(fix){
    let n=0;
    for(const cp of this.checkpoints){
      if(cp.cleared) continue;
      const geo=this.frame.toGeo(cp.localMeters);
      if(haversine({lat:fix.lat,lon:fix.lon}, geo) <= cp.radius){ cp.cleared=true; n++; }
    }
    return n;
  }

  tick(dt, wallMs, direction, baseSpeed, sprintWanted){
    if(dt<0) dt=0;
    if(this.isRunning) this.duration += dt;

    const moving=!!direction&&(direction.x!==0||direction.y!==0);
    const sprint=this.updateStamina(dt, !!sprintWanted, moving);
    const eff=baseSpeed*(sprint?1.55:1);

    const ps=this.feed.pace.update(dt, this.isRunning?eff:0);
    const dir=V.norm(direction);
    const speed=(dir.x===0&&dir.y===0)?0:ps.applied;

    this.velocity={x:dir.x*speed, y:dir.y*speed};
    const next=V.add(this.worldPos, V.mul(this.velocity,dt));
    return this._commit(dt, wallMs, next);
  }

  tickAutopilot(dt, wallMs, baseSpeed){
    if(dt<0) dt=0;
    if(this.isRunning) this.duration += dt;

    const ps=this.feed.pace.update(dt, this.isRunning?baseSpeed:0);
    this.routeDist += ps.applied*dt;
    const pos=this.route.pointAt(this.routeDist);
    this.velocity=V.mul(this.route.tangentAt(this.routeDist), ps.applied);
    return this._commit(dt, wallMs, pos);
  }

  _commit(dt, wallMs, nextWorld){
    const nextLocal=nextWorld;

    if(this._lastTrueLocal) this.trueDist += V.dist(nextLocal, this._lastTrueLocal);
    this._lastTrueLocal=nextLocal;
    this.worldPos=nextWorld;

    this._fixAcc += dt;
    if(this.fixCount>0 && this._fixAcc < this.fixInterval) return this.lastFix;

    const fixDt=this._fixAcc; this._fixAcc=0;

    const fix=this.feed.build(fixDt, nextLocal, this.velocity, wallMs);

    if(this.isRunning && fix.accuracy<=this.maxAcc){
      const cur={lat:fix.lat, lon:fix.lon};
      if(!this._lastAccepted){ this._lastAccepted=cur; }
      else {
        const step=haversine(this._lastAccepted,cur);
        const implied = fixDt>1e-6 ? step/fixDt : 999;
        if(implied<=this.maxSpeedAccepted){ this.recordedDist += step; this._lastAccepted=cur; }
      }
    }

    this.updateCheckpoints(fix);
    if(this.mode==="tour") this.checkLandmarks();
    this.navTarget=this.nearestUncleared();
    this.fixCount++;
    this.lastFix=fix;
    return fix;
  }
}
