"use strict";
/* ============================================================
   battle.js —— 弓箭手大作战式战斗层
   规则：走位时不出箭，停下自动索敌；波次刷怪；击杀得经验，
   升级三选一天赋；体力冲刺仍是走位保命手段；里程照常计入 GPS。
   本文件为纯逻辑（确定性，seed 固定），headless 可测。
   ============================================================ */

const BATTLE = {
  player: null,
  enemies: [],      // {id,type,x,y,hp,maxHp,fireT,dashT,dashVx,dashVy,dashLeft,hitCd,flash,seedSign}
  bullets: [],      // 玩家箭 {x,y,vx,vy,pierce,rico,hits,life}
  ebullets: [],     // 敌方弹 {x,y,vx,vy,dmg,life}
  fx: [],           // {x,y,age,dur,r,color}
  dmgTexts: [],     // 伤害数字 {x,y,vy,age,dur,text,crit}
  drops: [],        // 掉落金币 {x,y,vx,vy,age,val}
  shake: 0,         // 屏幕震动强度（render 读取，主循环衰减）
  hitStop: 0,       // 顿帧计时（>0 时冻结战斗世界）
  dashT: 0, dashVx: 0, dashVy: 0,   // 翻滚：0.22s 锁向位移
  invuln: 0, dashCd: 0,             // 翻滚无敌帧 / 冷却
  wave: 0,          // 当前站点编号（1 起），0=赶路中
  roomsTotal: 0,    // 站点总数
  room: null,       // 当前驻守的打卡点（清空前不再触发新房间）
  kills: 0, exp: 0, level: 1, expNext: 10,
  state: "fighting",   // fighting | levelup | dead
  choices: [],
  session: null,
  rng: null, _nextId: 1,
  fireCd: 0, novaCd: 0, time: 0,
};

const ENEMY_TYPES = {
  chaser:  { hp:22,  speed:2.7, r:6,  dmg:10, exp:3,  color:"#ff6b5a" },
  shooter: { hp:16,  speed:2.0, r:6,  dmg:8,  exp:4,  color:"#ffb84d", fireInterval:2.6, bulletSpeed:9.5 },
  charger: { hp:34,  speed:2.4, r:7,  dmg:14, exp:6,  color:"#e858c8", dashCd:3.4, dashSpeed:13 },
  boss:    { hp:220, speed:2.6, r:12, dmg:20, exp:40, color:"#ff3b30", fireInterval:1.7, bulletSpeed:8.5 },
  wild:    { hp:8,   speed:2.0, r:5,  dmg:6,  exp:2,  color:"#9ad14b" }
};

const BULLET_SPEED = 26;

const SKILLS = [
  { id:"multi",    n:"多重射击", d:"同时射出的箭 +1",        ok:p=>p.arrows<6,        ap:p=>{p.arrows++;} },
  { id:"pierce",   n:"穿透箭",   d:"箭可多穿透 1 名敌人",     ok:p=>p.pierce<3,        ap:p=>{p.pierce++;} },
  { id:"ricochet", n:"弹射",     d:"命中后弹向下一个敌人",    ok:p=>p.ricochet<3,      ap:p=>{p.ricochet++;} },
  { id:"aspd",     n:"疾射",     d:"攻击间隔 -18%",          ok:p=>p.atkInterval>0.18,ap:p=>{p.atkInterval*=0.82;} },
  { id:"atk",      n:"力量",     d:"攻击力 +30%",            ok:()=>true,             ap:p=>{p.atk*=1.3;} },
  { id:"speed",    n:"轻身",     d:"移动速度 +12%",          ok:p=>p.moveMul<1.8,     ap:p=>{p.moveMul*=1.12;} },
  { id:"nova",     n:"环射",     d:"每 4 秒向四周放一圈箭",   ok:p=>p.nova<3,          ap:p=>{p.nova++; if(p.nova===1)p.novaCd=1;} },
  { id:"heal",     n:"回春",     d:"回满生命，生命上限 +20",  ok:()=>true,             ap:p=>{p.maxHp+=20; p.hp=p.maxHp;} },
  { id:"range",    n:"鹰眼",     d:"索敌射程 +25%",          ok:p=>p.range<420,       ap:p=>{p.range*=1.25;} },
];

