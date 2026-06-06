/* =========================================================================
 * util.js  -  Shared helpers: RNG, math, color, simple event/timer helpers
 * ========================================================================= */
(function (global) {
  "use strict";

  // ---- Seedable RNG (mulberry32) so dungeons are reproducible if desired ---
  function makeRNG(seed) {
    let a = seed >>> 0;
    const fn = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.int = (min, max) => Math.floor(fn() * (max - min + 1)) + min;   // inclusive
    fn.range = (min, max) => fn() * (max - min) + min;
    fn.pick = (arr) => arr[Math.floor(fn() * arr.length)];
    fn.chance = (p) => fn() < p;
    fn.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(fn() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    return fn;
  }

  const Util = {
    makeRNG,
    clamp: (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    dist2: (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
    angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    now: () => performance.now(),

    // approach a value toward a target by a max step
    approach: (cur, target, step) => {
      if (cur < target) return Math.min(cur + step, target);
      if (cur > target) return Math.max(cur - step, target);
      return target;
    },

    // light/darken a hex color by amt (-1..1)
    shade: (hex, amt) => {
      const c = hex.replace('#', '');
      let r = parseInt(c.substring(0, 2), 16);
      let g = parseInt(c.substring(2, 4), 16);
      let b = parseInt(c.substring(4, 6), 16);
      const f = (x) => Util.clamp(Math.round(x + 255 * amt), 0, 255);
      r = f(r); g = f(g); b = f(b);
      return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    },

    rgba: (hex, a) => {
      const c = hex.replace('#', '');
      const r = parseInt(c.substring(0, 2), 16);
      const g = parseInt(c.substring(2, 4), 16);
      const b = parseInt(c.substring(4, 6), 16);
      return `rgba(${r},${g},${b},${a})`;
    },

    // shared global RNG (re-seeded per dungeon level)
    rng: makeRNG((Math.random() * 1e9) | 0),
  };

  global.Util = Util;
})(window);
