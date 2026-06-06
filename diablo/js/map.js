/* =========================================================================
 * map.js  -  Tile map, town layout, and procedural dungeon generation.
 * ========================================================================= */
(function (global) {
  "use strict";

  // Tile types -------------------------------------------------------------
  const T = {
    VOID:   0,  // empty / abyss (blocked, not drawn as floor)
    GRASS:  1,
    DIRT:   2,
    COBBLE: 3,  // town road
    FLOOR:  4,  // dungeon stone floor
    FLOOR2: 5,  // dungeon stone floor variant
    WALL:   6,  // raised blocking wall
    WATER:  7,  // blocked
    LAVA:   8,  // blocked, damages
    GRATE:  9,  // walkable decorative
  };

  // Per-tile visual + gameplay metadata
  const TILE_DEF = {
    [T.VOID]:   { walk: false, col: "#0a0b10", floor: false },
    [T.GRASS]:  { walk: true,  col: "#2f5d34", floor: true,  jitter: 0.06 },
    [T.DIRT]:   { walk: true,  col: "#5a4632", floor: true,  jitter: 0.05 },
    [T.COBBLE]: { walk: true,  col: "#6b6b73", floor: true,  jitter: 0.05 },
    [T.FLOOR]:  { walk: true,  col: "#3a3340", floor: true,  jitter: 0.06 },
    [T.FLOOR2]: { walk: true,  col: "#332e3a", floor: true,  jitter: 0.06 },
    [T.WALL]:   { walk: false, col: "#4a4450", floor: false, wall: true },
    [T.WATER]:  { walk: false, col: "#1d3b66", floor: true,  liquid: true },
    [T.LAVA]:   { walk: false, col: "#7a1d10", floor: true,  liquid: true, hot: true },
    [T.GRATE]:  { walk: true,  col: "#2a2730", floor: true },
  };

  class TileMap {
    constructor(w, h, fill) {
      this.w = w; this.h = h;
      this.tiles = new Uint8Array(w * h).fill(fill === undefined ? T.VOID : fill);
      this.props = [];        // {x,y,type,...} decorative / interactive objects
      this.spawns = [];       // monster spawn hints {x,y,r,count}
      this.exits = [];        // {x,y,type:'down'|'up'|'town', label}
      this.entry = { x: w / 2, y: h / 2 };
      this.kind = "dungeon";  // 'town' | 'dungeon'
      this.name = "Dungeon";
      this.tint = "#000000";  // ambient tint overlay
      this.ambient = 0;       // ambient darkness 0..1
    }

    inB(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    get(x, y) { return this.inB(x, y) ? this.tiles[y * this.w + x] : T.VOID; }
    set(x, y, t) { if (this.inB(x, y)) this.tiles[y * this.w + x] = t; }

    def(x, y) { return TILE_DEF[this.get(x, y)]; }

    isWall(x, y) { const d = TILE_DEF[this.get(x, y)]; return !!(d && d.wall); }

    isWalkable(x, y) {
      if (!this.inB(x, y)) return false;
      const d = TILE_DEF[this.get(x, y)];
      if (!d || !d.walk) return false;
      // blocking props
      const p = this.propAt(x, y);
      if (p && p.blocks) return false;
      return true;
    }

    propAt(x, y) {
      x |= 0; y |= 0;
      for (const p of this.props) if ((p.x | 0) === x && (p.y | 0) === y) return p;
      return null;
    }

    rect(x0, y0, w, h, t) {
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) this.set(x, y, t);
    }

    border(x0, y0, w, h, t) {
      for (let x = x0; x < x0 + w; x++) { this.set(x, y0, t); this.set(x, y0 + h - 1, t); }
      for (let y = y0; y < y0 + h; y++) { this.set(x0, y, t); this.set(x0 + w - 1, y, t); }
    }
  }

  // ---- Town ---------------------------------------------------------------
  function buildTown() {
    const W = 40, H = 40;
    const m = new TileMap(W, H, T.VOID);
    m.kind = "town"; m.name = "Tristram"; m.ambient = 0.18; m.tint = "#10141f";

    // grassy field
    m.rect(2, 2, W - 4, H - 4, T.GRASS);
    // scatter dirt patches
    for (let i = 0; i < 60; i++) {
      const x = Util.rng.int(3, W - 4), y = Util.rng.int(3, H - 4);
      m.set(x, y, T.DIRT);
    }
    // central cobble plaza & roads
    m.rect(16, 16, 8, 8, T.COBBLE);
    m.rect(19, 4, 2, 32, T.COBBLE);
    m.rect(4, 19, 32, 2, T.COBBLE);

    // a few buildings (wall rectangles with a doorway)
    const houses = [[6, 6, 6, 5], [28, 7, 6, 6], [7, 27, 7, 6], [27, 27, 6, 6]];
    for (const [hx, hy, hw, hh] of houses) {
      m.border(hx, hy, hw, hh, T.WALL);
      m.rect(hx + 1, hy + 1, hw - 2, hh - 2, T.COBBLE);
      // doorway facing plaza
      m.set(hx + (hw >> 1), hy + hh - 1, T.COBBLE);
    }

    // decorative props: torches at plaza corners, a fountain, barrels, trees
    addProp(m, 16.5, 16.5, "torch");
    addProp(m, 23.5, 16.5, "torch");
    addProp(m, 16.5, 23.5, "torch");
    addProp(m, 23.5, 23.5, "torch");
    addProp(m, 20, 20, "fountain", { blocks: true });

    // trees around the edge
    for (let i = 0; i < 26; i++) {
      let x, y, tries = 0;
      do { x = Util.rng.int(3, W - 4); y = Util.rng.int(3, H - 4); tries++; }
      while ((m.get(x, y) !== T.GRASS || nearCenter(x, y, W, H, 7)) && tries < 50);
      if (tries < 50) addProp(m, x + 0.5, y + 0.5, "tree", { blocks: true });
    }
    // a few barrels near houses
    addProp(m, 12, 9, "barrel", { blocks: true, breakable: true });
    addProp(m, 33, 11, "barrel", { blocks: true, breakable: true });
    addProp(m, 9, 31, "crate", { blocks: true, breakable: true });

    // friendly NPC (the town elder)
    addProp(m, 20, 14, "npc", { blocks: true, npc: true,
      name: "Deckard", line: "Stay a while and listen... darkness stirs below. Take the stairs east." });

    // stairs DOWN to dungeon, on the cobble plaza east side
    m.set(26, 20, T.COBBLE);
    m.exits.push({ x: 26.5, y: 20.5, type: "down", label: "Descend to the Catacombs" });
    addProp(m, 26.5, 20.5, "stairs_down");

    m.entry = { x: 20.5, y: 22.5 };
    return m;
  }

  function nearCenter(x, y, W, H, r) {
    return Math.abs(x - W / 2) < r && Math.abs(y - H / 2) < r;
  }

  // ---- Dungeon (rooms + corridors) ---------------------------------------
  function buildDungeon(level, seed) {
    Util.rng = Util.makeRNG(seed >>> 0);
    const W = 56 + level * 4, H = 56 + level * 4;
    const m = new TileMap(W, H, T.WALL);
    m.kind = "dungeon";
    m.name = level >= 6 ? "The Inner Sanctum" : "The Catacombs — Level " + level;
    m.level = level;
    m.ambient = Math.min(0.55, 0.30 + level * 0.04);
    m.tint = "#0a0810";

    const rooms = [];
    const tryRooms = 16 + level * 2;
    for (let i = 0; i < tryRooms; i++) {
      const rw = Util.rng.int(6, 11), rh = Util.rng.int(6, 11);
      const rx = Util.rng.int(2, W - rw - 2), ry = Util.rng.int(2, H - rh - 2);
      const room = { x: rx, y: ry, w: rw, h: rh, cx: (rx + rw / 2) | 0, cy: (ry + rh / 2) | 0 };
      // reject heavy overlaps
      let ok = true;
      for (const o of rooms) {
        if (rx < o.x + o.w + 2 && rx + rw + 2 > o.x && ry < o.y + o.h + 2 && ry + rh + 2 > o.y) { ok = false; break; }
      }
      if (!ok) continue;
      rooms.push(room);
      const ft = Util.rng.chance(0.5) ? T.FLOOR : T.FLOOR2;
      m.rect(rx, ry, rw, rh, ft);
      // sprinkle floor variant
      for (let k = 0; k < (rw * rh) / 8; k++)
        m.set(rx + Util.rng.int(0, rw - 1), ry + Util.rng.int(0, rh - 1),
          Util.rng.chance(0.5) ? T.FLOOR : T.FLOOR2);
    }

    if (rooms.length < 2) return buildDungeon(level, seed + 1);

    // connect rooms in sequence with L-corridors (carve floors)
    rooms.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
    for (let i = 1; i < rooms.length; i++) {
      const a = rooms[i - 1], b = rooms[i];
      carveH(m, a.cx, b.cx, a.cy);
      carveV(m, a.cy, b.cy, b.cx);
      // a couple of extra random links for loops
      if (Util.rng.chance(0.25) && i >= 2) {
        const c = rooms[Util.rng.int(0, i - 1)];
        carveH(m, c.cx, b.cx, b.cy); carveV(m, c.cy, b.cy, c.cx);
      }
    }

    // decorate rooms: torches on walls, barrels, occasional water/lava pools
    for (let ri = 0; ri < rooms.length; ri++) {
      const r = rooms[ri];
      // torches at the corners (placed on floor adjacent to wall)
      if (Util.rng.chance(0.85)) addProp(m, r.x + 1.5, r.y + 1.5, "torch");
      if (Util.rng.chance(0.85)) addProp(m, r.x + r.w - 1.5, r.y + r.h - 1.5, "torch");
      // barrels / crates
      const nb = Util.rng.int(0, 3);
      for (let k = 0; k < nb; k++) {
        const bx = r.x + Util.rng.int(1, r.w - 2) + 0.5;
        const by = r.y + Util.rng.int(1, r.h - 2) + 0.5;
        if (m.isWalkable(bx | 0, by | 0) && !m.propAt(bx, by))
          addProp(m, bx, by, Util.rng.chance(0.5) ? "barrel" : "crate",
            { blocks: true, breakable: true });
      }
      // hazard pool occasionally (avoid first room)
      if (ri > 0 && Util.rng.chance(level >= 3 ? 0.30 : 0.15)) {
        const haz = (level >= 4 && Util.rng.chance(0.5)) ? T.LAVA : T.WATER;
        const px = r.x + Util.rng.int(1, r.w - 3), py = r.y + Util.rng.int(1, r.h - 3);
        m.rect(px, py, 2, 2, haz);
      }
    }

    // entry = first room; up-stairs there
    const first = rooms[0];
    m.entry = { x: first.cx + 0.5, y: first.cy + 0.5 };
    m.exits.push({ x: first.cx + 0.5, y: first.cy - 0.5 < 1 ? first.cy + 0.5 : first.cx + 0.5,
      type: "up", label: "Ascend" });
    // place up-stairs prop on entry-adjacent floor
    placeStairs(m, first, "stairs_up", "up");

    // exit = farthest room; down-stairs (unless final level -> boss)
    let far = rooms[0], best = -1;
    for (const r of rooms) {
      const d = Util.dist2(r.cx, r.cy, first.cx, first.cy);
      if (d > best) { best = d; far = r; }
    }
    m.bossRoom = far;
    if (level < 6) placeStairs(m, far, "stairs_down", "down");

    // monster spawn hints: every room except the first gets spawns
    for (let ri = 1; ri < rooms.length; ri++) {
      const r = rooms[ri];
      const isBoss = (r === far && level >= 1);
      m.spawns.push({
        x: r.cx + 0.5, y: r.cy + 0.5, r: Math.max(r.w, r.h) / 2,
        count: isBoss ? 0 : Util.rng.int(2, 4 + level),
        boss: isBoss && level >= 1 && r === far,
        room: r,
      });
    }

    m.rooms = rooms;
    return m;
  }

  function placeStairs(m, room, type, exitType) {
    // find a walkable tile near the room center
    for (let r = 0; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = room.cx + dx, y = room.cy + dy;
        if (m.isWalkable(x, y) && !m.propAt(x + 0.5, y + 0.5)) {
          addProp(m, x + 0.5, y + 0.5, type);
          m.exits = m.exits.filter(e => e.type !== exitType || e._kept);
          m.exits.push({ x: x + 0.5, y: y + 0.5, type: exitType,
            label: exitType === "down" ? "Descend deeper" : "Ascend", _kept: true });
          return;
        }
      }
    }
  }

  function carveH(m, x0, x1, y) {
    const a = Math.min(x0, x1), b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) {
      if (m.get(x, y) === T.WALL) m.set(x, y, T.FLOOR);
      if (m.get(x, y + 1) === T.WALL) m.set(x, y + 1, T.FLOOR); // 2-wide corridors
    }
  }
  function carveV(m, y0, y1, x) {
    const a = Math.min(y0, y1), b = Math.max(y0, y1);
    for (let y = a; y <= b; y++) {
      if (m.get(x, y) === T.WALL) m.set(x, y, T.FLOOR);
      if (m.get(x + 1, y) === T.WALL) m.set(x + 1, y, T.FLOOR);
    }
  }

  let _propId = 1;
  function addProp(m, x, y, type, extra) {
    const p = Object.assign({ id: _propId++, x, y, type, hp: 1 }, extra || {});
    if (p.breakable) p.hp = 6;
    m.props.push(p);
    return p;
  }

  global.GameMap = { TileMap, T, TILE_DEF, buildTown, buildDungeon };
})(window);