/* 技能合成（吸血鬼幸存者式）：两系成型后必出合成牌 */
const EVO_DEFS = [
  { id:"evoRain",     n:"★ 箭雨",  d:"多重+穿透融合：箭 +1、穿透 +1",
    ok:p=>!p.evo.rain && p.arrows>=2 && p.pierce>=2,
    ap:p=>{ p.evo.rain=true; p.arrows++; p.pierce++; } },
  { id:"evoFission",  n:"★ 裂变弹", d:"弹射+鹰眼融合：弹射 +1、攻击 ×1.25、射程 +15%",
    ok:p=>!p.evo.fission && p.ricochet>=2 && p.range>=180,
    ap:p=>{ p.evo.fission=true; p.ricochet++; p.atk*=1.25; p.range*=1.15; } }
];

function battleReset(seed, session){
  BATTLE.player = { hp:100, maxHp:100, atk:10, atkInterval:0.55, arrows:1, pierce:0,
                    ricochet:0, moveMul:1, range:150, nova:0, novaCd:0,
                    evo:{rain:false, fission:false} };
  BATTLE.enemies=[]; BATTLE.bullets=[]; BATTLE.ebullets=[]; BATTLE.fx=[];
  BATTLE.dmgTexts=[]; BATTLE.drops=[];
  BATTLE.shake=0; BATTLE.hitStop=0; BATTLE.coins=0;
  BATTLE.dashT=0; BATTLE.dashVx=0; BATTLE.dashVy=0; BATTLE.invuln=0; BATTLE.dashCd=0;
  BATTLE.wave=0; BATTLE.roomsTotal=0; BATTLE.room=null;
  BATTLE.kills=0; BATTLE.exp=0; BATTLE.level=1; BATTLE.expNext=10;
  BATTLE.state="fighting"; BATTLE.choices=[];
  BATTLE.session=session||null;
  if(session) BATTLE.roomsTotal=session.checkpoints.length;
  if(typeof Progress!=="undefined") battleApplyMeta();
  BATTLE._rng2=new Rng((seed===undefined?7:seed)>>>0);   // 独立流：补给/野怪布局，不扰动战斗随机序列
  if(session) battleSpawnSupplies(session);
  if(session) battleSpawnRoamers(session);
  BATTLE.rng=new Rng((seed===undefined?20260924:seed)>>>0);
  BATTLE._nextId=1; BATTLE.fireCd=0; BATTLE.novaCd=0; BATTLE.time=0;
}

/* 局外天赋（store.js META_DEFS）→ 战斗内初始属性 */
function battleApplyMeta(){
  if(typeof Progress==="undefined"||!Progress.data.meta) return;
  const m=Progress.data.meta;
  const p=BATTLE.player;
  p.atk=10*(1+0.08*(m.atk||0));
  p.maxHp=100+12*(m.hp||0); p.hp=p.maxHp;
  p.moveMul=1+0.05*(m.spd||0);
  p.atkInterval=0.55/(1+0.07*(m.aspd||0));
  BATTLE.revives=m.revive||0;
}

/* 赶路补给：主环线上散落金币/医疗包（避开站点圈），磁吸拾取 */
function battleSpawnSupplies(session){
  const route=session.mainRoute||session.route;
  const L=route.length;
  const nearStation=(p)=>session.checkpoints.some(c=>V.dist(p,c.localMeters)<c.radius+25);
  for(let i=0;i<10;i++){
    const p=route.pointAt(BATTLE._rng2.range(L*0.03,L*0.97));
    p.x+=(BATTLE._rng2.next()-0.5)*14; p.y+=(BATTLE._rng2.next()-0.5)*14;
    if(nearStation(p)) continue;
    const med=BATTLE._rng2.next()<0.25;
    BATTLE.drops.push({x:p.x,y:p.y,vx:0,vy:0,age:0,val:med?12:1,kind:med?"med":"coin"});
  }
}

