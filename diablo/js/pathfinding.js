/* =========================================================================
 * pathfinding.js  -  A* over the tile grid for click-to-move.
 * ========================================================================= */
(function (global) {
  "use strict";

  // Binary min-heap keyed by .f
  class Heap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(node) {
      const a = this.items; a.push(node);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.items, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = 2 * i + 2; let s = i;
          if (l < a.length && a[l].f < a[s].f) s = l;
          if (r < a.length && a[r].f < a[s].f) s = r;
          if (s === i) break;
          [a[s], a[i]] = [a[i], a[s]]; i = s;
        }
      }
      return top;
    }
  }

  // isWalkable(x,y) -> bool.  Returns array of {x,y} tile centers, or null.
  function findPath(sx, sy, tx, ty, isWalkable, maxNodes) {
    sx |= 0; sy |= 0; tx |= 0; ty |= 0;
    maxNodes = maxNodes || 4000;
    if (!isWalkable(tx, ty)) return null;
    if (sx === tx && sy === ty) return [];

    const key = (x, y) => x + "," + y;
    const open = new Heap();
    const came = new Map();
    const g = new Map();
    const closed = new Set();

    const h = (x, y) => {
      const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
      // octile distance
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };

    g.set(key(sx, sy), 0);
    open.push({ x: sx, y: sy, f: h(sx, sy) });

    let count = 0;
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];

    while (open.size && count++ < maxNodes) {
      const cur = open.pop();
      const ck = key(cur.x, cur.y);
      if (closed.has(ck)) continue;
      closed.add(ck);

      if (cur.x === tx && cur.y === ty) {
        // reconstruct
        const path = [];
        let k = ck;
        while (k) {
          const [px, py] = k.split(",").map(Number);
          path.push({ x: px + 0.5, y: py + 0.5 });
          k = came.get(k);
        }
        path.reverse();
        path.shift(); // drop the starting tile
        return path;
      }

      const curG = g.get(ck);
      for (const [dx, dy, cost] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!isWalkable(nx, ny)) continue;
        // prevent cutting through diagonal walls
        if (dx !== 0 && dy !== 0) {
          if (!isWalkable(cur.x + dx, cur.y) || !isWalkable(cur.x, cur.y + dy)) continue;
        }
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = curG + cost;
        if (!g.has(nk) || ng < g.get(nk)) {
          g.set(nk, ng);
          came.set(nk, ck);
          open.push({ x: nx, y: ny, f: ng + h(nx, ny) });
        }
      }
    }
    return null; // no path
  }

  global.Pathfinding = { findPath };
})(window);
