/* =========================================================================
 * game.js  -  The orchestrator: state, world rendering, lighting, input,
 *             level transitions, loot, and the simulation API used by
 *             skills & entities.
 * ========================================================================= */
(function (global) {
  "use strict";

  const TWO_PI = Math.PI * 2;
  const FINAL_LEVEL = 6;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.light = document.createElement("canvas");
      this.lctx = this.light.getContext("2d");
      this.W = 0; this.H = 0;
      this.resize();
      window.addEventListener("resize", () => this.resize());

      this.input = { mouse: { x: 0, y: 0, wx: 0, wy: 0 }, mouseDown: [false, false, false], keys: {} };
      this.ui = new UIClass(this);
      this.seedBase = (Math.random() * 1e9) | 0;

      this.bindInput();
      this.newGame();

      this.last = Util.now();
      this.acc = 0;
      requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = window.innerWidth; this.H = window.innerHeight;
      this.canvas.width = this.W * dpr; this.canvas.height = this.H * dpr;
      this.canvas.style.width = this.W + "px"; this.canvas.style.height = this.H + "px";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.light.width = this.W; this.light.height = this.H;
      Iso.setView(this.W, this.H);
    }

    newGame() {
      this.player = new Ent.Player(0, 0);
      this.kills = 0;
      this.victory = false;
      this.depth = 0;
      this.enterTown();
      this.ui.log("Welcome, hero. Click to move. Right-click casts your selected skill.");
      this.ui.log("Speak to Deckard, then descend the eastern stairs into the dark.");
    }

    enterTown() {
      this.depth = 0;
      const map = GameMap.buildTown();
      this.loadMap(map);
    }
    enterDungeon(level) {
      this.depth = level;
      const map = GameMap.buildDungeon(level, this.seedBase + level * 7919);
      this.loadMap(map);
      this.ui.log(`You descend to ${map.name}.`);
    }

    loadMap(map) {
      this.map = map;
      this.monsters = [];
      this.projectiles = [];
      this.loot = [];
      this.floaters = [];
      this.effects = [];
      this.explored = new Uint8Array(map.w * map.h);
      const e = map.entry;
      this.player.x = e.x; this.player.y = e.y;
      this.player.path = null; this.player.target = null;
      Iso.cam.x = e.x; Iso.cam.y = e.y;
      this.exitCooldown = 1.2;
      this._onExit = false;
      if (map.kind === "dungeon") this.spawnMonsters(map);
      this.ui.dirty = true;
    }

    spawnMonsters(map) {
      const lvl = map.level;
      const palette = monsterPalette(lvl);
      for (const sp of map.spawns) {
        if (sp.boss) {
          const bossKey = lvl >= FINAL_LEVEL ? "diablo" : (lvl % 2 ? "skelking" : "butcher");
          const mob = new Ent.Monster(bossKey, sp.x, sp.y, lvl, true);
          this.monsters.push(mob);
          // a few minions around the boss
          for (let i = 0; i < 3 + lvl; i++) {
            const a = Util.rng.range(0, TWO_PI), r = Util.rng.range(1.5, sp.r + 1);
            const x = sp.x + Math.cos(a) * r, y = sp.y + Math.sin(a) * r;
            if (map.isWalkable(x | 0, y | 0))
              this.monsters.push(new Ent.Monster(Util.rng.pick(palette), x, y, lvl, false));
          }
          continue;
        }
        for (let i = 0; i < sp.count; i++) {
          const a = Util.rng.range(0, TWO_PI), r = Util.rng.range(0, sp.r);
          const x = sp.x + Math.cos(a) * r, y = sp.y + Math.sin(a) * r;
          if (map.isWalkable(x | 0, y | 0))
            this.monsters.push(new Ent.Monster(Util.rng.pick(palette), x, y, lvl, false));
        }
      }
    }

    // ===== Simulation API (used by skills / entities) ======================
    spawnProjectile(o) { this.projectiles.push(new Ent.Projectile(o)); }
    spawnRing(x, y, r, c) { this.effects.push(new Ent.Effect("ring", x, y, r, c)); }
    spawnSlash(x, y, r) { this.effects.push(new Ent.Effect("slash", x, y, r, "#fff")); }
    float(x, y, t, c, o) { this.floaters.push(new Ent.FloatingText(x, y, t, c, o)); }
    log(t) { this.ui.log(t); }

    areaBurst(x, y, radius, dmg, color, opts) {
      opts = opts || {};
      this.effects.push(new Ent.Effect("burst", x, y, radius, color));
      if (opts.source === "monster") {
        if (Util.dist(x, y, this.player.x, this.player.y) <= radius + 0.4)
          this.player.takeDamage(dmg, this, opts.element);
        return;
      }
      // player-sourced: hit monsters
      for (const m of this.monsters) {
        if (m.dead) continue;
        if (Util.dist(x, y, m.x, m.y) <= radius + m.size) {
          const crit = Util.rng() * 100 < this.player.crit;
          m.takeDamage(dmg * (crit ? 2 : 1), this, opts.element, crit);
          if (opts.knock) {
            const a = Util.angle(x, y, m.x, m.y);
            const nx = m.x + Math.cos(a) * opts.knock, ny = m.y + Math.sin(a) * opts.knock;
            if (this.map.isWalkable(nx | 0, ny | 0)) { m.x = nx; m.y = ny; }
          }
        }
      }
      // break barrels/crates caught in blast
      for (const pr of this.map.props) {
        if (pr.breakable && !pr._broken && Util.dist(x, y, pr.x, pr.y) <= radius + 0.5)
          this.breakProp(pr);
      }
    }

    dropLoot(x, y, ilvl, boss) {
      const rng = Util.rng;
      // gold
      const goldAmt = Math.round((rng.int(2, 8) + ilvl * rng.int(1, 4)) * (boss ? 12 : 1));
      if (goldAmt > 0) this.loot.push(new Ent.Loot(x + rng.range(-0.3, 0.3), y + rng.range(-0.3, 0.3), null, goldAmt));
      // item chance
      const drops = boss ? rng.int(2, 4) : (rng.chance(0.32) ? 1 : 0);
      for (let i = 0; i < drops; i++) {
        const luck = boss ? 2.5 : 0.3;
        const it = Math.random() < 0.25
          ? (Math.random() < 0.6 ? Items.healthPotion(1 + (ilvl / 3 | 0)) : Items.manaPotion(1 + (ilvl / 3 | 0)))
          : Items.makeItem(rng, ilvl, { luck: boss ? 3 : luck, rarity: boss && i === 0 ? "rare" : undefined });
        const a = rng.range(0, TWO_PI), r = rng.range(0.3, 1.1);
        this.loot.push(new Ent.Loot(x + Math.cos(a) * r, y + Math.sin(a) * r, it));
      }
    }

    breakProp(pr) {
      pr._broken = true; pr.blocks = false; pr.type = pr.type + "_broken";
      this.effects.push(new Ent.Effect("burst", pr.x, pr.y, 1, "#9a7a4a"));
      if (Util.rng.chance(0.5)) this.dropLoot(pr.x, pr.y, this.depth || 1, false);
    }

    onPlayerDeath() {
      this.ui.log("You have fallen in battle...");
    }
    onVictory() {
      this.victory = true;
    }

    // ===== Input ===========================================================
    bindInput() {
      const c = this.canvas;
      c.addEventListener("contextmenu", (e) => e.preventDefault());
      c.addEventListener("mousemove", (e) => {
        const r = c.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        this.input.mouse.x = mx; this.input.mouse.y = my;
        const w = Iso.screenToWorld(mx, my);
        this.input.mouse.wx = w.x; this.input.mouse.wy = w.y;
      });
      c.addEventListener("mousedown", (e) => {
        this.input.mouseDown[e.button] = true;
        this.onMouseDown(e.button);
      });
      window.addEventListener("mouseup", (e) => { this.input.mouseDown[e.button] = false; });
      window.addEventListener("keydown", (e) => this.onKey(e));
    }

    onMouseDown(button) {
      const m = this.input.mouse;
      // UI first
      if (this.ui.handleClick(m.x, m.y, button)) return;
      if (!this.player.alive || this.victory) return;

      if (button === 2) { // right-click: cast active skill
        this.castActive(m.wx, m.wy);
        return;
      }
      if (button === 0) { // left-click: target monster or move
        const mob = this.monsterAt(m.wx, m.wy);
        if (mob) { this.player.target = mob; return; }
        this.player.moveTo(m.wx, m.wy, this);
        this._heldRepath = 0;
      }
    }

    castActive(wx, wy) {
      const id = this.ui.activeSkill;
      if (id === "attack") { this.player.moveTo(wx, wy, this); return; }
      this.player.cast(id, wx, wy, this);
    }

    onKey(e) {
      const k = e.key.toLowerCase();
      this.input.keys[k] = true;
      const p = this.player;
      const m = this.input.mouse;

      if (k === "i" || k === "tab") { e.preventDefault(); this.ui.showInventory = !this.ui.showInventory; }
      else if (k === "c") { this.ui.showCharacter = !this.ui.showCharacter; }
      else if (k === "escape") { this.ui.showInventory = false; this.ui.showCharacter = false; }
      else if (k === "q") { p.usePotion("hp", this); }
      else if (k === "e") { p.usePotion("mp", this); }
      else if (k === "r" && (!p.alive || this.victory)) { this.restart(); }
      else if (k >= "1" && k <= "5") {
        const idx = parseInt(k, 10) - 1;
        const id = p.hotbar[idx];
        if (id) {
          if (id === "attack") this.ui.activeSkill = "attack";
          else { this.ui.activeSkill = id; if (p.alive) p.cast(id, m.wx, m.wy, this); }
        }
      }
    }

    restart() {
      if (this.victory) { this.seedBase = (Math.random() * 1e9) | 0; this.newGame(); return; }
      // respawn in town, keep gear, lose a little gold
      this.player.alive = true;
      this.player.hp = this.player.maxHP;
      this.player.mana = this.player.maxMana;
      this.player.gold = Math.floor(this.player.gold * 0.8);
      this.enterTown();
      this.ui.log("You awaken back in town, battered but alive.");
    }

    monsterAt(wx, wy) {
      let best = null, bestD = 0.9 * 0.9;
      for (const mo of this.monsters) {
        if (mo.dead) continue;
        const rr = (mo.size + 0.5) * (mo.size + 0.5);
        const d = Util.dist2(wx, wy, mo.x, mo.y);
        if (d < Math.max(rr, bestD)) { if (d < bestD || !best) { best = mo; bestD = d; } }
      }
      return best;
    }

    // ===== Inventory / equipment interactions ==============================
    onInventoryClick(i, button) {
      const p = this.player;
      const it = p.inventory[i];
      if (!it) return;
      if (it.consumable) {
        if (it.kind === "hp") { p.hp = Math.min(p.maxHP, p.hp + it.heal); this.float(p.x, p.y, "+" + it.heal, "#6cff6c", { size: 14 }); }
        else { p.mana = Math.min(p.maxMana, p.mana + it.restore); this.float(p.x, p.y, "+" + it.restore, "#6cf", { size: 14 }); }
        p.inventory.splice(i, 1);
        return;
      }
      // equip: swap with current slot
      const slot = it.slot;
      const cur = p.equip[slot];
      p.equip[slot] = it;
      p.inventory.splice(i, 1);
      if (cur) p.inventory.push(cur);
      p.recalc();
      this.ui.log("Equipped " + it.name + ".");
    }

    onEquipClick(slot, button) {
      const p = this.player;
      const it = p.equip[slot];
      if (!it) return;
      if (p.inventory.length >= p.invMax) { this.ui.log("Inventory full."); return; }
      p.equip[slot] = null;
      p.inventory.push(it);
      p.recalc();
      this.ui.log("Unequipped " + it.name + ".");
    }

    allocStat(k) {
      const p = this.player;
      if (p.statPoints <= 0) return;
      p.alloc[k] = (p.alloc[k] || 0) + 1;
      p.statPoints--;
      p.recalc();
    }

    // ===== Update ==========================================================
    loop(t) {
      let dt = (t - this.last) / 1000;
      this.last = t;
      if (dt > 0.1) dt = 0.1;            // clamp big frame gaps
      this.update(dt);
      this.render();
      requestAnimationFrame((tt) => this.loop(tt));
    }

    update(dt) {
      this.ui.update(dt);
      const p = this.player;

      // held-to-move (Diablo style) when not over UI and no target
      if (this.input.mouseDown[0] && p.alive && !this.victory) {
        const m = this.input.mouse;
        if (!this.ui.pointInUI(m.x, m.y) && !p.target) {
          this._heldRepath = (this._heldRepath || 0) - dt;
          if (this._heldRepath <= 0) { this._heldRepath = 0.12; p.moveTo(m.wx, m.wy, this); }
        }
      }
      if (this.input.mouseDown[2] && p.alive && !this.victory) {
        const m = this.input.mouse;
        if (!this.ui.pointInUI(m.x, m.y)) this.castActive(m.wx, m.wy);
      }

      p.update(dt, this);

      for (const mo of this.monsters) mo.update(dt, this);
      for (const pr of this.projectiles) pr.update(dt, this);
      for (const fx of this.effects) fx.update(dt);
      for (const ft of this.floaters) ft.update(dt);
      for (const lt of this.loot) lt.update(dt);

      // cleanup
      this.monsters = this.monsters.filter(m => !m.dead || m.hitFlash > 0); // keep one frame
      this.monsters = this.monsters.filter(m => !m.dead);
      this.projectiles = this.projectiles.filter(p2 => !p2.dead);
      this.effects = this.effects.filter(f => !f.dead);
      this.floaters = this.floaters.filter(f => !f.dead);

      // auto-pickup loot
      this.pickupLoot();

      // exploration for minimap
      this.markExplored(p.x | 0, p.y | 0, 6);

      // camera smooth-follow
      Iso.cam.x = Util.lerp(Iso.cam.x, p.x, Math.min(1, dt * 8));
      Iso.cam.y = Util.lerp(Iso.cam.y, p.y, Math.min(1, dt * 8));

      // level transitions
      this.exitCooldown = Math.max(0, this.exitCooldown - dt);
      this.checkExits();
    }

    pickupLoot() {
      const p = this.player;
      for (const lt of this.loot) {
        if (lt.dead) continue;
        if (Util.dist(p.x, p.y, lt.x, lt.y) < 0.85) {
          if (lt.gold) { p.gold += lt.gold; this.float(p.x, p.y - 0.2, "+" + lt.gold + "g", "#ffd24a", { size: 12 }); lt.dead = true; }
          else {
            if (p.inventory.length < p.invMax) {
              p.inventory.push(lt.item); lt.dead = true;
              this.ui.log("Picked up " + lt.item.name + ".");
              this.float(p.x, p.y - 0.2, lt.item.name, lt.item.col, { size: 12, life: 1.1 });
            }
          }
        }
      }
      this.loot = this.loot.filter(l => !l.dead);
    }

    markExplored(cx, cy, r) {
      const map = this.map;
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++)
          if (map.inB(x, y) && (x - cx) ** 2 + (y - cy) ** 2 <= r * r)
            this.explored[y * map.w + x] = 1;
    }

    checkExits() {
      if (this.exitCooldown > 0) { this._onExit = false; return; }
      const p = this.player;
      let on = null;
      for (const e of this.map.exits) {
        if (Util.dist(p.x, p.y, e.x, e.y) < 0.7) { on = e; break; }
      }
      if (on && !this._onExit) {
        this._onExit = true;
        if (on.type === "down") {
          if (this.map.kind === "town") this.enterDungeon(1);
          else this.enterDungeon(this.depth + 1);
        } else if (on.type === "up") {
          if (this.depth <= 1) this.enterTown();
          else this.enterDungeon(this.depth - 1);
        }
      } else if (!on) {
        this._onExit = false;
      }
    }

    // ===== Render ==========================================================
    render() {
      const ctx = this.ctx, W = this.W, H = this.H;
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, W, H);

      this.renderWorld(ctx);
      this.renderLighting(ctx);

      // floating text + cursor on top of lighting
      for (const ft of this.floaters) ft.draw(ctx);
      this.drawCursor(ctx);

      // HUD / panels
      this.ui.draw(ctx, W, H);
    }

    renderWorld(ctx) {
      const map = this.map;
      // 1) compute visible tile bounds from screen corners
      const corners = [
        Iso.screenToWorld(0, 0), Iso.screenToWorld(this.W, 0),
        Iso.screenToWorld(0, this.H), Iso.screenToWorld(this.W, this.H),
      ];
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const c of corners) { minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x); minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y); }
      minX = Math.max(0, (minX | 0) - 2); minY = Math.max(0, (minY | 0) - 2);
      maxX = Math.min(map.w - 1, (maxX | 0) + 2); maxY = Math.min(map.h - 1, (maxY | 0) + 2);

      // 2) draw floor tiles back-to-front
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const d = map.def(x, y);
          if (!d || !d.floor) continue;
          this.drawFloorTile(ctx, x, y, d);
        }
      }

      // 3) gather depth-sorted tall objects (walls, props, loot, monsters, player, projectiles, ground effects)
      const objs = [];
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (map.isWall(x, y)) objs.push({ d: x + y + 0.4, kind: "wall", x, y });
        }
      }
      for (const pr of map.props) {
        if (Iso.isVisible(pr.x, pr.y, 120)) objs.push({ d: pr.x + pr.y, kind: "prop", p: pr });
      }
      for (const lt of this.loot) objs.push({ d: lt.x + lt.y - 0.1, kind: "loot", o: lt });
      for (const fx of this.effects) objs.push({ d: fx.x + fx.y - 0.2, kind: "fx", o: fx });
      for (const mo of this.monsters) objs.push({ d: mo.x + mo.y, kind: "ent", o: mo });
      objs.push({ d: this.player.x + this.player.y, kind: "ent", o: this.player });
      for (const pj of this.projectiles) objs.push({ d: pj.x + pj.y + 0.5, kind: "proj", o: pj });

      objs.sort((a, b) => a.d - b.d);
      for (const ob of objs) {
        if (ob.kind === "wall") this.drawWall(ctx, ob.x, ob.y);
        else if (ob.kind === "prop") this.drawProp(ctx, ob.p);
        else ob.o.draw(ctx);
      }
    }

    drawFloorTile(ctx, x, y, d) {
      const s = Iso.worldToScreen(x + 0.5, y + 0.5);
      const HW = Iso.HW, HH = Iso.HH;
      // subtle per-tile shade variation
      let col = d.col;
      if (d.jitter) {
        const n = (((x * 73856093) ^ (y * 19349663)) >>> 0) / 4294967296;
        col = Util.shade(d.col, (n - 0.5) * d.jitter * 2);
      }
      if (d.liquid) {
        const tphase = (Util.now() / 600) + x * 0.5 + y * 0.3;
        col = Util.shade(d.col, Math.sin(tphase) * 0.06);
      }
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - HH);
      ctx.lineTo(s.x + HW, s.y);
      ctx.lineTo(s.x, s.y + HH);
      ctx.lineTo(s.x - HW, s.y);
      ctx.closePath();
      ctx.fill();
      // grid edge
      ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; ctx.stroke();
      if (d.hot) {
        ctx.fillStyle = "rgba(255,120,30,0.15)"; ctx.fill();
      }
    }

    drawWall(ctx, x, y) {
      const s = Iso.worldToScreen(x + 0.5, y + 0.5);
      const HW = Iso.HW, HH = Iso.HH, wh = 30;
      const base = "#4a4450";
      // right face
      ctx.fillStyle = Util.shade(base, -0.28);
      ctx.beginPath();
      ctx.moveTo(s.x + HW, s.y); ctx.lineTo(s.x, s.y + HH);
      ctx.lineTo(s.x, s.y + HH - wh); ctx.lineTo(s.x + HW, s.y - wh);
      ctx.closePath(); ctx.fill();
      // left face
      ctx.fillStyle = Util.shade(base, -0.14);
      ctx.beginPath();
      ctx.moveTo(s.x - HW, s.y); ctx.lineTo(s.x, s.y + HH);
      ctx.lineTo(s.x, s.y + HH - wh); ctx.lineTo(s.x - HW, s.y - wh);
      ctx.closePath(); ctx.fill();
      // top
      ctx.fillStyle = Util.shade(base, 0.10);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - HH - wh); ctx.lineTo(s.x + HW, s.y - wh);
      ctx.lineTo(s.x, s.y + HH - wh); ctx.lineTo(s.x - HW, s.y - wh);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.stroke();
    }

    drawProp(ctx, p) {
      const s = Iso.worldToScreen(p.x, p.y);
      const t = p.type;
      ctx.save();
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 12, 6, 0, 0, TWO_PI); ctx.fill();

      if (t === "torch") {
        ctx.strokeStyle = "#5a3a1a"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - 26); ctx.stroke();
        const fl = 4 + Math.sin(Util.now() / 90 + p.id) * 2;
        const g = ctx.createRadialGradient(s.x, s.y - 30, 0, s.x, s.y - 30, 12 + fl);
        g.addColorStop(0, "#fff2a0"); g.addColorStop(0.5, "#ff8a1a"); g.addColorStop(1, "rgba(255,80,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y - 30, 12 + fl, 0, TWO_PI); ctx.fill();
      } else if (t === "tree") {
        ctx.fillStyle = "#3a2a18"; ctx.fillRect(s.x - 3, s.y - 20, 6, 20);
        const g = ctx.createRadialGradient(s.x, s.y - 38, 4, s.x, s.y - 32, 26);
        g.addColorStop(0, "#3f7a3f"); g.addColorStop(1, "#1d3d1d");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y - 34, 22, 0, TWO_PI); ctx.fill();
      } else if (t === "barrel") {
        ctx.fillStyle = "#6b4a28"; this.cyl(ctx, s.x, s.y, 12, 26);
        ctx.strokeStyle = "#3a2814"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x - 11, s.y - 16); ctx.lineTo(s.x + 11, s.y - 16); ctx.stroke();
      } else if (t === "crate") {
        ctx.fillStyle = "#7a5a30";
        ctx.fillRect(s.x - 12, s.y - 22, 24, 22);
        ctx.strokeStyle = "#4a3418"; ctx.lineWidth = 2; ctx.strokeRect(s.x - 12, s.y - 22, 24, 22);
        ctx.beginPath(); ctx.moveTo(s.x - 12, s.y - 22); ctx.lineTo(s.x + 12, s.y); ctx.moveTo(s.x + 12, s.y - 22); ctx.lineTo(s.x - 12, s.y); ctx.stroke();
      } else if (t === "barrel_broken" || t === "crate_broken") {
        ctx.fillStyle = "#4a3418";
        ctx.fillRect(s.x - 12, s.y - 6, 24, 6);
        ctx.fillRect(s.x - 6, s.y - 12, 6, 8);
      } else if (t === "fountain") {
        ctx.fillStyle = "#888"; this.cyl(ctx, s.x, s.y, 22, 16);
        ctx.fillStyle = "#2a6fb0"; ctx.beginPath(); ctx.ellipse(s.x, s.y - 14, 18, 9, 0, 0, TWO_PI); ctx.fill();
        ctx.fillStyle = "#9fd0ff"; ctx.fillRect(s.x - 1.5, s.y - 34, 3, 20);
      } else if (t === "stairs_down") {
        ctx.fillStyle = "#1a1a22";
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 16); ctx.lineTo(s.x + 22, s.y - 4);
        ctx.lineTo(s.x, s.y + 10); ctx.lineTo(s.x - 22, s.y - 4); ctx.closePath(); ctx.fill();
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = Util.shade("#3a3340", -i * 0.12);
          ctx.beginPath(); ctx.moveTo(s.x, s.y - 12 + i * 4); ctx.lineTo(s.x + 16 - i * 3, s.y - 4 + i * 3);
          ctx.lineTo(s.x, s.y + 4 + i * 3); ctx.lineTo(s.x - 16 + i * 3, s.y - 4 + i * 3); ctx.closePath(); ctx.fill();
        }
        this.labelProp(ctx, s, "▼ Descend");
      } else if (t === "stairs_up") {
        ctx.fillStyle = "#3a3a4a";
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 18); ctx.lineTo(s.x + 20, s.y - 6);
        ctx.lineTo(s.x, s.y + 6); ctx.lineTo(s.x - 20, s.y - 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#6a6a7a";
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 28); ctx.lineTo(s.x + 12, s.y - 14);
        ctx.lineTo(s.x, s.y - 6); ctx.lineTo(s.x - 12, s.y - 14); ctx.closePath(); ctx.fill();
        this.labelProp(ctx, s, "▲ Ascend");
      } else if (t === "npc") {
        Ent.drawCreature(ctx, s, { h: 36, w: 12, body: "#5a4a8a", head: "#e0c39a", facing: 1.2, eyes: "#222" });
        this.labelProp(ctx, s, p.name || "Villager", "#9fe");
        // talk on proximity
        if (Util.dist(this.player.x, this.player.y, p.x, p.y) < 1.6 && !p._spoke) {
          p._spoke = true; this.ui.log(`${p.name}: "${p.line}"`);
        }
        if (Util.dist(this.player.x, this.player.y, p.x, p.y) > 2.4) p._spoke = false;
      }
      ctx.restore();
    }

    cyl(ctx, x, y, rw, h) {
      ctx.beginPath(); ctx.ellipse(x, y, rw, rw * 0.45, 0, 0, TWO_PI); ctx.fill();
      ctx.fillRect(x - rw, y - h, rw * 2, h);
      ctx.beginPath(); ctx.ellipse(x, y - h, rw, rw * 0.45, 0, 0, TWO_PI); ctx.fill();
    }

    labelProp(ctx, s, text, col) {
      const near = true;
      ctx.font = "11px Cinzel, serif"; ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(text, s.x + 1, s.y - 39);
      ctx.fillStyle = col || "#e8d8a0"; ctx.fillText(text, s.x, s.y - 40);
    }

    // ===== Lighting ========================================================
    renderLighting(ctx) {
      const lc = this.lctx, W = this.W, H = this.H, map = this.map;
      lc.globalCompositeOperation = "source-over";
      const dark = Util.clamp(0.25 + map.ambient, 0.2, 0.82);
      lc.clearRect(0, 0, W, H);
      lc.fillStyle = `rgba(4,4,10,${dark})`;
      lc.fillRect(0, 0, W, H);

      // punch out light around player + torches + fire projectiles
      lc.globalCompositeOperation = "destination-out";
      const punch = (sx, sy, rad, soft) => {
        const g = lc.createRadialGradient(sx, sy, rad * 0.15, sx, sy, rad);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(soft || 0.7, "rgba(0,0,0,0.85)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        lc.fillStyle = g; lc.beginPath(); lc.arc(sx, sy, rad, 0, TWO_PI); lc.fill();
      };
      const ps = Iso.worldToScreen(this.player.x, this.player.y);
      punch(ps.x, ps.y - 10, 300, 0.55);
      for (const pr of map.props) {
        if (pr.type === "torch" && Iso.isVisible(pr.x, pr.y, 200)) {
          const s = Iso.worldToScreen(pr.x, pr.y);
          const fl = Math.sin(Util.now() / 90 + pr.id) * 12;
          punch(s.x, s.y - 28, 150 + fl, 0.5);
        }
        if (pr.type === "fountain") { const s = Iso.worldToScreen(pr.x, pr.y); punch(s.x, s.y, 120, 0.5); }
      }
      for (const pj of this.projectiles) {
        if (pj.element === "fire") { const s = Iso.worldToScreen(pj.x, pj.y); punch(s.x, s.y, 110, 0.4); }
      }
      // lava tiles glow
      // (kept light: only near player to save cost)

      // composite darkness
      ctx.drawImage(this.light, 0, 0);

      // additive warm glow for torches/fire (color)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const pr of map.props) {
        if (pr.type === "torch" && Iso.isVisible(pr.x, pr.y, 200)) {
          const s = Iso.worldToScreen(pr.x, pr.y);
          const g = ctx.createRadialGradient(s.x, s.y - 28, 0, s.x, s.y - 28, 120);
          g.addColorStop(0, "rgba(255,150,40,0.22)"); g.addColorStop(1, "rgba(255,80,0,0)");
          ctx.fillStyle = g; ctx.fillRect(s.x - 120, s.y - 148, 240, 240);
        }
      }
      ctx.restore();
    }

    drawCursor(ctx) {
      const m = this.input.mouse;
      if (this.ui.pointInUI(m.x, m.y)) { this.canvas.style.cursor = "pointer"; return; }
      this.canvas.style.cursor = "none";
      const mob = this.monsterAt(m.wx, m.wy);
      ctx.save();
      if (mob) {
        ctx.strokeStyle = "#ff4a4a"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(m.x, m.y, 12, 0, TWO_PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(m.x - 16, m.y); ctx.lineTo(m.x - 8, m.y);
        ctx.moveTo(m.x + 8, m.y); ctx.lineTo(m.x + 16, m.y); ctx.stroke();
      } else {
        // tile highlight at cursor
        const s = Iso.worldToScreen((m.wx | 0) + 0.5, (m.wy | 0) + 0.5);
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - Iso.HH); ctx.lineTo(s.x + Iso.HW, s.y);
        ctx.lineTo(s.x, s.y + Iso.HH); ctx.lineTo(s.x - Iso.HW, s.y); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(m.x, m.y, 3, 0, TWO_PI); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function monsterPalette(lvl) {
    const p = ["fallen", "skeleton"];
    if (lvl >= 2) p.push("zombie", "bat");
    if (lvl >= 3) p.push("archer");
    if (lvl >= 4) p.push("shaman");
    if (lvl >= 5) p.push("zombie", "archer", "shaman");
    return p;
  }

  global.Game = Game;
})(window);