/* 游荡野怪：站点之间的弱怪，靠近 60m 才仇恨；不阻塞清站判定 */
function battleSpawnRoamers(session){
  const route=session.mainRoute||session.route;
  const L=route.length;
  const n=2+Math.floor(BATTLE._rng2.next()*2);
  for(let i=0;i<n;i++){
    const p=route.pointAt(BATTLE._rng2.range(L*0.05,L*0.95));
    p.x+=(BATTLE._rng2.next()-0.5)*40; p.y+=(BATTLE._rng2.next()-0.5)*40;
    BATTLE.enemies.push({ id:BATTLE._nextId++, type:"wild", x:p.x, y:p.y,
      hp:ENEMY_TYPES.wild.hp, maxHp:ENEMY_TYPES.wild.hp,
      fireT:0, dashT:0, dashVx:0, dashVy:0, dashLeft:0, hitCd:0, flash:0, tele:0,
      elite:false, aggro:false, wx:p.x, wy:p.y, wt:BATTLE._rng2.range(1,3), sign:1 });
  }
}

/* 站点出怪：怪物以打卡点为中心驻守；末站为 BOSS 房 */
function battleSpawnRoom(cp){
  const bounds=CAMPUS.bounds, inset=30;
  const cx=cp.localMeters.x, cy=cp.localMeters.y;
  const clamp=(p)=>{
    p.x=Math.max(bounds.minX+inset,Math.min(bounds.maxX-inset,p.x));
    p.y=Math.max(bounds.minY+inset,Math.min(bounds.maxY-inset,p.y));
    return p;
  };
  const ringPos=()=>{
    const a=BATTLE.rng.next()*Math.PI*2;
    const d=18+BATTLE.rng.next()*26;
    return clamp({x:cx+Math.cos(a)*d, y:cy+Math.sin(a)*d});
  };
  const push=(type)=>{
    const t=ENEMY_TYPES[type];
    const p=ringPos();
    const elite=type!=="boss" && cp.index>=2 && BATTLE.rng.next()<0.18;
    const mul=elite?1.8:1;
    BATTLE.enemies.push({ id:BATTLE._nextId++, type, x:p.x, y:p.y,
      hp:Math.round(t.hp*mul), maxHp:Math.round(t.hp*mul),
      fireT:t.fireInterval?BATTLE.rng.range(0.5,t.fireInterval):0,
      dashT:t.dashCd?BATTLE.rng.range(1,t.dashCd):0, dashVx:0, dashVy:0, dashLeft:0,
      hitCd:0, flash:0, tele:0, elite, sign:BATTLE.rng.next()<0.5?-1:1 });
  };
  const i=cp.index, isBossRoom=(i===BATTLE.roomsTotal-1);
  if(isBossRoom){ push("boss"); push("chaser"); push("chaser"); push("shooter"); }
  else {
    const ch=2+Math.ceil((i+1)/2), sh=i>=1?Math.floor((i+1)/2):0, cg=i>=2?1+(i>=4?1:0):0;
    for(let k=0;k<ch;k++) push("chaser");
    for(let k=0;k<sh;k++) push("shooter");
    for(let k=0;k<cg;k++) push("charger");
  }
  BATTLE.fx.push({x:cx,y:cy,age:0,dur:0.8,r:cp.radius*0.7,color:"#ff6b5a"});
}

function battleFireAt(target){
  const p=BATTLE.player;
  const base=Math.atan2(target.y-BATTLE._py, target.x-BATTLE._px);
  const N=p.arrows, spread=0.14;
  for(let i=0;i<N;i++){
    const a=base+(i-(N-1)/2)*spread;
    BATTLE.bullets.push({ x:BATTLE._px, y:BATTLE._py, vx:Math.cos(a)*BULLET_SPEED,
      vy:Math.sin(a)*BULLET_SPEED, pierce:p.pierce, rico:p.ricochet, hits:[], life:2.4 });
  }
  BATTLE.fireCd=p.atkInterval;
}

function battleHurtPlayer(dmg){
  if((BATTLE.invuln||0)>0) return;   // 翻滚无敌帧
  const p=BATTLE.player;
  p.hp-=dmg;
  BATTLE.shake=Math.min(1,(BATTLE.shake||0)+0.38);
  BATTLE.fx.push({x:BATTLE._px,y:BATTLE._py,age:0,dur:0.35,r:16,color:"#ff6b5a"});
  if(p.hp<=0){
    if(BATTLE.revives>0){                       // 局外天赋「不屈」
      BATTLE.revives--;
      p.hp=Math.round(p.maxHp*0.6);
      BATTLE.fx.push({x:BATTLE._px,y:BATTLE._py,age:0,dur:0.9,r:60,color:"#f9c63a"});
      if(typeof Progress!=="undefined"&&Progress.onToast) Progress.onToast("✨ 不屈发动！","ach");
      return;
    }
    p.hp=0; BATTLE.state="dead";
  }
}

