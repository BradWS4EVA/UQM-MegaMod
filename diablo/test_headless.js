/* Headless smoke test: stub canvas/DOM, run the sim, simulate input, assert no throws. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ---- stubs ----------------------------------------------------------------
function makeCtx() {
  const grad = { addColorStop() {} };
  const handler = {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => grad;
      if (prop === "measureText") return () => ({ width: 10 });
      if (prop === "canvas") return t._canvas;
      // any other method -> no-op
      return () => {};
    },
    set(t, prop, val) { t[prop] = val; return true; },
  };
  return new Proxy({ _canvas: null }, handler);
}
function makeCanvas() {
  const ctx = makeCtx();
  const c = {
    width: 1280, height: 720, style: {},
    getContext() { return ctx; },
    addEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
  };
  ctx._canvas = c;
  return c;
}

const win = globalThis;
win.window = win;
win.devicePixelRatio = 1;
win.innerWidth = 1280;
win.innerHeight = 720;
win.performance = { now: () => Date.now() };
win.requestAnimationFrame = () => 0;   // do not auto-loop; we drive manually
win.addEventListener = () => {};
win.removeEventListener = () => {};
win.document = {
  createElement() { return makeCanvas(); },
  getElementById() { return null; },
  addEventListener() {},
};

// ---- load engine scripts in order ----------------------------------------
const files = ["util", "iso", "pathfinding", "map", "items", "skills", "entities", "ui", "game"];
for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, "js", f + ".js"), "utf8");
  vm.runInThisContext(code, { filename: f + ".js" });
}

// ---- instantiate & drive --------------------------------------------------
let errors = 0;
function step(label, fn) {
  try { fn(); console.log("  ok  -", label); }
  catch (e) { errors++; console.log("  ERR -", label, "\n      ", e.stack.split("\n").slice(0, 3).join("\n       ")); }
}

const canvas = makeCanvas();
let game;
step("construct Game (spawns in town)", () => { game = new win.Game(canvas); });
step("town has player + map", () => { if (!game.player || game.map.kind !== "town") throw new Error("bad town"); });

// run some frames in town
step("run 60 town frames + render", () => { for (let i = 0; i < 60; i++) { game.update(0.016); game.render(); } });

// move the player around
step("move player in town", () => {
  game.input.mouse.wx = game.player.x + 4;
  game.input.mouse.wy = game.player.y + 2;
  game.onMouseDown(0);
  for (let i = 0; i < 120; i++) game.update(0.016);
});

// force descent into dungeon level 1
step("enter dungeon L1", () => { game.enterDungeon(1); if (game.map.kind !== "dungeon") throw new Error("not dungeon"); });
step("dungeon has monsters", () => { if (game.monsters.length === 0) throw new Error("no monsters spawned"); });

// cast each skill
step("cast all skills", () => {
  const m = game.input.mouse; m.wx = game.player.x + 3; m.wy = game.player.y;
  for (const id of ["fireball", "frostnova", "cleave", "teleport"]) {
    game.player.mana = game.player.maxMana;
    game.player.cooldowns[id] = 0;
    game.player.cast(id, m.wx, m.wy, game);
  }
  for (let i = 0; i < 30; i++) game.update(0.016);
});

// simulate combat: pull monsters to player and let them fight for a while
step("simulate combat 400 frames", () => {
  for (let i = 0; i < 400; i++) {
    // keep casting fireball at nearest monster
    if (i % 8 === 0 && game.monsters.length) {
      const mo = game.monsters[0];
      game.player.mana = game.player.maxMana; game.player.cooldowns.fireball = 0;
      game.player.cast("fireball", mo.x, mo.y, game);
      game.player.target = mo;
    }
    game.update(0.016);
    game.render();
  }
});

step("player gained xp/kills or survived", () => {
  if (!game.player.alive && game.depth === 0) throw new Error("died in town?!");
});

// loot interactions
step("drop + pickup loot, equip from inventory", () => {
  game.dropLoot(game.player.x, game.player.y, 3, true);
  for (let i = 0; i < 30; i++) game.update(0.016);
  // try equip first equippable item in inventory
  const idx = game.player.inventory.findIndex(it => it.slot);
  if (idx >= 0) game.onInventoryClick(idx, 0);
  game.player.recalc();
});

// level up allocation
step("allocate stats after granting points", () => {
  game.player.statPoints = 5;
  game.allocStat("str"); game.allocStat("vit");
  game.player.recalc();
});

// descend through all levels to final boss
step("descend to final level (Diablo)", () => {
  for (let L = 2; L <= 6; L++) game.enterDungeon(L);
  if (game.map.level !== 6) throw new Error("not final level");
  const hasDiablo = game.monsters.some(m => m.typeKey === "diablo");
  if (!hasDiablo) throw new Error("Diablo did not spawn on final level");
});

// kill diablo -> victory
step("defeat Diablo triggers victory", () => {
  const d = game.monsters.find(m => m.typeKey === "diablo");
  d.hp = 1; d.takeDamage(9999, game, "phys");
  if (!game.victory) throw new Error("no victory after Diablo death");
});

// render UI panels
step("render with inventory + character panels open", () => {
  game.ui.showInventory = true; game.ui.showCharacter = true;
  game.render();
});

// pathfinding sanity
step("pathfinding returns a path on open ground", () => {
  game.enterDungeon(1);
  const p = game.player;
  // find a far walkable tile
  let tx = p.x | 0, ty = p.y | 0;
  for (let r = 3; r < 20; r++) {
    if (game.map.isWalkable((p.x | 0) + r, p.y | 0)) { tx = (p.x | 0) + r; break; }
  }
  const path = win.Pathfinding.findPath(p.x | 0, p.y | 0, tx, ty, (x, y) => game.map.isWalkable(x, y));
  if (path === null) throw new Error("pathfinding failed on open ground");
});

console.log("\n" + (errors === 0 ? "ALL CHECKS PASSED ✅" : (errors + " CHECK(S) FAILED ❌")));
process.exit(errors === 0 ? 0 : 1);
