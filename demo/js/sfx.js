"use strict";
/* ============================================================
   sfx.js —— WebAudio 合成音效（无素材；默认低音量，M 键静音）
   headless 沙箱无 AudioContext，全部静默降级。
   ============================================================ */

const Sfx = (() => {
  let actx = null, master = null;
  let muted = Store.read("muted", false);

  function ensure() {
    if (actx || muted) return actx;
    try {
      const AC = typeof AudioContext !== "undefined" ? AudioContext
        : (typeof webkitAudioContext !== "undefined" ? webkitAudioContext : null);
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.18;
      master.connect(actx.destination);
    } catch (e) { actx = null; }
    return actx;
  }
  function beep(freq, dur, type, delay, vol) {
    const c = ensure();
    if (!c || muted) return;
    try {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      const t0 = c.currentTime + (delay || 0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) {}
  }
  return {
    unlock() { ensure(); },          // 首次用户手势时调用（浏览器自动播放策略）
    play(name) {
      switch (name) {
        case "checkpoint": beep(660, .12, "triangle"); beep(880, .16, "triangle", .09); break;
        case "ach":        [523, 659, 784, 1047].forEach((f, i) => beep(f, .14, "triangle", i * .09)); break;
        case "record":     beep(784, .10, "sine"); beep(988, .15, "sine", .10); break;
        case "levelup":    [440, 554, 659, 880].forEach((f, i) => beep(f, .12, "square", i * .08, .28)); break;
        case "shoot":      beep(200, .05, "square", 0, .12); break;
        case "coin":       beep(988, .05, "triangle", 0, .22); beep(1319, .07, "triangle", .05, .18); break;
        case "buy":        beep(523, .07, "triangle", 0, .3); beep(784, .1, "triangle", .07, .3); break;
        case "hurt":       beep(110, .09, "sawtooth", 0, .28); break;
        case "death":      [300, 220, 150].forEach((f, i) => beep(f, .20, "sawtooth", i * .13, .32)); break;
        case "click":      beep(880, .04, "sine", 0, .18); break;
      }
    },
    get muted() { return muted; },
    toggle() { muted = !muted; Store.write("muted", muted); if (!muted) ensure(); return muted; }
  };
})();