function battleKill(e){
  const t=ENEMY_TYPES[e.type];
  BATTLE.kills++;
  const ex=e.elite?t.exp*2:t.exp;
  BATTLE.exp+=ex;
  BATTLE.shake=Math.min(1,(BATTLE.shake||0)+0.10);
  BATTLE.hitStop=Math.min(0.09,(BATTLE.hitStop||0)+0.045);   // 击杀顿帧
  BATTLE.fx.push({x:e.x,y:e.y,age:0,dur:0.5,r:t.r*2.2,color:t.color});
  /* 掉金币（磁吸拾取）：BOSS 10、精英 5、普通 1 */
  const n=e.type==="boss"?10:(e.elite?5:1);
  for(let i=0;i<n&&BATTLE.drops.length<80;i++){
    const a=BATTLE.rng.next()*Math.PI*2;
    BATTLE.drops.push({x:e.x,y:e.y,vx:Math.cos(a)*7,vy:Math.sin(a)*7,age:0,val:1});
  }
}

function battleTryLevelUp(){
  while(BATTLE.exp>=BATTLE.expNext && BATTLE.state==="fighting"){
    BATTLE.exp-=BATTLE.expNext;
    BATTLE.level++;
    BATTLE.expNext=Math.round(BATTLE.expNext*1.45+2);
    BATTLE.state="levelup";
    battleRollChoices();
  }
}

function battleRollChoices(){
  const p=BATTLE.player;
  const evos=EVO_DEFS.filter(s=>s.ok(p));                 // 合成牌优先必出
  const pool=SKILLS.filter(s=>s.ok(p));
  for(let i=pool.length-1;i>0;i--){
    const j=Math.floor(BATTLE.rng.next()*(i+1));
    const t=pool[i]; pool[i]=pool[j]; pool[j]=t;
  }
  BATTLE.choices=evos.concat(pool.slice(0,3-evos.length));
  while(BATTLE.choices.length<3) BATTLE.choices.push(SKILLS.find(s=>s.id==="heal"));
}

function applySkill(i){
  if(BATTLE.state!=="levelup") return false;
  const s=BATTLE.choices[i];
  if(!s) return false;
  s.ap(BATTLE.player);
  BATTLE.fx.push({x:BATTLE._px,y:BATTLE._py,age:0,dur:0.6,r:30,color:"#f9c63a"});
  BATTLE.state="fighting";
  battleTryLevelUp();          // 经验溢出时连续升级
  return true;
}

/* 翻滚（Gungeon/Hades 式）：0.22s 锁向位移 + 0.3s 无敌帧，冷却 1.6s */
function battleDash(dx, dy){
  if(BATTLE.state!=="fighting") return;
  if((BATTLE.dashCd||0)>0 || (BATTLE.dashT||0)>0) return;
  const l=Math.hypot(dx,dy);
  if(l<1e-6) return;
  BATTLE.dashT=0.22;
  BATTLE.dashVx=dx/l*9.4; BATTLE.dashVy=dy/l*9.4;
  BATTLE.invuln=0.30; BATTLE.dashCd=1.6;
  if(typeof Sfx!=="undefined") Sfx.play("dash");
}

/* 特效/伤害数字老化 */
function battleAgeFx(dt){
  for(let i=BATTLE.fx.length-1;i>=0;i--){
    BATTLE.fx[i].age+=dt;
    if(BATTLE.fx[i].age>=BATTLE.fx[i].dur) BATTLE.fx.splice(i,1);
  }
  for(let i=BATTLE.dmgTexts.length-1;i>=0;i--){
    const t=BATTLE.dmgTexts[i];
    t.age+=dt; t.y+=t.vy*dt; t.vy*=Math.exp(-2.5*dt);
    if(t.age>=t.dur) BATTLE.dmgTexts.splice(i,1);
  }
}

/* 主步进：playerPos=玩家世界坐标，moving=是否在移动（移动时不出箭） */
function battleTick(dt, playerPos, moving){
  if(BATTLE.state!=="fighting" || dt<=0) return;
  /* 顿帧：命中/击杀瞬间冻结战斗世界，只老化特效 */
  if((BATTLE.hitStop||0)>0){
    BATTLE.hitStop-=dt;
    battleAgeFx(dt);
    return;
  }
  const p=BATTLE.player;
  BATTLE.time+=dt;
  BATTLE._px=playerPos.x; BATTLE._py=playerPos.y;

  /* 翻滚：锁向位移直接推移玩家（单步 <8m，GPS 合法） */
  if((BATTLE.dashT||0)>0){
    BATTLE.dashT-=dt;
    playerPos.x+=BATTLE.dashVx*dt;
    playerPos.y+=BATTLE.dashVy*dt;
    BATTLE._px=playerPos.x; BATTLE._py=playerPos.y;
    if(Math.floor(BATTLE.time*22)%2===0)
      BATTLE.fx.push({x:playerPos.x,y:playerPos.y,age:0,dur:0.28,r:9,color:"#7fd6ff"});
  }
  BATTLE.invuln=Math.max(0,(BATTLE.invuln||0)-dt);
  BATTLE.dashCd=Math.max(0,(BATTLE.dashCd||0)-dt);

  /* 站点触发：进入任一未清站点 → 守怪现身；清空本站 → 自动打卡 */
  const s=BATTLE.session;
  if(!BATTLE.room && s && s.mode==="battle" && s.checkpoints.length>0){
    const next=s.checkpoints.find(c=>!c.cleared &&
      V.dist(playerPos,c.localMeters) <= c.radius+10);
    if(next){
      BATTLE.room=next;
      BATTLE.wave=next.index+1;
      battleSpawnRoom(next);
    }
  }

  /* 停下自动索敌 */
  BATTLE.fireCd-=dt;
  if(!moving && BATTLE.fireCd<=0){
    let best=null, bd=p.range;
    for(const e of BATTLE.enemies){
      const d=V.dist(playerPos,e);
      if(d<bd){ bd=d; best=e; }
    }
    if(best) battleFireAt(best);
  }

  /* 环射 */
  if(p.nova>0){
    BATTLE.novaCd-=dt;
    if(BATTLE.novaCd<=0){
      BATTLE.novaCd=4;
      const N=8+p.nova*4;
      for(let i=0;i<N;i++){
        const a=i/N*Math.PI*2;
        BATTLE.bullets.push({x:BATTLE._px,y:BATTLE._py,vx:Math.cos(a)*BULLET_SPEED*0.8,
          vy:Math.sin(a)*BULLET_SPEED*0.8,pierce:p.pierce,rico:0,hits:[],life:1.6});
      }
    }
  }

  /* 玩家箭 */
  for(let bi=BATTLE.bullets.length-1;bi>=0;bi--){
    const b=BATTLE.bullets[bi];
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    let dead=b.life<=0;
    if(!dead){
      for(const e of BATTLE.enemies){
        if(b.hits.includes(e.id)) continue;            // 同一枚箭不重复命中
        const t=ENEMY_TYPES[e.type];
        if(V.dist(b,{x:e.x,y:e.y}) < t.r+3.5){
          const crit=BATTLE.rng.next()<0.12;
          const dmg=Math.round(p.atk*(crit?2:1));
          e.hp-=dmg; b.hits.push(e.id); e.flash=0.15;
          if(e.type==="wild") e.aggro=true;                 /* 打野怪也会拉仇恨 */
          /* 击退（沿箭向冲量）+ 伤害数字 + 轻顿帧 */
          e.kbx=(e.kbx||0)+b.vx/BULLET_SPEED*4.2;
          e.kby=(e.kby||0)+b.vy/BULLET_SPEED*4.2;
          if((typeof SETT==="undefined"||SETT.data.dmgNum))
            BATTLE.dmgTexts.push({x:e.x+(BATTLE.rng.next()-0.5)*4, y:e.y-t.r-2,
                                  vy:-26, age:0, dur:0.7, text:dmg, crit});          BATTLE.hitStop=Math.min(0.08,(BATTLE.hitStop||0)+0.016);
          BATTLE.fx.push({x:e.x,y:e.y,age:0,dur:0.25,r:t.r,color:"#fff"});
          if(e.hp<=0) battleKill(e);
          if(b.pierce>0){ b.pierce--; }
          else if(b.rico>0){
            b.rico--;
            let best=null,bd=90;
            for(const o of BATTLE.enemies){
              if(o.hp<=0||b.hits.includes(o.id)) continue;
              const d=V.dist(b,o);
              if(d<bd){ bd=d; best=o; }
            }
            if(best){
              const a=Math.atan2(best.y-b.y,best.x-b.x);
              b.vx=Math.cos(a)*BULLET_SPEED; b.vy=Math.sin(a)*BULLET_SPEED;
            } else dead=true;
          }
          else dead=true;
          break;
        }
      }
    }
    if(dead) BATTLE.bullets.splice(bi,1);
  }
  BATTLE.enemies=BATTLE.enemies.filter(e=>e.hp>0);

  /* 本站清空（野怪不算守怪）→ 打卡 + 通关经验；末站清空 → 通关胜利 */
  if(BATTLE.room && !BATTLE.enemies.some(e=>e.type!=="wild")){
    BATTLE.room.cleared=true;
    BATTLE.exp+=8;
    BATTLE.coins+=6;
    BATTLE.fx.push({x:BATTLE.room.localMeters.x,y:BATTLE.room.localMeters.y,age:0,dur:0.9,
                    r:BATTLE.room.radius,color:"#f9c63a"});
    BATTLE.room=null;
    if(BATTLE.session && !BATTLE.session.checkpoints.some(c=>!c.cleared)){
      BATTLE.victory=true;
      BATTLE.coins+=50;                                  // 通关奖励
      BATTLE.state="victory";
      BATTLE.fx.push({x:BATTLE._px,y:BATTLE._py,age:0,dur:1.4,r:120,color:"#ffd23f"});
      for(let i=0;i<24&&BATTLE.drops.length<80;i++){     // 金币喷泉
        const a=i/24*Math.PI*2;
        BATTLE.drops.push({x:BATTLE._px,y:BATTLE._py,vx:Math.cos(a)*9,vy:Math.sin(a)*9,age:0,val:2});
      }
      return;
    }
    battleTryLevelUp();
  }

  /* 敌人行为 */
  for(const e of BATTLE.enemies){
    const t=ENEMY_TYPES[e.type];
    e.flash=Math.max(0,e.flash-dt);
    const dx=BATTLE._px-e.x, dy=BATTLE._py-e.y, d=Math.hypot(dx,dy)||1;
    let vx=0, vy=0;
    if(e.type==="chaser"){
      vx=dx/d*t.speed; vy=dy/d*t.speed;
      const sway=Math.sin(BATTLE.time*2.4+e.id*1.7)*1.15;   /* 正弦侧摆，拒绝直线冲脸 */
      vx+=-dy/d*sway; vy+=dx/d*sway;
    }
    else if(e.type==="wild"){
      if(!e.aggro && d<60) e.aggro=true;                    /* 靠近才仇恨 */
      if(e.aggro){ vx=dx/d*t.speed; vy=dy/d*t.speed; }
      else {
        /* 游荡：周期性换漫游点（独立 rng 流） */
        e.wt=(e.wt===undefined?2:e.wt)-dt;
        if(e.wt<=0 || V.dist(e,{x:e.wx,y:e.wy})<3){
          const na=(BATTLE.rng2?BATTLE.rng2.next():0.5)*Math.PI*2;
          e.wx=BATTLE._px+(Math.cos(na)-0.3)*60; e.wy=BATTLE._py+(Math.sin(na)-0.3)*60;
          e.wt=2+(BATTLE.rng2?BATTLE.rng2.next():0.5)*2;
        }
        const wd=V.dist(e,{x:e.wx,y:e.wy})||1;
        vx=(e.wx-e.x)/wd*1.2; vy=(e.wy-e.y)/wd*1.2;
      }
    }
    else if(e.type==="shooter"){
      if(d>85){ vx=dx/d*t.speed; vy=dy/d*t.speed; }
      else if(d<55){ vx=-dx/d*t.speed; vy=-dy/d*t.speed; }
      else { vx=-dy/d*t.speed*e.sign; vy=dx/d*t.speed*e.sign; }
      e.fireT-=dt;
      if(e.fireT<=0 && d<130){
        e.fireT=t.fireInterval;
        BATTLE.ebullets.push({x:e.x,y:e.y,vx:dx/d*t.bulletSpeed,vy:dy/d*t.bulletSpeed,
          dmg:t.dmg,life:4});
      }
    }
    else if(e.type==="charger"){
      if(e.dashLeft>0){ e.dashLeft-=dt; vx=e.dashVx; vy=e.dashVy; }
      else if((e.tele||0)>0){
        e.tele-=dt;                                          /* 蓄力：定身，方向已锁定 */
        if(e.tele<=0){ e.dashLeft=1.0; }
      }
      else {
        e.dashT-=dt;
        if(e.dashT<=0 && d<85){
          e.dashT=t.dashCd+BATTLE.rng.range(0,1);
          e.tele=0.55;                                       /* 预警 0.55s，方向锁定可躲避 */
          e.dashVx=dx/d*t.dashSpeed; e.dashVy=dy/d*t.dashSpeed;
        }
        else { vx=dx/d*t.speed; vy=dy/d*t.speed; }
      }
    }
    else if(e.type==="boss"){
      vx=dx/d*t.speed; vy=dy/d*t.speed;
      e.fireT-=dt;
      if(e.fireT<=0){
        e.phase=(e.phase||0)+1;
        e.fireT=t.fireInterval;
        if(e.phase%2===1){
          /* 弹幕一：环形 10 连 */
          for(let i=0;i<10;i++){
            const a=i/10*Math.PI*2+BATTLE.time;
            BATTLE.ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*t.bulletSpeed,
              vy:Math.sin(a)*t.bulletSpeed,dmg:t.dmg,life:4});
          }
        } else {
          /* 弹幕二：瞄准扇形 5 连 */
          const base=Math.atan2(dy,dx);
          for(let i=-2;i<=2;i++){
            const a=base+i*0.26;
            BATTLE.ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*t.bulletSpeed*1.18,
              vy:Math.sin(a)*t.bulletSpeed*1.18,dmg:t.dmg,life:4});
          }
        }
      }
    }
    e.x+=vx*dt; e.y+=vy*dt;
    /* 受击击退冲量衰减 */
    e.x+=(e.kbx||0)*dt; e.y+=(e.kby||0)*dt;
    const kd=Math.exp(-9*dt);
    e.kbx=(e.kbx||0)*kd; e.kby=(e.kby||0)*kd;
    e.hitCd-=dt;
    if(d < t.r+5 && e.hitCd<=0){ e.hitCd=0.9; battleHurtPlayer(t.dmg); }
  }

  /* 金币掉落：磁吸拾取 */
  for(let i=BATTLE.drops.length-1;i>=0;i--){
    const d=BATTLE.drops[i];
    d.age+=dt;
    const dx=BATTLE._px-d.x, dy=BATTLE._py-d.y, dist=Math.hypot(dx,dy)||1;
    if(dist<34){ d.vx+=dx/dist*70*dt; d.vy+=dy/dist*70*dt; }
    else { d.vx*=Math.exp(-4*dt); d.vy*=Math.exp(-4*dt); }
    d.x+=d.vx*dt; d.y+=d.vy*dt;
    if(dist<5){
      if(d.kind==="med"){
        BATTLE.player.hp=Math.min(BATTLE.player.maxHp,BATTLE.player.hp+12);
        if(typeof Sfx!=="undefined") Sfx.play("heal");
        BATTLE.fx.push({x:BATTLE._px,y:BATTLE._py,age:0,dur:0.4,r:14,color:"#71e88a"});
      } else {
        BATTLE.coins+=d.val;
        if(typeof Sfx!=="undefined") Sfx.play("coin");
      }
      BATTLE.drops.splice(i,1);
    } else if(d.age>25) BATTLE.drops.splice(i,1);
  }

  /* 敌方弹 */
  for(let i=BATTLE.ebullets.length-1;i>=0;i--){
    const b=BATTLE.ebullets[i];
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    let dead=b.life<=0;
    if(!dead && V.dist(b,playerPos)<5){ battleHurtPlayer(b.dmg); dead=true; }
    if(dead) BATTLE.ebullets.splice(i,1);
  }

  battleAgeFx(dt);
  battleTryLevelUp();
}
